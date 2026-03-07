<p align="center">
  <img src="./assets/fancy-grid-title.svg" alt="Fancy Grid" width="100%" />
</p>

<p align="center">
  <strong>Fancy Grid</strong> is a frontend-first ComfyUI extension that turns the canvas background into a reactive field of dots, lines, motion, and snap-aware interactions.
</p>

<p align="center">
  It ships as a frontend-only custom node package and includes a standalone demo for tuning the shared renderer outside ComfyUI.
</p>

## Overview

Fancy Grid replaces the static editor background with a living grid that reacts to:

- node cards
- graph links
- active cable drags
- pointer movement
- viewport motion

The result is a cleaner canvas with more spatial feedback, without adding backend nodes or changing your workflow graph format.

## Highlights

- Frontend-only ComfyUI extension with `WEB_DIRECTORY = "./web"`
- Reactive dot-and-line background rendered behind nodes
- Multiple dynamic grid styles with a `Grid Style` setting
- Sticky reroute snapping to grid points
- Shift-drag cut gesture for slicing links and nodes
- Standalone demo app for tuning the field engine in isolation

## Grid Styles

Current styles:

- `Default`
- `Wave Matrix (Beta)`
- `Prism Flow (Beta)`
- `Orbit Weave (Beta)`
- `Shear Drift (Beta)`
- `Helix Ribbon (Beta)`

You can switch styles from:

- `Settings > Fancy Grid > General > Grid Style`

## Interaction Notes

- Normal cable drops on empty canvas now preserve ComfyUI's quick-add node menu.
- Sticky reroutes are created only when you right-click while dragging a cable near a valid grid snap point.
- Shift + left drag starts the cut gesture.
- Existing graph links and live cable previews deform the field, but Fancy Grid does not replace ComfyUI's native cable rendering.

## Install

Place this repo inside your ComfyUI `custom_nodes` folder:

```text
ComfyUI/custom_nodes/Fancy_Grid
```

Then restart ComfyUI.

This package is intentionally frontend-only:

- [`__init__.py`](./__init__.py) exposes `WEB_DIRECTORY = "./web"`
- [`nodes.py`](./nodes.py) contains no backend nodes

After restart, the extension settings appear under `Fancy Grid`.

## Demo

The repo includes a small local demo that uses the same shared core modules as the ComfyUI extension.

From the project root:

```bash
cd demo
npm install
npm run dev
```

Open the printed local URL, then:

- drag cards to deform the field
- drag from an output port to an input port to preview cable influence
- scroll to zoom
- drag empty space to pan
- switch grid styles live from the demo controls

## Project Layout

- `web/reactiveGrid.js`
  ComfyUI extension entrypoint, settings registration, canvas hooks, snapping, and interaction wiring.
- `web/core/`
  Shared renderer, field engine, geometry helpers, theme tokens, snap logic, and ComfyUI adapters.
- `demo/`
  Lightweight development surface for experimenting with the same background engine outside ComfyUI.
- `assets/`
  README presentation assets.

## Notes

- Fancy Grid is designed to sit in the LiteGraph background draw path so it stays behind nodes.
- The package name is `comfyui-fancy-grid`.
- Python requirement in [`pyproject.toml`](./pyproject.toml) is `>=3.10`.
