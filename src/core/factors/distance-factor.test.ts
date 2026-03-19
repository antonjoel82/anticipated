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
    zones: [{ rect, factor: 1.0 }],
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
    const ctx = makeCtx(10, 10, { left: 0, top: 0, right: 0, bottom: 0 })
    const factor = distanceFactor(ctx)
    expect(Number.isFinite(factor)).toBe(true)
    expect(factor).toBeGreaterThanOrEqual(0)
    expect(factor).toBeLessThanOrEqual(1)
  })
})
