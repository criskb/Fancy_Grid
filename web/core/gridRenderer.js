import { DEFAULT_GRID_SETTINGS, mergeSettings } from "./defaultSettings.js";
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
    this._drawHighlightedLines(context, frame, settings, "screen");

    if (drawConnectionPaths) {
      this._drawConnectionLines(context, frame.visibleLinks, settings);
    }

    this._drawDots(context, frame.points, settings, "screen");
    this._drawHighlightedDots(context, frame.points, settings, "screen");

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
    this._drawHighlightedLines(context, frame, settings, "world");
    this._drawDots(context, frame.points, settings, "world");
    this._drawHighlightedDots(context, frame.points, settings, "world");
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
    glow.addColorStop(0, rgba(settings.backgroundGlowColor, settings.backgroundAlpha * 0.6));
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

      context.strokeStyle = rgba(settings.lineColor, settings.lineAlpha);
      context.lineWidth = settings.lineWidth;
      context.stroke();
      return;
    }

    context.lineWidth = settings.lineWidth;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const point = points[index];
        if (!point) {
          continue;
        }

        if (col < cols - 1) {
          const right = points[index + 1];
          this._strokeBaseSegment(context, point, right, settings, coordinateSpace);
        }

        if (row < rows - 1) {
          const below = points[index + cols];
          this._strokeBaseSegment(context, point, below, settings, coordinateSpace);
        }
      }
    }
  }

  _strokeBaseSegment(context, a, b, settings, coordinateSpace) {
    if (!a || !b) {
      return;
    }

    const alpha = settings.lineAlpha * this._segmentVisibility(a, b);
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
          this._strokeHighlightSegment(context, point, right, settings, coordinateSpace);
        }

        if (row < rows - 1) {
          const below = points[index + cols];
          this._strokeHighlightSegment(context, point, below, settings, coordinateSpace);
        }
      }
    }
  }

  _strokeHighlightSegment(context, a, b, settings, coordinateSpace) {
    const nodeInfluence = Math.max(a.nodeVisualInfluence ?? a.nodeInfluence, b.nodeVisualInfluence ?? b.nodeInfluence);
    const linkInfluence = Math.max(a.linkInfluence, b.linkInfluence);
    const pointerInfluence = Math.max(a.pointerInfluence, b.pointerInfluence);
    const nodeGlow = settings.nodeGlow ?? 1;
    const nodeStrength = nodeInfluence * nodeGlow;
    const nodeColorStrength = this._segmentNodeColorInfluence(a, b) * nodeGlow;
    const alpha = nodeStrength * settings.lineAlpha * 1.8 + linkInfluence * 0.22 + pointerInfluence * 0.12;

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

    context.beginPath();
    context.moveTo(this._x(a, coordinateSpace), this._y(a, coordinateSpace));
    context.lineTo(this._x(b, coordinateSpace), this._y(b, coordinateSpace));
    context.strokeStyle = rgba(tint, alpha);
    context.lineWidth = settings.lineWidth + linkInfluence * 0.8 + pointerInfluence * 0.35;
    context.stroke();
  }

  _drawDots(context, points, settings, coordinateSpace) {
    if ((settings.gridVisibility ?? 1) >= 0.999) {
      context.beginPath();

      for (const point of points) {
        if (!point) {
          continue;
        }

        const x = this._x(point, coordinateSpace);
        const y = this._y(point, coordinateSpace);
        context.moveTo(x + settings.dotRadius, y);
        context.arc(x, y, settings.dotRadius, 0, Math.PI * 2);
      }

      context.fillStyle = rgba(settings.dotColor, settings.dotAlpha);
      context.fill();
      return;
    }

    for (const point of points) {
      if (!point) {
        continue;
      }

      const alpha = settings.dotAlpha * this._pointVisibility(point);
      if (alpha <= 0.003) {
        continue;
      }

      const x = this._x(point, coordinateSpace);
      const y = this._y(point, coordinateSpace);
      context.beginPath();
      context.arc(x, y, settings.dotRadius, 0, Math.PI * 2);
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
    for (const point of points) {
      if (!point) {
        continue;
      }

      const nodeInfluence = point.nodeVisualInfluence ?? point.nodeInfluence;
      const nodeStrength = nodeInfluence * 0.5 * (settings.nodeGlow ?? 1);
      const nodeColorStrength = (point.nodeColorInfluence ?? 0) * 0.5 * (settings.nodeGlow ?? 1);
      const strength = Math.max(nodeStrength, point.linkInfluence, point.pointerInfluence * 0.8);
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

      context.beginPath();
      context.arc(x, y, settings.dotRadius + strength * 1.4, 0, Math.PI * 2);
      context.fillStyle = rgba(tint, strength * 0.6);
      context.fill();
    }
  }

  _drawConnectionLines(context, links, settings) {
    for (const link of links) {
      const midpointX = (link.x1 + link.x2) * 0.5;
      context.beginPath();
      context.moveTo(link.x1, link.y1);
      context.bezierCurveTo(midpointX, link.y1, midpointX, link.y2, link.x2, link.y2);
      context.strokeStyle = rgba(
        link.active ? settings.highlightColor : settings.linkIdleColor,
        link.active ? 0.92 : 0.28
      );
      context.lineWidth = link.active ? 2.3 : 1.4;
      context.stroke();
    }
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
