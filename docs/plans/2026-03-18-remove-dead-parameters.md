# Remove Dead Parameters Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `confidenceSaturationFrames` and `confidenceDecayRate` — two parameters accepted, stored, validated, and exposed in the demo UI that have zero effect on engine behavior.

**Architecture:** These parameters were part of the original temporal ramp-up design (`confidence = consecutiveHitFrames / saturationFrames`) that was replaced by the weighted factor pipeline + accelerating decay. The actual decay now uses `confidenceDecayBaseRate` (0.03) and `confidenceDecayAcceleration` (0.04). The dead parameters exist in: `EngineOptions` type, `engine.ts` constructor, `validators.ts`, `constants.ts`, `index.ts` re-exports, `presets.ts`, demo store, demo settings panel, demo context, and `CLAUDE.md`.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/core/types.ts:104-105` | Remove from `EngineOptions` |
| Modify | `src/core/engine.ts:72-73,93-94` | Remove instance vars + constructor assignment |
| Modify | `src/core/validators.ts:78-84` | Remove validation blocks |
| Modify | `src/core/constants.ts:17-18` | Remove `CONFIDENCE_SATURATION_FRAMES`, `CONFIDENCE_DECAY_RATE` |
| Modify | `src/core/index.ts:69-70` | Remove constant re-exports |
| Modify | `src/core/presets.ts:19` | Remove `confidenceSaturationFrames: 6` from `denseGrid` |
| Modify | `full-demo/lib/demoStore.ts` | Remove from `DemoSettings`, defaults, URL read/write |
| Modify | `full-demo/components/SettingsPanel.tsx:84,245-246` | Remove sliders + preset logic |
| Modify | `full-demo/context/TrajectoryContext.tsx:21-22,43-44` | Remove from engine options + key |
| Modify | `README.md` | Remove from tuning constants table |
| Modify | `CLAUDE.md` | Update dead parameters section |

---

## Chunk 1: Core Library Cleanup

### Task 1: Remove from `EngineOptions` type

**Files:**
- Modify: `src/core/types.ts:104-105`

- [ ] **Step 1: Remove dead fields from EngineOptions**

Delete these two lines from `EngineOptions`:

```typescript
// DELETE these lines:
  confidenceSaturationFrames?: number
  confidenceDecayRate?: number
```

The type should go from `predictionWindow` → `defaultTolerance` → `confidenceThreshold` (skipping the two dead ones).

- [ ] **Step 2: Run typecheck to identify all downstream breakage**

Run: `pnpm typecheck 2>&1 | head -50`
Expected: Type errors in engine.ts, validators.ts, presets.ts, and full-demo files

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "refactor: remove dead confidenceSaturationFrames and confidenceDecayRate from EngineOptions type"
```

---

### Task 2: Remove from engine constructor

**Files:**
- Modify: `src/core/engine.ts:72-73,93-94`

- [ ] **Step 1: Remove instance variable declarations**

Delete these two lines from the class field declarations (~lines 72-73):

```typescript
// DELETE:
  private readonly confidenceSaturationFrames: number
  private readonly confidenceDecayRate: number
```

- [ ] **Step 2: Remove constructor assignments**

Delete these two lines from the constructor (~lines 93-94):

```typescript
// DELETE:
    this.confidenceSaturationFrames = options?.confidenceSaturationFrames ?? CONFIDENCE_SATURATION_FRAMES
    this.confidenceDecayRate = options?.confidenceDecayRate ?? CONFIDENCE_DECAY_RATE
```

- [ ] **Step 3: Remove unused constant imports**

Remove `CONFIDENCE_SATURATION_FRAMES` and `CONFIDENCE_DECAY_RATE` from the constants import at the top of engine.ts (if they are no longer used anywhere in the file).

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -30`
Expected: Fewer errors (engine.ts should be clean now)

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.ts
git commit -m "refactor: remove dead parameter storage from TrajectoryEngine constructor"
```

---

### Task 3: Remove validation and constants

**Files:**
- Modify: `src/core/validators.ts:78-84`
- Modify: `src/core/constants.ts:17-18`
- Modify: `src/core/index.ts:69-70`

- [ ] **Step 1: Remove validation blocks from validators.ts**

Delete these blocks (~lines 78-84):

```typescript
// DELETE:
  if (options.confidenceSaturationFrames !== undefined) {
    validateRange(options.confidenceSaturationFrames, 'confidenceSaturationFrames', 1, 60)
  }

  if (options.confidenceDecayRate !== undefined) {
    validateRange(options.confidenceDecayRate, 'confidenceDecayRate', 0, 5)
  }
```

