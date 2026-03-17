import { createContext, useContext, type ReactNode } from 'react'
import { useTrajectory } from 'anticipated/react'
import type { RegisterConfig, TrajectorySnapshot, TriggerOptions } from 'anticipated/core'
import type { RefCallback } from 'react'
import { useDemoStore, type DemoSettings } from '../lib/demoStore.js'

type TrajectoryContextType = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  trigger: (id: string, options?: TriggerOptions) => void
}

const TrajectoryContext = createContext<TrajectoryContextType | null>(null)

function TrajectoryProviderInner({ settings, children }: { settings: DemoSettings; children: ReactNode }) {
  const trajectory = useTrajectory({
    predictionWindow: settings.predictionWindow,
    smoothingFactor: settings.smoothingFactor,
    confidenceSaturationFrames: settings.confidenceSaturationFrames,
    confidenceDecayRate: settings.confidenceDecayRate,
    confidenceThreshold: settings.confidenceThreshold,
    minVelocityThreshold: settings.minVelocityThreshold,
    decelerationWindowFloor: settings.decelerationWindowFloor,
    decelerationDampening: settings.decelerationDampening,
  })

  return (
    <TrajectoryContext.Provider value={trajectory}>
      {children}
    </TrajectoryContext.Provider>
  )
}

export function TrajectoryProvider({ children }: { children: ReactNode }) {
  const settings = useDemoStore()
  const engineKey = [
    settings.predictionWindow,
    settings.smoothingFactor,
    settings.confidenceSaturationFrames,
    settings.confidenceDecayRate,
    settings.confidenceThreshold,
    settings.minVelocityThreshold,
    settings.decelerationWindowFloor,
    settings.decelerationDampening,
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
