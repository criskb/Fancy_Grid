import { findNearestStyledGridPoint } from "./gridStyles.js";

const DEFAULT_SNAP_RADIUS_PX = 14;

function normalizeGridSnapOptions(spacingOrOptions) {
  if (typeof spacingOrOptions === "number") {
    return { spacing: spacingOrOptions };
  }

  return spacingOrOptions ?? {};
}

export function findNearestGridPoint(point, spacingOrOptions) {
  return findNearestStyledGridPoint(point, normalizeGridSnapOptions(spacingOrOptions));
}

export function findGridSnapPoint(
  point,
  spacingOrOptions = {}
) {
  const { spacing, zoom = 1, snapRadiusPx = DEFAULT_SNAP_RADIUS_PX } =
    normalizeGridSnapOptions(spacingOrOptions);
  const snapped = findNearestGridPoint(point, spacingOrOptions);
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
