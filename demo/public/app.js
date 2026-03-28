import {
  DEFAULT_GRID_SETTINGS,
  NODE_VISUAL_FALLOFF_OPTIONS,
  mergeSettings,
} from "/core/defaultSettings.js";
import { ReactiveGridField } from "/core/fieldEngine.js";
import { ReactiveGridRenderer } from "/core/gridRenderer.js";
import { GRID_STYLE_OPTIONS } from "/core/gridStyles.js";

const stage = document.querySelector("[data-stage]");
const gridCanvas = document.querySelector("[data-grid]");
const nodesLayer = document.querySelector("[data-nodes]");
const statsRoot = document.querySelector("[data-stats]");
const controlsRoot = document.querySelector("[data-controls]");

const state = {
  settings: mergeSettings(DEFAULT_GRID_SETTINGS, {
    backgroundAlpha: 0.9,
    performanceMode: "quality",
    spacing: 30,
    radius: 216,
    strength: 0.18,
    spring: 0.16,
    damping: 0.8,
    linkGlow: 1.15,
    dotAlpha: 0.84,
    lineAlpha: 0.072,
  }),
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    zoom: 1,
    panX: window.innerWidth * 0.36,
    panY: window.innerHeight * 0.28,
  },
  nodes: [
    {
      id: "loader",
      title: "Image Loader",
      copy: "Ambient source texture\nand palette seed",
      x: -250,
      y: -80,
      width: 220,
      height: 150,
      inputs: [{ name: "seed" }],
      outputs: [{ name: "image" }],
    },
    {
      id: "sampler",
      title: "Sampler",
      copy: "Field response\nand latent shaping",
      x: 90,
      y: -10,
      width: 205,
      height: 146,
      inputs: [{ name: "image" }],
      outputs: [{ name: "latent" }],
    },
    {
      id: "output",
      title: "Save Image",
      copy: "Blue link glow\npreview target",
      x: 30,
      y: 220,
      width: 210,
      height: 144,
      inputs: [{ name: "image" }],
      outputs: [{ name: "done" }],
    },
  ],
  connections: [
    { id: "loader-sampler", from: { nodeId: "loader", slot: 0 }, to: { nodeId: "sampler", slot: 0 } },
    { id: "sampler-output", from: { nodeId: "sampler", slot: 0 }, to: { nodeId: "output", slot: 0 } },
  ],
  draggingNode: null,
  panning: null,
  activeCable: null,
  hoveredInput: null,
  pointerWorld: { x: 0, y: 0 },
  pointerActive: false,
  frameStats: { pointCount: 0, linkCount: 0, energy: 0 },
  fps: 0,
  frameCounter: 0,
  lastFpsAt: performance.now(),
  lastFrameAt: performance.now(),
};

const field = new ReactiveGridField(state.settings);
const renderer = new ReactiveGridRenderer({
  canvas: gridCanvas,
  settings: state.settings,
  drawBackground: true,
});
const nodeElements = new Map();

const CONTROL_DEFS = [
  { key: "spacing", label: "Spacing", min: 18, max: 100, step: 1 },
  { key: "radius", label: "Radius", min: 120, max: 320, step: 2 },
  { key: "strength", label: "Strength", min: 0.05, max: 0.4, step: 0.01 },
  { key: "connectionInfluence", label: "Connection Pull", min: 0, max: 0.5, step: 0.01 },
  { key: "spring", label: "Spring", min: 0.05, max: 0.3, step: 0.01 },
  { key: "damping", label: "Damping", min: 0.65, max: 0.92, step: 0.01 },
  { key: "gridVisibility", label: "Grid Visibility", min: 0, max: 1, step: 0.01 },
  { key: "linkGlow", label: "Link Glow", min: 0, max: 2, step: 0.05 },
  { key: "nodeGlow", label: "Node Glow", min: 0, max: 2, step: 0.05 },
  { key: "dotAlpha", label: "Dot Alpha", min: 0.2, max: 1, step: 0.01 },
  { key: "lineAlpha", label: "Line Alpha", min: 0.02, max: 0.18, step: 0.002 },
];
const SELECT_CONTROL_DEFS = [
  {
    key: "gridStyle",
    label: "Grid Style",
    options: GRID_STYLE_OPTIONS,
  },
  {
    key: "nodeVisualFalloff",
    label: "Node Falloff",
    options: NODE_VISUAL_FALLOFF_OPTIONS,
  },
  {
    key: "colorGlow",
    label: "Color Glow",
    options: [
      { text: "Off", value: false },
      { text: "On", value: true },
    ],
  },
  {
    key: "performanceMode",
    label: "Performance",
    options: [
      { text: "Eco", value: "eco" },
      { text: "Balanced", value: "balanced" },
      { text: "Quality", value: "quality" },
    ],
  },
];
const SELECT_CONTROL_KEYS = new Set(SELECT_CONTROL_DEFS.map((def) => def.key));
const SELECT_CONTROL_MAP = new Map(SELECT_CONTROL_DEFS.map((def) => [def.key, def]));