- [ ] **Step 2: Remove constant definitions from constants.ts**

Delete these lines (~lines 17-18):

```typescript
// DELETE:
export const CONFIDENCE_SATURATION_FRAMES = 10
export const CONFIDENCE_DECAY_RATE = 0.3
```

- [ ] **Step 3: Remove constant re-exports from index.ts**

Delete these lines from `src/core/index.ts` (~lines 69-70):

```typescript
// DELETE:
  CONFIDENCE_SATURATION_FRAMES,
  CONFIDENCE_DECAY_RATE,
```

- [ ] **Step 4: Remove from presets.ts**

Delete `confidenceSaturationFrames: 6` from the `denseGrid` preset in `src/core/presets.ts` (~line 19).

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All library tests pass. Demo files may still have type errors (fixed in Task 4).

- [ ] **Step 6: Commit**

```bash
git add src/core/validators.ts src/core/constants.ts src/core/index.ts src/core/presets.ts
git commit -m "refactor: remove dead parameter constants, validation, and exports"
```

---

## Chunk 2: Demo Cleanup

### Task 4: Remove from demo store and settings UI

**Files:**
- Modify: `full-demo/lib/demoStore.ts`
- Modify: `full-demo/components/SettingsPanel.tsx`
- Modify: `full-demo/context/TrajectoryContext.tsx`

- [ ] **Step 1: Remove from DemoSettings type and defaults in demoStore.ts**

In `full-demo/lib/demoStore.ts`:

Remove `confidenceSaturationFrames` and `confidenceDecayRate` from:
1. The `DemoSettings` type (lines 26-27)
2. The `readSettingsFromURL` function — delete lines with `csf` and `cdr` params (lines 64-65)
3. The `writeSettingsToURL` function — delete lines writing `csf` and `cdr` (lines 101-102)
4. The default settings object (lines 143-144)

- [ ] **Step 2: Remove sliders from SettingsPanel.tsx**

Delete these two `<EngineSlider>` lines (lines 245-246):

```tsx
// DELETE:
<EngineSlider label="Confidence Frames" value={settings.confidenceSaturationFrames} min={1} max={30} step={1} field="confidenceSaturationFrames" />
<EngineSlider label="Confidence Decay" value={settings.confidenceDecayRate} min={0} max={2} step={0.1} field="confidenceDecayRate" />
```

Also remove the preset application logic for `confidenceSaturationFrames` on line 84.

- [ ] **Step 3: Remove from TrajectoryContext.tsx**

In `full-demo/context/TrajectoryContext.tsx`:

Remove `confidenceSaturationFrames` and `confidenceDecayRate` from:
1. The `useAnticipated()` options object (lines 21-22)
2. The `engineKey` array (lines 43-44)

- [ ] **Step 4: Run typecheck + tests + verify demo builds**

Run: `pnpm typecheck && pnpm test && pnpm build:demo`
Expected: All clean — zero references to dead parameters remain.

- [ ] **Step 5: Commit**

```bash
git add full-demo/
git commit -m "refactor: remove dead parameter sliders and URL persistence from demo"
```

---

## Chunk 3: Documentation Update

### Task 5: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove from README tuning constants table**

Remove the `CONFIDENCE_SATURATION_FRAMES` and `CONFIDENCE_DECAY_RATE` rows from the "Tuning Constants" table in README.md.

Also update the "Confidence Scoring" section — the description `confidence = min(1, consecutiveHitFrames / 10)` is inaccurate. Replace with a brief description of the factor pipeline:

```markdown
### Confidence Scoring

Confidence is computed per element per frame via a weighted factor pipeline:
- **Trajectory alignment** — does the cursor ray intersect the element?
- **Distance** — exponential decay by cursor-to-element distance
- **Deceleration** — sigmoid detecting cursor slowdown near target
- **Erratic penalty** — circular variance penalizing jittery movement

Each factor produces a 0–1 score, aggregated multiplicatively. Temporal smoothing via accelerating decay prevents oscillation at element boundaries.
```

- [ ] **Step 2: Update CLAUDE.md dead parameters section**

Replace the "Dead parameters" section under "Confidence System" with:

```markdown
### Removed dead parameters (v0.1.0)

`confidenceDecayRate` and `confidenceSaturationFrames` were removed. They were part of the original temporal ramp-up design (`confidence = consecutiveHitFrames / saturationFrames`) that was replaced by the factor pipeline. The demo settings panel no longer exposes them.
```

- [ ] **Step 3: Run final validation**

Run: `pnpm typecheck && pnpm test`
Expected: All clean.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update confidence scoring docs, remove dead parameter references"
```
