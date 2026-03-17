import { useRef, useCallback, useEffect, useSyncExternalStore } from 'react'
import type { RefCallback } from 'react'
import { TrajectoryEngine } from '../core/engine.js'
import type {
  EngineOptions,
  RegisterConfig,
  TrajectorySnapshot,
  TriggerOptions,
} from '../core/types.js'

type SubscribeFn = (callback: () => void) => () => void

type UseTrajectoryReturn = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  trigger: (id: string, options?: TriggerOptions) => void
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
}

export function useTrajectory(options?: EngineOptions): UseTrajectoryReturn {
  const engineRef = useRef<TrajectoryEngine | null>(null)
  const configsRef = useRef<Map<string, RegisterConfig>>(new Map())
  const subscribeCache = useRef<Map<string, SubscribeFn>>(new Map())
  const refCallbackCache = useRef<Map<string, RefCallback<HTMLElement>>>(new Map())
  const elementCache = useRef<Map<string, HTMLElement>>(new Map())

  if (typeof window !== 'undefined' && !engineRef.current) {
    engineRef.current = new TrajectoryEngine(options)
  }

  useEffect(() => {
    const engine: TrajectoryEngine | null = engineRef.current
    if (!engine) return
    engine.connect()
    return () => engine.destroy()
  }, [])

  const register = useCallback((
    id: string,
    config: RegisterConfig,
  ): RefCallback<HTMLElement> => {
    configsRef.current.set(id, config)

    const existingElement: HTMLElement | undefined = elementCache.current.get(id)
    if (existingElement && engineRef.current) {
      engineRef.current.register(id, existingElement, config)
    }

    let cachedCallback: RefCallback<HTMLElement> | undefined = refCallbackCache.current.get(id)
    if (cachedCallback) return cachedCallback

    cachedCallback = (element: HTMLElement | null) => {
      const engine: TrajectoryEngine | null = engineRef.current
      if (!engine) return
      if (element) {
        elementCache.current.set(id, element)
        const latestConfig: RegisterConfig | undefined = configsRef.current.get(id)
        if (!latestConfig) return
        engine.register(id, element, latestConfig)
      } else {
        elementCache.current.delete(id)
        subscribeCache.current.delete(id)
        refCallbackCache.current.delete(id)
      }
    }
    refCallbackCache.current.set(id, cachedCallback)
    return cachedCallback
  }, [])

  const trigger = useCallback((id: string, triggerOptions?: TriggerOptions) => {
    engineRef.current?.trigger(id, triggerOptions)
  }, [])

  const getSnapshot = useCallback((id: string): TrajectorySnapshot | undefined => {
    return engineRef.current?.getSnapshot(id)
  }, [])

  const useSnapshot = (id: string): TrajectorySnapshot | undefined => {
    let cachedSubscribe: SubscribeFn | undefined = subscribeCache.current.get(id)
    if (!cachedSubscribe) {
      cachedSubscribe = engineRef.current?.subscribeToElement(id) ?? noopSubscribe
      subscribeCache.current.set(id, cachedSubscribe)
    }

    return useSyncExternalStore(
      cachedSubscribe,
      () => engineRef.current?.getSnapshot(id),
      () => undefined,
    )
  }

  return { register, trigger, getSnapshot, useSnapshot }
}

function noopSubscribe(_callback: () => void): () => void {
  return () => {}
}
