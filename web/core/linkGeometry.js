const LINK_RENDER_MODE = Object.freeze({
  HIDDEN_LINK: -1,
  STRAIGHT_LINK: 0,
  LINEAR_LINK: 1,
  SPLINE_LINK: 2,
});

const LINK_DIRECTION = Object.freeze({
  NONE: 0,
  UP: 1,
  DOWN: 2,
  LEFT: 3,
  RIGHT: 4,
  CENTER: 5,
});

const LINEAR_OFFSET = 15;
const STRAIGHT_OFFSET = 10;
const MAX_SPLINE_OFFSET = 80;
const SPLINE_OFFSET_FACTOR = 0.25;

export { LINK_DIRECTION, LINK_RENDER_MODE };

export function getLinkRenderMode(canvas) {
  const renderMode = canvas?.links_render_mode;
  return Number.isInteger(renderMode) ? renderMode : LINK_RENDER_MODE.SPLINE_LINK;
}

export function buildLinkSegments(
  graph,
  link,
  {
    renderMode = LINK_RENDER_MODE.SPLINE_LINK,
    baseId = link?.id,
    active = false,
    emphasis = 1,
    includeMarkers = false,
    includeDirectionalMarkers = false,
    now = performance.now(),
  } = {}
) {
  if (!graph || !link || renderMode === LINK_RENDER_MODE.HIDDEN_LINK) {
    return [];
  }

  const start = resolveLinkEndpoint(graph, link, false);
  const end = resolveLinkEndpoint(graph, link, true);
  const reroutes = resolveRerouteChain(graph, link.parentId);
  const segments = [];
  let segmentIndex = 0;

  if (reroutes.length) {
    let startControl;
    const lastFloatingSlotType = reroutes.at(-1)?.floating?.slotType;

    for (let index = 0; index < reroutes.length; index += 1) {
      const reroute = reroutes[index];
      const previousReroute = reroutes[index - 1];
      const segmentStart = previousReroute
        ? toXY(previousReroute.pos)
        : start
          ? { x: start.x, y: start.y }
          : null;
      const segmentEnd = toXY(reroute.pos);

      if (segmentStart && segmentEnd) {
        reroute.calculateAngle?.(now, graph, [segmentStart.x, segmentStart.y]);
        segmentIndex = appendConnectionSegments(segments, segmentIndex, {
          baseId,
          start: segmentStart,
          end: segmentEnd,
          renderMode,
          startDirection:
            startControl == null ? (start?.direction ?? LINK_DIRECTION.RIGHT) : LINK_DIRECTION.CENTER,
          endDirection: LINK_DIRECTION.CENTER,
          startControl,
          endControl: toXY(reroute.controlPoint),
          active,
          emphasis,
        });

        if (includeMarkers) {
          segmentIndex = appendConnectionMarkers(segments, segmentIndex, {
            baseId,
            start: segmentStart,
            end: segmentEnd,
            renderMode,
            startDirection:
              startControl == null ? (start?.direction ?? LINK_DIRECTION.RIGHT) : LINK_DIRECTION.CENTER,
            endDirection: LINK_DIRECTION.CENTER,
            startControl,
            endControl: toXY(reroute.controlPoint),
            active,
            emphasis,
            includeDirectionalMarkers,
          });
        }
      }

      if (startControl == null && lastFloatingSlotType === "input") {
        startControl = { x: 0, y: 0 };
      } else {
        const nextPos = toXY(reroutes[index + 1]?.pos) ?? (end ? { x: end.x, y: end.y } : null);
        const currentPos = toXY(reroute.pos);
        if (currentPos && nextPos) {
          const offset = Math.min(MAX_SPLINE_OFFSET, distance(currentPos, nextPos) * 0.25);
          startControl = {
            x: offset * (reroute.cos ?? 0),
            y: offset * (reroute.sin ?? 0),
          };
        }
      }
    }

    const tailStart = toXY(reroutes.at(-1)?.pos) ?? (start ? { x: start.x, y: start.y } : null);
    if (tailStart && end) {
      segmentIndex = appendConnectionSegments(segments, segmentIndex, {
        baseId,
        start: tailStart,
        end: { x: end.x, y: end.y },
        renderMode,
        startDirection: LINK_DIRECTION.CENTER,
        endDirection: end.direction ?? LINK_DIRECTION.LEFT,
        startControl,
        active,
        emphasis,
      });

      if (includeMarkers) {
        segmentIndex = appendConnectionMarkers(segments, segmentIndex, {
          baseId,
          start: tailStart,
          end: { x: end.x, y: end.y },
          renderMode,
          startDirection: LINK_DIRECTION.CENTER,
          endDirection: end.direction ?? LINK_DIRECTION.LEFT,
          startControl,
          active,
          emphasis,
          includeDirectionalMarkers,
        });
      }
    }

    return segments;
  }

  if (!start || !end) {
    return [];
  }

  segmentIndex = appendConnectionSegments(segments, segmentIndex, {
    baseId,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    renderMode,
    startDirection: start.direction ?? LINK_DIRECTION.RIGHT,
    endDirection: end.direction ?? LINK_DIRECTION.LEFT,
    active,
    emphasis,
  });

  if (includeMarkers) {
    segmentIndex = appendConnectionMarkers(segments, segmentIndex, {
      baseId,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      renderMode,
      startDirection: start.direction ?? LINK_DIRECTION.RIGHT,
      endDirection: end.direction ?? LINK_DIRECTION.LEFT,
      active,
      emphasis,
      includeDirectionalMarkers,
    });
  }

  return segments;
}

