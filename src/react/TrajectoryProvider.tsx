import { createContext, useContext, type ReactNode } from 'react'
import { useAnticipated } from './useAnticipated.js'
import type {
  EngineOptions,
  RegisterConfig,
  TrajectorySnapshot,
  TriggerOptions,
  NormalizedZone,
} from '../core/types.js'
import type { TrajectoryEngine } from '../core/engine.js'
import type { RefCallback } from 'react'

type SharedAnticipatedContextType = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  getElementZones: (id: string) => ReadonlyArray<NormalizedZone> | undefined
  trigger: (id: string, options?: TriggerOptions) => void
  engine: TrajectoryEngine | null
}

const SharedAnticipatedContext = createContext<SharedAnticipatedContextType | null>(null)

type TrajectoryProviderProps = {
  children: ReactNode
  options?: EngineOptions
}

export function TrajectoryProvider({ children, options }: TrajectoryProviderProps) {
  const anticipated = useAnticipated(options)

  return (
    <SharedAnticipatedContext.Provider value={anticipated}>
      {children}
    </SharedAnticipatedContext.Provider>
  )
}

export function useSharedAnticipated(): SharedAnticipatedContextType {
  const ctx = useContext(SharedAnticipatedContext)
  if (!ctx) {
    throw new Error('useSharedAnticipated must be used within TrajectoryProvider')
  }
  return ctx
}
