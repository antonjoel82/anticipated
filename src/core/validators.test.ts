import { describe, it, expect } from 'vitest'
import { validateEngineOptions, validateElementConfig, normalizeTolerance, normalizeZones } from './validators.js'
import type { EngineOptions } from './types.js'

describe('validateEngineOptions', () => {
  it('accepts undefined (all defaults)', () => {
    expect(() => validateEngineOptions(undefined)).not.toThrow()
  })

  it('accepts empty object', () => {
    expect(() => validateEngineOptions({})).not.toThrow()
  })

  it('accepts valid full options', () => {
    expect(() => validateEngineOptions({
      predictionWindow: 150,
      smoothingFactor: 0.3,
      bufferSize: 8,
    })).not.toThrow()
  })

  it('accepts boundary values for predictionWindow', () => {
    expect(() => validateEngineOptions({ predictionWindow: 50 })).not.toThrow()
    expect(() => validateEngineOptions({ predictionWindow: 500 })).not.toThrow()
  })

  it('rejects predictionWindow below minimum', () => {
    expect(() => validateEngineOptions({ predictionWindow: 49 })).toThrow(/predictionWindow/)
  })

  it('rejects predictionWindow above maximum', () => {
    expect(() => validateEngineOptions({ predictionWindow: 501 })).toThrow(/predictionWindow/)
  })

  it('accepts boundary values for smoothingFactor', () => {
    expect(() => validateEngineOptions({ smoothingFactor: 0.01 })).not.toThrow()
    expect(() => validateEngineOptions({ smoothingFactor: 1 })).not.toThrow()
  })

  it('rejects smoothingFactor at or below zero', () => {
    expect(() => validateEngineOptions({ smoothingFactor: 0 })).toThrow(/smoothingFactor/)
    expect(() => validateEngineOptions({ smoothingFactor: -0.1 })).toThrow(/smoothingFactor/)
  })

  it('rejects smoothingFactor above one', () => {
    expect(() => validateEngineOptions({ smoothingFactor: 1.1 })).toThrow(/smoothingFactor/)
  })

  it('accepts boundary values for bufferSize', () => {
    expect(() => validateEngineOptions({ bufferSize: 2 })).not.toThrow()
    expect(() => validateEngineOptions({ bufferSize: 30 })).not.toThrow()
  })

  it('rejects bufferSize below minimum', () => {
    expect(() => validateEngineOptions({ bufferSize: 1 })).toThrow(/bufferSize/)
  })

  it('rejects bufferSize above maximum', () => {
    expect(() => validateEngineOptions({ bufferSize: 31 })).toThrow(/bufferSize/)
  })
})

describe('validateElementConfig', () => {
  const validConfig = {
    triggerOn: () => ({ isTriggered: false }),
    whenTriggered: () => {},
    profile: { type: 'once' as const },
  }

  it('accepts valid config', () => {
    expect(() => validateElementConfig(validConfig)).not.toThrow()
  })

  it('accepts config with number tolerance', () => {
    expect(() => validateElementConfig({ ...validConfig, tolerance: 20 })).not.toThrow()
  })

  it('accepts config with rect tolerance', () => {
    expect(() => validateElementConfig({
      ...validConfig,
      tolerance: { top: 10, right: 20, bottom: 10, left: 20 },
    })).not.toThrow()
  })

  it('rejects negative number tolerance', () => {
    expect(() => validateElementConfig({ ...validConfig, tolerance: -1 })).toThrow(/tolerance/)
  })

  it('rejects tolerance exceeding maximum', () => {
    expect(() => validateElementConfig({ ...validConfig, tolerance: 2001 })).toThrow(/tolerance/)
  })

  it('rejects rect tolerance with negative values', () => {
    expect(() => validateElementConfig({
      ...validConfig,
      tolerance: { top: -1, right: 0, bottom: 0, left: 0 },
    })).toThrow(/tolerance/)
  })

  it('rejects empty tolerance zones array', () => {
    expect(() => validateElementConfig({
      ...validConfig,
      tolerance: [],
    })).toThrow(/must not be empty/)
  })

  it('rejects tolerance zone factor below zero', () => {
    expect(() => validateElementConfig({
      ...validConfig,
      tolerance: [{ distance: 20, factor: -0.1 }],
    })).toThrow(/factor/)
  })

  it('rejects tolerance zone factor above one', () => {
    expect(() => validateElementConfig({
      ...validConfig,
      tolerance: [{ distance: 20, factor: 1.1 }],
    })).toThrow(/factor/)
  })
})

type AssertNotKey<T, K extends string> = K extends keyof T ? never : true

describe('EngineOptions dead field removal (ISP)', () => {
  it('rejects confidenceSaturationFrames', () => {
    const _: AssertNotKey<EngineOptions, 'confidenceSaturationFrames'> = true
    expect(true).toBe(true)
  })

  it('rejects confidenceDecayRate', () => {
    const _: AssertNotKey<EngineOptions, 'confidenceDecayRate'> = true
    expect(true).toBe(true)
  })
})

describe('normalizeTolerance', () => {
  it('converts number to ToleranceRect', () => {
    expect(normalizeTolerance(10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 })
  })

  it('passes through ToleranceRect unchanged', () => {
    const rect = { top: 1, right: 2, bottom: 3, left: 4 }
    expect(normalizeTolerance(rect)).toEqual(rect)
  })

  it('defaults undefined to zero rect', () => {
    expect(normalizeTolerance(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('handles zero number', () => {
    expect(normalizeTolerance(0)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe('normalizeZones', () => {
  it('normalizes number tolerance as factor 1.0 zone', () => {
    expect(normalizeZones(30)).toEqual([
      {
        tolerance: { top: 30, right: 30, bottom: 30, left: 30 },
        factor: 1.0,
      },
    ])
  })

  it('normalizes zone array distances and factors', () => {
    expect(normalizeZones([{ distance: 20, factor: 0.7 }])).toEqual([
      {
        tolerance: { top: 20, right: 20, bottom: 20, left: 20 },
        factor: 0.7,
      },
    ])
  })

  it('defaults undefined to zero tolerance zone with factor 1.0', () => {
    expect(normalizeZones(undefined)).toEqual([
      {
        tolerance: { top: 0, right: 0, bottom: 0, left: 0 },
        factor: 1.0,
      },
    ])
  })
})
