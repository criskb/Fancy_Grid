import { formatRgbColor, parseColorString } from "./colorUtils.js";
import { DEFAULT_GRID_SETTINGS, getPerformanceProfile, mergeSettings } from "./defaultSettings.js";
import { getGridStyleDefinition, resolveGridRestPoint } from "./gridStyles.js";
import {
  buildWorldBounds,
  boundsIntersect,
  clamp,
  computeFalloff,
  expandBounds,
  limitVector,
  nearestPointOnRoundedRect,
  nearestPointOnSegment,
  segmentIntersectsBounds,
  worldToScreen,
} from "./geometry.js";

export class ReactiveGridField {
  constructor(settings = {}) {
    this.settings = mergeSettings(DEFAULT_GRID_SETTINGS, settings);
    this.points = new Map();
    this.frameId = 0;
    this.simulationTime = 0;
  }

  setSettings(patch = {}) {
    const nextSettings = mergeSettings(this.settings, patch);
    const shouldReset =
      nextSettings.spacing !== this.settings.spacing || nextSettings.gridStyle !== this.settings.gridStyle;

    this.settings = nextSettings;

    if (shouldReset) {
      this.reset();
    }
  }

  reset() {
    this.points.clear();
  }

  getTime() {
    return this.simulationTime;
  }

  update({
    viewport,
    nodes = [],
    links = [],
    activeCable = null,
    pointer = null,
    dt = 16.67,
    isInteracting = false,
    interactionBoost = 1,
  }) {
    if (!viewport?.width || !viewport?.height) {
      return this._emptyFrame(viewport);
    }

    const settings = this.settings;
    const style = getGridStyleDefinition(settings.gridStyle);
    const profile = getPerformanceProfile(settings.performanceMode);
    const worldBounds = buildWorldBounds(viewport);
    const cellMargin = settings.spacing * settings.viewMarginCells;
    const simulationBounds = expandBounds(worldBounds, cellMargin);
    const influenceBounds = expandBounds(worldBounds, profile.viewportPadding / Math.max(viewport.zoom, 0.001));
    const visibleNodes = this._prepareNodes(nodes, influenceBounds, profile.maxNodes, settings);
    const visibleLinks = this._prepareLinks(
      activeCable ? [...links, activeCable] : links,
      influenceBounds,
      profile.maxLinks,
      settings
    );
    const gridBounds = this._gridBounds(simulationBounds, settings.spacing);
    const rows = gridBounds.endRow - gridBounds.startRow + 1;
    const cols = gridBounds.endCol - gridBounds.startCol + 1;
    const framePoints = new Array(rows * cols);

    this.frameId += 1;
    this.simulationTime += Math.max(dt, 0) * 0.001;

    const ratio = Math.min(Math.max(dt / 16.67, 0.5), 2.2);
    const springBase = Math.min(
      0.92,
      settings.spring * (isInteracting ? settings.interactionSpringBoost * interactionBoost : 1)
    );
    const dampingBase = isInteracting
      ? Math.min(settings.damping, settings.interactionDamping)
      : settings.damping;
    const spring = 1 - Math.pow(1 - springBase, ratio);
    const damping = Math.pow(dampingBase, ratio);
    let energy = 0;
    let maxInfluence = 0;

    for (let row = gridBounds.startRow; row <= gridBounds.endRow; row += 1) {
      for (let col = gridBounds.startCol; col <= gridBounds.endCol; col += 1) {
        const restPoint = resolveGridRestPoint({
          col,
          row,
          spacing: settings.spacing,
          gridStyle: settings.gridStyle,
          time: this.simulationTime,
        });
        const point = this._getPoint(col, row, restPoint);
        const influence = this._accumulateInfluence(
          point.restX,
          point.restY,
          visibleNodes,
          visibleLinks,
          pointer,
          settings
        );
        const capped = limitVector(influence.dx, influence.dy, settings.maxOffset);
        const targetX = point.restX + capped.x;
        const targetY = point.restY + capped.y;

        point.vx += (targetX - point.x) * spring;
        point.vy += (targetY - point.y) * spring;
        point.vx *= damping;
        point.vy *= damping;
        point.x += point.vx;
        point.y += point.vy;
        point.nodeInfluence = influence.nodeInfluence;
        point.nodeVisualInfluence = influence.nodeVisualInfluence;
        point.nodeColorInfluence = influence.nodeColorInfluence;
        point.nodeColor = influence.nodeColor;
        point.linkInfluence = influence.linkInfluence;
        point.linkColor = influence.linkColor;
        point.pointerInfluence = influence.pointerInfluence;
        point.visibility = Math.min(
          1,
          settings.gridVisibility +
            Math.max(
              influence.nodeVisualInfluence * 0.92,
              influence.linkInfluence,
              influence.pointerInfluence * 0.96
            ) *
              (1 - settings.gridVisibility)
        );
        point.activeFrame = this.frameId;

        const screen = worldToScreen(point.x, point.y, viewport);
        point.screenX = screen.x;
        point.screenY = screen.y;

        const velocity = Math.abs(point.vx) + Math.abs(point.vy);
        energy = Math.max(energy, velocity);
        maxInfluence = Math.max(
          maxInfluence,
          influence.nodeVisualInfluence,
          influence.linkInfluence,
          influence.pointerInfluence
        );

        const rowIndex = row - gridBounds.startRow;
        const colIndex = col - gridBounds.startCol;
        framePoints[rowIndex * cols + colIndex] = point;
      }
    }

    this._prunePoints();

    return {
      width: viewport.width,
      height: viewport.height,
      rows,
      cols,
      points: framePoints,
      worldBounds,
      screenNodes: visibleNodes.map((node) => this._projectRect(node, viewport)),
      visibleLinks: visibleLinks.filter((link) => !link.marker).map((link) => this._projectLink(link, viewport)),
      stats: {
        pointCount: framePoints.length,
        nodeCount: visibleNodes.length,
        linkCount: visibleLinks.length,
        energy,
        influence: maxInfluence,
      },
      active: isInteracting || energy > 0.014 || style.alwaysAnimate,
    };
  }