function appendConnectionSegments(
  output,
  segmentIndex,
  {
    baseId,
    start,
    end,
    renderMode,
    startDirection,
    endDirection,
    startControl,
    endControl,
    active,
    emphasis,
  }
) {
  const geometry = buildConnectionGeometry({
    start,
    end,
    renderMode,
    startDirection,
    endDirection,
    startControl,
    endControl,
  });
  const polyline = geometry.polyline;

  for (let index = 1; index < polyline.length; index += 1) {
    const previous = polyline[index - 1];
    const current = polyline[index];

    if (!previous || !current) {
      continue;
    }

    output.push({
      id: `${baseId}:${segmentIndex}`,
      baseId,
      x1: previous.x,
      y1: previous.y,
      x2: current.x,
      y2: current.y,
      active,
      emphasis,
    });
    segmentIndex += 1;
  }

  return segmentIndex;
}

function appendConnectionMarkers(
  output,
  segmentIndex,
  {
    baseId,
    start,
    end,
    renderMode,
    startDirection,
    endDirection,
    startControl,
    endControl,
    active,
    emphasis,
    includeDirectionalMarkers,
  }
) {
  const centerMarker = computeNativeCenterMarkerPoint({
    start,
    end,
    renderMode,
    startDirection,
    endDirection,
    startControl,
    endControl,
  });

  if (centerMarker) {
    output.push({
      id: `${baseId}:marker:${segmentIndex}`,
      baseId,
      x1: centerMarker.x,
      y1: centerMarker.y,
      x2: centerMarker.x,
      y2: centerMarker.y,
      active,
      emphasis: emphasis * 1.2,
      marker: true,
    });
    segmentIndex += 1;
  }

  if (includeDirectionalMarkers) {
    for (const fraction of [0.25, 0.75]) {
      const markerPoint = computeNativeConnectionPoint(start, end, fraction, startDirection, endDirection);
      if (!markerPoint) {
        continue;
      }

      output.push({
        id: `${baseId}:marker:${segmentIndex}`,
        baseId,
        x1: markerPoint.x,
        y1: markerPoint.y,
        x2: markerPoint.x,
        y2: markerPoint.y,
        active,
        emphasis: emphasis * 0.92,
        marker: true,
      });
      segmentIndex += 1;
    }
  }

  if (endDirection === LINK_DIRECTION.CENTER) {
    output.push({
      id: `${baseId}:marker:${segmentIndex}`,
      baseId,
      x1: end.x,
      y1: end.y,
      x2: end.x,
      y2: end.y,
      active,
      emphasis: emphasis * 1.35,
      marker: true,
    });
    segmentIndex += 1;
  }

  return segmentIndex;
}

