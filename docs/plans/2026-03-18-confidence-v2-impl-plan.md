# Confidence V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the temporal frame-counter confidence model with a physics-based multiplicative factor pipeline, add an AbortSignal-based cancellation system, add granular feature flags, and ship built-in engine presets.

**Architecture:** Four independent confidence factors (trajectory alignment, Gaussian distance, sigmoid deceleration, circular-variance erratic penalty) are composed via a weighted multiplicative pipeline in `src/core/factors/`. The engine's `update()` loop calls `computeConfidence()` instead of the old `consecutiveHitFrames` math. A cancellation system tracks active triggers via `Map<string, ActiveTrigger>` and aborts them when confidence drops below a hysteresis threshold. Feature flags gate which factors run. Presets are plain `Partial<EngineOptions>` objects.

**Tech Stack:** TypeScript, Vitest, existing `anticipated/core` module structure.

**Design doc:** `docs/plans/2026-03-18-confidence-v2-design.md` (read this first for full context).

---

## Task 1: Add FactorContext type and computeConfidence function

**Files:**
- Create: `src/core/factors/types.ts`
- Create: `src/core/factors/compute.ts`
- Create: `src/core/factors/index.ts`
- Test: `src/core/factors/compute.test.ts`

**Step 1: Write the failing tests**

```ts
// src/core/factors/compute.test.ts
import { describe, it, expect } from 'vitest'
import { computeConfidence } from './compute.js'
import type { WeightedFactor, FactorContext } from './types.js'

// Minimal stub context — factors in these tests return fixed values
const stubCtx = {} as FactorContext

describe('computeConfidence', () => {
  it('returns 1.0 with no factors', () => {
    expect(computeConfidence([], stubCtx)).toBe(1.0)
  })

  it('returns raw value when weight is 1.0', () => {
    const factors: WeightedFactor[] = [
      { compute: () => 0.7, weight: 1.0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBeCloseTo(0.7)
  })

  it('returns 1.0 when weight is 0 (factor is invisible)', () => {
    const factors: WeightedFactor[] = [
      { compute: () => 0.3, weight: 0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBe(1.0)
  })

  it('multiplies weighted factors together', () => {
    const factors: WeightedFactor[] = [
      { compute: () => 0.8, weight: 1.0 },
      { compute: () => 0.5, weight: 1.0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBeCloseTo(0.4)
  })

  it('softens factor with weight < 1', () => {
    // effective = 1 - 0.5 * (1 - 0.4) = 1 - 0.3 = 0.7
    const factors: WeightedFactor[] = [
      { compute: () => 0.4, weight: 0.5 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBeCloseTo(0.7)
  })

  it('short-circuits to 0 when hard-gate factor returns 0', () => {
    const factors: WeightedFactor[] = [
      { compute: () => 0, weight: 1.0 },
      { compute: () => 0.9, weight: 1.0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBe(0)
  })

  it('clamps NaN raw to 0', () => {
    const factors: WeightedFactor[] = [
      { compute: () => NaN, weight: 0.5 },
    ]
    // NaN clamped to 0 → effective = 1 - 0.5*(1-0) = 0.5
    expect(computeConfidence(factors, stubCtx)).toBeCloseTo(0.5)
  })

  it('clamps raw > 1 to 1', () => {
    const factors: WeightedFactor[] = [
      { compute: () => 1.5, weight: 1.0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBe(1.0)
  })

  it('clamps raw < 0 to 0', () => {
    const factors: WeightedFactor[] = [
      { compute: () => -0.5, weight: 1.0 },
    ]
    expect(computeConfidence(factors, stubCtx)).toBe(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/factors/compute.test.ts`
Expected: FAIL — modules don't exist yet.

**Step 3: Write the types**

```ts
// src/core/factors/types.ts
import type { Point, Velocity, Rect, TimestampedPoint } from '../types.js'
import type { CircularBuffer } from '../buffer.js'

/** Resolved engine configuration values relevant to factor computation. */
export type FactorConfig = {
  /** Confidence score for ray-hit outside element. Default 0.85. */
  rayHitConfidence: number
  /** Gaussian decay rate for distance factor. Default 0.8. */
  distanceDecayRate: number
  /** Sigmoid sensitivity for deceleration factor. Default 0.02. */
  decelerationSensitivity: number
  /** Exponential sensitivity for erratic penalty. Default 1.5. */
  erraticSensitivity: number
}

/** Expanded rect from a tolerance zone, with its confidence cap factor. */
export type ExpandedZoneRect = {
  /** Expanded bounding rect (raw rect + zone tolerance). */
  rect: Rect
  /** Zone confidence cap factor (0–1). */
  factor: number
}

/** Context passed to each confidence factor on every frame, per element. */
export type FactorContext = {
  /** Current cursor position. */
  cursor: Point
  /** Predicted cursor position (EWMA-extrapolated). */
  predicted: Point
  /** EWMA-smoothed velocity vector. */
  velocity: Velocity
  /** Previous frame's smoothed speed (px/s). */
  previousSpeed: number
  /** Time delta since last frame, in seconds. */
  dt: number
  /** Target element's raw bounding rect and id. */
  element: { rect: Rect; id: string }
  /** Expanded rects from tolerance zones (for alignment factor). */
  zones: ReadonlyArray<ExpandedZoneRect>
  /** Recent cursor position history (raw points). */
  buffer: CircularBuffer<TimestampedPoint>
  /** Resolved factor configuration. */
  config: FactorConfig
}

/** A single confidence factor with its influence weight. */
export type WeightedFactor = {
  /** Pure function computing this factor's score. MUST return a finite number in [0, 1]. */
  compute: (ctx: FactorContext) => number
  /** How much this factor influences final confidence (0–1). 0 = no effect, 1 = full effect. */
  weight: number
}
```

