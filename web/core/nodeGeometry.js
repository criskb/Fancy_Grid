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
  const { x, y, width, height } = getNodeLayout(node);
  const slots = isInput ? node?.inputs ?? [] : node?.outputs ?? [];
  const count = Math.max(slots.length, slotIndex + 1, 1);
  const gap = height / (count + 1);

  return {
    x: isInput ? x : x + width,
    y: y + gap * (slotIndex + 1),
  };
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

function numberOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
