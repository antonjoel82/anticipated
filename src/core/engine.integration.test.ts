import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrajectoryEngine } from './engine.js'

function mockRect(el: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => {},
  })
}

function makePointerEvent(x: number, y: number, timeStamp: number): PointerEvent {
  const event = new PointerEvent('pointermove', {
    clientX: x,
    clientY: y,
    bubbles: true,
  })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  return event
}

describe('TrajectoryEngine pointer→confidence flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('confidence increases when trajectory ray intersects element', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target })
    const el = document.createElement('div')

    // Element at (200, 100) to (400, 200) — 200×100 box
    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })

    const cb = vi.fn()
    engine.register('box', el, {
      triggerOn: (snap) => ({
        isTriggered: snap.isIntersecting && snap.confidence > 0.5,
      }),
      whenTriggered: cb,
      profile: { type: 'on_enter' },
      tolerance: 30,
    })
    engine.connect()

    // Simulate cursor moving right toward the element
    // Cursor starts at (50, 150), element left edge expanded = 200-30 = 170
    // With velocity ~600px/s and prediction window 150ms, predicted offset = ~90px
    // Ray should start hitting when cursor is about 90px from the expanded edge (at ~80px)

    // Frame 0: first event (warmup)
    target.dispatchEvent(makePointerEvent(50, 150, 1000))
    vi.advanceTimersByTime(16)

    // Frames 1-5: build up velocity by moving right
    for (let i = 1; i <= 5; i++) {
      target.dispatchEvent(makePointerEvent(50 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    // Now cursor is at ~100, moving right at ~600px/s
    // predicted offset ≈ 600*0.15 = 90px, predicted point at ~190px
    // Expanded left edge = 170. 190 > 170 → ray should hit!

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.confidence).toBeGreaterThan(0)
    expect(snap!.factors).toBeDefined()
    expect(snap!.factors.alignment).toBeGreaterThanOrEqual(0)
    expect(snap!.factors.alignment).toBeLessThanOrEqual(1)
    expect(snap!.factors.distance).toBeGreaterThanOrEqual(0)
    expect(snap!.factors.distance).toBeLessThanOrEqual(1)
    expect(snap!.factors.deceleration).toBeGreaterThanOrEqual(0)
    expect(snap!.factors.deceleration).toBeLessThanOrEqual(1)
    expect(snap!.factors.erratic).toBeGreaterThanOrEqual(0)
    expect(snap!.factors.erratic).toBeLessThanOrEqual(1)

    engine.destroy()
  })

  it('confidence reaches trigger threshold with sustained trajectory', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })

    const cb = vi.fn()
    engine.register('box', el, {
      whenApproaching: cb,
      tolerance: 30,
    })
    engine.connect()

    // Simulate steady rightward movement toward the element
    // 20 frames at 10px/frame ≈ 600px/s
    for (let i = 0; i < 20; i++) {
      target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    // By frame 20, cursor is at ~280 (inside the element)
    // With factor pipeline: decel factor at constant speed = 0.5, so confidence ≈ 0.5
    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.confidence).toBeGreaterThan(0.3)
    expect(cb).toHaveBeenCalled()

    engine.destroy()
  })

  it('confidence resets to 0 when trajectory stops intersecting', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })

    engine.register('box', el, {
      triggerOn: (snap) => ({ isTriggered: snap.isIntersecting }),
      whenTriggered: () => {},
      profile: { type: 'every_frame' },
      tolerance: 30,
    })
    engine.connect()

    // Build up confidence by moving toward element
    for (let i = 0; i < 15; i++) {
      target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const snapBefore = engine.getSnapshot('box')
    expect(snapBefore).toBeDefined()
    expect(snapBefore!.confidence).toBeGreaterThan(0)

    for (let i = 0; i < 80; i++) {
      target.dispatchEvent(makePointerEvent(300, 50 - i * 10, 1500 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const snapAfter = engine.getSnapshot('box')
    expect(snapAfter).toBeDefined()
    expect(snapAfter!.confidence).toBe(0)

    engine.destroy()
  })
})

describe('TrajectoryEngine confidence with jittery velocity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('triggers callback despite per-frame speed oscillation', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })

    const cb = vi.fn()
    engine.register('box', el, {
      whenApproaching: cb,
      tolerance: 30,
    })
    engine.connect()

    for (let i = 0; i < 30; i++) {
      const jitter: number = i % 2 === 0 ? 12 : 8
      target.dispatchEvent(makePointerEvent(120 + i * 10 + (i % 2) * jitter, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    expect(cb).toHaveBeenCalled()

    engine.destroy()
  })
})

