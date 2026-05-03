# Flowmaptool Architecture

## Runtime Boundaries

Flowmaptool is an Electron desktop app with three runtime layers:

- Main process: owns native menus, file dialogs, file IO, print, PDF export, and window creation.
- Preload bridge: exposes a narrow `window.flowmaptool` API through `contextBridge`.
- Renderer: owns React UI, document editing, layout rendering, transient interaction state, and SVG/PNG snapshot generation.

The main window runs with `contextIsolation: true` and `nodeIntegration: false`. Renderer code should not import Electron or Node APIs directly.

## Document Model

The persisted document is a `.qflow` JSON file. The durable model lives in `src/shared/graph.ts`:

- `nodes` and `edges` are the editable graph.
- `settings` stores theme, spacing, default node shape, default edge style, and tag definitions.
- `checklist` stores checked node ids.
- `task` metadata is stored on nodes.
- `meta` stores next node and edge sequence counters.

Schema migration and sanitization happen through the shared graph module before a document reaches the renderer.

## Renderer State

Renderer state has two categories:

- Durable document state: `FlowDoc`, committed through history and written into `.qflow`.
- Transient UI state: active tab, selection, drag state, marquee state, zoom, panel visibility, edit buffers, and live pointer interactions.

Some UI state is persisted alongside the document wrapper, including layout direction, node offsets, edge bends, edge routes, and toolbar visibility. These values should stay separate from the core `FlowDoc` schema unless they become portable graph semantics.

## Shared Logic

Core graph behavior lives in `src/shared` and is covered by unit or integration tests:

- `graph.ts`: schema, migration, sanitization, graph edits, tags, checklist, task metadata, and edge validation.
- `layout.ts`: horizontal/vertical automatic layout and primary parent selection.
- `local-reflow.ts`: local node offset and layer reorder behavior.
- `history.ts`: undo/redo stack primitives.
- `subflow.ts`: copy/paste extraction and detached paste behavior.

Renderer-only pure helpers live under `src/renderer/src`:

- `outline.ts`: outline tree construction and checklist completion target derivation.
- `outline-panel.tsx`: Outline tree rendering, checklist controls, collapsed state display, and node selection entry points. It receives tree data and callbacks from `App.tsx`.
- `task-table.ts`: Task Table row derivation from tagged outline nodes, labels, columns, visibility, filtering, sorting, density options, and due-date status helpers.
- `task-table-panel.tsx`: Task Table rendering and table-specific controls. It receives rows, UI preferences, and callbacks from `App.tsx`; document mutation and tab state ownership stay in `App.tsx`.

Task Table UI preferences are persisted in the `.qflow` wrapper `ui.taskTable` object, not in the core `FlowDoc`. This currently includes sort, filters, visible columns, expanded mode, and density. Keep future table-only preferences in that wrapper unless they become durable task metadata.

New pure renderer logic should usually be extracted into small modules like these before adding more code to `App.tsx`.

## Routing and Export

Edge routing is currently renderer-local because it depends on measured node sizes, rendered positions, route control UI, and SVG output. The safest extraction path is to move geometry-only helpers into a renderer routing module first, then leave React event handling in `App.tsx`.

Export flow:

- PNG export is rendered from the renderer-generated SVG snapshot into a canvas.
- PDF and print send SVG to the main process, where Electron creates a temporary print window.

If future features allow external SVG, HTML labels, or rich text content, the SVG-to-print path must be sanitized and locked down further.

## Test Strategy

- Unit tests should cover shared modules and renderer pure helpers.
- Integration tests should cover `.qflow` serialization and migration.
- E2E tests should cover user-visible Electron workflows only.

Use `tests/e2e/helpers.ts` for new E2E tests so app launch, fixtures, and common node actions stay consistent.
