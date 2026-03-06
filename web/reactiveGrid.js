import { app } from "../../scripts/app.js";
import {
  DEFAULT_GRID_SETTINGS,
  NODE_VISUAL_FALLOFF_OPTIONS,
  getPerformanceProfile,
} from "./core/defaultSettings.js";
import { ReactiveGridField } from "./core/fieldEngine.js";
import { ReactiveGridRenderer } from "./core/gridRenderer.js";
import {
  findFrameSnapPoint,
  findGridSnapPoint as resolveGridSnapPoint,
} from "./core/gridSnap.js";
import {
  extractActiveCable,
  extractCuttableLinks,
  extractLinks,
  extractNodes,
  extractViewport,
  getLinkConnector,
  getSettingValue,
  isCanvasInteracting,
  waitForCanvas,
} from "./core/comfyAdapter.js";
import { rgba, screenToWorld, segmentsIntersect } from "./core/geometry.js";

const EXTENSION_NAME = "FancyGrid.ReactiveBackground";
const STICKY_REROUTE_STORAGE_KEY = "FancyGridStickyReroutes";
const CUT_FADE_DURATION_MS = 220;
const CUT_MIN_DISTANCE = 4;
const CUT_COLOR = "255,72,72";
const CUT_COLOR_TRAIL = "255,184,184";
const SETTING_IDS = {
  enabled: "FancyGrid.Enabled",
  spacing: "FancyGrid.Spacing",
  radius: "FancyGrid.Radius",
  strength: "FancyGrid.Strength",
  connectionInfluence: "FancyGrid.ConnectionInfluence",
  spring: "FancyGrid.Spring",
  damping: "FancyGrid.Damping",
  nodeVisualFalloff: "FancyGrid.NodeVisualFalloff",
  gridVisibility: "FancyGrid.GridVisibility",
  linkGlow: "FancyGrid.LinkGlow",
  nodeGlow: "FancyGrid.NodeGlow",
  dotAlpha: "FancyGrid.DotAlpha",
  lineAlpha: "FancyGrid.LineAlpha",
  performanceMode: "FancyGrid.PerformanceMode",
};

class FancyGridController {
  constructor(appInstance) {
    this.app = appInstance;
    this.settings = this.readSettings();
    this.field = new ReactiveGridField(this.settings);
    this.renderer = new ReactiveGridRenderer({ settings: this.settings });
    this.canvasElement = null;
    this.pointer = { active: false, x: 0, y: 0 };
    this.lastFrameAt = performance.now();
    this.lastInteractionAt = 0;
    this.lastFrame = null;
    this.hooksInstalled = false;
    this.pointerListenersInstalled = false;
    this.linkConnectorListenersInstalled = false;
    this.originalOnRenderBackground = null;
    this.originalOnDrawBackground = null;
    this.originalOnDrawForeground = null;
    this.snapPreview = null;
    this.redrawFrameId = 0;
    this.redrawLoopActive = false;
    this.cutGesture = null;
    this.cutFades = [];
    this.nativePreviewColorSnapshot = null;
  }

  async start() {
    this.canvasElement = await waitForCanvas(this.app);
    this.installCanvasHooks();
    this.installPointerListeners();
    this.installLinkConnectorListeners();
    this.refreshSettings();
  }

  refreshSettings() {
    this.settings = this.readSettings();
    this.field.setSettings(this.settings);
    this.renderer.setSettings(this.settings);
    this.lastFrameAt = performance.now();

    if (!this.settings.enabled) {
      this.field.reset();
      this.lastFrame = null;
      this.snapPreview = null;
      this.removeCutPointerListeners();
      this.cutGesture = null;
      this.cutFades = [];
      this.restoreNativePreviewLinkColors();
      this.syncRedrawLoop(false);
    }

    this.requestRedraw();
  }

