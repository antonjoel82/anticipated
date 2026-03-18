# Confidence V2: Physics-Based Scoring, Cancellation, Feature Flags & Presets

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Replace temporal confidence with physics-based factor pipeline; add cancellation system; add feature flags and engine presets.

---

## 1. Overview

The current confidence model is purely temporal — `consecutiveHitFrames / saturationFrames`. It knows nothing about distance, velocity, or movement quality. This design replaces it entirely with a **multiplicative pipeline of weighted confidence factors**, each computing a 0–1 score from real-time physics. The pipeline is extensible — adding or removing a factor is a one-line change.

Alongside the new confidence model, this design introduces:
- **Cancellation system** — AbortSignal + optional cleanup for speculative actions.
- **Feature flags** — granular toggles for expensive per-frame computations.
- **Engine presets** — built-in configurations for common UI patterns.

### What's deferred

| Feature | Reason | Tracking |
|---|---|---|
| Element gravity (area/weight-based pull) | May be unnecessary; YAGNI | `docs/future-ideas.md` |
| Web Worker offloading | Current perf is fine (<0.5ms/frame for ~15 elements); SAB requires COOP/COEP headers | `docs/future-ideas.md` |
| Angle-to-target gradient factor | Easy to add later via pipeline; binary ray-hit + soft score sufficient for now | `docs/future-ideas.md` |

---

## 2. Confidence Factor Pipeline

### Architecture

Confidence is the product of independent **weighted factors**. Each factor is a pure function `(context) => number` returning 0–1. Weights control how aggressively each factor pulls confidence down.

```ts
/** Context passed to each confidence factor on every frame, per element. */
type FactorContext = {
  /** Current cursor position. */
  cursor: Point
  /** Predicted cursor position (EWMA-extrapolated). */
  predicted: Point
  /** EWMA-smoothed velocity vector. */
  velocity: Velocity
  /** Previous frame's speed (for acceleration calculation). */
  previousSpeed: number
  /** Time delta since last frame, in seconds. */
  dt: number
  /** Target element's bounding rect and metadata. */
  element: { rect: Rect; id: string }
  /** Recent cursor position history. */
  buffer: CircularBuffer<TimestampedPoint>
  /** Resolved engine configuration. */
  config: ResolvedConfig
}

/** A single confidence factor with its influence weight. */
type WeightedFactor = {
  /** Pure function computing this factor's score (0–1). */
  compute: (ctx: FactorContext) => number
  /** How much this factor influences final confidence (0–1). 0 = no effect, 1 = full effect. */
  weight: number
}
```

### Computation

```ts
/**
 * Compute confidence as the product of weighted factors.
 *
 * For each factor: effective = 1 - weight × (1 - raw)
 * This means weight=0 makes the factor invisible (always 1.0),
 * and weight=1 applies the raw score directly.
 *
 * Short-circuits to 0 if any hard-gate factor (weight=1) returns 0.
 */
function computeConfidence(factors: WeightedFactor[], ctx: FactorContext): number {
  let confidence = 1.0
  for (const { compute, weight } of factors) {
    const raw = compute(ctx)
    if (raw === 0 && weight === 1) return 0  // hard gate short-circuit
    confidence *= 1 - weight * (1 - raw)
  }
  return confidence
}
```

### Default Pipeline

Four factors, evaluated per element per frame:

```
confidence = alignment × distance × deceleration × erratic
```

Each factor is independently toggleable via feature flags and tunable via weights.

---

## 3. Factor Specifications

### 3.1 Trajectory Alignment (hard gate)

**Purpose:** Does the predicted trajectory ray intersect this element?

**Formula:**
- Cursor inside element → `1.0`
- Ray hits expanded AABB (tolerance zones) → `rayHitConfidence` (default `0.85`)
- Ray misses → `0.0`

**Config:** `rayHitConfidence: number` (default 0.85)
**Feature flag:** `rayCasting` — when false, only cursor-inside check runs.