  _emptyFrame(viewport) {
    return {
      width: viewport?.width ?? 0,
      height: viewport?.height ?? 0,
      rows: 0,
      cols: 0,
      points: [],
      worldBounds: null,
      screenNodes: [],
      visibleLinks: [],
      stats: {
        pointCount: 0,
        nodeCount: 0,
        linkCount: 0,
        energy: 0,
        influence: 0,
      },
      active: false,
    };
  }

  _gridBounds(bounds, spacing) {
    return {
      startCol: Math.floor(bounds.left / spacing),
      endCol: Math.ceil(bounds.right / spacing),
      startRow: Math.floor(bounds.top / spacing),
      endRow: Math.ceil(bounds.bottom / spacing),
    };
  }

  _prepareNodes(nodes, bounds, maxNodes, settings) {
    const centerX = (bounds.left + bounds.right) * 0.5;
    const centerY = (bounds.top + bounds.bottom) * 0.5;

    return nodes
      .map((node) => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        radius: node.radius ?? settings.nodeCornerRadius,
        color: node.color ?? null,
        rgb: parseColorString(node.color),
        bounds: {
          left: node.x,
          top: node.y,
          right: node.x + node.width,
          bottom: node.y + node.height,
        },
        influenceBounds: {
          left: node.x - settings.radius - settings.nodePadding,
          top: node.y - settings.radius - settings.nodePadding,
          right: node.x + node.width + settings.radius + settings.nodePadding,
          bottom: node.y + node.height + settings.radius + settings.nodePadding,
        },
        paddedRect: {
          x: node.x - settings.nodePadding,
          y: node.y - settings.nodePadding,
          width: node.width + settings.nodePadding * 2,
          height: node.height + settings.nodePadding * 2,
        },
        paddedRadius: (node.radius ?? settings.nodeCornerRadius) + settings.nodePadding,
      }))
      .filter((node) => boundsIntersect(node.bounds, bounds))
      .sort((a, b) => {
        const ax = a.x + a.width * 0.5 - centerX;
        const ay = a.y + a.height * 0.5 - centerY;
        const bx = b.x + b.width * 0.5 - centerX;
        const by = b.y + b.height * 0.5 - centerY;
        return ax * ax + ay * ay - (bx * bx + by * by);
      })
      .slice(0, maxNodes);
  }

  _prepareLinks(links, bounds, maxLinks, settings) {
    const centerX = (bounds.left + bounds.right) * 0.5;
    const centerY = (bounds.top + bounds.bottom) * 0.5;
    const grouped = new Map();

    for (const link of links) {
      if (!segmentIntersectsBounds(link.x1, link.y1, link.x2, link.y2, bounds)) {
        continue;
      }

      const midX = (link.x1 + link.x2) * 0.5;
      const midY = (link.y1 + link.y2) * 0.5;
      const distanceScore = (midX - centerX) ** 2 + (midY - centerY) ** 2 - (link.active ? 100000 : 0);
      const groupKey = link.baseId ?? link.id;
      let group = grouped.get(groupKey);

      if (!group) {
        group = {
          distanceScore,
          segments: [],
          active: false,
        };
        grouped.set(groupKey, group);
      } else {
        group.distanceScore = Math.min(group.distanceScore, distanceScore);
      }

      group.segments.push({
        ...link,
        distanceScore,
        rgb: parseColorString(link.color),
        influenceBounds: createExpandedSegmentBounds(link, settings.linkRadius),
      });
      group.active ||= Boolean(link.active);
    }

    const hardLimit = Math.max(maxLinks, 1);
    const detailLimit = Math.max(hardLimit, Math.ceil(hardLimit * 1.6));
    const proxyLimit = Math.max(detailLimit, Math.ceil(hardLimit * 2.25));
    const sortedGroups = Array.from(grouped.values()).sort((a, b) => a.distanceScore - b.distanceScore);
    const selected = [];
    const overflowGroups = [];
    let selectedCost = 0;

    for (const group of sortedGroups) {
      if (selectedCost >= detailLimit && !group.active) {
        overflowGroups.push(group);
        continue;
      }

      const groupCost = Math.max(
        1,
        group.segments.reduce((total, segment) => total + (segment.marker ? 0 : 1), 0)
      );

      if (selectedCost > 0 && selectedCost + groupCost > detailLimit && !group.active) {
        overflowGroups.push(group);
        continue;
      }

      selected.push(...group.segments);
      selectedCost += groupCost;
    }

    let totalCost = selectedCost;

    for (const group of overflowGroups) {
      const proxySegments = buildProxySegments(group.segments, group.active ? 2 : 1);
      if (!proxySegments.length) {
        continue;
      }

      if (totalCost > 0 && totalCost + proxySegments.length > proxyLimit && !group.active) {
        continue;
      }

      selected.push(...proxySegments);
      totalCost += proxySegments.length;
    }

    return selected;
  }

  _accumulateInfluence(px, py, nodes, links, pointer, settings) {
    let dx = 0;
    let dy = 0;
    let nodeInfluence = 0;
    let nodeVisualInfluence = 0;
    let nodeColorInfluence = 0;
    let nodeColor = null;
    let nodeColorR = 0;
    let nodeColorG = 0;
    let nodeColorB = 0;
    let nodeColorWeight = 0;
    let linkInfluence = 0;
    let linkColor = null;
    let linkColorR = 0;
    let linkColorG = 0;
    let linkColorB = 0;
    let linkColorWeight = 0;
    let pointerInfluence = 0;

    for (const node of nodes) {
      if (!pointInBounds(px, py, node.influenceBounds)) {
        continue;
      }

      const nearest = nearestPointOnRoundedRect(px, py, node.paddedRect, node.paddedRadius);
      const localDx = nearest.x - px;
      const localDy = nearest.y - py;
      const distance = Math.hypot(localDx, localDy);
      const influence = computeFalloff(distance, settings.radius, "soft");
      const visualInfluence = computeFalloff(distance, settings.radius, settings.nodeVisualFalloff);
      // Keep node hue in a tight ring just outside the node edge.
      const localNodeColorInfluence = computeFalloff(
        distance,
        Math.max(settings.nodePadding, settings.spacing * 0.45),
        "edge"
      );

      if (influence <= 0) {
        continue;
      }

      dx += localDx * settings.strength * influence;
      dy += localDy * settings.strength * influence;
      nodeInfluence = Math.max(nodeInfluence, influence);
      nodeVisualInfluence = Math.max(nodeVisualInfluence, visualInfluence);
      nodeColorInfluence = Math.max(nodeColorInfluence, localNodeColorInfluence);

      const nodeRgb = node.rgb;
      if (nodeRgb && localNodeColorInfluence > 0) {
        const colorWeight = localNodeColorInfluence * Math.max(settings.nodeGlow ?? 1, 0);
        nodeColorR += nodeRgb.r * colorWeight;
        nodeColorG += nodeRgb.g * colorWeight;
        nodeColorB += nodeRgb.b * colorWeight;
        nodeColorWeight += colorWeight;
      }
    }

    if (nodeColorWeight > 0) {
      nodeColor = formatRgbColor({
        r: nodeColorR / nodeColorWeight,
        g: nodeColorG / nodeColorWeight,
        b: nodeColorB / nodeColorWeight,
      });
    }

    for (const link of links) {
      if (!pointInBounds(px, py, link.influenceBounds)) {
        continue;
      }

      const nearest = nearestPointOnSegment(px, py, link.x1, link.y1, link.x2, link.y2);
      const influence = computeFalloff(nearest.distance, settings.linkRadius, "soft");

      if (influence <= 0) {
        continue;
      }

      const strength =
        settings.connectionInfluence * (link.active ? 1.2 : 0.7) * (link.emphasis ?? 1);
      dx += (nearest.x - px) * strength * influence;
      dy += (nearest.y - py) * strength * influence;
      linkInfluence = Math.max(
        linkInfluence,
        clamp(influence * (link.active ? 1 : 0.65) * Math.max(settings.linkGlow, 0), 0, 1.6)
      );

      const linkRgb = link.rgb;
      if (linkRgb) {
        const colorWeight = influence * (link.active ? 1.3 : 0.9) * (link.emphasis ?? 1);
        linkColorR += linkRgb.r * colorWeight;
        linkColorG += linkRgb.g * colorWeight;
        linkColorB += linkRgb.b * colorWeight;
        linkColorWeight += colorWeight;
      }
    }

    if (linkColorWeight > 0) {
      linkColor = formatRgbColor({
        r: linkColorR / linkColorWeight,
        g: linkColorG / linkColorWeight,
        b: linkColorB / linkColorWeight,
      });
    }

    if (pointer?.active) {
      const localDx = pointer.x - px;
      const localDy = pointer.y - py;
      const influence = computeFalloff(Math.hypot(localDx, localDy), settings.pointerRadius, "soft");

      if (influence > 0) {
        dx += localDx * settings.pointerStrength * influence;
        dy += localDy * settings.pointerStrength * influence;
        pointerInfluence = influence;
      }
    }

    return {
      dx,
      dy,
      nodeInfluence,
      nodeVisualInfluence,
      nodeColorInfluence,
      nodeColor,
      linkInfluence,
      linkColor,
      pointerInfluence,
    };
  }

  _getPoint(col, row, restPoint) {
    const key = `${col}:${row}`;
    let point = this.points.get(key);

    if (!point) {
      point = {
        key,
        col,
        row,
        restX: restPoint.x,
        restY: restPoint.y,
        x: restPoint.x,
        y: restPoint.y,
        vx: 0,
        vy: 0,
        nodeInfluence: 0,
        nodeVisualInfluence: 0,
        nodeColorInfluence: 0,
        nodeColor: null,
        linkInfluence: 0,
        linkColor: null,
        pointerInfluence: 0,
        visibility: 1,
        screenX: 0,
        screenY: 0,
        activeFrame: 0,
      };
      this.points.set(key, point);
    } else {
      point.restX = restPoint.x;
      point.restY = restPoint.y;
    }

    return point;
  }

  _prunePoints() {
    for (const [key, point] of this.points.entries()) {
      if (point.activeFrame !== this.frameId) {
        this.points.delete(key);
      }
    }
  }

  _projectRect(node, viewport) {
    const screen = worldToScreen(node.x, node.y, viewport);
    return {
      x: screen.x,
      y: screen.y,
      width: node.width * viewport.zoom,
      height: node.height * viewport.zoom,
      radius: node.radius * viewport.zoom,
    };
  }

  _projectLink(link, viewport) {
    const from = worldToScreen(link.x1, link.y1, viewport);
    const to = worldToScreen(link.x2, link.y2, viewport);
    return {
      ...link,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    };
  }
}