**Step 4: Write the compute function**

```ts
// src/core/factors/compute.ts
import type { WeightedFactor, FactorContext } from './types.js'

/**
 * Compute confidence as the product of weighted factors.
 *
 * For each factor: effective = 1 - weight × (1 - raw)
 * weight=0 makes the factor invisible (always 1.0).
 * weight=1 applies the raw score directly.
 *
 * All inputs are clamped to [0, 1] and guarded against NaN/Infinity.
 */
export function computeConfidence(factors: WeightedFactor[], ctx: FactorContext): number {
  let confidence = 1.0
  for (const { compute, weight } of factors) {
    const rawUnclamped = compute(ctx)
    const raw = Number.isFinite(rawUnclamped) ? Math.max(0, Math.min(1, rawUnclamped)) : 0
    const w = Math.max(0, Math.min(1, weight))
    if (raw === 0 && w === 1) return 0
    confidence *= 1 - w * (1 - raw)
  }
  return confidence
}
```

**Step 5: Write the barrel export**

```ts
// src/core/factors/index.ts
export { computeConfidence } from './compute.js'
export type { FactorContext, FactorConfig, WeightedFactor } from './types.js'
```

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest run src/core/factors/compute.test.ts`
Expected: All PASS.

**Step 7: Commit**

```bash
git add src/core/factors/
git commit -m "feat(factors): add FactorContext types and computeConfidence pipeline"
```

---

## Task 2: Implement trajectory alignment factor

**Files:**
- Create: `src/core/factors/alignment.ts`
- Test: `src/core/factors/alignment.test.ts`

**Step 1: Write the failing tests**

```ts
// src/core/factors/alignment.test.ts
import { describe, it, expect } from 'vitest'
import { trajectoryAlignmentFactor } from './alignment.js'
import type { FactorContext } from './types.js'

function makeCtx(overrides: Partial<FactorContext>): FactorContext {
  return {
    cursor: { x: 0, y: 0 },
    predicted: { x: 100, y: 0 },
    velocity: { x: 100, y: 0, magnitude: 100, angle: 0 },
    previousSpeed: 100,
    dt: 0.016,
    element: { rect: { left: 50, top: -25, right: 150, bottom: 25 }, id: 'test' },
    buffer: { length: 0, forEach: () => {}, getLast: () => undefined, getFirst: () => undefined, getFirstLast: () => undefined, add: () => {}, clear: () => {} } as any,
    config: { rayHitConfidence: 0.85, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 },
    ...overrides,
  }
}

