# Publication Readiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the library for its first npm publication as v0.1.0. Add missing LICENSE file, create CHANGELOG, verify tarball contents, and bump version.

**Architecture:** No code changes. Metadata and documentation only.

**Tech Stack:** npm, git

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `LICENSE` | MIT license text |
| Create | `CHANGELOG.md` | Release notes for v0.1.0 |
| Modify | `package.json` | Version bump 0.0.1 → 0.1.0 |

---

## Chunk 1: Publication Metadata

### Task 1: Add LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Create MIT LICENSE file**

Create `LICENSE` in the repo root with the following content (year + author from package.json):

```
MIT License

Copyright (c) 2025 antonjoel82

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Verify it's included in the package**

The `"files"` array in `package.json` already includes `"LICENSE"`. Verify:

Run: `cat package.json | grep -A3 '"files"'`
Expected: `"files": ["dist", "README.md", "LICENSE"]`

- [ ] **Step 3: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT LICENSE file"
```

---

### Task 2: Create CHANGELOG

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create CHANGELOG.md**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-18

### Added
- `TrajectoryEngine` — framework-agnostic cursor trajectory prediction
- `useAnticipated` React hook with `useSyncExternalStore`
- `TrajectoryProvider` and `useSharedAnticipated` for shared context
- 4-factor confidence pipeline: trajectory alignment, distance decay, deceleration detection, erratic penalty
- 4 trigger profiles: `once`, `on_enter`, `every_frame`, `cooldown`
- Accelerating decay temporal smoothing
- Multi-zone directional tolerance system
- `AnticipatedProfiler` devtools with precision/recall/F1 metrics
- `AnticipatedDevtools` React component
- 4 presets: `hoverOnly`, `denseGrid`, `dashboard`, `navigation`
- Full-demo app with 3 pages, settings panel, debug overlay
- 276 tests across 26 files

### Fixed
- Removed dead parameters `confidenceSaturationFrames` and `confidenceDecayRate` (no-ops since factor pipeline replaced temporal ramp-up)
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "chore: add CHANGELOG.md for v0.1.0"
```

---

### Task 3: Bump version and verify tarball

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump version to 0.1.0**

In `package.json`, change:
```json
"version": "0.0.1"
```
to:
```json
"version": "0.1.0"
```

- [ ] **Step 2: Build the library**

Run: `pnpm build`
Expected: Clean build, dist/ populated with all 5 entry points.

- [ ] **Step 3: Verify tarball contents**

Run: `npm pack --dry-run 2>&1`
Expected output should show:
- `dist/` with all .js, .mjs, .d.ts, .map files
- `README.md`
- `LICENSE`
- `package.json`
- No `full-demo/`, `example/`, `src/`, `node_modules/`, or test files

- [ ] **Step 4: Run full validation**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: All clean.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.1.0 for initial publication"
```

- [ ] **Step 6 (manual): Publish**

When ready:
```bash
pnpm publish
```

This will trigger `prepublishOnly` → `pnpm build` automatically, then publish to npm.
