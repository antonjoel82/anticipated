import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TrajectoryProvider, useSharedAnticipated } from './TrajectoryProvider.js'

function wrapper({ children }: { children: ReactNode }) {
  return <TrajectoryProvider>{children}</TrajectoryProvider>
}

describe('TrajectoryProvider', () => {
  it('provides register, useSnapshot, getSnapshot, trigger, engine via context', () => {
    const { result } = renderHook(() => useSharedAnticipated(), { wrapper })
    expect(result.current.register).toBeTypeOf('function')
    expect(result.current.useSnapshot).toBeTypeOf('function')
    expect(result.current.getSnapshot).toBeTypeOf('function')
    expect(result.current.trigger).toBeTypeOf('function')
    expect(result.current.engine).toBeTruthy()
  })

  it('throws when useSharedAnticipated is used outside provider', () => {
    expect(() => {
      renderHook(() => useSharedAnticipated())
    }).toThrow('useSharedAnticipated must be used within TrajectoryProvider')
  })

  it('accepts engine options via props', () => {
    function optionsWrapper({ children }: { children: ReactNode }) {
      return (
        <TrajectoryProvider options={{ predictionWindow: 200 }}>
          {children}
        </TrajectoryProvider>
      )
    }
    const { result } = renderHook(() => useSharedAnticipated(), { wrapper: optionsWrapper })
    expect(result.current.engine).toBeTruthy()
  })
})
