# Fancy Grid

Fancy Grid is a frontend-first ComfyUI extension that renders a reactive dot mesh as the editor background, plus a standalone Node.js demo for tuning the field engine outside ComfyUI.

## What is included

- `web/reactiveGrid.js`
  Registers the ComfyUI extension with `app.registerExtension(...)`, hooks the LiteGraph background draw, disables the stock grid image, and exposes settings.
- `web/core/`
  Shared field engine, geometry helpers, renderer, and ComfyUI adapter utilities.
- `demo/`
  Lightweight Node.js tuning lab that serves the same shared core and gives you draggable cards, cable previews, pan/zoom, and slider controls.

## ComfyUI install

This repo already follows the normal custom-node package layout:

- `__init__.py` exposes `WEB_DIRECTORY = "./web"`
- `nodes.py` stays empty because this package is frontend-only

Restart ComfyUI after the package is present in `custom_nodes`. The extension settings show up under `Fancy Grid`.

## Demo usage

From this package root:

```bash
cd demo
npm run dev
```

Open the printed local URL, then:

- drag cards to deform the field
- drag from a right-side port to a left-side port to preview cable tension
- scroll to zoom
- drag empty canvas space to pan

## Notes

- The current Comfy integration renders in LiteGraph’s background draw hook so the field sits behind nodes.
- Existing graph links bend the field, but the extension does not redraw Comfy’s native cable lines.
- Active cable preview detection in ComfyUI uses the canvas connection state when available and falls back conservatively.