function buildConnectionGeometry({
  start,
  end,
  renderMode,
  startDirection,
  endDirection,
  startControl,
  endControl,
}) {
  if (renderMode === LINK_RENDER_MODE.LINEAR_LINK) {
    const offset = LINEAR_OFFSET;
    const innerA = offsetPoint(start, startDirection, offset);
    const innerB = offsetPoint(end, endDirection, offset);
    const polyline = [start, innerA, innerB, end];
    return {
      polyline,
      pointAt: (fraction) => pointAlongPolyline(polyline, fraction),
    };
  }

  if (renderMode === LINK_RENDER_MODE.STRAIGHT_LINK) {
    const offset = STRAIGHT_OFFSET;
    const innerA = offsetPoint(start, startDirection, offset);
    const innerB = offsetPoint(end, endDirection, offset);
    const midX = (innerA.x + innerB.x) * 0.5;
    const polyline = [
      start,
      innerA,
      { x: midX, y: innerA.y },
      { x: midX, y: innerB.y },
      innerB,
      end,
    ];
    return {
      polyline,
      pointAt: (fraction) => pointAlongPolyline(polyline, fraction),
    };
  }

  if (renderMode !== LINK_RENDER_MODE.SPLINE_LINK) {
    const polyline = [start, end];
    return {
      polyline,
      pointAt: (fraction) => pointAlongPolyline(polyline, fraction),
    };
  }

  const dist = !startControl || !endControl ? distance(start, end) : 0;
  const innerA = startControl
    ? addPoints(start, startControl)
    : offsetPoint(start, startDirection, dist * SPLINE_OFFSET_FACTOR);
  const innerB = endControl
    ? addPoints(end, endControl)
    : offsetPoint(end, endDirection, dist * SPLINE_OFFSET_FACTOR);
  return {
    polyline: sampleBezier(start, innerA, innerB, end),
    pointAt: (fraction) => evaluateBezier(start, innerA, innerB, end, fraction),
  };
}

function computeNativeCenterMarkerPoint({
  start,
  end,
  renderMode,
  startDirection,
  endDirection,
  startControl,
  endControl,
}) {
  if (!start || !end) {
    return null;
  }

  if (renderMode === LINK_RENDER_MODE.LINEAR_LINK) {
    const innerA = offsetPoint(start, startDirection, LINEAR_OFFSET);
    const innerB = offsetPoint(end, endDirection, LINEAR_OFFSET);
    return midpoint(innerA, innerB);
  }

  if (renderMode === LINK_RENDER_MODE.STRAIGHT_LINK) {
    const innerA = offsetPoint(start, startDirection, STRAIGHT_OFFSET);
    const innerB = offsetPoint(end, endDirection, STRAIGHT_OFFSET);
    return {
      x: (innerA.x + innerB.x) * 0.5,
      y: (innerA.y + innerB.y) * 0.5,
    };
  }

  if (renderMode !== LINK_RENDER_MODE.SPLINE_LINK) {
    return midpoint(start, end);
  }

  const dist = !startControl || !endControl ? distance(start, end) : 0;
  const innerA = startControl
    ? addPoints(start, startControl)
    : offsetPoint(start, startDirection, dist * SPLINE_OFFSET_FACTOR);
  const innerB = endControl
    ? addPoints(end, endControl)
    : offsetPoint(end, endDirection, dist * SPLINE_OFFSET_FACTOR);

  return evaluateBezier(start, innerA, innerB, end, 0.5);
}

function computeNativeConnectionPoint(start, end, fraction, startDirection, endDirection) {
  if (!start || !end) {
    return null;
  }

  const dist = distance(start, end);
  const innerA = offsetPoint(start, startDirection, dist * SPLINE_OFFSET_FACTOR);
  const innerB = offsetPoint(end, endDirection, dist * SPLINE_OFFSET_FACTOR);
  return evaluateBezier(start, innerA, innerB, end, fraction);
}

function sampleBezier(start, controlA, controlB, end) {
  const approxLength =
    distance(start, controlA) + distance(controlA, controlB) + distance(controlB, end);
  const segmentCount = clampInt(Math.ceil(approxLength / 42), 8, 22);
  const polyline = [start];

  for (let index = 1; index < segmentCount; index += 1) {
    const t = index / segmentCount;
    polyline.push(evaluateBezier(start, controlA, controlB, end, t));
  }

  polyline.push(end);
  return polyline;
}

