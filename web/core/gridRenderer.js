import { DEFAULT_GRID_SETTINGS, getPerformanceProfile, mergeSettings } from "./defaultSettings.js";
import { getGridStyleDefinition } from "./gridStyles.js";
import { rgba, roundedRectPath } from "./geometry.js";

export class ReactiveGridRenderer {
  constructor({ canvas = null, settings = {}, drawBackground = false } = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.("2d") ?? null;
    this.settings = mergeSettings(DEFAULT_GRID_SETTINGS, settings);
    this.drawBackground = drawBackground;
    this.lastSizeKey = "";
  }

  setSettings(patch = {}) {
    this.settings = mergeSettings(this.settings, patch);
  }

  render(frame, options = {}) {
    if (!this.canvas || !this.context) {
      return;
    }

    const drawBackground = options.drawBackground ?? this.drawBackground;
    const drawConnectionPaths = options.drawConnectionPaths ?? false;
    const dpr = options.dpr ?? window.devicePixelRatio ?? 1;
    this._resize(frame.width, frame.height, dpr);

    const context = this.context;
    const settings = this.settings;
    context.clearRect(0, 0, frame.width, frame.height);

    if (drawBackground) {
      this._drawScreenBackground(context, frame.width, frame.height, settings);
    }

    this._drawBaseLines(context, frame, settings, "screen");
    if (this._shouldDrawHighlights(frame)) {
      this._drawHighlightedLines(context, frame, settings, "screen");
    }

    if (drawConnectionPaths) {
      this._drawConnectionLines(context, frame.visibleLinks, settings);
    }

    if (!this._shouldSkipBaseDots(frame, settings)) {
      this._drawDots(context, frame.points, settings, "screen");
    }

    if (!this._shouldSkipHighlightDots(frame, settings)) {
      this._drawHighlightedDots(context, frame.points, settings, "screen");
    }

    if (options.workflowRunState?.active) {
      this._drawWorkflowRunLines(context, options.workflowRunState, settings, "screen");
    }

    if (frame.screenNodes.length) {
      this._maskNodeCards(context, frame.screenNodes, settings);
    }
  }

  renderGraph(frame, options = {}) {
    const context = options.context;
    if (!context || !frame) {
      return;
    }

    const settings = options.settings ? mergeSettings(this.settings, options.settings) : this.settings;

    if (options.drawBackground && frame.worldBounds) {
      this._drawWorldBackground(context, frame.worldBounds, settings);
    }

    this._drawBaseLines(context, frame, settings, "world");
    if (this._shouldDrawHighlights(frame)) {
      this._drawHighlightedLines(context, frame, settings, "world");
    }

    if (!this._shouldSkipBaseDots(frame, settings)) {
      this._drawDots(context, frame.points, settings, "world");
    }

    if (!this._shouldSkipHighlightDots(frame, settings)) {
      this._drawHighlightedDots(context, frame.points, settings, "world");
    }

    if (options.workflowRunState?.active) {
      this._drawWorkflowRunLines(context, options.workflowRunState, settings, "world");
    }
  }

  renderScreenBackground(context, width, height, options = {}) {
    if (!context || !width || !height) {
      return;
    }

    const settings = options.settings ? mergeSettings(this.settings, options.settings) : this.settings;
    this._drawScreenBackground(context, width, height, settings);
  }

  _resize(width, height, dpr) {
    const nextSizeKey = `${width}x${height}@${dpr}`;
    if (nextSizeKey === this.lastSizeKey) {
      return;
    }

    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.lastSizeKey = nextSizeKey;
  }