bootstrap();

function bootstrap() {
  buildStats();
  buildControls();
  renderNodes();
  syncViewport();
  attachEvents();
  requestAnimationFrame(loop);
}

function buildStats() {
  statsRoot.innerHTML = `
    <div class="demo-stat"><div class="demo-stat__label">Points</div><div class="demo-stat__value" data-stat="points">0</div></div>
    <div class="demo-stat"><div class="demo-stat__label">Zoom</div><div class="demo-stat__value" data-stat="zoom">1.00x</div></div>
    <div class="demo-stat"><div class="demo-stat__label">Links</div><div class="demo-stat__value" data-stat="links">0</div></div>
    <div class="demo-stat"><div class="demo-stat__label">FPS</div><div class="demo-stat__value" data-stat="fps">0</div></div>
  `;
}

function buildControls() {
  for (const def of CONTROL_DEFS) {
    const wrapper = document.createElement("div");
    wrapper.className = "demo-control";
    wrapper.innerHTML = `
      <div class="demo-control__row">
        <label for="control-${def.key}">${def.label}</label>
        <output data-output="${def.key}">${formatControlValue(def.key, state.settings[def.key])}</output>
      </div>
      <input id="control-${def.key}" data-control="${def.key}" type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${state.settings[def.key]}" />
    `;
    controlsRoot.appendChild(wrapper);
  }

  for (const def of SELECT_CONTROL_DEFS) {
    const wrapper = document.createElement("div");
    wrapper.className = "demo-control";
    wrapper.innerHTML = `
      <div class="demo-control__row">
        <label for="control-${def.key}">${def.label}</label>
        <output data-output="${def.key}">${formatControlValue(def.key, state.settings[def.key])}</output>
      </div>
      <select id="control-${def.key}" data-control="${def.key}">
        ${def.options.map((option) => `<option value="${String(option.value)}">${option.text}</option>`).join("")}
      </select>
    `;
    wrapper.querySelector("select").value = String(state.settings[def.key]);
    controlsRoot.appendChild(wrapper);
  }

  controlsRoot.addEventListener("input", (event) => {
    const key = event.target.dataset.control;
    if (!key || SELECT_CONTROL_KEYS.has(key)) {
      return;
    }

    const value = Number(event.target.value);
    state.settings[key] = value;
    field.setSettings(state.settings);
    renderer.setSettings(state.settings);
    controlsRoot.querySelector(`[data-output="${key}"]`).textContent = formatControlValue(key, value);
  });

  controlsRoot.addEventListener("change", (event) => {
    const key = event.target.dataset.control;
    if (!SELECT_CONTROL_KEYS.has(key)) {
      return;
    }

    const def = SELECT_CONTROL_MAP.get(key);
    const value =
      def?.options.find((option) => String(option.value) === event.target.value)?.value ?? event.target.value;
    state.settings[key] = value;
    field.setSettings(state.settings);
    renderer.setSettings(state.settings);
    controlsRoot.querySelector(`[data-output="${key}"]`).textContent = formatControlValue(
      key,
      value
    );
  });
}

function renderNodes() {
  for (const node of state.nodes) {
    let element = nodeElements.get(node.id);
    if (!element) {
      element = document.createElement("div");
      element.className = "demo-node";
      element.dataset.nodeId = node.id;
      element.innerHTML = `
        <div class="demo-node__card">
          <div class="demo-node__status"></div>
          <div class="demo-node__chrome" data-drag-handle="true">
            <div class="demo-node__eyebrow">Fancy Grid Demo</div>
            <div class="demo-node__title"></div>
            <div class="demo-node__copy"></div>
          </div>
        </div>
      `;
      nodesLayer.appendChild(element);
      nodeElements.set(node.id, element);
    }

    element.style.width = `${node.width}px`;
    element.style.height = `${node.height}px`;
    element.querySelector(".demo-node__title").textContent = node.title;
    element.querySelector(".demo-node__copy").textContent = node.copy;
    syncNodePorts(node, element);
  }
}