**Rationale:** A trajectory prediction is strong evidence but less certain than the cursor physically being on the element. The 0.85 default reflects this. Configurable because different UI densities benefit from different thresholds.

**Implementation notes:**
- Reuses existing `segmentAABB()` slab method.
- Zone system still applies — expanded rects with per-zone factors cap the final confidence as before.
- Weight should default to `1.0` (acts as a hard gate when ray misses).

### 3.2 Distance Factor (Gaussian decay)

**Purpose:** Penalize confidence based on how far the cursor is from the element.

**Formula:**
```
D = point-to-AABB distance (0 when cursor is inside)
S = (elementWidth + elementHeight) / 2
distanceFactor = exp(-(D / S)² × k)
```

**Config:** `distanceDecayRate: number` (default 0.8, aliased as `k`)
**Feature flag:** `distanceScoring`

**Reference values at k=0.8:**

| Distance (× S) | Factor |
|---|---|
| 0 (inside) | 1.00 |
| 0.5S | 0.82 |
| 1.0S | 0.45 |
| 1.5S | 0.17 |
| 2.0S | 0.04 |

**Rationale:** Gaussian decay provides steep near-field response (confidence drops quickly as cursor moves away) with smooth far-field behavior. Using averaged element dimension `S = (w+h)/2` normalizes across different element shapes.

**Research basis:** Adapted from Fitts's Law (`ID = log₂(D/W + 1)`). We chose Gaussian over logarithmic because it provides the steeper near-field response requested, while Fitts's logarithmic form requires empirically calibrated `a,b` constants per input device.

### 3.3 Deceleration Factor (pass-through detection)

**Purpose:** Distinguish "slowing toward a target" from "scanning past at constant speed."

**Formula:**
```
acceleration = (currentSpeed - previousSpeed) / dt
decelerationFactor = 1 / (1 + exp(acceleration × k_decel))
```

**Config:** `decelerationSensitivity: number` (default 0.01, aliased as `k_decel`)
**Feature flag:** `passThroughDetection`

**Behavior:**

| Movement | Acceleration | Factor |
|---|---|---|
| Decelerating toward element | < 0 | ~0.7–0.95 |
| Constant speed (scanning) | ≈ 0 | ~0.5 |
| Accelerating past | > 0 | ~0.05–0.3 |

**Rationale:** The sigmoid function maps continuous acceleration to (0,1) without arbitrary thresholds. This is the core "pass-through killer" — scanning a table at constant velocity keeps this at ~0.5, while slowing toward a button pushes it to ~0.9. Standard in machine learning for exactly this kind of soft binary classification.

**Research basis:** Derived from the hoverIntent model (velocity threshold) and the optimal feedback control model (Fischer et al. 2022) which shows human pointing movements follow a bell-shaped velocity profile with deceleration in the approach phase.

### 3.4 Erratic Penalty (movement entropy)

**Purpose:** Penalize jittery, random cursor movement.

**Formula:**
```
// Circular variance using mean resultant length
For each consecutive pair in buffer:
  angle = atan2(dy, dx)
  sumSin += sin(angle)
  sumCos += cos(angle)

R̄ = √(sumCos² + sumSin²) / N    // mean resultant length
circularVariance = 1 - R̄           // 0 = perfectly straight, 1 = perfectly random

erraticPenalty = exp(-circularVariance × k_entropy)
```

**Config:** `erraticSensitivity: number` (default 2.0, aliased as `k_entropy`)
**Feature flag:** `erraticDetection`
**Minimum buffer requirement:** 3 samples. Returns 1.0 (no penalty) with fewer.

**Reference values at k=2.0:**

| Movement | Circular Variance | Penalty |
|---|---|---|
| Straight line | ~0.0 | ~1.0 |
| Gentle curve | ~0.2 | ~0.67 |
| Zigzag | ~0.5 | ~0.37 |
| Random circles | ~0.8+ | ~0.20 |

