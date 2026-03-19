import { useState } from 'react'
import { useDemoStore, updateSettings, resetPreloadCount, getSettings, DEFAULT_FACTOR_WEIGHTS, DEFAULT_FEATURES } from '../lib/demoStore.js'
import type { FactorWeightsSettings, FeatureFlagsSettings } from '../lib/demoStore.js'
import { clearCache } from '../lib/cache.js'
import { presets } from 'anticipated/core'

type PresetName = keyof typeof presets

const PRESET_OPTIONS: Array<{ value: PresetName; label: string; description: string }> = [
  { value: 'default', label: 'Default', description: 'Balanced defaults' },
  { value: 'hoverOnly', label: 'Hover Only', description: 'No ray casting — proximity only' },
  { value: 'denseGrid', label: 'Dense Grid', description: 'Tight spacing, fast response' },
  { value: 'dashboard', label: 'Dashboard', description: 'Large targets, proximity bias' },
  { value: 'navigation', label: 'Navigation', description: 'Compact menus, tight tolerance' },
]

const FACTOR_WEIGHT_KEYS: Record<string, keyof FactorWeightsSettings> = {
  '__fw_ta': 'trajectoryAlignment',
  '__fw_d': 'distance',
  '__fw_dc': 'deceleration',
  '__fw_e': 'erratic',
}

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
          const v = Number(e.target.value)
          const fwKey = FACTOR_WEIGHT_KEYS[field]
          if (fwKey) {
            const current = getSettings()
            updateSettings({
              factorWeights: { ...current.factorWeights, [fwKey]: v },
              activePreset: 'default',
            })
          } else {
            updateSettings({ [field]: v })
          }
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

  const handleToggleAnticipated = () => {
    updateSettings({ isAnticipatedEnabled: !settings.isAnticipatedEnabled })
    clearCache()
    resetPreloadCount()
  }

  const handlePresetChange = (presetName: PresetName) => {
    const preset = presets[presetName]
    const patch: Record<string, unknown> = { activePreset: presetName }

    if ('predictionWindow' in preset && preset.predictionWindow !== undefined) patch.predictionWindow = preset.predictionWindow
    if ('smoothingFactor' in preset && preset.smoothingFactor !== undefined) patch.smoothingFactor = preset.smoothingFactor
    if ('minVelocityThreshold' in preset && preset.minVelocityThreshold !== undefined) patch.minVelocityThreshold = preset.minVelocityThreshold

    if ('features' in preset && preset.features) {
      patch.features = { ...DEFAULT_FEATURES, ...preset.features }
    } else if (presetName === 'default') {
      patch.features = { ...DEFAULT_FEATURES }
    }

    if ('factorWeights' in preset && preset.factorWeights) {
      patch.factorWeights = { ...DEFAULT_FACTOR_WEIGHTS, ...preset.factorWeights }
    } else if (presetName === 'default') {
      patch.factorWeights = { ...DEFAULT_FACTOR_WEIGHTS }
    }

    updateSettings(patch)
    clearCache()
    resetPreloadCount()
  }

  const handleFactorWeightChange = (key: keyof FactorWeightsSettings, value: number) => {
    updateSettings({
      factorWeights: { ...settings.factorWeights, [key]: value },
      activePreset: 'default',
    })
  }

  const handleFeatureToggle = (key: keyof FeatureFlagsSettings) => {
    updateSettings({
      features: { ...settings.features, [key]: !settings.features[key] },
      activePreset: 'default',
    })
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
      {isCollapsed && (
        <button className="settings-toggle-btn" onClick={() => setIsCollapsed(false)}>
          <span className="settings-toggle-icon">{'\u2699'}</span>
          <span className="settings-toggle-label">Settings</span>
        </button>
      )}

      {!isCollapsed && (
        <div className="settings-body">
          <div className="settings-header">
            <h3>Demo Settings</h3>
            <button className="settings-close-btn" onClick={() => setIsCollapsed(true)} aria-label="Close settings">
              {'\u2715'}
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Anticipated</span>
            <button
              className={`toggle-switch ${settings.isAnticipatedEnabled ? 'on' : 'off'}`}
              onClick={handleToggleAnticipated}
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

          <div className="settings-row">
            <span className="settings-label">Inspector</span>
            <button
              className={`toggle-switch ${settings.isShowingInspector ? 'on' : 'off'}`}
              onClick={() => updateSettings({ isShowingInspector: !settings.isShowingInspector })}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.isShowingInspector ? 'ON' : 'OFF'}</span>
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
          <div className="settings-section-label">Presets</div>

          <div className="settings-row column">
            <select
              className="form-input"
              value={settings.activePreset}
              onChange={(e) => handlePresetChange(e.target.value as PresetName)}
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-divider" />
          <div className="settings-section-label">Engine Tuning</div>

          <EngineSlider label="Prediction Window" value={settings.predictionWindow} unit="ms" min={50} max={500} step={10} field="predictionWindow" />
          <EngineSlider label="Smoothing Factor" value={settings.smoothingFactor} min={0.05} max={1} step={0.05} field="smoothingFactor" />
          <EngineSlider label="Confidence Threshold" value={settings.confidenceThreshold} min={0.1} max={1} step={0.05} field="confidenceThreshold" />
          <EngineSlider label="Min Velocity" value={settings.minVelocityThreshold} unit="px/s" min={0} max={50} step={1} field="minVelocityThreshold" />
          <EngineSlider label="Decel Floor" value={settings.decelerationWindowFloor} min={0.1} max={1} step={0.05} field="decelerationWindowFloor" />
          <EngineSlider label="Decel Dampening" value={settings.decelerationDampening} min={0} max={2} step={0.1} field="decelerationDampening" />

          <div className="settings-divider" />
          <div className="settings-section-label">Factor Weights</div>

          <EngineSlider label="Trajectory Align" value={settings.factorWeights.trajectoryAlignment} min={0} max={2} step={0.1} field="__fw_ta" />
          <EngineSlider label="Distance" value={settings.factorWeights.distance} min={0} max={2} step={0.1} field="__fw_d" />
          <EngineSlider label="Deceleration" value={settings.factorWeights.deceleration} min={0} max={2} step={0.1} field="__fw_dc" />
          <EngineSlider label="Erratic Penalty" value={settings.factorWeights.erratic} min={0} max={2} step={0.1} field="__fw_e" />

          <div className="settings-divider" />
          <div className="settings-section-label">Feature Flags</div>

          <div className="settings-row">
            <span className="settings-label">Ray Casting</span>
            <button
              className={`toggle-switch ${settings.features.rayCasting ? 'on' : 'off'}`}
              onClick={() => handleFeatureToggle('rayCasting')}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.features.rayCasting ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Distance Scoring</span>
            <button
              className={`toggle-switch ${settings.features.distanceScoring ? 'on' : 'off'}`}
              onClick={() => handleFeatureToggle('distanceScoring')}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.features.distanceScoring ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Erratic Detection</span>
            <button
              className={`toggle-switch ${settings.features.erraticDetection ? 'on' : 'off'}`}
              onClick={() => handleFeatureToggle('erraticDetection')}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.features.erraticDetection ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="settings-row">
            <span className="settings-label">Pass-Through</span>
            <button
              className={`toggle-switch ${settings.features.passThroughDetection ? 'on' : 'off'}`}
              onClick={() => handleFeatureToggle('passThroughDetection')}
            >
              <span className="toggle-thumb" />
              <span className="toggle-text">{settings.features.passThroughDetection ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