  readSettings() {
    return {
      ...DEFAULT_GRID_SETTINGS,
      enabled: getSettingValue(this.app, SETTING_IDS.enabled, DEFAULT_GRID_SETTINGS.enabled),
      spacing: getSettingValue(this.app, SETTING_IDS.spacing, DEFAULT_GRID_SETTINGS.spacing),
      radius: getSettingValue(this.app, SETTING_IDS.radius, DEFAULT_GRID_SETTINGS.radius),
      strength: getSettingValue(this.app, SETTING_IDS.strength, DEFAULT_GRID_SETTINGS.strength),
      connectionInfluence: getSettingValue(
        this.app,
        SETTING_IDS.connectionInfluence,
        DEFAULT_GRID_SETTINGS.connectionInfluence
      ),
      spring: getSettingValue(this.app, SETTING_IDS.spring, DEFAULT_GRID_SETTINGS.spring),
      damping: getSettingValue(this.app, SETTING_IDS.damping, DEFAULT_GRID_SETTINGS.damping),
      nodeVisualFalloff: getSettingValue(
        this.app,
        SETTING_IDS.nodeVisualFalloff,
        DEFAULT_GRID_SETTINGS.nodeVisualFalloff
      ),
      gridVisibility: getSettingValue(
        this.app,
        SETTING_IDS.gridVisibility,
        DEFAULT_GRID_SETTINGS.gridVisibility
      ),
      linkGlow: getSettingValue(this.app, SETTING_IDS.linkGlow, DEFAULT_GRID_SETTINGS.linkGlow),
      nodeGlow: getSettingValue(this.app, SETTING_IDS.nodeGlow, DEFAULT_GRID_SETTINGS.nodeGlow),
      dotAlpha: getSettingValue(this.app, SETTING_IDS.dotAlpha, DEFAULT_GRID_SETTINGS.dotAlpha),
      lineAlpha: getSettingValue(this.app, SETTING_IDS.lineAlpha, DEFAULT_GRID_SETTINGS.lineAlpha),
      performanceMode: getSettingValue(
        this.app,
        SETTING_IDS.performanceMode,
        DEFAULT_GRID_SETTINGS.performanceMode
      ),
    };
  }

  installCanvasHooks() {
    if (this.hooksInstalled || !this.app?.canvas) {
      return;
    }

    this.originalOnRenderBackground = this.app.canvas.onRenderBackground;
    this.originalOnDrawBackground = this.app.canvas.onDrawBackground;
    this.originalOnDrawForeground = this.app.canvas.onDrawForeground;
    const controller = this;

    this.app.canvas.onRenderBackground = function onRenderBackground() {
      const result = controller.originalOnRenderBackground?.apply(this, arguments);

      if (!controller.settings.enabled) {
        return result;
      }

      const [canvasElement, context] = arguments;
      if (canvasElement && context) {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        controller.renderer.renderScreenBackground(context, canvasElement.width, canvasElement.height);
        context.restore();
      }

      return true;
    };

    this.app.canvas.onDrawBackground = function onDrawBackground(ctx, visibleArea) {
      const result = controller.originalOnDrawBackground?.apply(this, arguments);
      controller.drawReactiveGrid(ctx, visibleArea);
      return result;
    };

    this.app.canvas.onDrawForeground = function onDrawForeground(ctx, visibleArea) {
      const result = controller.originalOnDrawForeground?.apply(this, arguments);

      if (controller.settings.enabled) {
        controller.drawCutEffects(ctx, visibleArea);
      }

      controller.restoreNativePreviewLinkColors();

      return result;
    };

    this.hooksInstalled = true;
  }

  installPointerListeners() {
    if (this.pointerListenersInstalled || !this.canvasElement) {
      return;
    }

    this.canvasElement.addEventListener("pointerdown", this.handlePointerDownCapture, true);
    this.canvasElement.addEventListener("pointermove", this.handlePointerMove);
    this.canvasElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.pointerListenersInstalled = true;
  }

  installLinkConnectorListeners() {
    const connector = getLinkConnector(this.app);
    if (this.linkConnectorListenersInstalled || !connector?.events) {
      return;
    }

    // Capture-phase interception prevents Comfy's empty-canvas drop menu when the
    // user is intentionally dropping a cable onto one of Fancy Grid's snap points.
    connector.events.addEventListener("dropped-on-canvas", this.handleCableDroppedOnCanvas, {
      capture: true,
    });
    connector.events.addEventListener("dropped-on-node", this.handleCableDroppedOnNode, {
      capture: true,
    });
    connector.events.addEventListener("reset", this.handleConnectorReset);
    this.linkConnectorListenersInstalled = true;
  }

