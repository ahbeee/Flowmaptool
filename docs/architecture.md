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

- `app-header.tsx`: top-level tab strip, panel toggles, toolbar visibility toggle, and file status rendering. It receives tab state and callbacks from `App.tsx`.
- `canvas-edges-layer.tsx`: canvas edge SVG rendering, connect preview, route guide display, and bend handle entry points. Edge selection, hit testing, routing state mutation, and drag lifecycle ownership stay in `App.tsx`.
- `canvas-nodes-layer.tsx`: canvas node rendering, inline node label editing, tag marker display, and connect handle entry points. Drag, edit, and connect state ownership stay in `App.tsx`.
- `canvas-overlays-layer.tsx`: canvas-only overlay rendering for marquee selection and drag insert previews.
- `outline.ts`: outline tree construction, search filtering, checklist target derivation, checklist view filtering, checklist counts, and outline ancestry helpers.
- `outline-panel.tsx`: Outline and Checklist rendering, search controls, checklist filters/counts, collapsed state display, inline label editing, context tag/status actions, metadata badges, and node selection entry points. It receives tree data and mutation callbacks from `App.tsx`.
- `panel-resizer.tsx`: accessible side panel resize separator rendering. Resize math and state ownership stay in `App.tsx` and `side-panel-resize.ts`.
- `task-table.ts`: Task Workbench row derivation from tagged outline nodes, labels, views, columns, visibility, filtering, sorting, and due-date status helpers.
- `task-table-panel.tsx`: Task Workbench rendering, quick capture, bulk actions, detail editing, and table-specific controls. It receives rows, UI preferences, and callbacks from `App.tsx`; document mutation and tab state ownership stay in `App.tsx`.
- `toolbar-panel.tsx`: right-side Map, Node, and Line toolbar rendering. It receives style summaries, settings, and mutation callbacks from `App.tsx`.

Task Workbench UI preferences are persisted in the `.qflow` wrapper `ui.taskTable` object, not in the core `FlowDoc`. This currently includes view, sort, filters, visible columns, column widths, and expanded mode. Keep future table-only preferences in that wrapper unless they become durable task metadata.

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
