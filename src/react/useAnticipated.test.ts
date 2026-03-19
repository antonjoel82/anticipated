import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAnticipated } from './useAnticipated.js'
import { TrajectoryEngine } from '../core/engine.js'

describe('useAnticipated', () => {
  it('returns register, useSnapshot, getSnapshot, and trigger', () => {
    const { result } = renderHook(() => useAnticipated())
    expect(result.current.register).toBeDefined()
    expect(result.current.useSnapshot).toBeDefined()
    expect(result.current.getSnapshot).toBeDefined()
    expect(result.current.trigger).toBeDefined()
  })

  it('register returns a ref callback function', () => {
    const { result } = renderHook(() => useAnticipated())
    const ref = result.current.register('test', {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })
    expect(typeof ref).toBe('function')
  })

  it('getSnapshot returns undefined for unregistered element', () => {
    const { result } = renderHook(() => useAnticipated())
    expect(result.current.getSnapshot('nonexistent')).toBeUndefined()
  })

  it('is SSR safe — does not crash without DOM interactions', () => {
    const { result } = renderHook(() => useAnticipated())
    expect(result.current).toBeDefined()
  })

  it('accepts engine options', () => {
    const { result } = renderHook(() => useAnticipated({ predictionWindow: 200 }))
    expect(result.current).toBeDefined()
  })

  it('register with convenience config (whenApproaching)', () => {
    const { result } = renderHook(() => useAnticipated())
    const ref = result.current.register('test', {
      whenApproaching: () => {},
      tolerance: 20,
    })
    expect(typeof ref).toBe('function')
  })

  it('exposes engine instance', () => {
    const { result } = renderHook(() => useAnticipated())
    expect(result.current.engine).toBeInstanceOf(TrajectoryEngine)
  })

  it('ref callback handles null (cleanup)', () => {
    const { result } = renderHook(() => useAnticipated())
    const ref = result.current.register('test', {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'once' },
    })

    const el = document.createElement('div')
    ref(el)
    ref(null)
    expect(result.current.getSnapshot('test')).toBeUndefined()
  })
})
