import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAnticipated } from 'anticipated/react'
import { AnticipatedProfiler } from 'anticipated/devtools'
import type { RegisterConfig, TrajectorySnapshot, TriggerOptions, NormalizedZone } from 'anticipated/core'
import type { TrajectoryEngine } from 'anticipated/core'
import type { RefCallback } from 'react'
import { useDemoStore, type DemoSettings } from '../lib/demoStore.js'

type TrajectoryContextType = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  getElementZones: (id: string) => ReadonlyArray<NormalizedZone> | undefined
  trigger: (id: string, options?: TriggerOptions) => void
  engine: TrajectoryEngine | null
  profiler: AnticipatedProfiler | null
}

const TrajectoryContext = createContext<TrajectoryContextType | null>(null)

function TrajectoryProviderInner({ settings, children }: { settings: DemoSettings; children: ReactNode }) {
  const trajectory = useAnticipated({
    predictionWindow: settings.predictionWindow,
    smoothingFactor: settings.smoothingFactor,
    confidenceThreshold: settings.confidenceThreshold,
    minVelocityThreshold: settings.minVelocityThreshold,
    decelerationWindowFloor: settings.decelerationWindowFloor,
    decelerationDampening: settings.decelerationDampening,
    features: settings.features,
    factorWeights: settings.factorWeights,
  })

  const profilerRef = useRef<AnticipatedProfiler | null>(null)
  if (trajectory.engine && !profilerRef.current) {
    profilerRef.current = new AnticipatedProfiler(trajectory.engine)
  }

  useEffect(() => {
    return () => {
      profilerRef.current?.destroy()
      profilerRef.current = null
    }
  }, [])

  const contextValue: TrajectoryContextType = {
    ...trajectory,
    profiler: profilerRef.current,
  }

  return (
    <TrajectoryContext.Provider value={contextValue}>
      {children}
    </TrajectoryContext.Provider>
  )
}

export function TrajectoryProvider({ children }: { children: ReactNode }) {
  const settings = useDemoStore()
  const engineKey = [
    settings.predictionWindow,
    settings.smoothingFactor,
    settings.confidenceThreshold,
    settings.minVelocityThreshold,
    settings.decelerationWindowFloor,
    settings.decelerationDampening,
    JSON.stringify(settings.features),
    JSON.stringify(settings.factorWeights),
  ].join('-')

  return (
    <TrajectoryProviderInner key={engineKey} settings={settings}>
      {children}
    </TrajectoryProviderInner>
  )
}

export function useSharedTrajectory(): TrajectoryContextType {
  const ctx = useContext(TrajectoryContext)
  if (!ctx) throw new Error('useSharedTrajectory must be used within TrajectoryProvider')
  return ctx
}
