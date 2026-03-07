import { buildLinkSegments, getLinkRenderMode } from "./linkGeometry.js";

export async function waitForCanvas(app, timeoutMs = 10000) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    const canvas = app?.canvas?.canvas;
    if (canvas) {
      return canvas;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }

  throw new Error("Fancy Grid: ComfyUI canvas was not ready before timeout.");
}

export function getSettingValue(app, id, fallback) {
  const value = app?.ui?.settings?.getSettingValue?.(id);
  return value ?? fallback;
}

export function getLinkConnector(app) {
  return app?.canvas?.linkConnector ?? null;
}

export function extractViewport(app) {
  const canvas = app?.canvas;
  const canvasElement = canvas?.canvas;
  if (!canvasElement) {
    return null;
  }

  const ds = canvas.ds ?? {};
  const zoom = ds.scale ?? 1;
  const offsetX = Array.isArray(ds.offset) ? ds.offset[0] : 0;
  const offsetY = Array.isArray(ds.offset) ? ds.offset[1] : 0;
  const panX = offsetX * zoom;
  const panY = offsetY * zoom;

  return {
    width: canvasElement.clientWidth || canvasElement.width || 0,
    height: canvasElement.clientHeight || canvasElement.height || 0,
    zoom,
    panX,
    panY,
  };
}

export function extractNodes(app) {
  const graph = getGraph(app);
  const nodes = graph?._nodes ?? [];

  return nodes.map((node) => ({
    id: node.id,
    x: node.pos?.[0] ?? 0,
    y: node.pos?.[1] ?? 0,
    width: node.size?.[0] ?? node.width ?? 180,
    height: node.size?.[1] ?? node.height ?? 120,
    radius: Math.min(node.size?.[1] ?? 120, node.size?.[0] ?? 180) * 0.12,
    color: resolveNodeColor(node),
  }));
}

export function extractLinks(app) {
  const graph = getGraph(app);
  const canvas = app?.canvas;
  const renderMode = getLinkRenderMode(canvas);
  const screenScale = Math.max(canvas?.ds?.scale ?? 1, 0.2);
  const includeMarkers = Boolean(canvas?.ds?.scale >= 0.6 && canvas?.highquality_render !== false);
  const includeDirectionalMarkers = includeMarkers && Boolean(canvas?.render_connection_arrows);
  const segments = [];

  for (const link of listCollection(graph?.links ?? graph?._links)) {
    const color = resolveLinkColor(app, link);
    segments.push(
      ...buildLinkSegments(graph, link, {
        renderMode,
        active: false,
        emphasis: 0.72,
        includeMarkers,
        includeDirectionalMarkers,
        screenScale,
      }).map((segment) => ({
        ...segment,
        color,
      }))
    );
  }

  for (const link of listCollection(graph?.floatingLinks)) {
    const color = resolveLinkColor(app, link);
    segments.push(
      ...buildLinkSegments(graph, link, {
        renderMode,
        active: false,
        emphasis: 0.92,
        includeMarkers,
        includeDirectionalMarkers,
        screenScale,
      }).map((segment) => ({
        ...segment,
        color,
      }))
    );
  }

  return segments;
}

export function extractCuttableLinks(app) {
  const graph = getGraph(app);
  const renderMode = getLinkRenderMode(app?.canvas);
  const segments = [];

  for (const link of listCollection(graph?.links ?? graph?._links)) {
    segments.push(
      ...buildLinkSegments(graph, link, {
        baseId: `link:${link.id}`,
        renderMode,
        active: false,
        emphasis: 1,
      }).map((segment) => ({
        ...segment,
        removeType: "link",
        removeId: link.id,
      }))
    );
  }

  for (const link of listCollection(graph?.floatingLinks)) {
    segments.push(
      ...buildLinkSegments(graph, link, {
        baseId: `floating:${link.id}`,
        renderMode,
        active: false,
        emphasis: 1,
      }).map((segment) => ({
        ...segment,
        removeType: "floating",
        removeId: link.id,
      }))
    );
  }

  return segments;
}

export function extractActiveCable(app) {
  const modernCable = extractLinkConnectorCable(app);
  if (modernCable) {
    return modernCable;
  }

  const canvas = app?.canvas;
  if (!canvas?.connecting_node) {
    return null;
  }

  const node = canvas.connecting_node;
  const slot = Number.isInteger(canvas.connecting_slot) ? canvas.connecting_slot : 0;
  const pointer = toPoint(canvas.connecting_pos) ?? toPoint(canvas.graph_mouse) ?? null;
  if (!pointer) {
    return null;
  }

  const startsFromOutput = canvas.connecting_output != null || canvas.connecting_input == null;
  const slotInfo = startsFromOutput ? node.outputs?.[slot] : node.inputs?.[slot];
  const from = startsFromOutput
    ? getSlotPosition(node, false, slot) ?? estimateSlotPosition(node, false)
    : pointer;
  const to = startsFromOutput
    ? pointer
    : getSlotPosition(node, true, slot) ?? estimateSlotPosition(node, true);

  return {
    id: "fancy-grid-active-cable",
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    active: true,
    emphasis: 1.1,
    color: resolveConnectingLinkColor(app, { fromSlot: slotInfo, node }),
  };
}

