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

- Multi-tab `.qflow` documents with new, open, save, save as, close, and tab switching.
- Local-first graph model and serialization with version migration.
- Keyboard-first editing: `Tab` adds a child, `Enter` adds a sibling, `Space` edits, `Delete` removes, `Ctrl+C` / `Ctrl+V` copies and pastes subflows, and arrow keys navigate between nodes.
- Mouse interactions: node selection, marquee selection, root drag, child reparenting, right-drag edge creation, edge selection, bend dragging, and reset bend.
- Auto layout for horizontal and vertical maps with configurable spacing, compact node sizing, multi-parent layout, root merge behavior, and fixed-spacing reflow.
- Node styling: theme presets, font family, font size, text style, text color, background color, shape, tags, and default new-node style.
- Edge styling: width, line type, color, manual route points, and automatic route reset.
- View controls: zoom, fit to graph, toolbar visibility, and right-side style panel.
- Export and packaging: PNG export, Windows portable app, and Windows installer.
- Validation coverage for bad file UX, old file migration, PNG export quality, 500-node / 1000-edge performance, and core UI workflows.

## Known Boundaries

- Advanced manual edge routing is supported, but exact parity with every QuikFlow routing case is intentionally kept as follow-up work.
- Remote GitHub Actions CI is disabled by design; validation is run locally with the commands above.
