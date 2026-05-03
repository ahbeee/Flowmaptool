# Flowmaptool Release Checklist

## Pre-Release

- Confirm the working tree is clean or contains only intentional release changes.
- Review `README.md` and `開發環境與測試策略.md` for scope or command drift.
- Update `package.json` version when producing a distributed build.
- Confirm Node.js and pnpm versions match the documented prerequisites.

## Validation

```powershell
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

For a full local gate:

```powershell
pnpm test:all
```

## Windows Artifacts

```powershell
pnpm dist:win
```

Expected output:

- x64 portable artifact under `release/`
- x64 NSIS installer under `release/`

Current builds are unsigned. Do not present them as signed production installers until code signing is added.

## Artifact Smoke Test

- Launch the portable build.
- Create a new document.
- Add a child node and edit its label.
- Apply a tag and confirm the node appears in the Outline and Task Table.
- Save a `.qflow` file.
- Reopen the saved file.
- Export PNG and confirm the image is non-blank.
- Export PDF or print preview if the release includes print/export changes.

## Post-Release

- Commit version or documentation updates.
- Tag the release commit if an external artifact was shared.
- Keep generated `release/` artifacts out of git.
