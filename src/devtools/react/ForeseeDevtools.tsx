import { useState, useSyncExternalStore } from 'react'
import type { ForeseeProfiler } from '../profiler.js'
import { DevtoolsToggle } from './DevtoolsToggle.js'
import { DevtoolsPanel } from './DevtoolsPanel.js'

type ForeseeDevtoolsProps = {
  profiler: ForeseeProfiler
  initialIsOpen?: boolean
  dock?: 'bottom' | 'right' | 'floating'
}

export function ForeseeDevtools({ profiler, initialIsOpen = false }: ForeseeDevtoolsProps) {
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