function createExpandedSegmentBounds(link, radius) {
  const padding = Math.max(radius ?? 0, 0);
  const left = Math.min(link.x1, link.x2) - padding;
  const top = Math.min(link.y1, link.y2) - padding;
  const right = Math.max(link.x1, link.x2) + padding;
  const bottom = Math.max(link.y1, link.y2) + padding;
  return { left, top, right, bottom };
}

function pointInBounds(x, y, bounds) {
  if (!bounds) {
    return true;
  }

  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function buildProxySegments(segments, maxSegments = 1) {
  const baseSegments = segments.filter((segment) => !segment.marker);
  if (!baseSegments.length) {
    return [];
  }

  if (baseSegments.length <= maxSegments) {
    return baseSegments;
  }

  const targetCount = Math.max(1, Math.min(maxSegments, baseSegments.length));
  const selected = [];
  const usedIndices = new Set();

  for (let index = 0; index < targetCount; index += 1) {
    const t = targetCount === 1 ? 0.5 : index / (targetCount - 1);
    const segmentIndex = Math.round((baseSegments.length - 1) * t);
    if (usedIndices.has(segmentIndex)) {
      continue;
    }

    usedIndices.add(segmentIndex);
    selected.push({
      ...baseSegments[segmentIndex],
      emphasis: (baseSegments[segmentIndex].emphasis ?? 1) * 0.9,
      proxy: true,
    });
  }

  return selected;
}
