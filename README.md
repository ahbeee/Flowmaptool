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

## Current scope (Issue 0-1 bootstrap)

- Electron app shell starts
- React renderer page
- Shared graph model with unit/integration tests
- Playwright Electron smoke test
