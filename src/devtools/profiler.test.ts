import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnticipatedProfiler } from './profiler.js'
import { TrajectoryEngine } from '../core/engine.js'

describe('AnticipatedProfiler', () => {
  let engine: TrajectoryEngine

  beforeEach(() => {
    sessionStorage.clear()
    engine = new TrajectoryEngine()
  })

  it('creates with default options', () => {
    const profiler = new AnticipatedProfiler(engine)
    expect(profiler).toBeDefined()
    profiler.destroy()
  })

  it('creates with custom options', () => {
    const profiler = new AnticipatedProfiler(engine, {
      confirmationWindowMs: 3000,
      persistAcrossNavigations: false,
      maxEventsStored: 100,
    })
    expect(profiler).toBeDefined()
    profiler.destroy()
  })

  it('getReport returns empty report initially', () => {
    const profiler = new AnticipatedProfiler(engine)
    const report = profiler.getReport()
    expect(report.predictions).toBe(0)
    expect(report.confirmed).toBe(0)
    expect(report.precision).toBe(0)
    expect(report.flows).toEqual([])
    profiler.destroy()
  })

  it('confirmNavigation manually confirms a prediction', () => {
    const profiler = new AnticipatedProfiler(engine)

    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    engine.register('nav-settings', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: vi.fn(),
      profile: { type: 'on_enter' },
    })

    engine.trigger('nav-settings')
    profiler.confirmNavigation('nav-settings')

    const report = profiler.getReport()
    expect(report.confirmed).toBe(1)
    expect(report.avgLeadTimeMs).toBeGreaterThanOrEqual(0)
    profiler.destroy()
  })

  it('reset clears all data', () => {
    const profiler = new AnticipatedProfiler(engine)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })
    engine.trigger('btn')
    profiler.confirmNavigation('btn')

    profiler.reset()
    const report = profiler.getReport()
    expect(report.predictions).toBe(0)
    expect(report.confirmed).toBe(0)
    profiler.destroy()
  })

  it('destroy unsubscribes from engine', () => {
    const profiler = new AnticipatedProfiler(engine)
    profiler.destroy()
    expect(() => profiler.destroy()).not.toThrow()
  })

  it('getFlows returns flow reports', () => {
    const profiler = new AnticipatedProfiler(engine)
    const flows = profiler.getFlows()
    expect(flows).toEqual([])
    profiler.destroy()
  })
})

describe('subscribable snapshot', () => {
  let engine: TrajectoryEngine

  beforeEach(() => {
    sessionStorage.clear()
    engine = new TrajectoryEngine()
  })

  it('subscribe returns unsubscribe function', () => {
    const profiler = new AnticipatedProfiler(engine)
    const listener = vi.fn()
    const unsub = profiler.subscribe(listener)
    expect(typeof unsub).toBe('function')
    unsub()
    profiler.destroy()
  })

  it('getSnapshot returns stable shape', () => {
    const profiler = new AnticipatedProfiler(engine)
    const snap = profiler.getSnapshot()
    expect(snap).toHaveProperty('report')
    expect(snap).toHaveProperty('events')
    expect(snap).toHaveProperty('enabled')
    expect(snap.enabled).toBe(true)
    profiler.destroy()
  })

  it('notifies subscribers on new prediction event', () => {
    const profiler = new AnticipatedProfiler(engine)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })
    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })

    const listener = vi.fn()
    profiler.subscribe(listener)
    engine.trigger('btn')
    expect(listener).toHaveBeenCalled()
    profiler.destroy()
  })

  it('setEnabled(false) stops recording events', () => {
    const profiler = new AnticipatedProfiler(engine)
    profiler.setEnabled(false)
    expect(profiler.getSnapshot().enabled).toBe(false)
    profiler.destroy()
  })
})