  handlePointerMove = (event) => {
    if (!this.settings.enabled) {
      return;
    }

    if (this.cutGesture?.pointerId === event.pointerId) {
      return;
    }

    const viewport = extractViewport(this.app);
    if (!viewport || !this.canvasElement) {
      return;
    }

    const rect = this.canvasElement.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    this.pointer.active = true;
    this.pointer.x = (localX - viewport.panX) / viewport.zoom;
    this.pointer.y = (localY - viewport.panY) / viewport.zoom;
    this.requestRedraw();
  };

  handlePointerLeave = () => {
    if (this.cutGesture) {
      return;
    }

    if (!this.pointer.active) {
      return;
    }

    this.pointer.active = false;
    this.snapPreview = null;
    this.requestRedraw();
  };

  handlePointerDownCapture = (event) => {
    if (!this.settings.enabled || this.cutGesture || event.button !== 0 || !event.shiftKey) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const connector = getLinkConnector(this.app);
    if (connector?.isConnecting) {
      return;
    }

    const point = this.eventToWorldPoint(event);
    const graph = this.app?.canvas?.graph ?? this.app?.graph;

    if (!point || !graph) {
      return;
    }

    if (graph.getRerouteOnPos?.(point.x, point.y)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    this.pointer.active = false;
    this.snapPreview = null;
    this.cutGesture = {
      pointerId: event.pointerId,
      start: point,
      end: point,
      path: [point],
    };
    this.lastInteractionAt = performance.now();

    window.addEventListener("pointermove", this.handleCutPointerMove, true);
    window.addEventListener("pointerup", this.handleCutPointerUp, true);
    window.addEventListener("pointercancel", this.handleCutPointerCancel, true);
    this.requestRedraw();
  };

  handleCutPointerMove = (event) => {
    if (this.cutGesture?.pointerId !== event.pointerId) {
      return;
    }

    const point = this.eventToWorldPoint(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    appendCutPathPoint(this.cutGesture.path, point);
    this.cutGesture.end = point;
    this.lastInteractionAt = performance.now();
    this.requestRedraw();
  };

  handleCutPointerUp = (event) => {
    if (this.cutGesture?.pointerId !== event.pointerId) {
      return;
    }

    const point = this.eventToWorldPoint(event) ?? this.cutGesture.end;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finishCutGesture(point);
  };

  handleCutPointerCancel = (event) => {
    if (this.cutGesture?.pointerId !== event.pointerId) {
      return;
    }

    const point = this.eventToWorldPoint(event) ?? this.cutGesture.end;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finishCutGesture(point);
  };

  handleConnectorReset = () => {
    this.restoreNativePreviewLinkColors();

    if (!this.snapPreview) {
      return;
    }

    this.snapPreview = null;
    this.requestRedraw();
  };

  handleCableDroppedOnNode = (customEvent) => {
    const connector = getLinkConnector(this.app);
    const targetNode = customEvent?.detail?.node;

    if (!connector?.renderLinks?.length || targetNode?.id == null) {
      return;
    }

    const wouldSelfLoop = connector.renderLinks.some((renderLink) => renderLink?.node?.id === targetNode.id);
    if (!wouldSelfLoop) {
      return;
    }

    customEvent.preventDefault();
    customEvent.stopImmediatePropagation();
  };

  handleCableDroppedOnCanvas = (customEvent) => {
    if (!this.settings.enabled) {
      return;
    }

    const connector = getLinkConnector(this.app);
    const graph = this.app?.canvas?.graph ?? this.app?.graph;
    const renderLink = connector?.renderLinks?.[0];
    const point = toWorldPoint(customEvent?.detail);
    const snapPoint = this.findGridSnapPoint(point);

    if (
      !connector?.isConnecting ||
      connector.state?.draggingExistingLinks ||
      connector.state?.multi ||
      connector.renderLinks.length !== 1 ||
      !graph ||
      !renderLink?.node?.connectFloatingReroute ||
      !renderLink.fromSlot ||
      !snapPoint
    ) {
      return;
    }

    customEvent.preventDefault();
    customEvent.stopImmediatePropagation();

    this.app.canvas?.emitBeforeChange?.();
    graph.beforeChange?.();

    try {
      const reroute = renderLink.node.connectFloatingReroute(
        [snapPoint.x, snapPoint.y],
        renderLink.fromSlot,
        renderLink.fromReroute?.id
      );

      if (reroute) {
        this.setStickyRerouteBinding(graph, reroute, snapPoint);
      }
    } catch (error) {
      console.error("Fancy Grid: failed to create reroute on cable drop.", error);
    } finally {
      graph.afterChange?.();
      this.app.canvas?.setDirty?.(false, true);
      this.app.canvas?.emitAfterChange?.();
      this.snapPreview = null;
      this.requestRedraw();
    }
  };

  getStickyRerouteRegistry(graph, create = false) {
    if (!graph) {
      return null;
    }

    if (!graph.extra) {
      if (!create) {
        return null;
      }

      graph.extra = {};
    }

    if (!graph.extra[STICKY_REROUTE_STORAGE_KEY]) {
      if (!create) {
        return null;
      }

      graph.extra[STICKY_REROUTE_STORAGE_KEY] = {};
    }

    return graph.extra[STICKY_REROUTE_STORAGE_KEY];
  }

  setStickyRerouteBinding(graph, reroute, snapPoint) {
    const registry = this.getStickyRerouteRegistry(graph, true);
    if (!registry || !reroute || !snapPoint?.key) {
      return;
    }

    registry[reroute.id] = {
      key: snapPoint.key,
      col: snapPoint.col,
      row: snapPoint.row,
    };
  }

  syncStickyReroutes(frame) {
    const graph = this.app?.canvas?.graph ?? this.app?.graph;
    const registry = this.getStickyRerouteRegistry(graph);
    if (!graph || !registry) {
      return;
    }

    const framePointsByKey = frame?.points?.length
      ? new Map(frame.points.filter(Boolean).map((point) => [point.key, point]))
      : null;

    for (const [rerouteId, binding] of Object.entries(registry)) {
      const reroute =
        graph.getReroute?.(Number(rerouteId)) ??
        graph.reroutes?.get?.(Number(rerouteId)) ??
        graph.reroutes?.[rerouteId];

      if (!reroute) {
        delete registry[rerouteId];
        continue;
      }

      if (reroute._dragging) {
        continue;
      }

      const target =
        (binding?.key && framePointsByKey?.get(binding.key)) ??
        this.resolveStickyRestPoint(binding);
      if (!target || !reroute.pos) {
        continue;
      }

      if (
        Math.abs((reroute.pos[0] ?? 0) - target.x) < 0.01 &&
        Math.abs((reroute.pos[1] ?? 0) - target.y) < 0.01
      ) {
        continue;
      }

      reroute.pos[0] = target.x;
      reroute.pos[1] = target.y;
    }
  }

  resolveStickyRestPoint(binding) {
    if (!Number.isFinite(binding?.col) || !Number.isFinite(binding?.row)) {
      return null;
    }

    return {
      key: binding.key ?? `${binding.col}:${binding.row}`,
      col: binding.col,
      row: binding.row,
      x: binding.col * this.settings.spacing,
      y: binding.row * this.settings.spacing,
    };
  }

  commitCutScene(pathPoints) {
    if (!Array.isArray(pathPoints) || pathPoints.length < 2) {
      return;
    }

    const graph = this.app?.canvas?.graph ?? this.app?.graph;
    if (!graph) {
      return;
    }

    const hitNodes = [];
    const seenNodeIds = new Set();
    const segments = extractCuttableLinks(this.app);
    const hitSegments = new Map();

    for (let index = 1; index < pathPoints.length; index += 1) {
      const startPoint = pathPoints[index - 1];
      const endPoint = pathPoints[index];

      this.collectCutNodes(graph, startPoint, endPoint, seenNodeIds, hitNodes);

      for (const segment of segments) {
        if (
          segment.baseId == null ||
          hitSegments.has(segment.baseId) ||
          !segmentsIntersect(
            startPoint,
            endPoint,
            { x: segment.x1, y: segment.y1 },
            { x: segment.x2, y: segment.y2 }
          )
        ) {
          continue;
        }

        hitSegments.set(segment.baseId, segment);
      }
    }

    if (!hitNodes.length && !hitSegments.size) {
      return;
    }

    this.app.canvas?.emitBeforeChange?.();
    graph.beforeChange?.();

    try {
      for (const node of hitNodes) {
        this.removeGraphNode(graph, node);
      }

      for (const [baseId, segment] of hitSegments.entries()) {
        if (segment.removeType === "floating") {
          const floatingLink =
            graph.floatingLinks?.get?.(segment.removeId) ??
            graph.floatingLinks?.[segment.removeId];
          if (floatingLink) {
            graph.removeFloatingLink?.(floatingLink);
          }
        } else {
          graph.removeLink?.(segment.removeId);
        }
      }
    } finally {
      graph.afterChange?.();
      this.app.canvas?.setDirty?.(true, true);
      this.app.canvas?.emitAfterChange?.();
    }
  }

  collectCutNodes(graph, startPoint, endPoint, seenNodeIds, hitNodes) {
    if (typeof graph.getNodeOnPos !== "function") {
      return;
    }

    const visibleNodes = this.app?.canvas?.visible_nodes;
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / 14));

    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const sample = {
        x: startPoint.x + dx * t,
        y: startPoint.y + dy * t,
      };
      const node = graph.getNodeOnPos(sample.x, sample.y, visibleNodes);

      if (
        !node ||
        node.id == null ||
        seenNodeIds.has(node.id) ||
        !isDirectNodeCutHit(sample, node)
      ) {
        continue;
      }

      seenNodeIds.add(node.id);
      hitNodes.push(node);
    }
  }

  removeGraphNode(graph, node) {
    if (!graph || !node) {
      return false;
    }

    if (typeof graph.remove === "function") {
      graph.remove(node);
      return true;
    }

    if (typeof graph.removeNode === "function") {
      graph.removeNode(node);
      return true;
    }

    if (typeof node.remove === "function") {
      node.remove();
      return true;
    }

    return false;
  }

  finishCutGesture(endPoint) {
    if (!this.cutGesture) {
      return;
    }

    const pathPoints = finalizeCutPath(this.cutGesture.path, endPoint ?? this.cutGesture.end);
    const distance = measureCutPath(pathPoints);

    if (distance >= CUT_MIN_DISTANCE) {
      this.commitCutScene(pathPoints);
      this.cutFades.push({
        points: pathPoints,
        startedAt: performance.now(),
        duration: CUT_FADE_DURATION_MS,
      });
    }

    this.cutGesture = null;
    this.removeCutPointerListeners();
    this.requestRedraw();
  }

  removeCutPointerListeners() {
    window.removeEventListener("pointermove", this.handleCutPointerMove, true);
    window.removeEventListener("pointerup", this.handleCutPointerUp, true);
    window.removeEventListener("pointercancel", this.handleCutPointerCancel, true);
  }

  drawCutEffects(ctx) {
    if (!ctx || (!this.cutGesture && !this.cutFades.length)) {
      return;
    }

    const viewport = extractViewport(this.app);
    if (!viewport) {
      return;
    }

    const zoom = Math.max(viewport.zoom, 0.001);
    const now = performance.now();
    const activeColor = CUT_COLOR;
    const accentColor = CUT_COLOR_TRAIL;
    const fades = [];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (this.cutGesture) {
      this.strokeCutPath(ctx, this.cutGesture.path, {
        zoom,
        progress: 0,
        activeColor,
        accentColor,
        alpha: 1,
      });
    }

    for (const fade of this.cutFades) {
      const progress = Math.min((now - fade.startedAt) / fade.duration, 1);
      if (progress >= 1) {
        continue;
      }

      fades.push(fade);
      this.strokeCutPath(ctx, fade.points, {
        zoom,
        progress,
        activeColor,
        accentColor,
        alpha: 1 - progress,
      });
    }

    ctx.restore();
    this.cutFades = fades;
  }

  strokeCutPath(ctx, points, { zoom, progress, activeColor, accentColor, alpha }) {
    const visiblePath = sliceCutPath(points, progress);
    if (visiblePath.length < 2) {
      return;
    }

    const start = visiblePath[0];
    const end = visiblePath[visiblePath.length - 1];
    const length = measureCutPath(visiblePath);
    if (length < 0.5) {
      return;
    }

    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, rgba(activeColor, 0));
    gradient.addColorStop(0.18, rgba(activeColor, alpha * 0.42));
    gradient.addColorStop(1, rgba(accentColor, alpha * 0.95));

    ctx.beginPath();
    traceCutPath(ctx, visiblePath);
    ctx.strokeStyle = rgba(activeColor, alpha * 0.12);
    ctx.lineWidth = Math.max(4 / zoom, 1.8);
    ctx.stroke();

    ctx.beginPath();
    traceCutPath(ctx, visiblePath);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(2.1 / zoom, 1.1);
    ctx.stroke();
  }

  eventToWorldPoint(event) {
    const viewport = extractViewport(this.app);
    if (!viewport || !this.canvasElement) {
      return null;
    }

    const rect = this.canvasElement.getBoundingClientRect();
    return screenToWorld(event.clientX - rect.left, event.clientY - rect.top, viewport);
  }

  drawReactiveGrid(ctx) {
    if (!this.settings.enabled) {
      this.syncRedrawLoop(false);
      return;
    }

    const viewport = extractViewport(this.app);
    if (!viewport) {
      this.syncRedrawLoop(false);
      return;
    }

    const now = performance.now();
    const dt = now - this.lastFrameAt || 16.67;
    this.lastFrameAt = now;
    this.syncStickyReroutes(this.lastFrame);
    const activeCable = extractActiveCable(this.app);
    this.applyNativePreviewLinkColor(activeCable?.color ?? null);
    const nodes = extractNodes(this.app);
    const links = extractLinks(this.app);
    const isInteracting = isCanvasInteracting(this.app);
    const pointerOverNode = this.pointer.active && isPointerOverNode(this.pointer, nodes);

    if (isInteracting || this.cutGesture) {
      this.lastInteractionAt = now;
    }

    const frame = this.field.update({
      viewport,
      nodes,
      links,
      activeCable,
      pointer:
        this.pointer.active && !this.cutGesture && !isInteracting && !pointerOverNode
          ? this.pointer
          : null,
      dt,
      isInteracting,
      interactionBoost: pointerOverNode ? 1.12 : 1,
    });

    this.syncStickyReroutes(frame);
    this.lastFrame = frame;
    this.snapPreview = activeCable
      ? this.findGridSnapPoint({ x: activeCable.x2, y: activeCable.y2 }, frame)
      : null;

    this.renderer.renderGraph(frame, {
      context: ctx,
      drawBackground: false,
    });

    if (this.snapPreview) {
      this.drawSnapPreview(ctx, viewport, this.snapPreview);
    }

    this.syncRedrawLoop(
      frame.active ||
        now - this.lastInteractionAt < 180 ||
        Boolean(this.cutGesture) ||
        this.cutFades.length > 0
    );
  }

  requestRedraw() {
    this.app?.canvas?.setDirty?.(true, true);
    this.app?.graph?.setDirtyCanvas?.(true, true);
  }

  applyNativePreviewLinkColor(color) {
    const litegraph = globalThis.LiteGraph;
    if (!litegraph || !color) {
      if (!color) {
        this.restoreNativePreviewLinkColors();
      }
      return;
    }

    if (!this.nativePreviewColorSnapshot) {
      this.nativePreviewColorSnapshot = {
        connecting: litegraph.CONNECTING_LINK_COLOR,
        event: litegraph.EVENT_LINK_COLOR,
      };
    }

    litegraph.CONNECTING_LINK_COLOR = color;
    litegraph.EVENT_LINK_COLOR = color;
  }

  restoreNativePreviewLinkColors() {
    const litegraph = globalThis.LiteGraph;
    if (!litegraph || !this.nativePreviewColorSnapshot) {
      return;
    }

    litegraph.CONNECTING_LINK_COLOR = this.nativePreviewColorSnapshot.connecting;
    litegraph.EVENT_LINK_COLOR = this.nativePreviewColorSnapshot.event;
    this.nativePreviewColorSnapshot = null;
  }

  findGridSnapPoint(point, frame = this.lastFrame) {
    const viewport = extractViewport(this.app);
    if (!viewport) {
      return null;
    }

    const frameSnap = findFrameSnapPoint(point, frame, {
      zoom: viewport.zoom,
    });
    if (frameSnap) {
      return frameSnap;
    }

    return resolveGridSnapPoint(point, {
      spacing: this.settings.spacing,
      zoom: viewport.zoom,
    });
  }

  syncRedrawLoop(active) {
    this.redrawLoopActive = Boolean(this.settings.enabled && active);

    if (!this.redrawLoopActive) {
      if (this.redrawFrameId) {
        window.cancelAnimationFrame(this.redrawFrameId);
        this.redrawFrameId = 0;
      }
      return;
    }

    if (this.redrawFrameId) {
      return;
    }

    const profile = getPerformanceProfile(this.settings.performanceMode);
    const frameInterval = 1000 / Math.max(profile.activeFps, 1);
    const earliestAt = performance.now() + frameInterval;

    const tick = (rafNow) => {
      if (!this.redrawLoopActive) {
        this.redrawFrameId = 0;
        return;
      }

      if (rafNow < earliestAt) {
        this.redrawFrameId = window.requestAnimationFrame(tick);
        return;
      }

      this.redrawFrameId = 0;
      this.requestRedraw();
    };

    this.redrawFrameId = window.requestAnimationFrame(tick);
  }

  drawSnapPreview(ctx, viewport, snapPoint) {
    const outerRadius = Math.max(8 / Math.max(viewport.zoom, 0.001), this.settings.dotRadius * 3);
    const innerRadius = Math.max(3 / Math.max(viewport.zoom, 0.001), this.settings.dotRadius * 1.8);

    ctx.save();

    ctx.beginPath();
    ctx.arc(snapPoint.x, snapPoint.y, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56, 168, 255, 0.18)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(snapPoint.x, snapPoint.y, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(snapPoint.x, snapPoint.y, outerRadius * 0.72, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(56, 168, 255, 0.9)";
    ctx.lineWidth = Math.max(1 / Math.max(viewport.zoom, 0.001), 0.75);
    ctx.stroke();

    ctx.restore();
  }
}

function isPointerOverNode(pointer, nodes) {
  for (const node of nodes) {
    if (
      pointer.x >= node.x - 16 &&
      pointer.x <= node.x + node.width + 16 &&
      pointer.y >= node.y - 16 &&
      pointer.y <= node.y + node.height + 16
    ) {
      return true;
    }
  }

  return false;
}

function isDirectNodeCutHit(point, node) {
  if (!point || !node) {
    return false;
  }

  const x = node.pos?.[0] ?? node.x ?? 0;
  const y = node.pos?.[1] ?? node.y ?? 0;
  const width = node.size?.[0] ?? node.width ?? 0;
  const height = node.size?.[1] ?? node.height ?? 0;
  const inset = Math.max(8, Math.min(16, Math.min(width, height) * 0.12));

  return (
    point.x >= x + inset &&
    point.x <= x + width - inset &&
    point.y >= y + inset &&
    point.y <= y + height - inset
  );
}

function appendCutPathPoint(path, point) {
  if (!Array.isArray(path) || !point) {
    return;
  }

  const previous = path[path.length - 1];
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 3) {
    path.push(point);
  } else {
    path[path.length - 1] = point;
  }
}

