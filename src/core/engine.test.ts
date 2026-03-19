import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrajectoryEngine } from './engine.js'
import type { ElementConfig } from './types.js'

function makeConfig(overrides?: Partial<ElementConfig>): ElementConfig {
  return {
    triggerOn: () => ({ isTriggered: false }),
    whenTriggered: () => {},
    profile: { type: 'once' },
    ...overrides,
  }
}

describe('TrajectoryEngine lifecycle', () => {
  it('creates with default options', () => {
    const engine = new TrajectoryEngine()
    expect(engine).toBeDefined()
    engine.destroy()
  })

  it('creates with custom options', () => {
    const engine = new TrajectoryEngine({ predictionWindow: 200, bufferSize: 12 })
    expect(engine).toBeDefined()
    engine.destroy()
  })

  it('rejects invalid options', () => {
    expect(() => new TrajectoryEngine({ predictionWindow: 5 })).toThrow()
  })
})

describe('TrajectoryEngine registration', () => {
  it('registers and unregisters elements', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')

    engine.register('test', el, makeConfig())
    expect(engine.getSnapshot('test')).toBeUndefined()

    engine.unregister('test')
    expect(engine.getSnapshot('test')).toBeUndefined()
    engine.destroy()
  })

  it('re-register with same id updates config', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    engine.register('test', el, makeConfig({ whenTriggered: cb1 }))
    engine.register('test', el, makeConfig({ whenTriggered: cb2 }))

    engine.destroy()
  })

  it('unregistering unknown id is a no-op', () => {
    const engine = new TrajectoryEngine()
    expect(() => engine.unregister('nonexistent')).not.toThrow()
    engine.destroy()
  })
})

describe('TrajectoryEngine subscriptions', () => {
  it('subscribe returns unsubscribe function', () => {
    const engine = new TrajectoryEngine()
    const cb = vi.fn()
    const unsubscribe = engine.subscribe(cb)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    engine.destroy()
  })

  it('subscribeToElement returns factory function', () => {
    const engine = new TrajectoryEngine()
    const factory = engine.subscribeToElement('test')
    expect(typeof factory).toBe('function')
    const unsubscribe = factory(() => {})
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    engine.destroy()
  })

  it('getAllSnapshots returns empty map initially', () => {
    const engine = new TrajectoryEngine()
    const snapshots = engine.getAllSnapshots()
    expect(snapshots.size).toBe(0)
    engine.destroy()
  })
})

describe('TrajectoryEngine imperative trigger', () => {
  it('fires whenTriggered callback', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb = vi.fn()
    engine.register('test', el, makeConfig({
      whenTriggered: cb,
      profile: { type: 'on_enter' },
    }))

    engine.trigger('test')
    expect(cb).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('respects once profile — does not re-fire', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb = vi.fn()
    engine.register('test', el, makeConfig({
      whenTriggered: cb,
      profile: { type: 'once' },
    }))

    engine.trigger('test')
    engine.trigger('test')
    expect(cb).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('dangerouslyIgnoreProfile bypasses once', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb = vi.fn()
    engine.register('test', el, makeConfig({
      whenTriggered: cb,
      profile: { type: 'once' },
    }))

    engine.trigger('test')
    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(cb).toHaveBeenCalledTimes(2)
    engine.destroy()
  })

  it('throws on unknown element id', () => {
    const engine = new TrajectoryEngine()
    expect(() => engine.trigger('nonexistent')).toThrow()
    engine.destroy()
  })
})

describe('TrajectoryEngine connect/disconnect', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connect adds event listener', () => {
    const engine = new TrajectoryEngine()
    const addSpy = vi.spyOn(document, 'addEventListener')
    engine.connect()
    expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function))
    engine.disconnect()
    engine.destroy()
  })

  it('disconnect removes event listener', () => {
    const engine = new TrajectoryEngine()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    engine.connect()
    engine.disconnect()
    expect(removeSpy).toHaveBeenCalled()
    engine.destroy()
  })

  it('destroy fully tears down without throwing', () => {
    const engine = new TrajectoryEngine()
    engine.connect()
    engine.destroy()
    expect(() => engine.destroy()).not.toThrow()
  })

  it('double connect does not add duplicate listeners', () => {
    const engine = new TrajectoryEngine()
    const addSpy = vi.spyOn(document, 'addEventListener')
    engine.connect()
    engine.connect()
    const pointerMoveCallCount = addSpy.mock.calls.filter(
      (call) => call[0] === 'pointermove'
    ).length
    expect(pointerMoveCallCount).toBe(1)
    engine.disconnect()
    engine.destroy()
  })
})

