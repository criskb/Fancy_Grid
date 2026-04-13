import { buildLinkSegments, getLinkRenderMode } from "./linkGeometry.js";
import { formatRgbColor, parseColorString } from "./colorUtils.js";
import { getCustomNodeLayout } from "./customNodeLayouts.js";
import { estimateNodeSlotPosition, getNodeLayout, resolveNodeSlotPosition } from "./nodeGeometry.js";

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
  const value =
    app?.extensionManager?.setting?.get?.(id) ??
    app?.ui?.settings?.getSettingValue?.(id);
  return value ?? fallback;
}

export async function setSettingValue(app, id, value) {
  if (id == null) {
    return;
  }

  if (app?.extensionManager?.setting?.set) {
    await app.extensionManager.setting.set(id, value);
    return;
  }

  await app?.ui?.settings?.setSettingValue?.(id, value);
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
  const slotLinkSummaries = buildSlotLinkSummaryMap(app, graph);

  return nodes.map((node) => {
    const customLayout = getCustomNodeLayout(node);
    return {
      id: node.id,
      ...getNodeLayout(node),
      color: resolveNodeColor(node),
      customLayout,
      slotAnchors: readNodeSlotAnchors(app, node, customLayout, slotLinkSummaries),
    };
  });
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
        originId: link.origin_id,
        targetId: link.target_id,
        segmentIndex: readSegmentIndex(segment.id),
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
        originId: link.origin_id,
        targetId: link.target_id,
        segmentIndex: readSegmentIndex(segment.id),
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

function readNodeSlotAnchors(app, node, customLayout = null, slotLinkSummaries = new Map()) {
  const anchors = [];
  const socketProfile = customLayout?.socketProfile?.slots ?? [];

  for (const [isInput, slots] of [
    [true, node?.inputs ?? []],
    [false, node?.outputs ?? []],
  ]) {
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      const position = getSlotPosition(node, isInput, slotIndex);
      if (!position) {
        continue;
      }

      const profileSlot =
        socketProfile.find((entry) => entry.isInput === isInput && entry.index === slotIndex) ?? null;
      const slotKey = createSlotKey(node?.id, isInput, slotIndex);
      const linkSummary = slotLinkSummaries.get(slotKey) ?? null;
      const linkedColor = linkSummary?.color ?? null;
      const linked = isInput ? slot?.link != null : Array.isArray(slot?.links) ? slot.links.length > 0 : slot?.link != null;

      anchors.push({
        x: position.x,
        y: position.y,
        isInput,
        side: profileSlot?.edge ?? null,
        nearEdge: profileSlot?.nearEdge ?? null,
        edgeDistance: profileSlot?.edgeDistance ?? null,
        color: linkedColor ?? resolveSlotActiveColor(app, slot) ?? resolveNodeColor(node),
        linked,
        linkedCount: linkSummary?.count ?? (linked ? 1 : 0),
      });
    }
  }

  return anchors;
}

function buildSlotLinkSummaryMap(app, graph) {
  const slotLinkSummaries = new Map();

  for (const link of listCollection(graph?.links ?? graph?._links)) {
    const color = resolveLinkColor(app, link);
    if (!color) {
      continue;
    }

    if (link.origin_id != null && link.origin_slot != null) {
      appendSlotLinkColor(slotLinkSummaries, createSlotKey(link.origin_id, false, link.origin_slot), color, 1);
    }

    if (link.target_id != null && link.target_slot != null) {
      appendSlotLinkColor(slotLinkSummaries, createSlotKey(link.target_id, true, link.target_slot), color, 1);
    }
  }

  for (const link of listCollection(graph?.floatingLinks)) {
    const color = resolveLinkColor(app, link);
    if (!color) {
      continue;
    }

    if (link.origin_id != null && link.origin_slot != null) {
      appendSlotLinkColor(slotLinkSummaries, createSlotKey(link.origin_id, false, link.origin_slot), color, 0.75);
    }

    if (link.target_id != null && link.target_slot != null) {
      appendSlotLinkColor(slotLinkSummaries, createSlotKey(link.target_id, true, link.target_slot), color, 0.75);
    }
  }

  finalizeSlotLinkSummaries(slotLinkSummaries);
  return slotLinkSummaries;
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
  return resolveNodeSlotPosition(node, isInput, slotIndex);
}

function estimateSlotPosition(node, isInput, slotIndex = 0) {
  return estimateNodeSlotPosition(node, isInput, slotIndex);
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

function readSegmentIndex(id) {
  if (typeof id !== "string") {
    return 0;
  }

  const tail = id.split(":").at(-1);
  const index = Number.parseInt(tail ?? "", 10);
  return Number.isFinite(index) ? index : 0;
}

function createSlotKey(nodeId, isInput, slotIndex) {
  return `${nodeId}:${isInput ? "in" : "out"}:${slotIndex}`;
}

function appendSlotLinkColor(store, key, color, weight) {
  const rgb = parseColorString(color);
  if (!rgb) {
    return;
  }

  const entry = store.get(key) ?? {
    totalWeight: 0,
    count: 0,
    r: 0,
    g: 0,
    b: 0,
    color: null,
  };

  entry.totalWeight += weight;
  entry.count += 1;
  entry.r += rgb.r * weight;
  entry.g += rgb.g * weight;
  entry.b += rgb.b * weight;
  store.set(key, entry);
}

function finalizeSlotLinkSummaries(store) {
  for (const [key, entry] of store.entries()) {
    if (!entry.totalWeight) {
      store.delete(key);
      continue;
    }

    store.set(key, {
      count: entry.count,
      color: formatRgbColor({
        r: entry.r / entry.totalWeight,
        g: entry.g / entry.totalWeight,
        b: entry.b / entry.totalWeight,
      }),
    });
  }
}
