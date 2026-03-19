import { describe, it, expect } from 'vitest'
import * as C from './constants.js'

describe('prediction window range', () => {
  it('has min less than max', () => {
    expect(C.MIN_PREDICTION_WINDOW_MS).toBeLessThan(C.MAX_PREDICTION_WINDOW_MS)
  })

  it('has default within bounds', () => {
    expect(C.DEFAULT_PREDICTION_WINDOW_MS).toBeGreaterThanOrEqual(C.MIN_PREDICTION_WINDOW_MS)
    expect(C.DEFAULT_PREDICTION_WINDOW_MS).toBeLessThanOrEqual(C.MAX_PREDICTION_WINDOW_MS)
  })
})

describe('buffer size range', () => {
  it('has min less than max', () => {
    expect(C.MIN_BUFFER_SIZE).toBeLessThan(C.MAX_BUFFER_SIZE)
  })

  it('has default within bounds', () => {
    expect(C.DEFAULT_BUFFER_SIZE).toBeGreaterThanOrEqual(C.MIN_BUFFER_SIZE)
    expect(C.DEFAULT_BUFFER_SIZE).toBeLessThanOrEqual(C.MAX_BUFFER_SIZE)
  })
})

describe('smoothing factor', () => {
  it('is between 0 exclusive and 1 inclusive', () => {
    expect(C.DEFAULT_SMOOTHING_FACTOR).toBeGreaterThan(0)
    expect(C.DEFAULT_SMOOTHING_FACTOR).toBeLessThanOrEqual(1)
  })
})

describe('deceleration tuning', () => {
  it('has window floor between 0 and 1', () => {
    expect(C.DECELERATION_WINDOW_FLOOR).toBeGreaterThan(0)
    expect(C.DECELERATION_WINDOW_FLOOR).toBeLessThan(1)
  })

  it('has positive dampening factor', () => {
    expect(C.DECELERATION_DAMPENING).toBeGreaterThan(0)
  })
})

describe('tolerance bounds', () => {
  it('has default less than max', () => {
    expect(C.DEFAULT_TOLERANCE).toBeLessThan(C.MAX_TOLERANCE)
  })

  it('has non-negative default', () => {
    expect(C.DEFAULT_TOLERANCE).toBeGreaterThanOrEqual(0)
  })
})
