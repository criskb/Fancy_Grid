import { THEME_COLOR_FALLBACKS } from "./themeTokens.js";

export const DEFAULT_GRID_SETTINGS = Object.freeze({
  enabled: true,
  gridStyle: "default",
  spacing: 30,
  radius: 220,
  strength: 0.2,
  connectionInfluence: 0.2,
  nodeVisualFalloff: "soft",
  gridVisibility: 1,
  spring: 0.15,
  damping: 0.8,
  interactionSpringBoost: 1.7,
  interactionDamping: 0.74,
  maxOffset: 28,
  dotRadius: 1.4,
  dotAlpha: 0.84,
  dotColor: THEME_COLOR_FALLBACKS.dotColor,
  lineAlpha: 0.075,
  lineWidth: 1,
  lineColor: THEME_COLOR_FALLBACKS.lineColor,
  linkIdleColor: THEME_COLOR_FALLBACKS.linkIdleColor,
  linkRadius: 148,
  linkGlow: 1,
  nodeGlow: 1,
  colorGlow: false,
  pointerRadius: 120,
  pointerStrength: 0.12,
  highlightColor: THEME_COLOR_FALLBACKS.highlightColor,
  accentColor: THEME_COLOR_FALLBACKS.accentColor,
  backgroundColorTop: THEME_COLOR_FALLBACKS.backgroundColorTop,
  backgroundColorBottom: THEME_COLOR_FALLBACKS.backgroundColorBottom,
  backgroundGlowColor: THEME_COLOR_FALLBACKS.backgroundGlowColor,
  backgroundAlpha: 0.22,
  nodePadding: 14,
  nodeCornerRadius: 20,
  nodeMaskPadding: 4,
  viewMarginCells: 3,
  performanceMode: "balanced",
});

export const PERFORMANCE_PROFILES = Object.freeze({
  eco: Object.freeze({
    maxNodes: 10,
    maxLinks: 28,
    viewportPadding: 240,
    idleFps: 14,
    activeFps: 26,
  }),
  balanced: Object.freeze({
    maxNodes: 18,
    maxLinks: 52,
    viewportPadding: 320,
    idleFps: 20,
    activeFps: 40,
  }),
  quality: Object.freeze({
    maxNodes: 32,
    maxLinks: 96,
    viewportPadding: 420,
    idleFps: 24,
    activeFps: 60,
  }),
});

export const NODE_VISUAL_FALLOFF_OPTIONS = Object.freeze([
  Object.freeze({ text: "Soft", value: "soft" }),
  Object.freeze({ text: "Edge Fade", value: "edge" }),
]);

export { GRID_STYLE_OPTIONS } from "./gridStyles.js";

export function getPerformanceProfile(mode) {
  return PERFORMANCE_PROFILES[mode] ?? PERFORMANCE_PROFILES.balanced;
}

export function mergeSettings(base = DEFAULT_GRID_SETTINGS, patch = {}) {
  return {
    ...base,
    ...patch,
  };
}