**Rationale:** Uses **circular variance** (not linear variance of angles) because direction angles wrap at ±π. The mean resultant length `R̄` is the standard statistical measure for directional data — when all directions align, `R̄ = 1`; when uniformly distributed, `R̄ → 0`.

**Research basis:** Adapted from Jevremovic et al. (2021) entropy-based mouse tracking correction and the EMOT model (Sulpizio 2017). WindMouse human movement model (Ben Land 2021) confirms that intentional movement has low angular variance while random perturbation has high variance.

---

## 4. Cancellation System

### Mechanism

When `whenTriggered` fires, the engine creates an `AbortController` for that trigger instance. The signal is passed to the callback. The callback can optionally return a cleanup function. Both mechanisms fire on cancellation.

```ts
/** Signature for the triggered callback. */
type WhenTriggered = (signal: AbortSignal) => void | (() => void) | Promise<void | (() => void)>
```

### Internal State

```ts
/** Tracks an active speculative action for cancellation. */
type ActiveTrigger = {
  /** AbortController for this trigger instance. */
  controller: AbortController
  /** Optional cleanup function returned by whenTriggered. */
  cleanup?: () => void
}
```

The engine maintains a `Map<string, ActiveTrigger>` of active triggers per element.

### Cancellation Conditions

An active trigger is canceled when ANY of these occur:

1. **Confidence drops below `cancelThreshold`** — The element's confidence was above `confidenceThreshold` (trigger fired), then drops below `cancelThreshold`.
2. **Engine disconnects or destroys** — All active triggers are aborted during teardown.

### Hysteresis (anti-oscillation)

Two separate thresholds prevent rapid fire→cancel→fire→cancel cycles:

```
confidenceThreshold = 0.6   // must exceed this to trigger (existing)
cancelThreshold = 0.4       // must DROP below this to cancel (new)
```

The 0.2 dead zone between them means confidence can fluctuate within [0.4, 0.6] without triggering or canceling. Both thresholds are configurable.

### Consumer API

```ts
// Raw fetch — signal auto-aborts on leave
register('checkout', el, {
  whenTriggered: (signal) => {
    fetch('/api/checkout-bundle', { signal })
  },
})

// React Query — cleanup handles RQ-specific cancel
register('settings', el, {
  whenTriggered: (signal) => {
    queryClient.prefetchQuery({
      queryKey: ['settings'],
      queryFn: ({ signal: rqSignal }) => fetchSettings(rqSignal),
    })
    return () => queryClient.cancelQueries({ queryKey: ['settings'] })
  },
})

// Dynamic import — no cancellation needed
register('page', el, {
  whenTriggered: () => { import('./heavy-page.js') },
})
```

---

## 5. Feature Flags

Granular flags controlling which per-frame computations run:

```ts
/** Feature flags to enable/disable expensive per-frame computations. */
type FeatureFlags = {
  /** Segment→AABB intersection test (trajectory ray). */
  rayCasting: boolean
  /** Gaussian distance factor computation. */
  distanceScoring: boolean
  /** Angular variance computation for jitter detection. */
  erraticDetection: boolean
  /** Acceleration-based pass-through detection. */
  passThroughDetection: boolean
}
```

**Default:** All flags `true`.

When a flag is `false`, its corresponding factor is skipped in the pipeline (effectively returns 1.0). No code path executes for disabled features.

---

## 6. Engine Presets

Presets are plain `Partial<EngineOptions>` objects. Consumers spread and override:

```ts
import { presets } from 'anticipated/core'

const engine = new TrajectoryEngine(presets.hoverOnly)
const engine = new TrajectoryEngine({ ...presets.denseGrid, predictionWindow: 200 })
```

### Built-in Presets

