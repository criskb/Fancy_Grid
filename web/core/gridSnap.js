const DEFAULT_SNAP_RADIUS_PX = 14;

export function findNearestGridPoint(point, spacing) {
  if (!point || !Number.isFinite(spacing) || spacing <= 0) {
    return null;
  }

  const col = Math.round(point.x / spacing);
  const row = Math.round(point.y / spacing);

  return {
    key: `${col}:${row}`,
    col,
    row,
    x: col * spacing,
    y: row * spacing,
  };
}

export function findGridSnapPoint(
  point,
  { spacing, zoom = 1, snapRadiusPx = DEFAULT_SNAP_RADIUS_PX } = {}
) {
  const snapped = findNearestGridPoint(point, spacing);
  if (!snapped) {
    return null;
  }

  const distance = Math.hypot(snapped.x - point.x, snapped.y - point.y);
  const maxDistance = Math.min(spacing * 0.5, snapRadiusPx / Math.max(zoom, 0.001));

  if (distance > maxDistance) {
    return null;
  }

  return {
    ...snapped,
    distance,
    maxDistance,
  };
}

export function findFrameSnapPoint(
  point,
  frame,
  { zoom = 1, snapRadiusPx = DEFAULT_SNAP_RADIUS_PX } = {}
) {
  if (!point || !frame?.points?.length) {
    return null;
  }

  const maxDistance = snapRadiusPx / Math.max(zoom, 0.001);
  let best = null;

  for (const candidate of frame.points) {
    if (!candidate) {
      continue;
    }

    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance > maxDistance) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = {
        key: candidate.key,
        col: candidate.col,
        row: candidate.row,
        x: candidate.x,
        y: candidate.y,
        distance,
        maxDistance,
      };
    }
  }

  return best;
}
