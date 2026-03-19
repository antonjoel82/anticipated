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
    zones: [{ rect: { left: 0, top: 0, right: 100, bottom: 100 }, factor: 1.0 }],
    buffer: { length: 0, forEach: () => {}, getLast: () => undefined, getFirst: () => undefined, getFirstLast: () => undefined, add: () => {}, clear: () => {} } as any,
    config: { rayHitConfidence: 0.85, distanceDecayRate: 0.8, decelerationSensitivity: 0.003, erraticSensitivity: 1.5 },
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

  it('returns ~0.57 at moderate deceleration (-100 px/s²)', () => {
    // accel = -100, sigmoid(−100 × 0.003) = 1/(1+exp(-0.3)) ≈ 0.574
    const dt = 0.016
    const accel = -100
    const prevSpeed = 100 - accel * dt  // 101.6
    expect(decelerationFactor(makeCtx(100, prevSpeed, dt))).toBeCloseTo(0.574, 2)
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
