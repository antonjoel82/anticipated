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
    zones: [{ rect: { left: 0, top: 0, right: 100, bottom: 100 }, factor: 1.0 }],
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
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: (i % 2 === 0 ? 10 : -10) * (i + 1),
      y: i * 10,
    }))
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBeLessThan(0.8)
  })

  it('handles intentional 90° turn without extreme penalty', () => {
    const points = [
      ...Array.from({ length: 5 }, (_, i) => ({ x: i * 20, y: 0 })),
      ...Array.from({ length: 5 }, (_, i) => ({ x: 80, y: i * 20 })),
    ]
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBeGreaterThan(0.5)
  })

  it('ignores sub-pixel segments', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({
      x: 100 + (i % 2 === 0 ? 0.3 : -0.3),
      y: 100,
    }))
    const factor = erraticPenaltyFactor(makeCtx(points))
    expect(factor).toBe(1.0)
  })
})