export function isCanvasInteracting(app) {
  const canvas = app?.canvas;
  if (!canvas) {
    return false;
  }

  return Boolean(
    canvas.linkConnector?.isConnecting ||
      canvas.isDragging ||
      canvas.node_dragged ||
      canvas.dragging_canvas ||
      canvas.connecting_node ||
      canvas.resizing_node ||
      canvas.resizingGroup
  );
}

function getGraph(app) {
  return app?.canvas?.graph ?? app?.graph ?? null;
}

function extractLinkConnectorCable(app) {
  const canvas = app?.canvas;
  const connector = canvas?.linkConnector;
  const renderLink = connector?.renderLinks?.[0];
  const from = toPoint(renderLink?.fromPos);
  const to =
    toPoint(connector?.state?.snapLinksPos) ??
    toPoint(canvas?._highlight_pos) ??
    toPoint(canvas?.graph_mouse);

  if (!connector?.isConnecting || !from || !to) {
    return null;
  }

  return {
    id: "fancy-grid-active-cable",
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    active: true,
    emphasis: 1.1,
    color: resolveConnectingLinkColor(app, renderLink),
  };
}

function resolveLinkColor(app, link) {
  const canvas = app?.canvas;
  return (
    link?.color ??
    link?._colour ??
    canvas?.colourGetter?.getConnectedColor?.(link?.type) ??
    canvas?.constructor?.link_type_colors?.[link?.type] ??
    canvas?.default_link_color ??
    null
  );
}

function resolveConnectingLinkColor(app, renderLink) {
  const slot =
    renderLink?.fromSlot ??
    renderLink?.slot ??
    renderLink?.output ??
    renderLink?.input ??
    null;

  const explicitLinkColor = resolveExplicitLinkColor(renderLink);
  if (explicitLinkColor) {
    return explicitLinkColor;
  }

  const slotColor = resolveSlotActiveColor(app, slot);
  if (slotColor) {
    return slotColor;
  }

  return resolveLinkColor(app, {
    type: slot?.type ?? renderLink?.type,
    color: renderLink?.color ?? renderLink?._colour ?? null,
  });
}

function resolveNodeColor(node) {
  return node?.renderingColor ?? node?.color ?? node?.bgcolor ?? null;
}

function resolveSlotActiveColor(app, slot) {
  if (!slot) {
    return null;
  }

  const canvas = app?.canvas;
  const litegraph = globalThis.LiteGraph;
  const colorContext = canvas?.default_connection_color_byType || canvas?.colorContext;
  let renderedColor = null;

  if (typeof slot.renderingColor === "function") {
    try {
      renderedColor = slot.renderingColor(colorContext);
    } catch (error) {
      renderedColor = null;
    }
  }

  return (
    slot.color_on ??
    canvas?.colourGetter?.getConnectedColor?.(slot.type) ??
    renderedColor ??
    slot.color_off ??
    canvas?.colourGetter?.getDisconnectedColor?.(slot.type) ??
    (slot.type === litegraph?.EVENT ? litegraph?.EVENT_LINK_COLOR : null) ??
    canvas?.default_link_color ??
    null
  );
}

function resolveExplicitLinkColor(linkLike) {
  return (
    linkLike?.color ??
    linkLike?._colour ??
    linkLike?.linkColor ??
    linkLike?.renderColor ??
    null
  );
}

function listCollection(collection) {
  if (!collection) {
    return [];
  }

  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection instanceof Map) {
    return Array.from(collection.values());
  }

  if (typeof collection.values === "function") {
    try {
      return Array.from(collection.values());
    } catch (error) {
      return Object.values(collection);
    }
  }

  return Object.values(collection);
}

function getSlotPosition(node, isInput, slotIndex) {
  if (typeof node?.getConnectionPos === "function") {
    try {
      const out = [0, 0];
      const position = node.getConnectionPos(Boolean(isInput), slotIndex, out) ?? out;
      return toPoint(position);
    } catch (error) {
      return estimateSlotPosition(node, isInput, slotIndex);
    }
  }

  return estimateSlotPosition(node, isInput, slotIndex);
}

function estimateSlotPosition(node, isInput, slotIndex = 0) {
  const x = node.pos?.[0] ?? 0;
  const y = node.pos?.[1] ?? 0;
  const width = node.size?.[0] ?? node.width ?? 180;
  const height = node.size?.[1] ?? node.height ?? 120;
  const slots = isInput ? node.inputs ?? [] : node.outputs ?? [];
  const count = Math.max(slots.length, slotIndex + 1, 1);
  const gap = height / (count + 1);
  return {
    x: isInput ? x : x + width,
    y: y + gap * (slotIndex + 1),
  };
}

function toPoint(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return { x: value[0], y: value[1] };
  }

  if (typeof value.x === "number" && typeof value.y === "number") {
    return { x: value.x, y: value.y };
  }

  return null;
}
