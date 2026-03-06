const THEME_STYLESHEET_ID = "fancy-grid-theme-vars";
const THEME_STYLESHEET_URL = new URL("../fancyGridTheme.css", import.meta.url);

export const THEME_COLOR_FALLBACKS = Object.freeze({
  dotColor: "255,255,255",
  lineColor: "170,182,214",
  linkIdleColor: "224,229,238",
  highlightColor: "56,168,255",
  accentColor: "255,255,255",
  backgroundColorTop: "#0f141b",
  backgroundColorBottom: "#090d12",
  backgroundGlowColor: "18,36,56",
  cutColor: "255,72,72",
  cutColorTrail: "255,184,184",
  snapFillColor: "56,168,255",
  snapCenterColor: "255,255,255",
  snapRingColor: "56,168,255",
});

const THEME_COLOR_VARIABLES = Object.freeze({
  dotColor: "--fancy-grid-dot-color",
  lineColor: "--fancy-grid-line-color",
  linkIdleColor: "--fancy-grid-link-idle-color",
  highlightColor: "--fancy-grid-highlight-color",
  accentColor: "--fancy-grid-accent-color",
  backgroundColorTop: "--fancy-grid-background-top",
  backgroundColorBottom: "--fancy-grid-background-bottom",
  backgroundGlowColor: "--fancy-grid-background-glow",
  cutColor: "--fancy-grid-cut-color",
  cutColorTrail: "--fancy-grid-cut-color-trail",
  snapFillColor: "--fancy-grid-snap-fill-color",
  snapCenterColor: "--fancy-grid-snap-center-color",
  snapRingColor: "--fancy-grid-snap-ring-color",
});

let themeStylesheetPromise = null;

export function ensureThemeStylesheet() {
  if (typeof document === "undefined") {
    return Promise.resolve();
  }

  if (themeStylesheetPromise) {
    return themeStylesheetPromise;
  }

  const existing = document.getElementById(THEME_STYLESHEET_ID);
  if (existing) {
    themeStylesheetPromise = existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => resolve(), { once: true });
        });
    return themeStylesheetPromise;
  }

  const link = document.createElement("link");
  link.id = THEME_STYLESHEET_ID;
  link.rel = "stylesheet";
  link.href = THEME_STYLESHEET_URL.href;
  themeStylesheetPromise = new Promise((resolve) => {
    link.addEventListener(
      "load",
      () => {
        link.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    link.addEventListener("error", () => resolve(), { once: true });
  });
  document.head.appendChild(link);
  return themeStylesheetPromise;
}

export function getThemeColors() {
  if (typeof document === "undefined") {
    return { ...THEME_COLOR_FALLBACKS };
  }

  const styles = getComputedStyle(document.documentElement);
  const colors = {};

  for (const [token, variableName] of Object.entries(THEME_COLOR_VARIABLES)) {
    colors[token] = styles.getPropertyValue(variableName).trim() || THEME_COLOR_FALLBACKS[token];
  }

  return colors;
}
