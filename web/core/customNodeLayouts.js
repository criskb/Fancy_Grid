import { getNodeLayout, resolveNodeSlotPosition } from "./nodeGeometry.js";

const EDGE_TOLERANCE_MIN = 10;
const EDGE_TOLERANCE_RATIO = 0.12;

export function getCustomNodeLayout(node) {
  if (!node) {
    return null;
  }

  const socketProfile = analyzeSocketProfile(node);
  if (!socketProfile.isCustomShell) {
    return null;
  }

  return {
    influenceMode: "anchors-dominant",
    socketProfile,
  };
}

function analyzeSocketProfile(node) {
  const layout = getNodeLayout(node);
  const slots = collectSocketPositions(node, layout);
  if (!slots.length) {
    return { isCustomShell: false, slots: [] };
  }

  const edgeTolerance = Math.max(
    EDGE_TOLERANCE_MIN,
    Math.min(layout.width || 0, layout.height || 0) * EDGE_TOLERANCE_RATIO
  );
  let customSignals = 0;

  for (const slot of slots) {
    const edge = classifyNearestEdge(slot.position, layout);
    slot.edge = edge.side;
    slot.edgeDistance = edge.distance;
    slot.nearEdge = edge.distance <= edgeTolerance;

    const expectedSide = slot.isInput ? "left" : "right";
    const isUnexpectedSide = slot.edge !== expectedSide;
    const isInsetSocket = !slot.nearEdge;

    if (isUnexpectedSide || isInsetSocket) {
      customSignals += 1;
    }
  }

  const sameSideIO = hasSameSideInputOutput(slots);
  const hasInsetSocket = slots.some((slot) => !slot.nearEdge);
  const hasUnexpectedSide = slots.some((slot) => slot.edge !== (slot.isInput ? "left" : "right"));
  const isCustomShell = customSignals > 0 || sameSideIO || hasInsetSocket || hasUnexpectedSide;

  return {
    isCustomShell,
    slots,
  };
}

function collectSocketPositions(node, layout) {
  const sockets = [];

  for (const [isInput, sourceSlots] of [
    [true, node.inputs ?? []],
    [false, node.outputs ?? []],
  ]) {
    for (let index = 0; index < sourceSlots.length; index += 1) {
      const position = resolveNodeSlotPosition(node, isInput, index);
      if (!position) {
        continue;
      }

      sockets.push({
        isInput,
        index,
        position: {
          x: position.x,
          y: position.y,
        },
        relative: {
          x: position.x - layout.x,
          y: position.y - layout.y,
        },
      });
    }
  }

  return sockets;
}

function hasSameSideInputOutput(slots) {
  const inputSides = new Set(slots.filter((slot) => slot.isInput).map((slot) => slot.edge));
  const outputSides = new Set(slots.filter((slot) => !slot.isInput).map((slot) => slot.edge));

  for (const side of inputSides) {
    if (outputSides.has(side)) {
      return true;
    }
  }

  return false;
}

function classifyNearestEdge(position, layout) {
  const distances = [
    { side: "left", distance: Math.abs(position.x - layout.x) },
    { side: "right", distance: Math.abs(position.x - (layout.x + layout.width)) },
    { side: "top", distance: Math.abs(position.y - layout.y) },
    { side: "bottom", distance: Math.abs(position.y - (layout.y + layout.height)) },
  ];
  distances.sort((a, b) => a.distance - b.distance);
  return distances[0] ?? { side: "left", distance: 0 };
}
