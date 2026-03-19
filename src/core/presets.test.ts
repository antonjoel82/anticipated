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
