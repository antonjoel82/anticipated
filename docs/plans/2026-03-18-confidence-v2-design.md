# Confidence V2: Physics-Based Scoring, Cancellation, Feature Flags & Presets

**Date:** 2026-03-18
**Status:** Approved (revised after Oracle + Librarian review)
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
 *
 * INVARIANT: All raw and weight values are clamped to [0, 1] and
 * guarded against NaN/Infinity before use. Factor functions that
 * encounter degenerate input (dt=0, empty buffer, etc.) MUST return
 * a safe neutral value rather than NaN.
 */
function computeConfidence(factors: WeightedFactor[], ctx: FactorContext): number {
  let confidence = 1.0
  for (const { compute, weight } of factors) {
    const rawUnclamped = compute(ctx)
    const raw = Number.isFinite(rawUnclamped) ? Math.max(0, Math.min(1, rawUnclamped)) : 0
    const w = Math.max(0, Math.min(1, weight))
    if (raw === 0 && w === 1) return 0  // hard gate short-circuit
    confidence *= 1 - w * (1 - raw)
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

### Practical Confidence Ranges & Threshold Calibration

**Problem identified in review:** With all four factors at their default weights (1.0), the multiplicative chain produces lower confidence than might be expected. A "good" approach scenario (ray hit at distance=1S, moderate deceleration, gentle curve) yields:

```
0.85 × 0.45 × 0.88 × 0.74 ≈ 0.25
```

This means the `confidenceThreshold` for triggering must be set **lower than the old v1 default of 0.5**. The new defaults reflect this:

- `confidenceThreshold`: **0.3** (was 0.5 in v1)
- `cancelThreshold`: **0.15** (maintains ~0.15 dead zone)

These thresholds mean: "confidence 0.3 with the physics pipeline is roughly equivalent in certainty to confidence 0.5 with the old frame-counter."

Alternatively, factor weights can be reduced below 1.0 to soften the multiplicative penalty. With default weights at 0.7 for distance, deceleration, and erratic:

```
0.85 × (1 - 0.7×(1-0.45)) × (1 - 0.7×(1-0.88)) × (1 - 0.7×(1-0.74))
= 0.85 × 0.615 × 0.916 × 0.818 ≈ 0.39
```

This brings the same scenario closer to 0.4, making a 0.3 threshold comfortably reachable during approach. **The exact threshold + weight calibration will require real-world testing with the demo app.**

---

## 3. Factor Specifications

### 3.1 Trajectory Alignment

**Purpose:** Does the predicted trajectory ray intersect this element?

**Formula:**
- Cursor inside element → `1.0`
- Ray hits expanded AABB (tolerance zones) → `rayHitConfidence` (default `0.85`)
- Ray misses → `0.0`

**Config:** `rayHitConfidence: number` (default 0.85)
**Feature flag:** `rayCasting` — when false, the alignment factor is **removed from the pipeline** (weight set to 0, making it neutral). This allows the remaining factors (distance, deceleration, erratic) to drive confidence on their own.

**Rationale:** A trajectory prediction is strong evidence but less certain than the cursor physically being on the element. The 0.85 default reflects this. Configurable because different UI densities benefit from different thresholds.

**Implementation notes:**
- Reuses existing `segmentAABB()` slab method.
- Zone system still applies — expanded rects with per-zone factors cap the final confidence as before.
- Weight defaults to `1.0` (acts as a hard gate when ray misses).
- **CRITICAL:** When `features.rayCasting = false`, the alignment factor's weight MUST be set to `0` (neutral pass-through), NOT kept at 1.0. Otherwise, confidence is hard-gated to 0 for any cursor outside the element, defeating the purpose of hover/proximity-only presets like `hoverOnly`.

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

**Research basis:** Gaussian endpoint distribution models are well-established in pointing research — Huang et al. (UIST 2019) achieved R²=0.94 fit to empirical endpoint distributions using a 2D Ternary-Gaussian model. Note: Fitts's Law (`ID = log₂(D/W + 1)`) models *movement time*, not *endpoint probability* — it answers a different question. Our Gaussian decay is a confidence decay function inspired by the Gaussian endpoint distribution, not a direct adaptation of Fitts's Law.

### 3.3 Deceleration Factor (pass-through detection)

**Purpose:** Distinguish "slowing toward a target" from "scanning past at constant speed."

**Formula:**
```
// Guard against dt=0 (same-timestamp events on high-refresh displays)
if (dt <= 0 || !isFinite(dt)) return 0.5  // neutral — unknown acceleration

// Use EWMA-smoothed speed difference to reduce noise amplification
// (raw acceleration = derivative of velocity, which amplifies noise per Meyer et al. 2023)
acceleration = (currentSmoothedSpeed - previousSmoothedSpeed) / dt
if (!isFinite(acceleration)) return 0.5  // neutral

decelerationFactor = 1 / (1 + exp(acceleration × k_decel))
```

**Config:** `decelerationSensitivity: number` (default 0.02, aliased as `k_decel`)
**Feature flag:** `passThroughDetection`

**Behavior (at k_decel=0.02):**

| Movement | Acceleration (px/s²) | Factor |
|---|---|---|
| Strong deceleration (approach) | -200 | ~0.98 |
| Moderate deceleration | -100 | ~0.88 |
| Constant speed (scanning) | 0 | 0.50 |
| Moderate acceleration (leaving) | +100 | ~0.12 |
| Strong acceleration | +200 | ~0.02 |

**Calibration note:** `k_decel` was derived by solving `1/(1+exp(a×k)) = 0.88` at `a = -100 px/s²` (moderate deceleration), yielding `k ≈ 0.02`. Adjustable per application — higher values make the factor more sensitive to small acceleration changes.

**dt=0 safety:** On high-refresh displays (240Hz+) or during event bursts, consecutive pointermove events can share timestamps. Division by zero produces NaN/Infinity which propagates through the entire pipeline. The guard returns a neutral 0.5 (unknown acceleration = no opinion).

**Noise mitigation:** Raw acceleration amplifies position sensor noise (Meyer et al. 2023: "taking the derivative of a time series amplifies its noise"). The implementation MUST use the EWMA-smoothed speed values (already computed by the prediction module), not raw per-frame speed deltas.

**Rationale:** The sigmoid function maps continuous acceleration to (0,1) without arbitrary thresholds. This is the core "pass-through killer" — scanning a table at constant velocity keeps this at 0.5, while slowing toward a button pushes it to ~0.88.

**Research basis:** Bell-shaped velocity profile from the optimal feedback control model (Fischer et al. 2022). Production systems like hoverIntent use a simpler speed threshold (7px/100ms ≈ 70px/s), which our sigmoid generalizes into a continuous function. Amazon's triangle method uses trajectory geometry instead — a fundamentally different approach suited to mega-menus but not general-purpose prediction.

### 3.4 Erratic Penalty (movement entropy)

**Purpose:** Penalize jittery, random cursor movement.

**Formula:**
```
// Length-weighted circular variance using mean resultant length.
// Weighting by segment length prevents tiny jitter segments from
// dominating the score when the cursor moves slowly.
For each consecutive pair in buffer:
  dx = point[i].x - point[i-1].x
  dy = point[i].y - point[i-1].y
  segmentLength = sqrt(dx² + dy²)
  if (segmentLength < 1.0) skip    // drop sub-pixel noise
  angle = atan2(dy, dx)
  sumSin += segmentLength × sin(angle)
  sumCos += segmentLength × cos(angle)
  totalWeight += segmentLength

// Weighted mean resultant length
R̄ = √(sumCos² + sumSin²) / totalWeight
circularVariance = 1 - R̄           // 0 = perfectly straight, 1 = perfectly random

erraticPenalty = exp(-circularVariance × k_entropy)
```

**Config:** `erraticSensitivity: number` (default 1.5, aliased as `k_entropy`)
**Feature flag:** `erraticDetection`
**Minimum buffer requirement:** 6 samples. Returns 1.0 (no penalty) with fewer.

**Recommended `bufferSize`:** 16 or higher (default 8 may be insufficient — see note below).

**Reference values at k=1.5:**

| Movement | Circular Variance | R̄ | Penalty |
|---|---|---|---|
| Straight line | ~0.0 | ~1.0 | ~1.00 |
| Gentle curve | ~0.2 | ~0.8 | ~0.74 |
| Clean 90° turn | ~0.29 | ~0.71 | ~0.65 |
| Zigzag | ~0.5 | ~0.5 | ~0.47 |
| Random circles | ~0.8+ | <0.2 | ~0.30 |

**Calibration note:** `k_entropy` was reduced from the original 2.0 to 1.5 after review showed that a clean intentional 90° turn produced a penalty of 0.557 at k=2.0 — too harsh for legitimate directional changes. At k=1.5, a 90° turn yields ~0.65, which is still a noticeable penalty but not crippling when multiplied with other factors.

**Buffer size note:** At 60fps, 8 samples = 133ms of history. The standard error of R̄ at N=8 is approximately `1/√8 ≈ 0.35`, meaning R̄ = 0.7 and R̄ = 0.4 are statistically indistinguishable. For reliable discrimination, the buffer should hold ≥16 samples (~267ms at 60fps). The engine's `bufferSize` option should be increased in presets that enable erratic detection, or a separate `erraticBufferSize` option should be added.

**Segment length weighting:** Without weighting, tiny jitter segments (1-3 px at slow speeds, caused by pixel quantization) contribute equally to deliberate motion segments. This biases R̄ downward (more "erratic") during slow movement, even when the overall path is stable. Weighting by segment length ensures that deliberate, longer movements dominate the variance calculation.

**Rationale:** Uses **circular variance** (not linear variance of angles) because direction angles wrap at ±π. The mean resultant length `R̄` is the standard statistical measure for directional data (Cremers & Klugkist, Frontiers in Psychology 2018) — when all directions align, `R̄ = 1`; when uniformly distributed, `R̄ → 0`.

**Research basis:** Adapted from Jevremovic et al. (2021) entropy-based mouse tracking correction and the EMOT model (Calcagni et al. 2017). The mouse tracking literature also uses curvature (AUC/MAD) and sample entropy (Dale et al. 2007) as alternatives — these could be added as future pipeline factors if R̄ proves insufficient.

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
confidenceThreshold = 0.3   // must exceed this to trigger
cancelThreshold = 0.15      // must DROP below this to cancel
```

The 0.15 dead zone between them means confidence can fluctuate within [0.15, 0.3] without triggering or canceling. Both thresholds are configurable.

**Dead zone sizing:** The dead zone should be ≥ 2× the peak-to-peak noise amplitude of the confidence signal (standard Schmitt trigger design principle). The exact width will be validated during integration testing with the demo app. If oscillation occurs, widen the gap; if response feels sluggish, narrow it.

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

  /** Sigmoid sensitivity for deceleration factor. Default 0.02. */
  decelerationSensitivity?: number

  /** Exponential sensitivity for erratic penalty. Default 1.5. */
  erraticSensitivity?: number

  /** Confidence below which active triggers are canceled (hysteresis). Default 0.15. */
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
| Huang et al. UIST 2019 | lcs.ios.ac.cn | 2D Ternary-Gaussian endpoint model (R²=0.94) |
| Cremers & Klugkist, Front. Psychol. 2018 | PMC6218623 | Circular statistics, R̄ definition |
| Meyer et al. Behav. Res. Methods 2023 | PMC11289036 | Noise amplification from derivatives, mouse tracking metrics |
| Dale et al. 2007 | — | Sample entropy for movement classification |
| Calcagni et al. Behav. Res. Methods 2017 | — | EMOT: entropic approach to mouse tracking |

---

## 10. Review Addendum (2026-03-18)

**Reviewed by:** Oracle (mathematical soundness) + Librarian (UX research validation)

### Blocking issues found and resolved

1. **`rayCasting=false` hard-gated confidence to 0** — When ray casting was disabled, the alignment factor returned 0 for any cursor outside the element, making all other factors useless. **Fix:** When `rayCasting=false`, alignment factor weight is set to 0 (neutral pass-through).

2. **`dt=0` → NaN propagation** — High-refresh displays can produce same-timestamp events. Division by zero in deceleration factor produced NaN that poisoned the entire pipeline. **Fix:** Guard clause returns neutral 0.5 for `dt ≤ 0`.

### Important issues found and resolved

3. **`k_decel` miscalibrated** — Was 0.01, claimed "~0.9 for deceleration" but math showed only 0.73 at moderate decel (-100 px/s²). **Fix:** Changed to 0.02, which yields 0.88 at -100 px/s².

4. **Multiplicative chain too low for old thresholds** — A good approach scenario yielded ~0.19, far below the 0.6 fire threshold. **Fix:** Lowered `confidenceThreshold` to 0.3, `cancelThreshold` to 0.15.

5. **Erratic penalty too harsh on intentional turns** — A clean 90° turn produced penalty=0.557. Buffer of 8 too small (std error ~0.35). **Fix:** Reduced `k_entropy` from 2.0 to 1.5, increased minimum buffer to 6 samples, added segment-length weighting, recommended bufferSize ≥ 16.

6. **Input validation missing** — Weight > 1 or raw > 1 could produce negative or >1 effective values. NaN from any factor propagated through pipeline. **Fix:** Clamping + `isFinite` guards in `computeConfidence`.

### Minor issues noted (not yet resolved)

7. Circular variance is mathematically correct but not the dominant metric in mouse tracking literature — curvature (AUC/MAD) and sample entropy are more commonly used. R̄ is adequate for v1.

8. Hysteresis dead zone (0.15) should be validated against actual signal noise floor during integration testing.
