---
name: anticipated-core
description: Framework-agnostic cursor trajectory prediction engine. Use when building predictive UI with TrajectoryEngine — registering elements, configuring trigger profiles, handling snapshots, or integrating anticipated/core into non-React frameworks.
---

# Anticipated Core Engine

Cursor trajectory prediction via EWMA-smoothed velocity extrapolation + segment/AABB intersection. Import from `anticipated/core`.

## Quick Start

```ts
import { TrajectoryEngine } from 'anticipated/core'
import type { ElementConfig, TrajectorySnapshot } from 'anticipated/core'

const engine = new TrajectoryEngine({ predictionWindow: 150 })

engine.register('cta', document.getElementById('cta')!, {
  triggerOn: (snap: TrajectorySnapshot) => ({
    isTriggered: snap.isIntersecting && snap.confidence > 0.5,
  }),
  whenTriggered: () => preloadCheckout(),
  profile: { type: 'on_enter' },
  tolerance: 30,
})

engine.connect()
```

## Core Patterns

### Convenience Config (common case)

```ts
engine.register('nav-settings', el, {
  whenApproaching: () => prefetch('/api/settings'),
  tolerance: 20,
})
```

Expands to: profile `on_enter`, triggers when `isIntersecting && confidence > 0.5`.

### Full Config (custom logic)

```ts
engine.register('menu', el, {
  triggerOn: (snap) => ({
    isTriggered: snap.distancePx < 100 && snap.velocity.magnitude > 200,
    reason: 'velocity',
  }),
  whenTriggered: () => showSubmenu(),
  profile: { type: 'cooldown', intervalMs: 500 },
  tolerance: { top: 40, right: 20, bottom: 10, left: 20 },
})
```

### Trigger Profiles

| Profile | Behavior | Use Case |
|---|---|---|
| `{ type: 'once' }` | First trigger only, never again | Prefetch, analytics |
| `{ type: 'on_enter' }` | Each false→true transition | Hover prep, tooltip |
| `{ type: 'every_frame' }` | Every frame while triggered | Live animation |
| `{ type: 'cooldown', intervalMs }` | At most once per interval | Rate-limited actions |

### Subscribing to Changes

```ts
const unsubGlobal = engine.subscribe(() => {
  const all = engine.getAllSnapshots()
  updateUI(all)
})

const unsubElement = engine.subscribeToElement('cta')((cb) => {
  const snap = engine.getSnapshot('cta')
  updateCTAGlow(snap)
})
```

### Imperative Trigger

```ts
engine.trigger('cta')
engine.trigger('cta', { dangerouslyIgnoreProfile: true })
```

### Lifecycle

```ts
engine.connect()      // start listening to pointermove
engine.disconnect()   // stop listening, keep registrations
engine.destroy()      // full teardown, clear all state
engine.invalidateRects() // force bounding-rect refresh
```

## Confidence Decay

Confidence has temporal memory via accelerating decay. This prevents `on_enter` oscillation when cursors hover near element boundaries.

- **Ramp-up**: instant — raw pipeline output used directly when it exceeds previous confidence
- **Decay**: `rate = confidenceDecayBaseRate × (1 + consecutiveDecayFrames × confidenceDecayAcceleration)`
- **Floor**: confidence < 0.01 snaps to 0
- **State**: `previousConfidence` + `consecutiveDecayFrames` stored per `RegisteredElement` (private, not on exported `ElementState`)

Defaults: `confidenceDecayBaseRate = 0.03`, `confidenceDecayAcceleration = 0.04`. From confidence 0.6, reaches 0 in ~55 frames (~900ms). Oscillation near threshold is smoothed within 2-3 frames.

Configurable via `EngineOptions`:

```ts
new TrajectoryEngine({
  confidenceDecayBaseRate: 0.03,
  confidenceDecayAcceleration: 0.04,
})
```

**Dead parameters**: `confidenceDecayRate` (0.3) and `confidenceSaturationFrames` (10) are stored but never used in `update()`. They were part of an earlier temporal ramp-up design replaced by the factor pipeline.

## Key Types

```ts
type EngineOptions = {
  predictionWindow?: number    // 50–500ms, default 150
  smoothingFactor?: number     // (0, 1], default 0.3
  bufferSize?: number          // 2–30, default 8
  defaultTolerance?: Tolerance // px expansion, default 0
  eventTarget?: EventTarget    // default document
  features?: Partial<FeatureFlags>
  factorWeights?: Partial<FactorWeights>
  confidenceDecayBaseRate?: number   // default 0.03
  confidenceDecayAcceleration?: number // default 0.04
}

type FeatureFlags = {
  rayCasting: boolean          // default true
  distanceScoring: boolean     // default true
  erraticDetection: boolean    // default true
  passThroughDetection: boolean // default true
}

type FactorWeights = {
  trajectoryAlignment: number  // default 1.0
  distance: number             // default 1.0
  deceleration: number         // default 1.0
  erratic: number              // default 1.0
}

type TrajectorySnapshot = {
  isIntersecting: boolean
  distancePx: number
  velocity: Velocity    // { x, y, magnitude, angle }
  confidence: number    // 0–1
  predictedPoint: Point // { x, y }
}

type ToleranceZone = { distance: number | ToleranceRect; factor: number }
type Tolerance = number | ToleranceRect | ToleranceZone[]
```

## Advanced

- [references/math-internals.md](references/math-internals.md) — EWMA, slab intersection, distance math
- [references/api-complete.md](references/api-complete.md) — Full API surface with all exports