describe('TrajectoryEngine convenience config', () => {
  it('expands whenApproaching to full config', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    const cb = vi.fn()

    engine.register('test', el, {
      whenApproaching: cb,
      tolerance: 20,
    } as unknown as ElementConfig)

    engine.trigger('test')
    expect(cb).toHaveBeenCalledOnce()
    engine.destroy()
  })
})

function mockRect(el: HTMLElement): void {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 100, bottom: 100,
    width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
  })
}

function mockRectAt(
  el: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
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

describe('TrajectoryEngine hover priority and tolerance zones', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives instant full confidence for stationary cursor over element', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig())
    engine.connect()

    target.dispatchEvent(makePointerEvent(120, 120, 1000))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.confidence).toBe(1)

    engine.destroy()
  })

  it('gives instant full confidence for slow cursor over element', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig())
    engine.connect()

    target.dispatchEvent(makePointerEvent(120, 120, 1000))
    vi.advanceTimersByTime(17)
    target.dispatchEvent(makePointerEvent(140, 120, 2000))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.velocity.magnitude).toBeLessThan(50)
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.confidence).toBe(1)

    engine.destroy()
  })

  it('applies normal ramp when cursor is inside but moving fast', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig())
    engine.connect()

    target.dispatchEvent(makePointerEvent(80, 120, 1000))
    vi.advanceTimersByTime(17)
    target.dispatchEvent(makePointerEvent(120, 120, 1100))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.velocity.magnitude).toBeGreaterThan(50)
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.confidence).toBeGreaterThan(0)
    expect(snap!.confidence).toBeLessThan(1)

    engine.destroy()
  })

  it('keeps normal trajectory ramping when cursor is outside raw element', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig())
    engine.connect()

    target.dispatchEvent(makePointerEvent(0, 120, 1000))
    vi.advanceTimersByTime(17)
    target.dispatchEvent(makePointerEvent(50, 120, 1100))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.distancePx).toBeGreaterThan(0)
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.confidence).toBeGreaterThan(0)
    expect(snap!.confidence).toBeLessThan(1)

    engine.destroy()
  })

  it('measures distance to raw bounding box even with expanded tolerance', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig({ tolerance: 30 }))
    engine.connect()

    target.dispatchEvent(makePointerEvent(80, 120, 1000))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.distancePx).toBe(20)

    engine.destroy()
  })

  it('keeps backwards-compatible behavior for numeric tolerance', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig({ tolerance: 30 }))
    engine.connect()

    target.dispatchEvent(makePointerEvent(80, 120, 1000))
    vi.advanceTimersByTime(17)
    target.dispatchEvent(makePointerEvent(80, 120, 1016.67))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.isIntersecting).toBe(true)
    expect(snap!.confidence).toBeGreaterThan(0)

    engine.destroy()
  })

  it('caps confidence at outer zone factor when only outer zone matches', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig({
      tolerance: [
        { distance: 20, factor: 0.7 },
        { distance: 50, factor: 0.3 },
      ],
    }))
    engine.connect()

    for (let i = 0; i < 12; i++) {
      target.dispatchEvent(makePointerEvent(60, 120, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.distancePx).toBe(40)
    expect(snap!.confidence).toBe(0.3)

    engine.destroy()
  })

  it('caps confidence at inner zone factor when inner zone matches', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig({
      tolerance: [
        { distance: 20, factor: 0.7 },
        { distance: 50, factor: 0.3 },
      ],
    }))
    engine.connect()

    for (let i = 0; i < 12; i++) {
      target.dispatchEvent(makePointerEvent(85, 120, 1000 + i * 16.67))
      vi.advanceTimersByTime(17)
    }

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.distancePx).toBe(15)
    expect(snap!.confidence).toBeLessThanOrEqual(0.7)
    expect(snap!.confidence).toBeGreaterThan(0)

    engine.destroy()
  })

  it('keeps confidence at 1.0 inside raw element regardless of zone factors', () => {
    const target = new EventTarget()
    const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })
    const el = document.createElement('div')

    mockRectAt(el, { left: 100, top: 100, width: 100, height: 100 })
    engine.register('box', el, makeConfig({
      tolerance: [
        { distance: 20, factor: 0.1 },
        { distance: 50, factor: 0.2 },
      ],
    }))
    engine.connect()

    target.dispatchEvent(makePointerEvent(120, 120, 1000))
    vi.advanceTimersByTime(17)

    const snap = engine.getSnapshot('box')
    expect(snap).toBeDefined()
    expect(snap!.distancePx).toBe(0)
    expect(snap!.confidence).toBe(1)

    engine.destroy()
  })
})