describe('TrajectoryEngine accelerating confidence decay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('smooths confidence decline instead of dropping instantly', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })
    engine.register('box', el, {
      triggerOn: (snap) => ({ isTriggered: snap.isIntersecting && snap.confidence > 0.3 }),
      whenTriggered: () => {},
      profile: { type: 'every_frame' },
      tolerance: 30,
    })
    engine.connect()

    for (let i = 0; i < 15; i++) {
      target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const peakSnap = engine.getSnapshot('box')
    expect(peakSnap).toBeDefined()
    const peakConfidence = peakSnap!.confidence
    expect(peakConfidence).toBeGreaterThan(0)

    target.dispatchEvent(makePointerEvent(300, 0, 1500))
    vi.advanceTimersByTime(17)

    const afterOneFrame = engine.getSnapshot('box')
    expect(afterOneFrame).toBeDefined()
    expect(afterOneFrame!.confidence).toBeGreaterThan(0)
    expect(afterOneFrame!.confidence).toBeLessThan(peakConfidence)

    engine.destroy()
  })

  it('decay accelerates over consecutive frames', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })
    engine.register('box', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'every_frame' },
      tolerance: 30,
    })
    engine.connect()

    for (let i = 0; i < 12; i++) {
      target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const rates: number[] = []
    let prevConf = engine.getSnapshot('box')!.confidence

    for (let i = 0; i < 10; i++) {
      target.dispatchEvent(makePointerEvent(500 + i * 20, 500 + i * 20, 1300 + i * 16.67))
      vi.advanceTimersByTime(17)
      const conf = engine.getSnapshot('box')!.confidence
      if (prevConf > 0.01) {
        rates.push((prevConf - conf) / prevConf)
      }
      prevConf = conf
    }

    const earlyRate = rates[1]
    const lateRate = rates[rates.length - 1]
    expect(lateRate).toBeGreaterThan(earlyRate)

    engine.destroy()
  })

  it('ramp-up is instant when raw confidence exceeds decayed value', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })
    engine.register('box', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'every_frame' },
      tolerance: 30,
    })
    engine.connect()

    for (let i = 0; i < 10; i++) {
      target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    for (let i = 0; i < 5; i++) {
      target.dispatchEvent(makePointerEvent(500, 500 + i * 20, 1300 + i * 16.67))
      vi.advanceTimersByTime(17)
    }
    const decayedConf = engine.getSnapshot('box')!.confidence

    for (let i = 0; i < 10; i++) {
      target.dispatchEvent(makePointerEvent(100 + i * 15, 150, 1500 + i * 16.67))
      vi.advanceTimersByTime(17)
    }
    const rampedConf = engine.getSnapshot('box')!.confidence

    expect(rampedConf).toBeGreaterThan(decayedConf)

    engine.destroy()
  })

  it('prevents on_enter re-triggering during oscillating ray hits', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRect(el, { left: 200, top: 100, width: 200, height: 100 })

    const cb = vi.fn()
    engine.register('box', el, {
      whenApproaching: cb,
      tolerance: 20,
    })
    engine.connect()

    for (let i = 0; i < 10; i++) {
      target.dispatchEvent(makePointerEvent(100 + i * 8, 150, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const firstCallCount = cb.mock.calls.length

    for (let i = 0; i < 20; i++) {
      const x = 185 + (i % 2 === 0 ? 3 : -3)
      target.dispatchEvent(makePointerEvent(x, 150, 1200 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    expect(cb.mock.calls.length).toBe(firstCallCount)

    engine.destroy()
  })
})

describe('TrajectoryEngine integration', () => {
  it('cleanup: unregister removes snapshot and notifies', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const subscriber = vi.fn()

    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    engine.subscribe(subscriber)
    engine.unregister('btn')

    expect(engine.getSnapshot('btn')).toBeUndefined()
    expect(engine.getAllSnapshots().size).toBe(0)
    expect(subscriber).toHaveBeenCalled()
    engine.destroy()
  })

  it('multiple elements have independent registrations', () => {
    const engine = new TrajectoryEngine()
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')

    engine.register('a', el1, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })
    engine.register('b', el2, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    engine.unregister('a')
    expect(engine.getSnapshot('a')).toBeUndefined()

    engine.trigger('b')
    engine.destroy()
  })

  it('per-element subscriptions fire independently', () => {
    const engine = new TrajectoryEngine()
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const subA = vi.fn()
    const subB = vi.fn()

    engine.register('a', el1, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })
    engine.register('b', el2, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    const unsubA = engine.subscribeToElement('a')(subA)
    engine.subscribeToElement('b')(subB)

    engine.unregister('a')
    expect(subA).toHaveBeenCalled()
    expect(subB).not.toHaveBeenCalled()

    unsubA()
    engine.destroy()
  })

  it('imperative trigger with callback error does not crash engine', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => { throw new Error('callback error') },
      profile: { type: 'on_enter' },
    })

    expect(() => engine.trigger('test')).not.toThrow()
    engine.destroy()
  })

  it('imperative trigger with async callback error does not crash engine', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: async () => { throw new Error('async error') },
      profile: { type: 'on_enter' },
    })

    expect(() => engine.trigger('test')).not.toThrow()
    engine.destroy()
  })

  it('convenience config works through imperative trigger', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb = vi.fn()

    engine.register('nav', el, {
      whenApproaching: cb,
      tolerance: 10,
    })

    engine.trigger('nav')
    expect(cb).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('destroy after unregister all elements is clean', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')

    engine.register('a', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    engine.connect()
    engine.unregister('a')
    engine.disconnect()

    expect(() => engine.destroy()).not.toThrow()
    expect(engine.getAllSnapshots().size).toBe(0)
  })
})
