const DETAIL_LEVEL_PRESETS = Object.freeze({
  eco: Object.freeze({
    softZoomThreshold: 0.2,
    heavyZoomThreshold: 0.1,
    budgetZoomThreshold: 0.18,
    idlePointBudget: 3600,
    activePointBudget: 5600,
    maxSamplingStep: 8,
    skipBaseDotsStep: 3,
    skipHighlightDotsStep: 4,
  }),
  balanced: Object.freeze({
    softZoomThreshold: 0.2,
    heavyZoomThreshold: 0.1,
    budgetZoomThreshold: 0.18,
    idlePointBudget: 5600,
    activePointBudget: 8200,
    maxSamplingStep: 6,
    skipBaseDotsStep: 4,
    skipHighlightDotsStep: 5,
  }),
  quality: Object.freeze({
    softZoomThreshold: 0.2,
    heavyZoomThreshold: 0.1,
    budgetZoomThreshold: 0.16,
    idlePointBudget: 9000,
    activePointBudget: 12800,
    maxSamplingStep: 5,
    skipBaseDotsStep: 5,
    skipHighlightDotsStep: 6,
  }),
});

export function computeGridDetailLevel({
  viewport,
  settings,
  profile,
  hasDirectInteraction = false,
}) {
  const preset = DETAIL_LEVEL_PRESETS[settings?.performanceMode] ?? DETAIL_LEVEL_PRESETS.balanced;
  const zoom = Math.max(viewport?.zoom ?? 1, 0.001);
  const spacing = Math.max(settings?.spacing ?? 30, 1);
  const screenSpacing = spacing * zoom;
  const marginCells = Math.max(profile?.viewMarginCells ?? settings?.viewMarginCells ?? 0, 0);
  const pointBudget = hasDirectInteraction ? preset.activePointBudget : preset.idlePointBudget;
  const softZoomThreshold = preset.softZoomThreshold ?? 0.2;
  const heavyZoomThreshold = preset.heavyZoomThreshold ?? 0.1;
  const budgetZoomThreshold = preset.budgetZoomThreshold ?? heavyZoomThreshold;

  const estimatedCols = viewport.width / Math.max(screenSpacing, 1) + marginCells * 2 + 1;
  const estimatedRows = viewport.height / Math.max(screenSpacing, 1) + marginCells * 2 + 1;
  const estimatedPoints = estimatedCols * estimatedRows;
  const zoomStep = computeZoomSamplingStep({
    zoom,
    softZoomThreshold,
    heavyZoomThreshold,
    maxSamplingStep: preset.maxSamplingStep,
  });
  const budgetStep =
    zoom < budgetZoomThreshold
      ? Math.max(1, Math.ceil(Math.sqrt(estimatedPoints / Math.max(pointBudget, 1))))
      : 1;
  const profileStep = hasDirectInteraction ? 1 : Math.max(profile?.idleGridStep ?? 1, 1);
  const samplingStep = clamp(Math.max(profileStep, zoomStep, budgetStep), 1, preset.maxSamplingStep);
  const effectiveViewMarginCells = hasDirectInteraction ? marginCells : Math.max(0.75, marginCells / samplingStep);

  return {
    samplingStep,
    effectiveViewMarginCells,
    screenSpacing,
    estimatedPoints,
    skipBaseDots: samplingStep >= preset.skipBaseDotsStep,
    skipHighlightDots: samplingStep >= preset.skipHighlightDotsStep,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeZoomSamplingStep({ zoom, softZoomThreshold, heavyZoomThreshold, maxSamplingStep }) {
  if (zoom >= softZoomThreshold) {
    return 1;
  }

  if (zoom >= heavyZoomThreshold) {
    return 2;
  }

  const heavyRange = Math.max(heavyZoomThreshold, 0.001);
  const normalized = clamp((heavyRange - zoom) / heavyRange, 0, 1);
  const extraSteps = Math.round(normalized * Math.max(maxSamplingStep - 2, 0));
  return clamp(2 + extraSteps, 2, maxSamplingStep);
}
