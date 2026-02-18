# hayro-demo

`hayro-demo` is a WASM-powered browser demo for testing hayro's rendering and editing capabilities.

## Current capabilities

- Multi-page continuous scrolling
- Zoom controls (`+`, `-`, fit-width, fit-page, `Ctrl/Cmd + wheel`)
- Text selection via a generated text layer
- Annotation tools:
  - Highlight
  - Rectangle
  - Freehand ink
  - Free text
- Form authoring tools:
  - Text form fields (`/FT /Tx`)
  - Signature form fields (`/FT /Sig`) with placeholder appearance
- Global undo/redo for pending edits
- Save edited PDF output

## Scope notes

- Signature support in this crate currently means **signature field creation** only.
- Cryptographic signing workflows (certificate handling, CMS payload generation, byte-range sealing) are out of scope for this demo crate.

## Build

From the `hayro-demo` directory:

```bash
wasm-pack build --target web --out-dir www
```

Then serve `www` with a static file server.

## Lightweight JS unit tests

From repository root:

```bash
node --test hayro-demo/tests-js/viewer_math.test.js
```
