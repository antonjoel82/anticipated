import { useState, useSyncExternalStore } from 'react'
import type { AnticipatedProfiler } from '../profiler.js'
import { DevtoolsToggle } from './DevtoolsToggle.js'
import { DevtoolsPanel } from './DevtoolsPanel.js'

type AnticipatedDevtoolsProps = {
  profiler: AnticipatedProfiler
  initialIsOpen?: boolean
  dock?: 'bottom' | 'right' | 'floating'
}

export function AnticipatedDevtools({ profiler, initialIsOpen = false }: AnticipatedDevtoolsProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen)

  const snapshot = useSyncExternalStore(
    (cb) => profiler.subscribe(cb),
    () => profiler.getSnapshot(),
  )

  return (
    <>
      <DevtoolsToggle onClick={() => setIsOpen(!isOpen)} isOpen={isOpen} />
      {isOpen && <DevtoolsPanel snapshot={snapshot} profiler={profiler} />}
    </>
  )
}
