import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TrajectoryProvider } from './context/TrajectoryContext.js'
import { Sidebar } from './components/Sidebar.js'
import { SettingsPanel } from './components/SettingsPanel.js'
import { DebugOverlay } from './components/DebugOverlay.js'
import { Dashboard } from './pages/Dashboard.js'
import { Orders } from './pages/Orders.js'
import { Onboarding } from './pages/Onboarding.js'

export function App() {
  return (
    <BrowserRouter>
      <TrajectoryProvider>
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
      </TrajectoryProvider>
    </BrowserRouter>
  )
}
