# Flowmaptool Release Checklist

## Pre-Release

- Confirm the working tree is clean or contains only intentional release changes.
- Review `README.md` and `development-and-test-strategy.md` for scope or command drift.
- Confirm Node.js and pnpm versions match the documented prerequisites.

## Version Bump

- Decide the release version before building artifacts.
- Update `package.json` `version`.
- Run `pnpm install --lockfile-only` if the package manager updates `pnpm-lock.yaml` metadata for the version change.
- Keep the version bump in the release commit with any release-note or checklist updates.
- Use the same version in the git tag, artifact names, and release notes.

## Validation

Run the full local gate before building release artifacts:

```powershell
pnpm test:all
```

If `pnpm test:all` fails because of a transient Electron or Playwright worker crash, rerun the failing spec once and record the rerun result in the release notes. Do not ship with a reproducible test failure.

## Windows Artifacts

Build the Windows portable app and NSIS installer:

```powershell
pnpm dist:win
```

Expected output under `release/`:

- `Flowmaptool-<version>-x64-portable.exe`
- `Flowmaptool-<version>-x64-installer.exe`

Current builds are unsigned local builds. Release notes and any download page must state that Windows may show an unsigned-app warning until code signing is added.

## Artifact Smoke Test

Smoke test the portable artifact at minimum:

- Launch `release/Flowmaptool-<version>-x64-portable.exe`.
- Confirm the app opens without console or startup errors.
- Create a new document.
- Add a child node and edit its label.
- Apply a tag and confirm the node appears in the Outline and Task Table.
- Toggle Task Table columns and confirm the Task column remains visible.
- Save a `.qflow` file.
- Reopen the saved file.
- Export PNG and confirm the image is non-blank.
- Export PDF or print preview if the release includes print/export changes.

Smoke test the installer when sharing installer artifacts:

- Run `release/Flowmaptool-<version>-x64-installer.exe`.
- Install to a temporary user-writable directory.
- Launch from the installer-created shortcut or install location.
- Repeat the portable smoke test's create/save/reopen checks.
- Uninstall and confirm no release artifact is expected to be committed.

## Release Notes Template

```markdown
# Flowmaptool <version>

## Summary

- <one or two sentences describing the release>

## Changes

- <user-visible feature or fix>
- <user-visible feature or fix>

## Validation

- `pnpm test:all`
- `pnpm dist:win`
- Portable artifact smoke test: passed
- Installer smoke test: passed / not included

## Known Notes

- Windows artifacts are unsigned local builds; Windows may show an unsigned-app warning.
- <known limitation or migration note, if any>
```

## Post-Release

- Commit version, lockfile, checklist, and release note updates.
- Tag the release commit if an external artifact was shared, using the same version as `package.json`.
- Keep generated `release/` artifacts out of git.