describe('trajectoryAlignmentFactor', () => {
  it('returns 1.0 when cursor is inside element', () => {
    const ctx = makeCtx({ cursor: { x: 100, y: 0 } })
    expect(trajectoryAlignmentFactor(ctx)).toBe(1.0)
  })

  it('returns rayHitConfidence when ray hits AABB', () => {
    // cursor at origin, predicted at (100,0), element at [50,-25,150,25] — ray passes through
    const ctx = makeCtx({})
    expect(trajectoryAlignmentFactor(ctx)).toBe(0.85)
  })

  it('returns 0 when ray misses', () => {
    // cursor at origin, predicted straight up — misses element to the right
    const ctx = makeCtx({ predicted: { x: 0, y: -100 } })
    expect(trajectoryAlignmentFactor(ctx)).toBe(0)
  })

  it('uses custom rayHitConfidence', () => {
    const ctx = makeCtx({ config: { rayHitConfidence: 0.7, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 } })
    expect(trajectoryAlignmentFactor(ctx)).toBe(0.7)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/factors/alignment.test.ts`
Expected: FAIL — module doesn't exist.

**Step 3: Implement**

```ts
// src/core/factors/alignment.ts
import type { FactorContext } from './types.js'
import { segmentAABB } from '../intersection.js'

/**
 * Trajectory alignment factor (hard gate).
 *
 * - Cursor inside element → 1.0
 * - Ray hits any expanded zone AABB → rayHitConfidence (default 0.85)
 * - Ray misses all zones → 0.0
 *
 * Tests the ray against each tolerance zone's expanded rect.
 * The zone factor capping is applied post-pipeline by the engine,
 * not by this factor (this factor only checks hit/miss).
 */
export function trajectoryAlignmentFactor(ctx: FactorContext): number {
  const { cursor, predicted, element, zones, config } = ctx
  const r = element.rect

  const inside =
    cursor.x >= r.left && cursor.x <= r.right &&
    cursor.y >= r.top && cursor.y <= r.bottom

  if (inside) return 1.0

  const dx = predicted.x - cursor.x
  const dy = predicted.y - cursor.y

  // Test against each zone's expanded rect
  for (const zone of zones) {
    const zr = zone.rect
    const cursorInZone =
      cursor.x >= zr.left && cursor.x <= zr.right &&
      cursor.y >= zr.top && cursor.y <= zr.bottom

    if (cursorInZone) return config.rayHitConfidence

    if (segmentAABB(cursor.x, cursor.y, dx, dy, zr.left, zr.top, zr.right, zr.bottom)) {
      return config.rayHitConfidence
    }
  }

  return 0
}
```

**Step 4: Add to barrel export**

Add to `src/core/factors/index.ts`:
```ts
export { trajectoryAlignmentFactor } from './alignment.js'
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/factors/alignment.test.ts`
Expected: All PASS.

**Step 6: Commit**

```bash
git add src/core/factors/alignment.ts src/core/factors/alignment.test.ts src/core/factors/index.ts
git commit -m "feat(factors): add trajectory alignment factor with rayHitConfidence"
```

---

## Task 3: Implement distance factor (Gaussian decay)

**Files:**
- Create: `src/core/factors/distance-factor.ts`
- Test: `src/core/factors/distance-factor.test.ts`

**Step 1: Write the failing tests**

```ts
// src/core/factors/distance-factor.test.ts
import { describe, it, expect } from 'vitest'
import { distanceFactor } from './distance-factor.js'
import type { FactorContext } from './types.js'

function makeCtx(cursorX: number, cursorY: number, rect = { left: 50, top: 0, right: 150, bottom: 100 }): FactorContext {
  return {
    cursor: { x: cursorX, y: cursorY },
    predicted: { x: 100, y: 50 },
    velocity: { x: 0, y: 0, magnitude: 0, angle: 0 },
    previousSpeed: 0,
    dt: 0.016,
    element: { rect, id: 'test' },
    buffer: { length: 0, forEach: () => {}, getLast: () => undefined, getFirst: () => undefined, getFirstLast: () => undefined, add: () => {}, clear: () => {} } as any,
    config: { rayHitConfidence: 0.85, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 },
  }
}

describe('distanceFactor', () => {
  it('returns 1.0 when cursor is inside element', () => {
    expect(distanceFactor(makeCtx(100, 50))).toBe(1.0)
  })

  it('returns 1.0 when cursor is on element edge', () => {
    expect(distanceFactor(makeCtx(50, 50))).toBe(1.0)
  })

  it('decays with distance from element', () => {
    // Element is 100×100, S = (100+100)/2 = 100
    // Cursor at x=0, y=50 → distance to left edge = 50px = 0.5S
    // exp(-(0.5)² × 0.8) = exp(-0.2) ≈ 0.819
    const factor = distanceFactor(makeCtx(0, 50))
    expect(factor).toBeCloseTo(0.819, 2)
  })

  it('approaches 0 at large distances', () => {
    // Cursor at x=-150, y=50 → distance = 200px = 2S
    // exp(-(2)² × 0.8) = exp(-3.2) ≈ 0.041
    const factor = distanceFactor(makeCtx(-150, 50))
    expect(factor).toBeCloseTo(0.041, 2)
  })

  it('handles zero-size elements without NaN', () => {
    // 0×0 element → S = 0 → would divide by zero
    const ctx = makeCtx(10, 10, { left: 0, top: 0, right: 0, bottom: 0 })
    const factor = distanceFactor(ctx)
    expect(Number.isFinite(factor)).toBe(true)
    expect(factor).toBeGreaterThanOrEqual(0)
    expect(factor).toBeLessThanOrEqual(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/factors/distance-factor.test.ts`
Expected: FAIL.

**Step 3: Implement**

```ts
// src/core/factors/distance-factor.ts
import type { FactorContext } from './types.js'
import { distanceToAABB } from '../distance.js'

/**
 * Gaussian distance decay factor.
 *
 * Formula: exp(-(D/S)² × k)
 * D = point-to-AABB distance (0 when inside)
 * S = (width + height) / 2 (average element dimension)
 * k = distanceDecayRate (default 0.8)
 */
export function distanceFactor(ctx: FactorContext): number {
  const r = ctx.element.rect
  const D = distanceToAABB(ctx.cursor.x, ctx.cursor.y, r)
  if (D === 0) return 1.0

  const w = r.right - r.left
  const h = r.bottom - r.top
  const S = (w + h) / 2

  // Guard against zero-size elements
  if (S <= 0) return 0

  const ratio = D / S
  return Math.exp(-ratio * ratio * ctx.config.distanceDecayRate)
}
```

**Step 4: Add to barrel export and run tests**

Run: `pnpm vitest run src/core/factors/distance-factor.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/core/factors/distance-factor.ts src/core/factors/distance-factor.test.ts src/core/factors/index.ts
git commit -m "feat(factors): add Gaussian distance decay factor"
```

---

## Task 4: Implement deceleration factor (sigmoid)

**Files:**
- Create: `src/core/factors/deceleration.ts`
- Test: `src/core/factors/deceleration.test.ts`

**Step 1: Write the failing tests**

```ts
// src/core/factors/deceleration.test.ts
import { describe, it, expect } from 'vitest'
import { decelerationFactor } from './deceleration.js'
import type { FactorContext } from './types.js'

function makeCtx(currentSpeed: number, previousSpeed: number, dt: number): FactorContext {
  return {
    cursor: { x: 0, y: 0 },
    predicted: { x: 0, y: 0 },
    velocity: { x: 0, y: 0, magnitude: currentSpeed, angle: 0 },
    previousSpeed,
    dt,
    element: { rect: { left: 0, top: 0, right: 100, bottom: 100 }, id: 'test' },
    buffer: { length: 0, forEach: () => {}, getLast: () => undefined, getFirst: () => undefined, getFirstLast: () => undefined, add: () => {}, clear: () => {} } as any,
    config: { rayHitConfidence: 0.85, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 },
  }
}

describe('decelerationFactor', () => {
  it('returns 0.5 at constant speed (zero acceleration)', () => {
    expect(decelerationFactor(makeCtx(100, 100, 0.016))).toBeCloseTo(0.5)
  })

  it('returns > 0.5 when decelerating', () => {
    // accel = (50 - 200) / 0.016 = -9375 px/s²
    expect(decelerationFactor(makeCtx(50, 200, 0.016))).toBeGreaterThan(0.5)
  })

  it('returns < 0.5 when accelerating', () => {
    // accel = (200 - 50) / 0.016 = 9375 px/s²
    expect(decelerationFactor(makeCtx(200, 50, 0.016))).toBeLessThan(0.5)
  })

  it('returns ~0.88 at moderate deceleration (-100 px/s²)', () => {
    // accel = -100, sigmoid(−100 × 0.02) = 1/(1+exp(-2)) ≈ 0.881
    // currentSpeed = 100, previousSpeed = 100 + 100*0.016 = 101.6
    const dt = 0.016
    const accel = -100
    const prevSpeed = 100 - accel * dt  // 101.6
    expect(decelerationFactor(makeCtx(100, prevSpeed, dt))).toBeCloseTo(0.881, 2)
  })

  it('returns 0.5 (neutral) when dt is 0', () => {
    expect(decelerationFactor(makeCtx(100, 200, 0))).toBe(0.5)
  })

  it('returns 0.5 (neutral) when dt is negative', () => {
    expect(decelerationFactor(makeCtx(100, 200, -1))).toBe(0.5)
  })

  it('returns 0.5 (neutral) when dt is NaN', () => {
    expect(decelerationFactor(makeCtx(100, 200, NaN))).toBe(0.5)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/factors/deceleration.test.ts`
Expected: FAIL.

**Step 3: Implement**

```ts
// src/core/factors/deceleration.ts
import type { FactorContext } from './types.js'

/** Neutral value returned when acceleration cannot be computed. */
const NEUTRAL = 0.5

/**
 * Deceleration factor (pass-through detection).
 *
 * Sigmoid of smoothed acceleration:
 * - Decelerating → factor approaches 1.0 (intent)
 * - Constant speed → 0.5 (neutral)
 * - Accelerating → factor approaches 0.0 (passing through)
 *
 * Returns 0.5 (neutral) if dt ≤ 0 or input is non-finite.
 */
export function decelerationFactor(ctx: FactorContext): number {
  if (!Number.isFinite(ctx.dt) || ctx.dt <= 0) return NEUTRAL

  const acceleration = (ctx.velocity.magnitude - ctx.previousSpeed) / ctx.dt

  if (!Number.isFinite(acceleration)) return NEUTRAL

  return 1 / (1 + Math.exp(acceleration * ctx.config.decelerationSensitivity))
}
```

**Step 4: Add to barrel export and run tests**

Run: `pnpm vitest run src/core/factors/deceleration.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/core/factors/deceleration.ts src/core/factors/deceleration.test.ts src/core/factors/index.ts
git commit -m "feat(factors): add sigmoid deceleration factor with dt=0 safety"
```

---

## Task 5: Implement erratic penalty factor (circular variance)

**Files:**
- Create: `src/core/factors/erratic.ts`
- Test: `src/core/factors/erratic.test.ts`

**Step 1: Write the failing tests**

```ts
// src/core/factors/erratic.test.ts
import { describe, it, expect } from 'vitest'
import { erraticPenaltyFactor } from './erratic.js'
import type { FactorContext } from './types.js'
import { CircularBuffer } from '../buffer.js'
import type { TimestampedPoint } from '../types.js'

function makeCtx(points: Array<{ x: number; y: number }>): FactorContext {
  const buffer = new CircularBuffer<TimestampedPoint>(30)
  points.forEach((p, i) => buffer.add({ x: p.x, y: p.y, timestamp: i * 16 }))

  return {
    cursor: points[points.length - 1] ?? { x: 0, y: 0 },
    predicted: { x: 0, y: 0 },
    velocity: { x: 0, y: 0, magnitude: 100, angle: 0 },
    previousSpeed: 100,
    dt: 0.016,
    element: { rect: { left: 0, top: 0, right: 100, bottom: 100 }, id: 'test' },
    buffer,
    config: { rayHitConfidence: 0.85, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 },
  }
}

describe('erraticPenaltyFactor', () => {
  it('returns 1.0 with fewer than 6 samples', () => {
    expect(erraticPenaltyFactor(makeCtx([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]))).toBe(1.0)
  })

  it('returns ~1.0 for a straight line (low variance)', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: 0 }))
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBeGreaterThan(0.95)
  })

  it('returns lower score for random directions', () => {
    // Zigzag: alternating left-right
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: (i % 2 === 0 ? 10 : -10) * (i + 1),
      y: i * 10,
    }))
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBeLessThan(0.8)
  })

  it('handles intentional 90° turn without extreme penalty', () => {
    // 5 points right, then 5 points down
    const points = [
      ...Array.from({ length: 5 }, (_, i) => ({ x: i * 20, y: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ x: 80, y: i * 20 })),
    ]
    const factor = erraticPenaltyFactor(makeCtx(points))
    // With k=1.5 and segment-length weighting, should be > 0.5
    expect(factor).toBeGreaterThan(0.5)
  })

  it('ignores sub-pixel segments', () => {
    // Mostly stationary with tiny jitter
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: 100 + (i % 2 === 0 ? 0.3 : -0.3),
      y: 100,
    }))
    // All segments < 1px → should be filtered out → return 1.0 (neutral)
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBe(1.0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/factors/erratic.test.ts`
Expected: FAIL.

**Step 3: Implement**

```ts
// src/core/factors/erratic.ts
import type { FactorContext } from './types.js'
import type { TimestampedPoint } from '../types.js'

/** Minimum number of buffer samples required. */
const MIN_SAMPLES = 6

/** Minimum segment length (px) to include in variance calculation. */
const MIN_SEGMENT_LENGTH = 1.0

/**
 * Erratic penalty factor using length-weighted circular variance.
 *
 * Penalizes jittery, random cursor movement. Weights segments by
 * their length so tiny jitter doesn't dominate deliberate motion.
 *
 * Returns 1.0 (no penalty) when buffer has fewer than MIN_SAMPLES entries.
 */
export function erraticPenaltyFactor(ctx: FactorContext): number {
  if (ctx.buffer.length < MIN_SAMPLES) return 1.0

  let sumSin = 0
  let sumCos = 0
  let totalWeight = 0
  let prev: TimestampedPoint | null = null

  ctx.buffer.forEach((point) => {
    if (prev) {
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      const segmentLength = Math.hypot(dx, dy)

      if (segmentLength >= MIN_SEGMENT_LENGTH) {
        const angle = Math.atan2(dy, dx)
        sumSin += segmentLength * Math.sin(angle)
        sumCos += segmentLength * Math.cos(angle)
        totalWeight += segmentLength
      }
    }
    prev = point
  })

  // All segments below threshold → no data → no penalty
  if (totalWeight === 0) return 1.0

  const R = Math.hypot(sumCos, sumSin) / totalWeight
  const circularVariance = 1 - R

  return Math.exp(-circularVariance * ctx.config.erraticSensitivity)
}
```

**Step 4: Add to barrel export and run tests**

Run: `pnpm vitest run src/core/factors/erratic.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/core/factors/erratic.ts src/core/factors/erratic.test.ts src/core/factors/index.ts
git commit -m "feat(factors): add length-weighted erratic penalty with circular variance"
```

---

## Task 6: Add FeatureFlags type and engine presets

**Files:**
- Create: `src/core/presets.ts`
- Test: `src/core/presets.test.ts`
- Modify: `src/core/types.ts` — add `FeatureFlags`, `FactorWeights`, new `EngineOptions` fields

**Step 1: Write the failing tests**

```ts
// src/core/presets.test.ts
import { describe, it, expect } from 'vitest'
import { presets } from './presets.js'

describe('presets', () => {
  it('exports a default preset with all features on', () => {
    expect(presets.default.features?.rayCasting).not.toBe(false)
  })

  it('exports hoverOnly preset with rayCasting disabled', () => {
    expect(presets.hoverOnly.features?.rayCasting).toBe(false)
  })

  it('exports denseGrid preset', () => {
    expect(presets.denseGrid).toBeDefined()
    expect(presets.denseGrid.smoothingFactor).toBeDefined()
  })

  it('exports dashboard preset', () => {
    expect(presets.dashboard).toBeDefined()
  })

  it('exports navigation preset', () => {
    expect(presets.navigation).toBeDefined()
  })

  it('all presets are spreadable with overrides', () => {
    const custom = { ...presets.denseGrid, predictionWindow: 200 }
    expect(custom.predictionWindow).toBe(200)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/presets.test.ts`
Expected: FAIL.

**Step 3: Add new types to `src/core/types.ts`**

Add `FeatureFlags`, `FactorWeights`, and new `EngineOptions` fields to the existing types file. Add new fields to `EngineOptions`:

```ts
/** Feature flags to enable/disable expensive per-frame computations. */
export type FeatureFlags = {
  /** Segment→AABB intersection test (trajectory ray). */
  rayCasting: boolean
  /** Gaussian distance factor computation. */
  distanceScoring: boolean
  /** Angular variance computation for jitter detection. */
  erraticDetection: boolean
  /** Acceleration-based pass-through detection. */
  passThroughDetection: boolean
}

/** Per-factor weight overrides. */
export type FactorWeights = {
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

Add to `EngineOptions`:
```ts
  features?: Partial<FeatureFlags>
  factorWeights?: Partial<FactorWeights>
  rayHitConfidence?: number
  distanceDecayRate?: number
  decelerationSensitivity?: number
  erraticSensitivity?: number
  cancelThreshold?: number
```

**Step 4: Implement presets**

```ts
// src/core/presets.ts
import type { EngineOptions } from './types.js'

export const presets = {
  default: {} satisfies Partial<EngineOptions>,

  hoverOnly: {
    features: {
      rayCasting: false,
      erraticDetection: false,
      passThroughDetection: false,
    },
    predictionWindow: 80,
    minVelocityThreshold: 30,
  } satisfies Partial<EngineOptions>,

  denseGrid: {
    smoothingFactor: 0.5,
    defaultTolerance: 2,
    confidenceSaturationFrames: 6,
    factorWeights: { erratic: 0.8 },
  } satisfies Partial<EngineOptions>,

  dashboard: {
    defaultTolerance: 20,
    predictionWindow: 120,
    factorWeights: { distance: 0.8 },
  } satisfies Partial<EngineOptions>,

  navigation: {
    defaultTolerance: 5,
    predictionWindow: 100,
  } satisfies Partial<EngineOptions>,
} as const
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/core/presets.test.ts`
Expected: All PASS.

**Step 6: Commit**

```bash
git add src/core/presets.ts src/core/presets.test.ts src/core/types.ts
git commit -m "feat(core): add FeatureFlags, FactorWeights types and engine presets"
```

---

## Task 7: Integrate factor pipeline into TrajectoryEngine

**Files:**
- Modify: `src/core/engine.ts` — replace `consecutiveHitFrames` logic with `computeConfidence()`
- Modify: `src/core/constants.ts` — add new defaults
- Test: `src/core/engine.test.ts` — update existing tests for new confidence behavior

**This is the largest task.** The key changes in `engine.ts`:

1. Import the factor modules and `computeConfidence`.
2. In the constructor, build the default factor pipeline based on `EngineOptions.features` and `EngineOptions.factorWeights`. When a feature flag is `false`, set that factor's weight to 0.
3. In the `update()` method, replace the `consecutiveHitFrames` block (lines ~405-422 of current engine.ts) with a call to `computeConfidence(this.factors, factorCtx)`.
4. Remove `consecutiveHitFrames` from `ElementState` (it's no longer used).
5. Add `previousSpeed` tracking to `PredictionState` or the engine.
6. Update `validators.ts` to validate new `EngineOptions` fields (`rayHitConfidence`, `distanceDecayRate`, `decelerationSensitivity`, `erraticSensitivity`, `cancelThreshold`, `factorWeights`).

### Critical behavior specifications (from Momus review)

**`isIntersecting` when `rayCasting=false`:**

The existing `isIntersecting` logic already checks TWO things: (a) cursor inside element, (b) cursor in expanded tolerance zone OR trajectory ray hits zone. When `rayCasting=false`, only the ray test is skipped — the proximity checks remain:

```
isIntersecting = cursorIsInside || cursorInAnyExpandedZone
// (ray hit check is simply not run when rayCasting=false)
```

This means the convenience config (`isIntersecting && confidence > threshold`) still works in hoverOnly mode: the cursor must be within the tolerance zone AND the physics factors (distance, decel, erratic — alignment is neutral at weight=0) must produce sufficient confidence. **No change to convenience config expansion is needed.**

**Zone system (NormalizedZone.factor) integration:**

The existing zone system computes `bestFactor` from whichever zone the cursor/ray hits. In v2, this zone factor is applied as a **post-pipeline cap**:

```ts
// AFTER computeConfidence runs:
const pipelineConfidence = computeConfidence(this.factors, factorCtx)
const confidence = cursorIsInside ? pipelineConfidence : Math.min(bestFactor, pipelineConfidence)
```

This preserves the existing behavior where outer tolerance zones (with factor < 1.0) reduce confidence. The alignment factor runs against expanded rects from zones (same as today's `trajectoryHitsZone` check inside the zone loop).

**FactorContext includes zone data:**

The `FactorContext.element` field is extended to include the expanded rects so the alignment factor can test against them:

```ts
element: {
  rect: Rect           // raw bounding rect
  id: string
  expandedRects: Array<{ rect: Rect; factor: number }>  // from normalized zones
}
```

**Devtools compatibility:**

The devtools event `prediction:fired` emits `confidence` from `this.snapshots.get(elementId)`. Since the snapshot is populated with the v2 pipeline confidence, devtools works without changes — it just sees different confidence values.

**Step 1: Add new defaults to constants.ts**

```ts
// Add to src/core/constants.ts
export const DEFAULT_RAY_HIT_CONFIDENCE = 0.85
export const DEFAULT_DISTANCE_DECAY_RATE = 0.8
export const DEFAULT_DECELERATION_SENSITIVITY = 0.02
export const DEFAULT_ERRATIC_SENSITIVITY = 1.5
export const DEFAULT_CANCEL_THRESHOLD = 0.15
```

**Step 2: Update engine constructor to build factor pipeline**

Build the `WeightedFactor[]` array from options + feature flags. Store as `private readonly factors: WeightedFactor[]`.

**Step 3: Replace confidence computation in `update()`**

Remove the `consecutiveHitFrames` increment/decay logic. Build a `FactorContext` from the current frame data and call `computeConfidence(this.factors, ctx)`.

**Step 4: Update existing tests**

Many existing tests check `confidence` values. Since the formula changed, expected values will differ. Update assertions to match the new physics-based pipeline output.

**Step 5: Run full test suite**

Run: `pnpm vitest run`
Expected: All PASS (after test updates).

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors.

**Step 7: Commit**

```bash
git add src/core/engine.ts src/core/constants.ts src/core/engine.test.ts src/core/engine.integration.test.ts src/core/triggers.ts src/core/triggers.test.ts
git commit -m "feat(engine): replace frame-counter confidence with factor pipeline

BREAKING: confidence values differ from v1. Consumers using
confidence > 0.5 thresholds should use > 0.3 with the new pipeline."
```

---

## Task 8: Implement cancellation system

**Files:**
- Modify: `src/core/types.ts` — update `WhenTriggered` signature, add `ActiveTrigger` type
- Modify: `src/core/engine.ts` — add `activeTriggers` map, AbortController lifecycle
- Test: `src/core/engine.test.ts` — add cancellation-specific tests

**Step 1: Write the failing tests**

```ts
// src/core/cancellation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrajectoryEngine } from './engine.js'

function createEngine(overrides = {}) {
  return new TrajectoryEngine({
    confidenceThreshold: 0.3,
    cancelThreshold: 0.15,
    ...overrides,
  })
}

function makeElement(id = 'test'): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ left: 50, top: 50, right: 150, bottom: 150, width: 100, height: 100, x: 50, y: 50, toJSON: () => ({}) })
  return el
}

describe('cancellation system', () => {
  let engine: TrajectoryEngine

  beforeEach(() => {
    engine = createEngine()
  })

  afterEach(() => {
    engine.destroy()
  })

  it('passes AbortSignal to whenTriggered', () => {
    let receivedSignal: AbortSignal | null = null
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { receivedSignal = signal },
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal!.aborted).toBe(false)
  })

  it('aborts signal when confidence drops below cancelThreshold', () => {
    let receivedSignal: AbortSignal | null = null
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: (snap) => ({ isTriggered: snap.confidence > 0.3 }),
      whenTriggered: (signal) => { receivedSignal = signal },
      profile: { type: 'on_enter' },
    })

    // Simulate high confidence → trigger fires
    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(receivedSignal).not.toBeNull()
    expect(receivedSignal!.aborted).toBe(false)

    // Engine.destroy should abort (as proxy for confidence drop — 
    // full confidence-drop test requires simulating pointer events)
    engine.destroy()
    expect(receivedSignal!.aborted).toBe(true)
  })

  it('calls cleanup function returned by whenTriggered', () => {
    const cleanup = vi.fn()
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: () => cleanup,
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(cleanup).not.toHaveBeenCalled()

    engine.destroy()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('aborts all active triggers on destroy', () => {
    const signals: AbortSignal[] = []
    const cleanups = [vi.fn(), vi.fn()]

    const el1 = makeElement('a')
    const el2 = makeElement('b')

    engine.register('a', el1, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { signals.push(signal); return cleanups[0] },
      profile: { type: 'once' },
    })
    engine.register('b', el2, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { signals.push(signal); return cleanups[1] },
      profile: { type: 'once' },
    })

    engine.trigger('a', { dangerouslyIgnoreProfile: true })
    engine.trigger('b', { dangerouslyIgnoreProfile: true })

    engine.destroy()
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(true)
    expect(cleanups[0]).toHaveBeenCalledOnce()
    expect(cleanups[1]).toHaveBeenCalledOnce()
  })

  it('handles async whenTriggered that returns cleanup after delay', async () => {
    const cleanup = vi.fn()
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: async (signal) => {
        // Simulate async work before returning cleanup
        await new Promise(resolve => setTimeout(resolve, 10))
        return cleanup
      },
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })

    // Destroy BEFORE the async whenTriggered resolves
    // Signal should be aborted immediately, cleanup collected when promise resolves
    engine.destroy()

    // Wait for the async whenTriggered to resolve
    await new Promise(resolve => setTimeout(resolve, 20))

    // Cleanup should still be called even though it resolved after abort
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/cancellation.test.ts`
Expected: FAIL — cancellation system not yet implemented.

**Step 3: Update `WhenTriggered` type**

Change from `() => void | Promise<void>` to `(signal: AbortSignal) => void | (() => void) | Promise<void | (() => void)>`.

**Step 3: Implement ActiveTrigger tracking in engine**

- Add `private readonly activeTriggers = new Map<string, ActiveTrigger>()`
- On trigger fire: create `AbortController`, pass `signal` to callback, store result
- In `update()`: after computing confidence, check if active trigger exists and confidence < `cancelThreshold` → abort + cleanup
- In `destroy()`: abort all active triggers

**Step 4: Run tests and commit**

Run: `pnpm vitest run`
Expected: All PASS.

```bash
git add src/core/types.ts src/core/engine.ts src/core/engine.test.ts
git commit -m "feat(engine): add AbortSignal cancellation with hysteresis dead zone"
```

---

## Task 9: Update exports and React hook

**Files:**
- Modify: `src/core/index.ts` — export new types, presets, factor functions
- Modify: `src/react/` — update `useAnticipated` to pass through new options
- Verify: `pnpm build` succeeds

**Step 1: Update core barrel export**

Add exports for: `presets`, `computeConfidence`, factor functions, new types (`FeatureFlags`, `FactorWeights`, `WeightedFactor`, `FactorContext`, `FactorConfig`).

**Step 2: Verify React hook compatibility**

The React hook passes `EngineOptions` through to `TrajectoryEngine`. Since new fields are all optional, the hook should work without changes. Verify by running the React tests.

**Step 3: Build**

Run: `pnpm build`
Expected: Clean build, no errors.

**Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/core/index.ts src/react/
git commit -m "feat(core): export factor pipeline, presets, and new types"
```

---

## Task 10: Integration test with demo app

**Files:**
- Modify: `full-demo/` — update demo to use new presets and show confidence values

**Step 1: Run the full demo locally**

Run: `pnpm full-demo`
Navigate to the demo and verify:
- Elements glow based on new confidence values
- Confidence increases as cursor approaches (not just when ray hits)
- Confidence drops when moving erratically
- Confidence drops at constant-speed pass-through
- `presets.hoverOnly` works without ray casting

**Step 2: Final full test suite run**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: All clean.

**Step 3: Commit any demo updates**

```bash
git add full-demo/
git commit -m "chore(demo): update demo for confidence v2 pipeline"
```

---

## Summary

| Task | Description | Est. Time |
|---|---|---|
| 1 | FactorContext types + computeConfidence | 15 min |
| 2 | Trajectory alignment factor | 15 min |
| 3 | Distance factor (Gaussian) | 15 min |
| 4 | Deceleration factor (sigmoid) | 15 min |
| 5 | Erratic penalty (circular variance) | 20 min |
| 6 | FeatureFlags, FactorWeights, presets | 15 min |
| 7 | **Engine integration** (largest) | 45 min |
| 8 | Cancellation system | 30 min |
| 9 | Export updates + React hook | 10 min |
| 10 | Integration test with demo | 15 min |
| **Total** | | **~3.5 hours** |