function finalizeCutPath(path, endPoint) {
  const finalized = Array.isArray(path) ? [...path] : [];
  if (endPoint) {
    appendCutPathPoint(finalized, endPoint);
  }
  return finalized;
}

function measureCutPath(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return 0;
  }

  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }
  return length;
}

function sliceCutPath(path, progress) {
  if (!Array.isArray(path) || path.length < 2) {
    return [];
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  if (clampedProgress <= 0) {
    return [...path];
  }

  const totalLength = measureCutPath(path);
  if (totalLength <= 0.001) {
    return [];
  }

  const targetOffset = totalLength * (clampedProgress * clampedProgress * (3 - 2 * clampedProgress));
  let traversed = 0;

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);

    if (traversed + segmentLength < targetOffset) {
      traversed += segmentLength;
      continue;
    }

    const remaining = Math.max(targetOffset - traversed, 0);
    const t = segmentLength > 0 ? remaining / segmentLength : 0;
    const visibleStart = {
      x: previous.x + (current.x - previous.x) * t,
      y: previous.y + (current.y - previous.y) * t,
    };

    return [visibleStart, ...path.slice(index)];
  }

  return [];
}

function traceCutPath(ctx, path) {
  if (!ctx || !Array.isArray(path) || path.length < 2) {
    return;
  }

  ctx.moveTo(path[0].x, path[0].y);
  for (let index = 1; index < path.length; index += 1) {
    ctx.lineTo(path[index].x, path[index].y);
  }
}