  _drawScreenBackground(context, width, height, settings) {
    const style = this._getStyle(settings);
    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, rgba(settings.backgroundColorTop, settings.backgroundAlpha));
    background.addColorStop(1, rgba(settings.backgroundColorBottom, settings.backgroundAlpha));
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(
      width * 0.58,
      height * 0.34,
      0,
      width * 0.58,
      height * 0.34,
      Math.max(width, height) * 0.72
    );
    glow.addColorStop(
      0,
      rgba(settings.backgroundGlowColor, settings.backgroundAlpha * 0.6 * this._getBackgroundGlowScale(style))
    );
    glow.addColorStop(1, rgba(settings.backgroundGlowColor, 0));
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  _drawWorldBackground(context, bounds, settings) {
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const background = context.createLinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom);
    background.addColorStop(0, rgba(settings.backgroundColorTop, 1));
    background.addColorStop(1, rgba(settings.backgroundColorBottom, 1));
    context.fillStyle = background;
    context.fillRect(bounds.left, bounds.top, width, height);
  }

  _drawBaseLines(context, frame, settings, coordinateSpace) {
    const style = this._getStyle(settings);
    const lineAlpha = this._getLineAlpha(settings, style);
    const lineWidth = this._getLineWidth(settings, style);
    const { cols, rows, points } = frame;

    if ((settings.gridVisibility ?? 1) >= 0.999) {
      context.beginPath();

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          const point = points[index];
          if (!point) {
            continue;
          }

          if (col < cols - 1) {
            const right = points[index + 1];
            context.moveTo(this._x(point, coordinateSpace), this._y(point, coordinateSpace));
            context.lineTo(this._x(right, coordinateSpace), this._y(right, coordinateSpace));
          }

          if (row < rows - 1) {
            const below = points[index + cols];
            context.moveTo(this._x(point, coordinateSpace), this._y(point, coordinateSpace));
            context.lineTo(this._x(below, coordinateSpace), this._y(below, coordinateSpace));
          }
        }
      }

      context.strokeStyle = rgba(settings.lineColor, lineAlpha);
      context.lineWidth = lineWidth;
      context.stroke();
      return;
    }

    context.lineWidth = lineWidth;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const point = points[index];
        if (!point) {
          continue;
        }

        if (col < cols - 1) {
          const right = points[index + 1];
          this._strokeBaseSegment(context, point, right, settings, coordinateSpace, style);
        }

        if (row < rows - 1) {
          const below = points[index + cols];
          this._strokeBaseSegment(context, point, below, settings, coordinateSpace, style);
        }
      }
    }
  }

  _strokeBaseSegment(context, a, b, settings, coordinateSpace, style) {
    if (!a || !b) {
      return;
    }

    const alpha = this._getLineAlpha(settings, style) * this._segmentVisibility(a, b);
    if (alpha <= 0.0015) {
      return;
    }

    context.beginPath();
    context.moveTo(this._x(a, coordinateSpace), this._y(a, coordinateSpace));
    context.lineTo(this._x(b, coordinateSpace), this._y(b, coordinateSpace));
    context.strokeStyle = rgba(settings.lineColor, alpha);
    context.stroke();
  }

  _drawHighlightedLines(context, frame, settings, coordinateSpace) {
    const style = this._getStyle(settings);
    const { cols, rows, points } = frame;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const point = points[index];
        if (!point) {
          continue;
        }

        if (col < cols - 1) {
          const right = points[index + 1];
          this._strokeHighlightSegment(context, point, right, settings, coordinateSpace, style);
        }

        if (row < rows - 1) {
          const below = points[index + cols];
          this._strokeHighlightSegment(context, point, below, settings, coordinateSpace, style);
        }
      }
    }
  }

  _strokeHighlightSegment(context, a, b, settings, coordinateSpace, style) {
    const nodeInfluence = Math.max(a.nodeVisualInfluence ?? a.nodeInfluence, b.nodeVisualInfluence ?? b.nodeInfluence);
    const linkInfluence = Math.max(a.linkInfluence, b.linkInfluence);
    const pointerInfluence = Math.max(a.pointerInfluence, b.pointerInfluence);
    const nodeGlow = settings.nodeGlow ?? 1;
    const nodeStrength = nodeInfluence * nodeGlow;
    const nodeColorStrength = this._segmentNodeColorInfluence(a, b) * nodeGlow;
    const visibility = this._segmentVisibility(a, b);
    const alpha =
      (nodeStrength * this._getLineAlpha(settings, style) * 1.8 +
        linkInfluence * 0.22 +
        pointerInfluence * 0.12) *
      this._getHighlightScale(style) *
      visibility;

    if (alpha <= 0.012) {
      return;
    }

    const linkTint = this._segmentLinkTint(a, b, settings);
    const nodeTint = this._segmentNodeTint(a, b, settings);
    const tint = linkInfluence > 0.02
      ? linkTint
      : pointerInfluence > nodeStrength
        ? settings.accentColor
        : nodeColorStrength > 0.018
          ? nodeTint
          : settings.lineColor;
    const lineWidth =
      this._getLineWidth(settings, style) + linkInfluence * 0.8 + pointerInfluence * 0.35;

    if (this._shouldUseColorGlow(settings)) {
      const glowStrength = Math.max(linkInfluence * Math.max(settings.linkGlow ?? 1, 0.3), nodeStrength, pointerInfluence);
      this._strokeGlowSegment(context, a, b, coordinateSpace, {
        tint,
        alpha: Math.min(0.34, alpha * (0.18 + glowStrength * 0.28)),
        lineWidth: lineWidth + 2.4 + glowStrength * 3.2,
      });
    }

    context.beginPath();
    context.moveTo(this._x(a, coordinateSpace), this._y(a, coordinateSpace));
    context.lineTo(this._x(b, coordinateSpace), this._y(b, coordinateSpace));
    context.strokeStyle = rgba(tint, alpha);
    context.lineWidth = lineWidth;
    context.stroke();
  }

  _drawDots(context, points, settings, coordinateSpace) {
    const style = this._getStyle(settings);
    const dotRadius = this._getDotRadius(settings, style);
    const dotAlpha = this._getDotAlpha(settings, style);

    if ((settings.gridVisibility ?? 1) >= 0.999) {
      context.beginPath();

      for (const point of points) {
        if (!point) {
          continue;
        }

        const x = this._x(point, coordinateSpace);
        const y = this._y(point, coordinateSpace);
        context.moveTo(x + dotRadius, y);
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
      }

      context.fillStyle = rgba(settings.dotColor, dotAlpha);
      context.fill();
      return;
    }

    for (const point of points) {
      if (!point) {
        continue;
      }

      const alpha = dotAlpha * this._pointVisibility(point);
      if (alpha <= 0.003) {
        continue;
      }

      const x = this._x(point, coordinateSpace);
      const y = this._y(point, coordinateSpace);
      context.beginPath();
      context.arc(x, y, dotRadius, 0, Math.PI * 2);
      context.fillStyle = rgba(settings.dotColor, alpha);
      context.fill();
    }
  }

  _segmentVisibility(a, b) {
    return Math.max(this._pointVisibility(a), this._pointVisibility(b));
  }

  _pointVisibility(point) {
    return Math.min(Math.max(point?.visibility ?? 1, 0), 1);
  }

  _segmentLinkTint(a, b, settings) {
    if ((a?.linkInfluence ?? 0) >= (b?.linkInfluence ?? 0)) {
      return a?.linkColor ?? b?.linkColor ?? settings.highlightColor;
    }

    return b?.linkColor ?? a?.linkColor ?? settings.highlightColor;
  }

  _segmentNodeTint(a, b, settings) {
    if ((a?.nodeColorInfluence ?? 0) >= (b?.nodeColorInfluence ?? 0)) {
      return a?.nodeColor ?? b?.nodeColor ?? settings.lineColor;
    }

    return b?.nodeColor ?? a?.nodeColor ?? settings.lineColor;
  }

  _segmentNodeColorInfluence(a, b) {
    return Math.max(a?.nodeColorInfluence ?? 0, b?.nodeColorInfluence ?? 0);
  }

  _drawHighlightedDots(context, points, settings, coordinateSpace) {
    const style = this._getStyle(settings);
    const dotRadius = this._getDotRadius(settings, style);
    const highlightScale = this._getHighlightScale(style);

    for (const point of points) {
      if (!point) {
        continue;
      }

      const visibility = this._pointVisibility(point);
      const nodeInfluence = point.nodeVisualInfluence ?? point.nodeInfluence;
      const nodeStrength = nodeInfluence * 0.5 * (settings.nodeGlow ?? 1);
      const nodeColorStrength = (point.nodeColorInfluence ?? 0) * 0.5 * (settings.nodeGlow ?? 1);
      const strength =
        Math.max(nodeStrength, point.linkInfluence, point.pointerInfluence * 0.8) * highlightScale * visibility;
      if (strength <= 0.025) {
        continue;
      }

      const tint = point.linkInfluence > 0.02
        ? point.linkColor ?? settings.highlightColor
        : point.pointerInfluence > nodeStrength
          ? settings.accentColor
          : nodeColorStrength > 0.018
            ? point.nodeColor ?? settings.dotColor
            : settings.dotColor;
      const x = this._x(point, coordinateSpace);
      const y = this._y(point, coordinateSpace);

      if (this._shouldUseColorGlow(settings)) {
        const glowScale =
          point.linkInfluence > 0.02
            ? Math.max(settings.linkGlow ?? 1, 0.4)
            : nodeColorStrength > 0.018
              ? Math.max(settings.nodeGlow ?? 1, 0.4)
              : 0.8;
        this._fillGlowDot(
          context,
          x,
          y,
          dotRadius + strength * 3,
          tint,
          Math.min(0.3, strength * 0.24 * glowScale)
        );
      }

      context.beginPath();
      context.arc(x, y, dotRadius + strength * 1.4, 0, Math.PI * 2);
      context.fillStyle = rgba(tint, strength * 0.6);
      context.fill();
    }
  }

  _getStyle(settings) {
    return getGridStyleDefinition(settings.gridStyle);
  }

  _getDotAlpha(settings, style) {
    return settings.dotAlpha * (style.dotAlphaScale ?? 1);
  }

  _getDotRadius(settings, style) {
    return settings.dotRadius * (style.dotRadiusScale ?? 1);
  }

  _getLineAlpha(settings, style) {
    return settings.lineAlpha * (style.lineAlphaScale ?? 1);
  }

  _getLineWidth(settings, style) {
    return settings.lineWidth * (style.lineWidthScale ?? 1);
  }

  _getHighlightScale(style) {
    return style.highlightScale ?? 1;
  }

  _getBackgroundGlowScale(style) {
    return style.backgroundGlowScale ?? 1;
  }

  _drawConnectionLines(context, links, settings) {
    for (const link of links) {
      const tint = link.active ? settings.highlightColor : settings.linkIdleColor;
      const alpha = link.active ? 0.92 : 0.28;
      const lineWidth = link.active ? 2.3 : 1.4;

      if (this._shouldUseColorGlow(settings)) {
        const glowWeight = Math.max(settings.linkGlow ?? 1, 0.35) * (link.active ? 1 : 0.72);
        this._strokeConnectionGlow(context, link, {
          tint,
          alpha: Math.min(0.28, alpha * (0.24 + glowWeight * 0.16)),
          lineWidth: lineWidth + 2 + glowWeight * 2.4,
        });
      }

      context.beginPath();
      this._traceConnectionCurve(context, link);
      context.strokeStyle = rgba(tint, alpha);
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  _drawWorkflowRunLines(context, workflowRunState, settings, coordinateSpace) {
    const links = workflowRunState?.links;
    if (!Array.isArray(links) || !links.length) {
      return;
    }

    const elapsed = Math.max((workflowRunState.now - workflowRunState.startedAt) * 0.001, 0);
    const style = workflowRunState.style ?? settings.workflowRunStyle ?? "pulse-trail";
    const baseWidth = 1.45 + (settings.lineWidth ?? 1) * 0.9;

    for (const link of links) {
      if (!link || link.marker) {
        continue;
      }

      this._strokeLinkSegment(context, link, coordinateSpace, {
        tint: settings.highlightColor,
        alpha: 0.22,
        lineWidth: baseWidth + 0.8,
      });

      switch (style) {
        case "comet-flow":
          this._drawWorkflowComet(context, link, coordinateSpace, settings, elapsed, baseWidth);
          break;
        case "scan-sweep":
          this._drawWorkflowScan(context, link, coordinateSpace, settings, elapsed, baseWidth);
          break;
        default:
          this._drawWorkflowPulse(context, link, coordinateSpace, settings, elapsed, baseWidth);
          break;
      }
    }
  }

  _drawWorkflowPulse(context, link, coordinateSpace, settings, elapsed, baseWidth) {
    const head = mod01(elapsed * 1.8 - (link.segmentIndex ?? 0) * 0.18);
    this._strokeAnimatedLinkTrail(context, link, coordinateSpace, {
      tint: settings.highlightColor,
      glowTint: settings.accentColor,
      alpha: 0.88,
      glowAlpha: 0.22,
      lineWidth: baseWidth + 1.2,
      glowWidth: baseWidth + 4.2,
      head,
      length: 0.42,
    });
  }

  _drawWorkflowComet(context, link, coordinateSpace, settings, elapsed, baseWidth) {
    const head = mod01(elapsed * 2.35 - (link.segmentIndex ?? 0) * 0.22);
    this._strokeAnimatedLinkTrail(context, link, coordinateSpace, {
      tint: settings.accentColor,
      glowTint: settings.highlightColor,
      alpha: 0.96,
      glowAlpha: 0.3,
      lineWidth: baseWidth + 1.8,
      glowWidth: baseWidth + 5.8,
      head,
      length: 0.62,
    });
  }

  _drawWorkflowScan(context, link, coordinateSpace, settings, elapsed, baseWidth) {
    const primaryHead = mod01(elapsed * 2.8 - (link.segmentIndex ?? 0) * 0.16);
    const secondaryHead = mod01(primaryHead + 0.48);

    this._strokeAnimatedLinkTrail(context, link, coordinateSpace, {
      tint: settings.highlightColor,
      glowTint: settings.highlightColor,
      alpha: 0.76,
      glowAlpha: 0.16,
      lineWidth: baseWidth + 0.9,
      glowWidth: baseWidth + 3.2,
      head: primaryHead,
      length: 0.18,
    });
    this._strokeAnimatedLinkTrail(context, link, coordinateSpace, {
      tint: settings.accentColor,
      glowTint: settings.accentColor,
      alpha: 0.72,
      glowAlpha: 0.14,
      lineWidth: baseWidth + 0.6,
      glowWidth: baseWidth + 2.8,
      head: secondaryHead,
      length: 0.14,
    });
  }

  _strokeAnimatedLinkTrail(
    context,
    link,
    coordinateSpace,
    { tint, glowTint = tint, alpha, glowAlpha, lineWidth, glowWidth, head, length }
  ) {
    const start = head - Math.max(length, 0.02);
    if (glowAlpha > 0.003 && glowWidth > 0) {
      this._strokePartialLinkSegment(context, link, coordinateSpace, {
        tint: glowTint,
        alpha: glowAlpha,
        lineWidth: glowWidth,
        start,
        end: head,
      });
    }

    this._strokePartialLinkSegment(context, link, coordinateSpace, {
      tint,
      alpha,
      lineWidth,
      start,
      end: head,
    });
  }

  _strokePartialLinkSegment(context, link, coordinateSpace, { tint, alpha, lineWidth, start, end }) {
    if (alpha <= 0.003 || lineWidth <= 0) {
      return;
    }

    const clampedStart = Math.max(start, 0);
    const clampedEnd = Math.min(end, 1);
    if (start < 0) {
      this._strokePartialLinkSegment(context, link, coordinateSpace, {
        tint,
        alpha,
        lineWidth,
        start: 1 + start,
        end: 1,
      });
    }

    if (end > 1) {
      this._strokePartialLinkSegment(context, link, coordinateSpace, {
        tint,
        alpha,
        lineWidth,
        start: 0,
        end: end - 1,
      });
    }

    if (clampedEnd - clampedStart <= 0.01) {
      return;
    }

    const startPoint = interpolateLinkSegment(link, coordinateSpace, clampedStart);
    const endPoint = interpolateLinkSegment(link, coordinateSpace, clampedEnd);
    this._strokeLine(context, startPoint, endPoint, { tint, alpha, lineWidth });
  }

  _strokeLinkSegment(context, link, coordinateSpace, { tint, alpha, lineWidth }) {
    const start = {
      x: coordinateSpace === "world" ? link.x1 : link.screenX1 ?? link.x1,
      y: coordinateSpace === "world" ? link.y1 : link.screenY1 ?? link.y1,
    };
    const end = {
      x: coordinateSpace === "world" ? link.x2 : link.screenX2 ?? link.x2,
      y: coordinateSpace === "world" ? link.y2 : link.screenY2 ?? link.y2,
    };
    this._strokeLine(context, start, end, { tint, alpha, lineWidth });
  }

  _strokeLine(context, start, end, { tint, alpha, lineWidth }) {
    if (alpha <= 0.003 || lineWidth <= 0) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = rgba(tint, alpha);
    context.lineWidth = lineWidth;
    context.stroke();
    context.restore();
  }

  _strokeGlowSegment(context, a, b, coordinateSpace, { tint, alpha, lineWidth }) {
    if (alpha <= 0.003 || lineWidth <= 0) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(this._x(a, coordinateSpace), this._y(a, coordinateSpace));
    context.lineTo(this._x(b, coordinateSpace), this._y(b, coordinateSpace));
    context.strokeStyle = rgba(tint, alpha);
    context.lineWidth = lineWidth;
    context.stroke();
    context.restore();
  }

  _fillGlowDot(context, x, y, radius, tint, alpha) {
    if (alpha <= 0.003 || radius <= 0) {
      return;
    }

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = rgba(tint, alpha);
    context.fill();
  }

  _strokeConnectionGlow(context, link, { tint, alpha, lineWidth }) {
    if (alpha <= 0.003 || lineWidth <= 0) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    this._traceConnectionCurve(context, link);
    context.strokeStyle = rgba(tint, alpha);
    context.lineWidth = lineWidth;
    context.stroke();
    context.restore();
  }

  _traceConnectionCurve(context, link) {
    const midpointX = (link.x1 + link.x2) * 0.5;
    context.moveTo(link.x1, link.y1);
    context.bezierCurveTo(midpointX, link.y1, midpointX, link.y2, link.x2, link.y2);
  }

  _shouldUseColorGlow(settings) {
    const profile = getPerformanceProfile(settings.performanceMode);
    return Boolean(settings.colorGlow && (profile.allowColorGlow ?? true));
  }

  _shouldDrawHighlights(frame) {
    return Boolean(frame?.hasDirectInteraction || (frame?.stats?.influence ?? 0) > 0.01);
  }

  _shouldSkipBaseDots(frame, settings) {
    const profile = getPerformanceProfile(settings.performanceMode);
    return Boolean(
      frame?.detailLevel?.skipBaseDots || (!frame?.hasDirectInteraction && (profile.idleSkipBaseDots ?? false))
    );
  }

  _shouldSkipHighlightDots(frame, settings) {
    const profile = getPerformanceProfile(settings.performanceMode);
    return Boolean(
      frame?.detailLevel?.skipHighlightDots ||
        (!frame?.hasDirectInteraction && (profile.idleSkipHighlightDots ?? false))
    );
  }

  _maskNodeCards(context, nodes, settings) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();

    for (const node of nodes) {
      roundedRectPath(
        context,
        node.x - settings.nodeMaskPadding,
        node.y - settings.nodeMaskPadding,
        node.width + settings.nodeMaskPadding * 2,
        node.height + settings.nodeMaskPadding * 2,
        node.radius + settings.nodeMaskPadding
      );
    }

    context.fill();
    context.restore();
  }

  _x(point, coordinateSpace) {
    return coordinateSpace === "world" ? point.x : point.screenX;
  }

  _y(point, coordinateSpace) {
    return coordinateSpace === "world" ? point.y : point.screenY;
  }
}

function interpolateLinkSegment(link, coordinateSpace, fraction) {
  const startX = coordinateSpace === "world" ? link.x1 : link.screenX1 ?? link.x1;
  const startY = coordinateSpace === "world" ? link.y1 : link.screenY1 ?? link.y1;
  const endX = coordinateSpace === "world" ? link.x2 : link.screenX2 ?? link.x2;
  const endY = coordinateSpace === "world" ? link.y2 : link.screenY2 ?? link.y2;
  const t = Math.min(Math.max(fraction, 0), 1);

  return {
    x: startX + (endX - startX) * t,
    y: startY + (endY - startY) * t,
  };
}

function mod01(value) {
  return ((value % 1) + 1) % 1;
}
