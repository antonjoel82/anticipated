import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrajectoryEngine } from './engine.js'

function createEngine(overrides = {}) {
  return new TrajectoryEngine({
    confidenceThreshold: 0.3,
    cancelThreshold: 0.15,
    ...overrides,
  })
}

function makeElement(id = 'test'): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ left: 50, top: 50, right: 150, bottom: 150, width: 100, height: 100, x: 50, y: 50, toJSON: () => ({}) })
  return el
}

describe('cancellation system', () => {
  let engine: TrajectoryEngine

  beforeEach(() => {
    engine = createEngine()
  })

  afterEach(() => {
    engine.destroy()
  })

  it('passes AbortSignal to whenTriggered', () => {
    let receivedSignal: AbortSignal | null = null
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { receivedSignal = signal },
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(receivedSignal!.aborted).toBe(false)
  })

  it('aborts signal when confidence drops below cancelThreshold', () => {
    let receivedSignal: AbortSignal | null = null
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: (snap) => ({ isTriggered: snap.confidence > 0.3 }),
      whenTriggered: (signal) => { receivedSignal = signal },
      profile: { type: 'on_enter' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(receivedSignal).not.toBeNull()
    expect(receivedSignal!.aborted).toBe(false)

    engine.destroy()
    expect(receivedSignal!.aborted).toBe(true)
  })

  it('calls cleanup function returned by whenTriggered', () => {
    const cleanup = vi.fn()
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: () => cleanup,
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })
    expect(cleanup).not.toHaveBeenCalled()

    engine.destroy()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('aborts all active triggers on destroy', () => {
    const signals: AbortSignal[] = []
    const cleanups = [vi.fn(), vi.fn()]

    const el1 = makeElement('a')
    const el2 = makeElement('b')

    engine.register('a', el1, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { signals.push(signal); return cleanups[0] },
      profile: { type: 'once' },
    })
    engine.register('b', el2, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: (signal) => { signals.push(signal); return cleanups[1] },
      profile: { type: 'once' },
    })

    engine.trigger('a', { dangerouslyIgnoreProfile: true })
    engine.trigger('b', { dangerouslyIgnoreProfile: true })

    engine.destroy()
    expect(signals).toHaveLength(2)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(true)
    expect(cleanups[0]).toHaveBeenCalledOnce()
    expect(cleanups[1]).toHaveBeenCalledOnce()
  })

  it('handles async whenTriggered that returns cleanup after delay', async () => {
    const cleanup = vi.fn()
    const el = makeElement()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: async (_signal) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return cleanup
      },
      profile: { type: 'once' },
    })

    engine.trigger('test', { dangerouslyIgnoreProfile: true })

    engine.destroy()

    await new Promise(resolve => setTimeout(resolve, 20))

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('emits prediction:cancelled dev event on cancel', () => {
    const el = makeElement()
    const cancelled = vi.fn()

    engine.register('test', el, {
      triggerOn: () => ({ isTriggered: true }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    engine.onDev('prediction:cancelled', cancelled)
    engine.trigger('test', { dangerouslyIgnoreProfile: true })

    expect(cancelled).not.toHaveBeenCalled()

    engine.destroy()

    expect(cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: 'test' })
    )
  })
})