| Preset | Use Case | Key Overrides |
|---|---|---|
| `presets.default` | General purpose | All features on, balanced tuning |
| `presets.hoverOnly` | No ray casting, pure proximity | `rayCasting: false`, `erraticDetection: false`, `passThroughDetection: false`, shorter prediction window (80ms), higher hover velocity threshold |
| `presets.denseGrid` | Tables/grids with many small cells | Lower smoothing factor (0.5, snappier), smaller default tolerance, faster confidence response, higher erratic penalty weight |
| `presets.dashboard` | Cards/widgets with spacing | Larger default tolerance, medium prediction window, distance factor weighted higher |
| `presets.navigation` | Nav bars, sidebar menus | Ray casting on, low tolerance, fast triggers, cooldown profile recommended |

---

## 7. New Config Surface

All additions to `EngineOptions`:

```ts
type EngineOptions = {
  // ... existing options (predictionWindow, smoothingFactor, bufferSize, etc.) ...

  /** Feature flags to enable/disable expensive computations. All default to true. */
  features?: Partial<FeatureFlags>

  /** Custom confidence factor pipeline. Replaces the default four-factor pipeline entirely.  */
  confidenceFactors?: WeightedFactor[]

  /** Default weights for built-in factors (only used when confidenceFactors is not set). */
  factorWeights?: Partial<FactorWeights>

  /** Confidence score for ray-hit outside element (vs 1.0 for cursor-inside). Default 0.85. */
  rayHitConfidence?: number

  /** Gaussian decay rate for distance factor. Higher = steeper dropoff. Default 0.8. */
  distanceDecayRate?: number

  /** Sigmoid sensitivity for deceleration factor. Default 0.01. */
  decelerationSensitivity?: number

  /** Exponential sensitivity for erratic penalty. Default 2.0. */
  erraticSensitivity?: number

  /** Confidence below which active triggers are canceled (hysteresis). Default 0.4. */
  cancelThreshold?: number
}

/** Per-factor weight overrides. */
type FactorWeights = {
  /** Trajectory alignment factor weight. Default 1.0 (hard gate). */
  trajectoryAlignment: number
  /** Distance factor weight. Default 1.0. */
  distance: number
  /** Deceleration factor weight. Default 1.0. */
  deceleration: number
  /** Erratic penalty weight. Default 1.0. */
  erratic: number
}
```

---

## 8. Migration Impact

### Breaking changes

- `confidence` values will differ from v1. Consumers using `confidence > 0.5` thresholds may need re-tuning.
- `whenTriggered` signature changes from `() => void | Promise<void>` to `(signal: AbortSignal) => void | (() => void) | Promise<void | (() => void)>`. Existing callbacks that ignore the `signal` parameter will continue to work without changes.

### Backward compatibility

- The convenience config (`whenApproaching`) still works — it expands to use the new pipeline with default settings.
- Existing `EngineOptions` fields remain unchanged. New fields are all optional with sensible defaults.
- The `isIntersecting` field on `TrajectorySnapshot` remains but its semantics are unchanged (trajectory ray hits OR cursor inside).

---

## 9. Research References

| Topic | Source | Application |
|---|---|---|
| Fitts's Law (Shannon formulation) | MacKenzie 1992, ISO 9241-9 | Distance factor design (Gaussian adaptation) |
| Circular variance | Mardia & Jupp, Directional Statistics | Erratic penalty (mean resultant length) |
| hoverIntent sensitivity model | Brian Cherne, jQuery hoverIntent | Deceleration threshold inspiration |
| Optimal Feedback Control | Fischer et al. 2022, Glasgow | Bell-shaped velocity profile for approach detection |
| Entropy-based tracking | Jevremovic et al. 2021 | Movement classification (intentional vs random) |
| WindMouse model | Ben Land 2021 | Human movement reference distribution |
| Aim assist cone | GDC Vault (Resistance 3) | Future: angle-to-target gradient factor |
| ForesightJS | spaansba/ForesightJS, GitHub | Comparable OSS: linear extrapolation + Liang-Barsky |
| Pasqual & Wobbrock CHI 2014 | UW Faculty | Future: template matching for endpoint prediction |