function evaluateBezier(start, controlA, controlB, end, t) {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * t * controlA.x +
      3 * inverse * tSquared * controlB.x +
      tSquared * t * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * t * controlA.y +
      3 * inverse * tSquared * controlB.y +
      tSquared * t * end.y,
  };
}

function pointAlongPolyline(polyline, fraction) {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    return null;
  }

  if (polyline.length === 1) {
    return polyline[0];
  }

  const clampedFraction = Math.min(Math.max(fraction, 0), 1);
  const totalLength = polylineLength(polyline);
  if (totalLength <= 0.001) {
    return polyline[0];
  }

  const targetDistance = totalLength * clampedFraction;
  let traversed = 0;

  for (let index = 1; index < polyline.length; index += 1) {
    const previous = polyline[index - 1];
    const current = polyline[index];
    const segmentLength = distance(previous, current);
    if (traversed + segmentLength < targetDistance) {
      traversed += segmentLength;
      continue;
    }

    const remaining = Math.max(targetDistance - traversed, 0);
    const t = segmentLength > 0 ? remaining / segmentLength : 0;
    return {
      x: previous.x + (current.x - previous.x) * t,
      y: previous.y + (current.y - previous.y) * t,
    };
  }

  return polyline.at(-1) ?? polyline[0];
}

function polylineLength(polyline) {
  let length = 0;
  for (let index = 1; index < polyline.length; index += 1) {
    length += distance(polyline[index - 1], polyline[index]);
  }
  return length;
}

function resolveLinkEndpoint(graph, link, isInput) {
  if (isInput) {
    if (link.target_id == null || link.target_id === -1) {
      return null;
    }

    const node = getNodeById(graph, link.target_id);
    const slot = node?.inputs?.[link.target_slot];
    const position = node ? getSlotPosition(node, true, link.target_slot) : null;

    return position
      ? {
          ...position,
          direction: slot?.dir ?? LINK_DIRECTION.LEFT,
        }
      : null;
  }

  if (link.origin_id == null || link.origin_id === -1) {
    return null;
  }

  const node = getNodeById(graph, link.origin_id);
  const slot = node?.outputs?.[link.origin_slot];
  const position = node ? getSlotPosition(node, false, link.origin_slot) : null;

  return position
    ? {
        ...position,
        direction: slot?.dir ?? LINK_DIRECTION.RIGHT,
      }
    : null;
}

function resolveRerouteChain(graph, parentId) {
  const chain = [];
  const visited = new Set();
  let currentId = parentId;

  while (currentId != null && !visited.has(currentId)) {
    visited.add(currentId);
    const reroute =
      graph?.getReroute?.(currentId) ??
      graph?.reroutes?.get?.(currentId) ??
      graph?.reroutes?.[currentId];

    if (!reroute) {
      break;
    }

    chain.unshift(reroute);
    currentId = reroute.parentId;
  }

  return chain;
}

function getNodeById(graph, nodeId) {
  return (
    graph?._nodes_by_id?.[nodeId] ??
    graph?._nodes_by_id?.get?.(nodeId) ??
    graph?.getNodeById?.(nodeId) ??
    null
  );
}

function getSlotPosition(node, isInput, slotIndex) {
  if (typeof node?.getConnectionPos === "function") {
    try {
      const out = [0, 0];
      const position = node.getConnectionPos(Boolean(isInput), slotIndex, out) ?? out;
      return toXY(position);
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

function offsetPoint(point, direction, amount) {
  const next = { x: point.x, y: point.y };

  switch (direction) {
    case LINK_DIRECTION.LEFT:
      next.x -= amount;
      break;
    case LINK_DIRECTION.RIGHT:
      next.x += amount;
      break;
    case LINK_DIRECTION.UP:
      next.y -= amount;
      break;
    case LINK_DIRECTION.DOWN:
      next.y += amount;
      break;
  }

  return next;
}

function addPoints(point, offset) {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5,
  };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampInt(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toXY(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return {
      x: value[0],
      y: value[1],
    };
  }

  if (typeof value[0] === "number" && typeof value[1] === "number") {
    return {
      x: value[0],
      y: value[1],
    };
  }

  if (typeof value.x === "number" && typeof value.y === "number") {
    return {
      x: value.x,
      y: value.y,
    };
  }

  return null;
}
