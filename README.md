# Flowmaptool

Windows-only desktop flow editor prototype (Electron + React + TypeScript).

## Prerequisites

- Node.js 24.15.0
- pnpm 9.12.3

## Setup

```powershell
cd C:\Users\yeile\Documents\codex\Mindatom\Flowmaptool
pnpm install
pnpm dev
```

## Test commands

```powershell
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:all
```

## Windows packaging

```powershell
pnpm pack:win
pnpm dist:win
```

- `pnpm pack:win` builds an unpacked Windows app for quick local checks.
- `pnpm dist:win` builds x64 portable and NSIS installer artifacts under `release/`.
- Current Windows artifacts are unsigned local builds.

## Current scope (Issue 0-1 bootstrap)

- Electron app shell starts
- React renderer page
- Shared graph model with unit/integration tests
- Playwright Electron smoke test
