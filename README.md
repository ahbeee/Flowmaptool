# Flowmaptool

Windows desktop mind-map / flow-map editor built with Electron, React, and TypeScript.

## Prerequisites

- Node.js 24.15.0
- pnpm 9.12.3

## Setup

```powershell
cd C:\Users\yeile\Documents\codex\Mindatom\Flowmaptool
pnpm install
pnpm dev
```

## Test Commands

```powershell
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:all
```

## Windows Packaging

```powershell
pnpm pack:win
pnpm dist:win
```

- `pnpm pack:win` builds an unpacked Windows app for quick local checks.
- `pnpm dist:win` builds x64 portable and NSIS installer artifacts under `release/`.
- Current Windows artifacts are unsigned local builds.

## Current Scope

- Multi-tab `.qflow` documents with new, open, save, save as, close, and tab switching workflows.
- Local-first graph model and serialization with schema migration, settings, tags, checklist state, task metadata, and manual/layout edge roles.
- Keyboard-first editing: `Tab` adds a child, `Enter` adds a sibling, `Space` edits, `Delete` removes, `Ctrl+C` / `Ctrl+V` copies and pastes subflows, undo/redo restores document history, and arrow keys navigate between nodes.
- Mouse interactions: node selection, marquee selection, root drag, child reparenting, right-drag edge creation, edge selection, route control editing, bend dragging, segment deletion, and reset bend.
- Auto layout for horizontal and vertical maps with configurable spacing, compact node sizing, multi-parent layout, root merge behavior, cycle edge handling, and fixed-spacing local reflow.
- Node styling: theme presets, font family, font size, text style, text alignment, text color, background color, shape, tags, and default new-node style.
- Edge styling and routing: width, line type, color, front/back/body anchors, manual route lanes, bend/control handle routing, selection stability, route persistence, and automatic route reset.
- Panels and view controls: zoom, fit to graph, toolbar visibility, right-side style panel, outline hierarchy, checklist state, and task table.
- Task workflows: tag-derived task rows, editable priority/progress/assignee/start/due/notes fields, readonly category/tag columns, sortable task headers, and expanded task table mode.
- Export and output: PNG export, PDF export, print, Windows portable app, and Windows installer.
- Validation coverage for bad file UX, old file migration, PNG export quality, 500-node / 1000-edge performance, task workflows, routing workflows, and core UI behavior.