function toWorldPoint(value) {
  if (!value) {
    return null;
  }

  if (typeof value.canvasX === "number" && typeof value.canvasY === "number") {
    return { x: value.canvasX, y: value.canvasY };
  }

  if (Array.isArray(value)) {
    return { x: value[0], y: value[1] };
  }

  if (typeof value.x === "number" && typeof value.y === "number") {
    return { x: value.x, y: value.y };
  }

  return null;
}

const runtime = {
  controller: null,
};

app.registerExtension({
  name: EXTENSION_NAME,
  settings: [
    {
      id: SETTING_IDS.enabled,
      name: "Enable Fancy Grid background",
      type: "boolean",
      defaultValue: DEFAULT_GRID_SETTINGS.enabled,
      category: ["Fancy Grid", "General", "Enable"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.spacing,
      name: "Grid spacing",
      type: "slider",
      attrs: { min: 18, max: 42, step: 1 },
      defaultValue: DEFAULT_GRID_SETTINGS.spacing,
      category: ["Fancy Grid", "Field", "Spacing"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.radius,
      name: "Influence radius",
      type: "slider",
      attrs: { min: 120, max: 320, step: 2 },
      defaultValue: DEFAULT_GRID_SETTINGS.radius,
      category: ["Fancy Grid", "Field", "Radius"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.strength,
      name: "Node influence",
      type: "slider",
      attrs: { min: 0, max: 0.4, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.strength,
      category: ["Fancy Grid", "Field", "Node Influence"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.connectionInfluence,
      name: "Connection influence",
      type: "slider",
      attrs: { min: 0, max: 0.5, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.connectionInfluence,
      category: ["Fancy Grid", "Field", "Connection Influence"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.spring,
      name: "Springiness",
      type: "slider",
      attrs: { min: 0.05, max: 0.3, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.spring,
      category: ["Fancy Grid", "Motion", "Spring"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.damping,
      name: "Damping",
      type: "slider",
      attrs: { min: 0.65, max: 0.92, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.damping,
      category: ["Fancy Grid", "Motion", "Damping"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.nodeVisualFalloff,
      name: "Node visual falloff",
      type: "combo",
      defaultValue: DEFAULT_GRID_SETTINGS.nodeVisualFalloff,
      options: NODE_VISUAL_FALLOFF_OPTIONS,
      category: ["Fancy Grid", "Look", "Node Falloff"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.gridVisibility,
      name: "Grid visibility",
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.gridVisibility,
      category: ["Fancy Grid", "Look", "Visibility"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.linkGlow,
      name: "Connection glow",
      type: "slider",
      attrs: { min: 0, max: 2, step: 0.05 },
      defaultValue: DEFAULT_GRID_SETTINGS.linkGlow,
      category: ["Fancy Grid", "Links", "Glow"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.nodeGlow,
      name: "Node glow",
      type: "slider",
      attrs: { min: 0, max: 2, step: 0.05 },
      defaultValue: DEFAULT_GRID_SETTINGS.nodeGlow,
      category: ["Fancy Grid", "Look", "Node Glow"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.dotAlpha,
      name: "Dot brightness",
      type: "slider",
      attrs: { min: 0.15, max: 1, step: 0.01 },
      defaultValue: DEFAULT_GRID_SETTINGS.dotAlpha,
      category: ["Fancy Grid", "Look", "Dots"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.lineAlpha,
      name: "Line brightness",
      type: "slider",
      attrs: { min: 0.02, max: 0.25, step: 0.005 },
      defaultValue: DEFAULT_GRID_SETTINGS.lineAlpha,
      category: ["Fancy Grid", "Look", "Lines"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
    {
      id: SETTING_IDS.performanceMode,
      name: "Performance mode",
      type: "combo",
      defaultValue: DEFAULT_GRID_SETTINGS.performanceMode,
      options: [
        { text: "Eco", value: "eco" },
        { text: "Balanced", value: "balanced" },
        { text: "Quality", value: "quality" },
      ],
      category: ["Fancy Grid", "General", "Performance"],
      onChange: () => runtime.controller?.refreshSettings(),
    },
  ],
  async setup() {
    runtime.controller = new FancyGridController(app);
    await runtime.controller.start();
  },
});