describe('resolveIdFromEventTarget', () => {
  it('resolves a registered element', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    mockRect(el)
    engine.register('btn', el, makeConfig())
    expect(engine.resolveIdFromEventTarget(el)).toBe('btn')
  })

  it('resolves a child element inside a registered element', () => {
    const engine = new TrajectoryEngine()
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    mockRect(parent)
    engine.register('link', parent, makeConfig())
    expect(engine.resolveIdFromEventTarget(child)).toBe('link')
  })

  it('returns null for unregistered elements', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    expect(engine.resolveIdFromEventTarget(el)).toBeNull()
  })

  it('returns null for null target', () => {
    const engine = new TrajectoryEngine()
    expect(engine.resolveIdFromEventTarget(null)).toBeNull()
  })

  it('updates mapping when element is re-registered', () => {
    const engine = new TrajectoryEngine()
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    mockRect(el1)
    mockRect(el2)
    engine.register('btn', el1, makeConfig())
    engine.register('btn', el2, makeConfig())
    expect(engine.resolveIdFromEventTarget(el2)).toBe('btn')
    expect(engine.resolveIdFromEventTarget(el1)).toBeNull()
  })

  it('clears mapping on unregister', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    mockRect(el)
    engine.register('btn', el, makeConfig())
    engine.unregister('btn')
    expect(engine.resolveIdFromEventTarget(el)).toBeNull()
  })
})

describe('getElementById', () => {
  it('returns registered element', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    mockRect(el)
    engine.register('btn', el, makeConfig())
    expect(engine.getElementById('btn')).toBe(el)
  })

  it('returns null for unregistered id', () => {
    const engine = new TrajectoryEngine()
    expect(engine.getElementById('nonexistent')).toBeNull()
  })
})

describe('dev events', () => {
  it('onDev subscribes to dev events', () => {
    const engine = new TrajectoryEngine()
    const listener = vi.fn()
    const unsub = engine.onDev('prediction:fired', listener)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('emits prediction:fired when callback fires via trigger()', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    const whenTriggered = vi.fn()
    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered,
      profile: { type: 'on_enter' },
    })

    const firedListener = vi.fn()
    const callbackStartListener = vi.fn()
    const callbackEndListener = vi.fn()
    engine.onDev('prediction:fired', firedListener)
    engine.onDev('prediction:callback-start', callbackStartListener)
    engine.onDev('prediction:callback-end', callbackEndListener)

    engine.trigger('btn')

    expect(firedListener).toHaveBeenCalledOnce()
    expect(firedListener).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: 'btn' })
    )
    expect(callbackStartListener).toHaveBeenCalledOnce()
    expect(callbackEndListener).toHaveBeenCalledOnce()
    expect(callbackEndListener).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: 'btn', status: 'success' })
    )
  })

  it('does not emit events when no listeners attached', () => {
    const engine = new TrajectoryEngine()
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })

    const whenTriggered = vi.fn()
    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered,
      profile: { type: 'on_enter' },
    })

    expect(() => engine.trigger('btn')).not.toThrow()
    expect(whenTriggered).toHaveBeenCalledOnce()
  })
})
