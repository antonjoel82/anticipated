import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnticipatedDevtools } from 'anticipated/devtools/react'
import { TrajectoryProvider, useSharedTrajectory } from './context/TrajectoryContext.js'
import { Sidebar } from './components/Sidebar.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { DebugOverlay } from './components/DebugOverlay.js'
import { MetricsBar } from './components/MetricsBar.js'
import { Dashboard } from './pages/Dashboard.js'
import { Orders } from './pages/Orders.js'
import { Onboarding } from './pages/Onboarding.js'

function DevtoolsWrapper() {
  const { profiler } = useSharedTrajectory()
  if (!profiler) return null
  return <AnticipatedDevtools profiler={profiler} />
}

export function App() {
  return (
    <BrowserRouter basename="/anticipated">
      <TrajectoryProvider>
        <MetricsBar />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/onboarding" element={<Onboarding />} />
            </Routes>
          </main>
        </div>
        <DebugOverlay />
        <SettingsPanel />
        <DevtoolsWrapper />
      </TrajectoryProvider>
    </BrowserRouter>
  )
}
