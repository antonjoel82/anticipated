import { useState } from 'react'
import { useDemoStore, updateSettings, resetPreloadCount } from '../lib/demoStore.js'
import { clearCache } from '../lib/cache.js'

function EngineSlider({ label, value, unit, min, max, step, field }: {
  label: string
  value: number
  unit?: string
  min: number
  max: number
  step: number
  field: string
}) {
  const display = step < 1 ? value.toFixed(2) : String(value)
  return (
    <div className="settings-row column">
      <div className="settings-row-header">
        <span className="settings-label">
          {label} <span className="mono settings-value">{display}{unit ?? ''}</span>
        </span>
      </div>
      <input
        type="range"
        className="range-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          updateSettings({ [field]: Number(e.target.value) })
          clearCache()
          resetPreloadCount()
        }}
      />
    </div>
  )
}

export function SettingsPanel() {
  const settings = useDemoStore()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleToggleForesee = () => {
    updateSettings({ isAnticipatedEnabled: !settings.isAnticipatedEnabled })
    clearCache()
    resetPreloadCount()
  }

  const handleLatencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const latencyMs: number = Number(e.target.value)
    updateSettings({ latencyMs })
    clearCache()
  }

  const handleTogglePredictions = () => {
    updateSettings({ isShowingPredictions: !settings.isShowingPredictions })
  }

  const handleReset = () => {
    clearCache()
    resetPreloadCount()
  }

  return (
    <div className={`settings-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <button className="settings-toggle-btn" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span className="settings-toggle-icon">{isCollapsed ? '\u2699' : '\u2715'}</span>
        {isCollapsed && <span className="settings-toggle-label">Settings</span>}
      </button>

      {!isCollapsed && (
        <div className="settings-body">
          <div className="settings-header">
            <h3>Demo Settings</h3>
          </div>

          <div className="settings-row">
            <span className="settings-label">Anticipated</span>
            <button
              className={`toggle-switch ${settings.isAnticipatedEnabled ? 'on' : 'off'}`}
              onClick={handleToggleForesee}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.isAnticipatedEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row column">
            <div className="settings-row-header">
              <span className="settings-label">
                Latency <span className="mono settings-value">{settings.latencyMs}ms</span>
              </span>
            </div>
            <input
              type="range"
              className="range-slider"
              min={50}
              max={3000}
              step={50}
              value={settings.latencyMs}
              onChange={handleLatencyChange}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Show Predictions</span>
            <button
              className={`toggle-switch ${settings.isShowingPredictions ? 'on' : 'off'}`}
              onClick={handleTogglePredictions}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.isShowingPredictions ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Show Radii</span>
            <button
              className={`toggle-switch ${settings.isShowingRadii ? 'on' : 'off'}`}
              onClick={() => updateSettings({ isShowingRadii: !settings.isShowingRadii })}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.isShowingRadii ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Show Ray</span>
            <button
              className={`toggle-switch ${settings.isShowingRays ? 'on' : 'off'}`}
              onClick={() => updateSettings({ isShowingRays: !settings.isShowingRays })}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.isShowingRays ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-divider" />

          <div className="settings-row">
            <span className="settings-label">Preloads fired</span>
            <span className="preload-counter mono">{settings.preloadCount}</span>
          </div>

          <button className="settings-reset-btn" onClick={handleReset}>
            Clear Cache &amp; Reset
          </button>

          <div className="settings-divider" />
          <div className="settings-section-label">Engine Tuning</div>

          <EngineSlider label="Prediction Window" value={settings.predictionWindow} unit="ms" min={50} max={500} step={10} field="predictionWindow" />
          <EngineSlider label="Smoothing Factor" value={settings.smoothingFactor} min={0.05} max={1} step={0.05} field="smoothingFactor" />
          <EngineSlider label="Confidence Frames" value={settings.confidenceSaturationFrames} min={1} max={30} step={1} field="confidenceSaturationFrames" />
          <EngineSlider label="Confidence Decay" value={settings.confidenceDecayRate} min={0} max={2} step={0.1} field="confidenceDecayRate" />
          <EngineSlider label="Confidence Threshold" value={settings.confidenceThreshold} min={0.1} max={1} step={0.05} field="confidenceThreshold" />
          <EngineSlider label="Min Velocity" value={settings.minVelocityThreshold} unit="px/s" min={0} max={50} step={1} field="minVelocityThreshold" />
          <EngineSlider label="Decel Floor" value={settings.decelerationWindowFloor} min={0.1} max={1} step={0.05} field="decelerationWindowFloor" />
          <EngineSlider label="Decel Dampening" value={settings.decelerationDampening} min={0} max={2} step={0.1} field="decelerationDampening" />
        </div>
      )}
    </div>
  )
}
