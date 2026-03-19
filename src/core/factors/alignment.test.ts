import { describe, it, expect } from 'vitest'
import { trajectoryAlignmentFactor } from './alignment.js'
import type { FactorContext } from './types.js'

function makeCtx(overrides: Partial<FactorContext>): FactorContext {
  const elementRect = overrides.element?.rect ?? { left: 50, top: -25, right: 150, bottom: 25 }
  return {
    cursor: { x: 0, y: 0 },
    predicted: { x: 100, y: 0 },
    velocity: { x: 100, y: 0, magnitude: 100, angle: 0 },
    previousSpeed: 100,
    dt: 0.016,
    element: { rect: elementRect, id: 'test' },
    zones: [{ rect: elementRect, factor: 1.0 }],
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
    const ctx = makeCtx({})
    expect(trajectoryAlignmentFactor(ctx)).toBe(0.85)
  })

  it('returns 0 when ray misses', () => {
    const ctx = makeCtx({ predicted: { x: 0, y: -100 } })
    expect(trajectoryAlignmentFactor(ctx)).toBe(0)
  })

  it('uses custom rayHitConfidence', () => {
    const ctx = makeCtx({ config: { rayHitConfidence: 0.7, distanceDecayRate: 0.8, decelerationSensitivity: 0.02, erraticSensitivity: 1.5 } })
    expect(trajectoryAlignmentFactor(ctx)).toBe(0.7)
  })
})
