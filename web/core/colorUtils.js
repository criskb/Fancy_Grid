const COLOR_PARSE_CACHE_LIMIT = 192;
const colorParseCache = new Map();

function clampChannel(value) {
  return Math.min(Math.max(Math.round(value), 0), 255);
}

export function parseColorString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (colorParseCache.has(normalized)) {
    return colorParseCache.get(normalized);
  }

  let parsed = null;
  if (normalized.startsWith("#")) {
    parsed = parseHexColor(normalized);
  } else {
    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
      const channels = rgbMatch[1]
        .split(",")
        .map((channel) => Number.parseFloat(channel.trim()))
        .filter((channel) => Number.isFinite(channel));

      if (channels.length >= 3) {
        parsed = {
          r: clampChannel(channels[0]),
          g: clampChannel(channels[1]),
          b: clampChannel(channels[2]),
        };
      }
    }

    if (!parsed) {
      parsed = parseCssColor(normalized);
    }
  }

  cacheParsedColor(normalized, parsed);
  return parsed;
}

export function formatRgbColor({ r, g, b }) {
  return `${clampChannel(r)},${clampChannel(g)},${clampChannel(b)}`;
}

function parseHexColor(value) {
  const hex = value.slice(1);
  if (![3, 6].includes(hex.length)) {
    return null;
  }

  const expanded = hex.length === 3 ? hex.split("").map((digit) => `${digit}${digit}`).join("") : hex;
  const int = Number.parseInt(expanded, 16);
  if (!Number.isFinite(int)) {
    return null;
  }

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function parseCssColor(value) {
  const context = getColorContext();
  if (!context) {
    return null;
  }

  const css = globalThis.CSS;
  if (css?.supports && !css.supports("color", value)) {
    return null;
  }

  context.fillStyle = "#010203";
  context.fillStyle = value;
  const normalized = context.fillStyle;

  if (typeof normalized !== "string" || normalized === "#010203") {
    return null;
  }

  const hex = parseHexColor(normalized);
  if (hex) {
    return hex;
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1]
    .split(",")
    .map((channel) => Number.parseFloat(channel.trim()))
    .filter((channel) => Number.isFinite(channel));

  if (channels.length < 3) {
    return null;
  }

  return {
    r: clampChannel(channels[0]),
    g: clampChannel(channels[1]),
    b: clampChannel(channels[2]),
  };
}

let colorContext = null;

function getColorContext() {
  if (colorContext) {
    return colorContext;
  }

  const canvas = globalThis.document?.createElement?.("canvas");
  colorContext = canvas?.getContext?.("2d") ?? null;
  return colorContext;
}

function cacheParsedColor(key, value) {
  if (colorParseCache.size >= COLOR_PARSE_CACHE_LIMIT) {
    const oldestKey = colorParseCache.keys().next().value;
    if (typeof oldestKey === "string") {
      colorParseCache.delete(oldestKey);
    }
  }

  colorParseCache.set(key, value ? Object.freeze(value) : null);
}
