export function getNodeLayout(node) {
  const x = numberOr(node?.pos?.[0] ?? node?.x, 0);
  const y = numberOr(node?.pos?.[1] ?? node?.y, 0);
  const expandedWidth = Math.max(0, numberOr(node?.size?.[0] ?? node?.width, 180));
  const expandedHeight = Math.max(0, numberOr(node?.size?.[1] ?? node?.height, 120));
  const boundingRect = readBoundingRect(node);

  if (boundingRect) {
    return {
      x: boundingRect.x,
      y: boundingRect.y,
      width: boundingRect.width,
      height: boundingRect.height,
      radius: Math.min(boundingRect.width, boundingRect.height) * 0.12,
    };
  }

  if (node?.flags?.collapsed) {
    const litegraph = globalThis.LiteGraph;
    const collapsedWidth = Math.max(
      0,
      numberOr(node?._collapsed_width ?? node?.collapsed_width ?? node?.constructor?.collapsed_width, expandedWidth)
    );
    const collapsedHeight = Math.max(
      0,
      numberOr(
        node?.titleHeight ?? node?.constructor?.title_height ?? litegraph?.NODE_TITLE_HEIGHT,
        Math.min(expandedHeight, 30)
      )
    );

    return {
      x,
      y,
      width: collapsedWidth,
      height: collapsedHeight,
      radius: Math.min(collapsedWidth, collapsedHeight) * 0.12,
    };
  }

  return {
    x,
    y,
    width: expandedWidth,
    height: expandedHeight,
    radius: Math.min(expandedWidth, expandedHeight) * 0.12,
  };
}

export function estimateNodeSlotPosition(node, isInput, slotIndex = 0) {
  const resolvedIndex = normalizeSlotIndex(slotIndex);
  const slotPosition = readSlotOffset(node, isInput, resolvedIndex);
  if (slotPosition) {
    const { x, y } = getNodeLayout(node);
    return {
      x: x + slotPosition.x,
      y: y + slotPosition.y,
    };
  }

  const { x, y, width, height } = getNodeLayout(node);
  const slots = isInput ? node?.inputs ?? [] : node?.outputs ?? [];
  const count = Math.max(slots.length, resolvedIndex + 1, 1);
  const gap = height / (count + 1);

  return {
    x: isInput ? x : x + width,
    y: y + gap * (resolvedIndex + 1),
  };
}

export function resolveNodeSlotPosition(node, isInput, slotIndex = 0) {
  const resolvedIndex = normalizeSlotIndex(slotIndex);
  if (typeof node?.getConnectionPos === "function") {
    try {
      const out = [0, 0];
      const position = node.getConnectionPos(Boolean(isInput), resolvedIndex, out) ?? out;
      const point = toPoint(position);
      if (point) {
        return point;
      }
    } catch (error) {
      // Fall back to slot metadata and estimated layout below.
    }
  }

  return estimateNodeSlotPosition(node, isInput, resolvedIndex);
}

function readBoundingRect(node) {
  const rect = node?.boundingRect;
  if (!(Array.isArray(rect) || ArrayBuffer.isView(rect)) || rect.length < 4) {
    return null;
  }

  return {
    x: numberOr(rect[0], 0),
    y: numberOr(rect[1], 0),
    width: Math.max(0, numberOr(rect[2], 0)),
    height: Math.max(0, numberOr(rect[3], 0)),
  };
}

function readSlotOffset(node, isInput, slotIndex) {
  const slot = (isInput ? node?.inputs : node?.outputs)?.[slotIndex];
  if (!slot) {
    return null;
  }

  if (Array.isArray(slot.pos) && slot.pos.length >= 2) {
    const x = numberOr(slot.pos[0], null);
    const y = numberOr(slot.pos[1], null);
    if (x != null && y != null) {
      return { x, y };
    }
  }

  if (Number.isFinite(slot.x) && Number.isFinite(slot.y)) {
    return { x: slot.x, y: slot.y };
  }

  return null;
}

function normalizeSlotIndex(slotIndex) {
  const numeric = Number.parseInt(String(slotIndex ?? 0), 10);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function toPoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    return {
      x: numberOr(value[0], 0),
      y: numberOr(value[1], 0),
    };
  }

  if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
    return {
      x: value.x,
      y: value.y,
    };
  }

  return null;
}

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
