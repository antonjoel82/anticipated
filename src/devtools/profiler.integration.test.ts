import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrajectoryEngine } from '../core/engine.js'
import { AnticipatedProfiler } from './profiler.js'

describe('AnticipatedProfiler integration', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('full cycle: register → trigger → confirm → report shows TP', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)

    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    const cb = vi.fn()
    engine.register('settings', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: cb,
      profile: { type: 'on_enter' },
    })

    engine.trigger('settings')
    expect(cb).toHaveBeenCalledOnce()

    profiler.confirmNavigation('settings')

    const report = profiler.getReport()
    expect(report.predictions).toBe(1)
    expect(report.confirmed).toBe(1)
    expect(report.falsePositives).toBe(0)
    expect(report.precision).toBe(1.0)

    profiler.destroy()
    engine.destroy()
  })

  it('false positive: prediction fires but user never clicks', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine, { confirmationWindowMs: 100 })

    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    engine.register('cta', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })

    engine.trigger('cta')

    const report = profiler.getReport()
    expect(report.predictions).toBe(1)
    expect(report.confirmed).toBe(0)
    expect(report.falsePositives).toBe(1)
    expect(report.precision).toBe(0)

    profiler.destroy()
    engine.destroy()
  })

  it('sessionStorage persistence: state survives across profiler instances', () => {
    const engine1 = new TrajectoryEngine()
    const profiler1 = new AnticipatedProfiler(engine1, { persistAcrossNavigations: true })

    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    engine1.register('checkout', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })

    engine1.trigger('checkout')
    profiler1.destroy()
    engine1.destroy()

    const engine2 = new TrajectoryEngine()
    const profiler2 = new AnticipatedProfiler(engine2, { persistAcrossNavigations: true })

    const report = profiler2.getReport()
    expect(report.predictions).toBeGreaterThanOrEqual(1)

    profiler2.destroy()
    engine2.destroy()
  })
})
