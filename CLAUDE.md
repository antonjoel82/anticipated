# Anticipated

Cursor trajectory prediction library for predictive UI. Predicts where a user's cursor is heading and triggers actions (prefetch, preload, visual effects) before the cursor arrives.

## Architecture

- `src/core/` — Framework-agnostic engine (`TrajectoryEngine`), factor pipeline, intersection math
- `src/react/` — `useAnticipated` hook wrapping the engine
- `src/devtools/` — `AnticipatedProfiler`, `DevEventEmitter`, React devtools component
- `full-demo/` — Production-quality demo app (React Router, 3 pages, settings panel, debug overlay)
- `example/` — Minimal single-page demo

Package exports: `anticipated/core`, `anticipated/react`, `anticipated/devtools`, `anticipated/devtools/react`.

## Confidence System

Confidence (0–1) is computed per element per frame via a weighted factor pipeline:

1. **Trajectory alignment** — binary ray-AABB hit (0 or 0.85)
2. **Distance** — exponential decay by cursor-to-element distance
3. **Deceleration** — sigmoid detecting cursor slowdown near target
4. **Erratic penalty** — circular variance penalizing jittery movement

After the pipeline, **accelerating decay** smooths the temporal behavior:
- Ramp-up is instant (raw pipeline output used directly)
- Decay is gradual: `rate = baseRate × (1 + consecutiveDecayFrames × acceleration)`
- Prevents `on_enter` profile oscillation when cursor hovers near element boundaries
- Floor: confidence < 0.01 snaps to 0
- Decay state is private to `RegisteredElement`, not on the exported `ElementState` type

### Removed dead parameters (v0.1.0)

`confidenceDecayRate` and `confidenceSaturationFrames` were removed. They were part of the original temporal ramp-up design (`confidence = consecutiveHitFrames / saturationFrames`) that was replaced by the factor pipeline. The demo settings panel no longer exposes them.

## Demo App (full-demo/)

### Pages
- **Dashboard** (`/`) — Stat cards with multi-zone tolerance, Visual Effects Showcase (4 cards with `every_frame` profile showing different snapshot-driven effects), Trigger Profiles Demo (all 4 profiles with fire counters)
- **Orders** (`/orders`) — Table with row-level preloading and detail side panel
- **Onboarding** (`/onboarding`) — Multi-step wizard with next/back preloading

### Key components
- `MetricsBar` — Persistent top bar showing preloads, estimated time saved, active preset
- `SettingsPanel` — Presets dropdown, 8 engine tuning sliders, 4 factor weight sliders, 4 feature flag toggles
- `DebugOverlay` — Canvas visualization of rays, tolerance zones, predicted points (ON by default)
- `TrajectoryContext` — Shared `useAnticipated` instance, passes all settings including features/factorWeights

### Settings persistence
All settings persist to URL query params. Shareable URLs with tuned configurations.

### DevTools integration
`AnticipatedDevtools` is integrated in the full-demo via `TrajectoryContext`. The `useAnticipated` hook exposes the engine instance, allowing profiler creation: `new AnticipatedProfiler(engine)`. The devtools panel is rendered via `DevtoolsWrapper` in `App.tsx`.

## Build & Test

```sh
pnpm test          # vitest — 273 tests across 26 files
pnpm typecheck     # tsc --noEmit
pnpm build:demo    # vite build → demo-dist/ (GitHub Pages)
pnpm full-demo     # vite dev server for full demo
pnpm example       # vite dev server for simple demo
```
