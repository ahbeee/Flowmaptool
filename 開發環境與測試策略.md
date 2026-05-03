# Flowmaptool Development Environment and Test Strategy

Document version: v0.3
Date: 2026-05-02

## 1. Goal

Flowmaptool is a Windows local-first mind-map and flow-map editor. The development strategy is to keep core validation reproducible through local commands, with automated coverage for graph logic, serialization, Electron UI workflows, export quality, and Windows packaging readiness.

## 2. Development Environment

### 2.1 Operating System

- Windows 11 x64

### 2.2 Core Tools

- Node.js `24.15.0`
- pnpm `9.12.3`
- Git `2.47+`

### 2.3 Build Dependencies

- Visual Studio 2022 Build Tools with Desktop development with C++
- Python `3.12.x`, or the currently available local Python version

### 2.4 Recommended IDE

- Latest VS Code
- Playwright extension for inspecting traces when needed

## 3. Project Stack

- Electron `31.7.7`
- React `18.3.1`
- TypeScript `5.6.3`
- Vite `5.4.11`
- electron-vite `2.3.0`
- Vitest `2.1.9`
- Playwright `1.54.2`
- Internal TypeScript modules for the graph model, history, layout, local reflow, and subflow operations

The project does not currently use Zustand or ELK.js. State management and layout behavior are handled inside the application and shared TypeScript modules.

## 4. Current Product Surface

- Multi-tab `.qflow` documents with new, open, save, save as, close, and tab switching workflows.
- Local-first graph model with schema migration, settings, tags, checklist state, task metadata, and manual/layout edge roles.
- Keyboard-first editing with node creation, editing, deletion, copy/paste, undo/redo, sibling reordering, and keyboard navigation.
- Mouse interactions for node selection, marquee selection, root dragging, child reparenting, right-drag edge creation, edge selection, bend dragging, route editing, and reset bend.
- Horizontal and vertical automatic layout with configurable spacing, compact node sizing, multi-parent behavior, root merge behavior, and fixed-spacing local reflow.
- Styling controls for themes, fonts, text style, text alignment, text color, background color, shape, tags, default node style, and edge style.
- Outline panel with hierarchy mirroring, selection sync, collapsible nodes, checklist completion state, and tag-derived checklist targets.
- Task Table derived from tagged outline nodes, including editable task fields, readonly tag/category columns, sortable headers, column visibility controls, and expanded workspace mode.
- Export and output workflows for PNG export, PDF export, print, Windows portable builds, and Windows installer builds.

## 5. Test Strategy

### 5.1 Test Layers

- Unit tests cover graph operations, history, layout, local reflow, and subflow extraction/paste behavior.
- Integration tests cover `.qflow` serialization, migration, checklist persistence, task metadata, style settings, edge anchors, and invalid input sanitization.
- E2E tests cover Electron UI behavior, keyboard and mouse interactions, panel workflows, file operations, export quality, performance, and error handling.

### 5.2 Local Test Commands

```powershell
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:all
```

`pnpm test:e2e` runs a production build first, then launches Electron through Playwright.

### 5.3 Current E2E Coverage

- App launch smoke test.
- Keyboard shortcuts: `Tab`, `Enter`, `Space`, `Delete`, `Ctrl+C`, `Ctrl+V`, undo/redo, arrow navigation, and sibling reorder shortcuts.
- Node editing, selection switching, marquee selection, multi-select deletion, root dragging, reparenting, and offset reset.
- Horizontal and vertical layout, spacing settings, root merge, root connection normalization, multi-parent layout, local reflow, and cycle edge layout.
- Manual edge creation, front/back/body anchor behavior, edge selection, route control points, bend persistence, segment deletion, reset bend, and advanced manual routing cases.
- Toolbar visibility, toolbar mode, node style changes, default node settings, tag creation/rename/delete, and edge style changes.
- Outline hierarchy, checklist persistence, Task Table derivation, task field editing, task sorting, column visibility, and expanded task table mode.
- Zoom-aware marquee selection and fit-to-graph behavior.
- PNG export quality.
- Bad file handling, malformed file errors, and old-file migration UX.
- 500-node / 1000-edge large graph performance coverage.

### 5.4 Failure Artifacts

When Playwright tests fail, the test run keeps useful diagnostics under `test-results/`, including screenshots, trace zips, and per-test failure output.

## 6. Windows Packaging

```powershell
pnpm pack:win
pnpm dist:win
```

- `pnpm pack:win` creates an unpacked Windows app for quick local checks.
- `pnpm dist:win` creates x64 portable and NSIS installer artifacts under `release/`.
- `release/` is not committed to git.
- Current Windows builds are unsigned local builds.

## 7. CI Policy

GitHub Actions CI is intentionally not used at this stage. Validation is run locally with:

```powershell
pnpm test:all
pnpm dist:win
```

## 8. Environment Check

```powershell
node -v
npm -v
pnpm -v
python --version
git --version
```
