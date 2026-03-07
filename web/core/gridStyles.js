const GRID_STYLE_DEFINITIONS = Object.freeze({
  default: Object.freeze({
    id: "default",
    label: "Default",
    alwaysAnimate: false,
    dotRadiusScale: 1,
    dotAlphaScale: 1,
    lineAlphaScale: 1,
    lineWidthScale: 1,
    highlightScale: 1,
    backgroundGlowScale: 1,
    resolvePoint: ({ col, row, spacing }) => ({
      x: col * spacing,
      y: row * spacing,
    }),
  }),
  "wave-matrix": Object.freeze({
    id: "wave-matrix",
    label: "Wave Matrix (Beta)",
    alwaysAnimate: true,
    dotRadiusScale: 1.08,
    dotAlphaScale: 1.04,
    lineAlphaScale: 1.16,
    lineWidthScale: 1.04,
    highlightScale: 1.14,
    backgroundGlowScale: 1.18,
    resolvePoint: ({ col, row, spacing, time = 0 }) => {
      const baseX = col * spacing;
      const baseY = row * spacing;
      return {
        x:
          baseX +
          Math.sin(row * 0.72 + time * 1.45) * spacing * 0.28 +
          Math.cos((col + row) * 0.35 - time * 0.7) * spacing * 0.08,
        y:
          baseY +
          Math.cos(col * 0.68 - time * 1.25) * spacing * 0.22 +
          Math.sin(row * 0.4 + time * 0.95) * spacing * 0.07,
      };
    },
  }),
  "prism-flow": Object.freeze({
    id: "prism-flow",
    label: "Prism Flow (Beta)",
    alwaysAnimate: true,
    dotRadiusScale: 0.96,
    dotAlphaScale: 1.02,
    lineAlphaScale: 1.1,
    lineWidthScale: 1.08,
    highlightScale: 1.18,
    backgroundGlowScale: 1.12,
    resolvePoint: ({ col, row, spacing, time = 0 }) => {
      const baseX = col * spacing + (row % 2 === 0 ? 0 : spacing * 0.5);
      const baseY = row * spacing;
      return {
        x: baseX + Math.sin(time * 1.05 + row * 0.62) * spacing * 0.12,
        y:
          baseY +
          Math.cos(time * 1.2 + col * 0.55 + (row % 2) * 0.4) * spacing * 0.16 +
          Math.sin((col - row) * 0.28 - time * 0.5) * spacing * 0.04,
      };
    },
  }),
  "orbit-weave": Object.freeze({
    id: "orbit-weave",
    label: "Orbit Weave (Beta)",
    alwaysAnimate: true,
    dotRadiusScale: 1.12,
    dotAlphaScale: 1.06,
    lineAlphaScale: 1.2,
    lineWidthScale: 1.06,
    highlightScale: 1.2,
    backgroundGlowScale: 1.22,
    resolvePoint: ({ col, row, spacing, time = 0 }) => {
      const baseX = col * spacing;
      const baseY = row * spacing;
      const orbitalPhase = time * 1.4 + (col + row) * 0.35;
      const orbitRadius = spacing * (0.12 + ((col + row) & 1) * 0.06);
      return {
        x: baseX + Math.cos(orbitalPhase) * orbitRadius + Math.sin(row * 0.42 - time * 0.55) * spacing * 0.08,
        y: baseY + Math.sin(orbitalPhase) * orbitRadius + Math.cos(col * 0.38 + time * 0.65) * spacing * 0.08,
      };
    },
  }),
  "shear-drift": Object.freeze({
    id: "shear-drift",
    label: "Shear Drift (Beta)",
    alwaysAnimate: true,
    dotRadiusScale: 0.94,
    dotAlphaScale: 1,
    lineAlphaScale: 1.14,
    lineWidthScale: 1.12,
    highlightScale: 1.16,
    backgroundGlowScale: 1.15,
    resolvePoint: ({ col, row, spacing, time = 0 }) => {
      const baseX = col * spacing;
      const baseY = row * spacing;
      const shear = Math.sin(time * 0.9 + row * 0.44) * spacing * 0.32;
      return {
        x: baseX + shear + Math.cos(col * 0.4 - time * 0.75) * spacing * 0.06,
        y:
          baseY +
          Math.sin(col * 0.52 + time * 1.1) * spacing * 0.18 +
          Math.sin((col + row) * 0.24 - time * 0.4) * spacing * 0.06,
      };
    },
  }),
  "helix-ribbon": Object.freeze({
    id: "helix-ribbon",
    label: "Helix Ribbon (Beta)",
    alwaysAnimate: true,
    dotRadiusScale: 1.04,
    dotAlphaScale: 1.03,
    lineAlphaScale: 1.18,
    lineWidthScale: 1.08,
    highlightScale: 1.22,
    backgroundGlowScale: 1.2,
    resolvePoint: ({ col, row, spacing, time = 0 }) => {
      const baseX = col * spacing;
      const baseY = row * spacing;
      const ribbon = Math.sin(time * 1.3 + col * 0.48) * spacing * 0.26;
      const twist = Math.cos(time * 1.05 + row * 0.5 + col * 0.22) * spacing * 0.16;
      return {
        x: baseX + ribbon,
        y: baseY + twist + Math.sin(time * 0.55 + (row - col) * 0.2) * spacing * 0.05,
      };
    },
  }),
});

export const GRID_STYLE_OPTIONS = Object.freeze(
  Object.values(GRID_STYLE_DEFINITIONS).map((style) =>
    Object.freeze({
      text: style.label,
      value: style.id,
    })
  )
);

export function getGridStyleDefinition(gridStyle) {
  return GRID_STYLE_DEFINITIONS[gridStyle] ?? GRID_STYLE_DEFINITIONS.default;
}

export function resolveGridRestPoint({ col, row, spacing, gridStyle = "default", time = 0 }) {
  const style = getGridStyleDefinition(gridStyle);
  const point = style.resolvePoint({ col, row, spacing, time });

  return {
    key: `${col}:${row}`,
    col,
    row,
    x: point.x,
    y: point.y,
  };
}

export function findNearestStyledGridPoint(
  point,
  { spacing, gridStyle = "default", time = 0, rowSearchRadius = 2, colSearchRadius = 2 } = {}
) {
  if (!point || !Number.isFinite(spacing) || spacing <= 0) {
    return null;
  }

  const approxRow = Math.round(point.y / spacing);
  let best = null;

  for (let row = approxRow - rowSearchRadius; row <= approxRow + rowSearchRadius; row += 1) {
    const approxCol = Math.round(point.x / spacing);

    for (let col = approxCol - colSearchRadius; col <= approxCol + colSearchRadius; col += 1) {
      const candidate = resolveGridRestPoint({
        col,
        row,
        spacing,
        gridStyle,
        time,
      });
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);

      if (!best || distance < best.distance) {
        best = {
          ...candidate,
          distance,
        };
      }
    }
  }

  return best;
}
