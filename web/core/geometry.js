export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function smoothFalloff(distance, radius) {
  if (radius <= 0) {
    return 0;
  }

  const t = 1 - clamp(distance / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

export function computeFalloff(distance, radius, mode = "soft") {
  if (mode === "edge") {
    if (radius <= 0) {
      return 0;
    }

    return 1 - clamp(distance / radius, 0, 1);
  }

  return smoothFalloff(distance, radius);
}

export function limitVector(x, y, maxLength) {
  const length = Math.hypot(x, y);
  if (!length || length <= maxLength) {
    return { x, y };
  }

  const scale = maxLength / length;
  return {
    x: x * scale,
    y: y * scale,
  };
}

export function worldToScreen(x, y, viewport) {
  return {
    x: x * viewport.zoom + viewport.panX,
    y: y * viewport.zoom + viewport.panY,
  };
}

export function screenToWorld(x, y, viewport) {
  return {
    x: (x - viewport.panX) / viewport.zoom,
    y: (y - viewport.panY) / viewport.zoom,
  };
}

export function buildWorldBounds(viewport) {
  const topLeft = screenToWorld(0, 0, viewport);
  const bottomRight = screenToWorld(viewport.width, viewport.height, viewport);
  return {
    left: Math.min(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    right: Math.max(topLeft.x, bottomRight.x),
    bottom: Math.max(topLeft.y, bottomRight.y),
  };
}

export function expandBounds(bounds, amount) {
  return {
    left: bounds.left - amount,
    top: bounds.top - amount,
    right: bounds.right + amount,
    bottom: bounds.bottom + amount,
  };
}

export function boundsIntersect(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function segmentIntersectsBounds(x1, y1, x2, y2, bounds) {
  const segmentBounds = {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };

  return boundsIntersect(segmentBounds, bounds);
}

export function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = orientation(a1, a2, b1);
  const d2 = orientation(a1, a2, b2);
  const d3 = orientation(b1, b2, a1);
  const d4 = orientation(b1, b2, a2);

  if (d1 !== d2 && d3 !== d4) {
    return true;
  }

  if (d1 === 0 && pointOnSegment(b1, a1, a2)) {
    return true;
  }

  if (d2 === 0 && pointOnSegment(b2, a1, a2)) {
    return true;
  }

  if (d3 === 0 && pointOnSegment(a1, b1, b2)) {
    return true;
  }

  if (d4 === 0 && pointOnSegment(a2, b1, b2)) {
    return true;
  }

  return false;
}

export function nearestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1) : 0;
  const x = x1 + dx * t;
  const y = y1 + dy * t;

  return {
    x,
    y,
    distance: Math.hypot(px - x, py - y),
  };
}

export function nearestPointOnRoundedRect(px, py, rect, radius = 0) {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const r = clamp(radius, 0, Math.min(rect.width, rect.height) * 0.5);

  if (r <= 0) {
    return nearestPointOnRect(px, py, rect);
  }

  const innerLeft = left + r;
  const innerRight = right - r;
  const innerTop = top + r;
  const innerBottom = bottom - r;

  if (px < innerLeft && py < innerTop) {
    return nearestPointOnCircle(px, py, innerLeft, innerTop, r);
  }

  if (px > innerRight && py < innerTop) {
    return nearestPointOnCircle(px, py, innerRight, innerTop, r);
  }

  if (px < innerLeft && py > innerBottom) {
    return nearestPointOnCircle(px, py, innerLeft, innerBottom, r);
  }

  if (px > innerRight && py > innerBottom) {
    return nearestPointOnCircle(px, py, innerRight, innerBottom, r);
  }

  if (px <= innerLeft) {
    return { x: left, y: clamp(py, innerTop, innerBottom) };
  }

  if (px >= innerRight) {
    return { x: right, y: clamp(py, innerTop, innerBottom) };
  }

  if (py <= innerTop) {
    return { x: clamp(px, innerLeft, innerRight), y: top };
  }

  if (py >= innerBottom) {
    return { x: clamp(px, innerLeft, innerRight), y: bottom };
  }

  const distances = [
    { distance: Math.abs(px - left), point: { x: left, y: py } },
    { distance: Math.abs(px - right), point: { x: right, y: py } },
    { distance: Math.abs(py - top), point: { x: px, y: top } },
    { distance: Math.abs(py - bottom), point: { x: px, y: bottom } },
  ];

  distances.sort((a, b) => a.distance - b.distance);
  return distances[0].point;
}

function nearestPointOnRect(px, py, rect) {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (px < left) {
    return { x: left, y: clamp(py, top, bottom) };
  }

  if (px > right) {
    return { x: right, y: clamp(py, top, bottom) };
  }

  if (py < top) {
    return { x: clamp(px, left, right), y: top };
  }

  if (py > bottom) {
    return { x: clamp(px, left, right), y: bottom };
  }

  const distances = [
    { distance: Math.abs(px - left), point: { x: left, y: py } },
    { distance: Math.abs(px - right), point: { x: right, y: py } },
    { distance: Math.abs(py - top), point: { x: px, y: top } },
    { distance: Math.abs(py - bottom), point: { x: px, y: bottom } },
  ];

  distances.sort((a, b) => a.distance - b.distance);
  return distances[0].point;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-6) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function pointOnSegment(point, start, end) {
  return (
    point.x <= Math.max(start.x, end.x) + 1e-6 &&
    point.x + 1e-6 >= Math.min(start.x, end.x) &&
    point.y <= Math.max(start.y, end.y) + 1e-6 &&
    point.y + 1e-6 >= Math.min(start.y, end.y)
  );
}

function nearestPointOnCircle(px, py, cx, cy, radius) {
  const dx = px - cx;
  const dy = py - cy;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: cx + (dx / length) * radius,
    y: cy + (dy / length) * radius,
  };
}

export function rgba(color, alpha) {
  if (color.startsWith("#")) {
    const normalized = color.slice(1);
    const value = normalized.length === 3
      ? normalized.split("").map((digit) => `${digit}${digit}`).join("")
      : normalized;
    const int = Number.parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return `rgba(${color}, ${alpha})`;
}

export function roundedRectPath(context, x, y, width, height, radius) {
  const safeRadius = clamp(radius, 0, Math.min(width, height) * 0.5);
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}