function syncNodePorts(node, element) {
  element.querySelectorAll(".demo-node__port").forEach((port) => port.remove());

  node.inputs.forEach((input, index) => {
    const port = document.createElement("button");
    port.type = "button";
    port.className = "demo-node__port demo-node__port--input";
    port.dataset.portKind = "input";
    port.dataset.portIndex = String(index);
    port.dataset.nodeId = node.id;
    port.title = input.name;
    port.style.top = `${getPortOffsetY(node, index, node.inputs.length) - 8}px`;
    element.appendChild(port);
  });

  node.outputs.forEach((output, index) => {
    const port = document.createElement("button");
    port.type = "button";
    port.className = "demo-node__port demo-node__port--output";
    port.dataset.portKind = "output";
    port.dataset.portIndex = String(index);
    port.dataset.nodeId = node.id;
    port.title = output.name;
    port.style.top = `${getPortOffsetY(node, index, node.outputs.length) - 8}px`;
    element.appendChild(port);
  });
}

function attachEvents() {
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", syncViewport);
  stage.addEventListener("pointerleave", onPointerLeave);
}

function onWheel(event) {
  if (event.target.closest(".demo-panel")) {
    return;
  }

  event.preventDefault();
  const previousZoom = state.viewport.zoom;
  const mouse = { x: event.clientX, y: event.clientY };
  const anchor = screenToWorld(mouse.x, mouse.y);
  const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
  state.viewport.zoom = clamp(previousZoom * zoomFactor, 0.55, 1.9);
  state.viewport.panX = mouse.x - anchor.x * state.viewport.zoom;
  state.viewport.panY = mouse.y - anchor.y * state.viewport.zoom;
}

function onPointerDown(event) {
  if (event.button !== 0 || event.target.closest(".demo-panel")) {
    return;
  }

  const port = event.target.closest(".demo-node__port");
  if (port?.dataset.portKind === "output") {
    const node = findNode(port.dataset.nodeId);
    const slot = Number(port.dataset.portIndex);
    const from = getPortWorldPosition(node, false, slot);
    state.activeCable = {
      id: `active-${node.id}-${slot}`,
      x1: from.x,
      y1: from.y,
      x2: from.x,
      y2: from.y,
      active: true,
      emphasis: 1.1,
      fromNodeId: node.id,
      fromSlot: slot,
    };
    state.hoveredInput = null;
    return;
  }

  const nodeElement = event.target.closest(".demo-node");
  if (nodeElement && event.target.closest("[data-drag-handle]")) {
    const node = findNode(nodeElement.dataset.nodeId);
    state.draggingNode = {
      nodeId: node.id,
      startX: node.x,
      startY: node.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    return;
  }

  state.panning = {
    startPanX: state.viewport.panX,
    startPanY: state.viewport.panY,
    pointerX: event.clientX,
    pointerY: event.clientY,
  };
}

function onPointerMove(event) {
  state.pointerWorld = screenToWorld(event.clientX, event.clientY);
  state.pointerActive = !event.target.closest(".demo-panel");

  if (state.draggingNode) {
    const node = findNode(state.draggingNode.nodeId);
    node.x = state.draggingNode.startX + (event.clientX - state.draggingNode.pointerX) / state.viewport.zoom;
    node.y = state.draggingNode.startY + (event.clientY - state.draggingNode.pointerY) / state.viewport.zoom;
    return;
  }

  if (state.panning) {
    state.viewport.panX = state.panning.startPanX + (event.clientX - state.panning.pointerX);
    state.viewport.panY = state.panning.startPanY + (event.clientY - state.panning.pointerY);
    return;
  }

  if (state.activeCable) {
    const hovered = findHoveredInput(state.pointerWorld);
    state.hoveredInput = hovered;
    if (hovered) {
      const snapped = getPortWorldPosition(findNode(hovered.nodeId), true, hovered.slot);
      state.activeCable.x2 = snapped.x;
      state.activeCable.y2 = snapped.y;
    } else {
      state.activeCable.x2 = state.pointerWorld.x;
      state.activeCable.y2 = state.pointerWorld.y;
    }
  }
}

function onPointerUp() {
  if (state.activeCable && state.hoveredInput) {
    const existing = state.connections.filter(
      (connection) =>
        !(connection.to.nodeId === state.hoveredInput.nodeId && connection.to.slot === state.hoveredInput.slot)
    );
    existing.push({
      id: `${state.activeCable.fromNodeId}-${state.hoveredInput.nodeId}-${Date.now()}`,
      from: { nodeId: state.activeCable.fromNodeId, slot: state.activeCable.fromSlot },
      to: { nodeId: state.hoveredInput.nodeId, slot: state.hoveredInput.slot },
    });
    state.connections = existing;
  }

  state.draggingNode = null;
  state.panning = null;
  state.activeCable = null;
  state.hoveredInput = null;
}

function onPointerLeave() {
  state.pointerActive = false;
}

function loop(timestamp) {
  const delta = timestamp - state.lastFrameAt || 16.67;
  state.lastFrameAt = timestamp;

  syncViewport();
  syncNodeTransforms();
  syncHoveredPorts();

  const frame = field.update({
    viewport: state.viewport,
    nodes: state.nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      radius: 24,
    })),
    links: getConnectionSegments(),
    activeCable: state.activeCable ? { ...state.activeCable } : null,
    pointer: state.pointerActive ? { ...state.pointerWorld, active: true } : null,
    dt: delta,
    isInteracting: Boolean(state.draggingNode || state.panning || state.activeCable),
  });

  renderer.render(frame, {
    drawBackground: true,
    drawConnectionPaths: true,
  });

  state.frameStats = frame.stats;
  state.frameCounter += 1;
  if (timestamp - state.lastFpsAt >= 400) {
    state.fps = Math.round((state.frameCounter * 1000) / (timestamp - state.lastFpsAt));
    state.frameCounter = 0;
    state.lastFpsAt = timestamp;
    updateStats();
  }

  requestAnimationFrame(loop);
}

