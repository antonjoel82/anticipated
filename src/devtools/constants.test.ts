import { describe, it, expect } from 'vitest'
import * as C from './constants.js'

describe('devtools constants', () => {
  it('has valid confirmation window', () => {
    expect(C.DEFAULT_CONFIRMATION_WINDOW_MS).toBeGreaterThan(0)
    expect(C.DEFAULT_CONFIRMATION_WINDOW_MS).toBeLessThanOrEqual(10000)
  })

  it('has valid max events stored', () => {
    expect(C.DEFAULT_MAX_EVENTS_STORED).toBeGreaterThan(0)
    expect(C.DEFAULT_MAX_EVENTS_STORED).toBeLessThanOrEqual(10000)
  })

  it('has valid flow break timeout', () => {
    expect(C.FLOW_BREAK_TIMEOUT_MS).toBeGreaterThan(C.DEFAULT_CONFIRMATION_WINDOW_MS)
  })

  it('has a session storage key', () => {
    expect(C.SESSION_STORAGE_KEY).toBe('anticipated:profiler')
  })
})