function getConnectionSegments() {
  return state.connections.map((connection) => {
    const fromNode = findNode(connection.from.nodeId);
    const toNode = findNode(connection.to.nodeId);
    const from = getPortWorldPosition(fromNode, false, connection.from.slot);
    const to = getPortWorldPosition(toNode, true, connection.to.slot);
    return {
      id: connection.id,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      active: state.draggingNode?.nodeId === fromNode.id || state.draggingNode?.nodeId === toNode.id,
      emphasis: 0.84,
    };
  });
}

function updateStats() {
  statsRoot.querySelector('[data-stat="points"]').textContent = String(state.frameStats.pointCount);
  statsRoot.querySelector('[data-stat="zoom"]').textContent = `${state.viewport.zoom.toFixed(2)}x`;
  statsRoot.querySelector('[data-stat="links"]').textContent = String(
    state.frameStats.linkCount + (state.activeCable ? 1 : 0)
  );
  statsRoot.querySelector('[data-stat="fps"]').textContent = String(state.fps);
}

function syncViewport() {
  state.viewport.width = window.innerWidth;
  state.viewport.height = window.innerHeight;
}

function formatControlValue(key, value) {
  if (SELECT_CONTROL_KEYS.has(key)) {
    return SELECT_CONTROL_MAP.get(key)?.options.find(
      (option) => String(option.value) === String(value)
    )?.text ?? String(value);
  }

  if (key === "spacing" || key === "radius") {
    return String(Math.round(value));
  }

  return Number(value).toFixed(2);
}

function syncNodeTransforms() {
  for (const node of state.nodes) {
    const element = nodeElements.get(node.id);
    element.style.transform = `translate(${worldToScreenX(node.x)}px, ${worldToScreenY(node.y)}px) scale(${state.viewport.zoom})`;
  }
}

function syncHoveredPorts() {
  for (const [nodeId, element] of nodeElements.entries()) {
    element.querySelectorAll('.demo-node__port--input').forEach((port) => {
      const slot = Number(port.dataset.portIndex);
      const active = state.hoveredInput?.nodeId === nodeId && state.hoveredInput.slot === slot;
      port.classList.toggle("is-target", active);
    });
  }
}

function findHoveredInput(pointerWorld) {
  const hitRadius = 18 / state.viewport.zoom;
  for (const node of state.nodes) {
    for (let index = 0; index < node.inputs.length; index += 1) {
      const port = getPortWorldPosition(node, true, index);
      if (Math.hypot(pointerWorld.x - port.x, pointerWorld.y - port.y) <= hitRadius) {
        if (node.id === state.activeCable.fromNodeId) {
          continue;
        }
        return { nodeId: node.id, slot: index };
      }
    }
  }
  return null;
}

function getPortWorldPosition(node, isInput, index) {
  return {
    x: isInput ? node.x : node.x + node.width,
    y: node.y + getPortOffsetY(node, index, isInput ? node.inputs.length : node.outputs.length),
  };
}

function getPortOffsetY(node, index, count) {
  const gap = (node.height - 40) / (Math.max(count, 1) + 1);
  return 20 + gap * (index + 1);
}

function findNode(nodeId) {
  return state.nodes.find((node) => node.id === nodeId);
}

function worldToScreenX(x) {
  return x * state.viewport.zoom + state.viewport.panX;
}

function worldToScreenY(y) {
  return y * state.viewport.zoom + state.viewport.panY;
}

function screenToWorld(x, y) {
  return {
    x: (x - state.viewport.panX) / state.viewport.zoom,
    y: (y - state.viewport.panY) / state.viewport.zoom,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
