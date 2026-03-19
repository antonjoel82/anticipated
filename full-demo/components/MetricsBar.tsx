import { useDemoStore } from '../lib/demoStore.js'

export function MetricsBar() {
  const settings = useDemoStore()

  const estimatedTimeSaved: number = settings.preloadCount * settings.latencyMs
  const timeSavedDisplay: string =
    estimatedTimeSaved >= 1000
      ? `${(estimatedTimeSaved / 1000).toFixed(1)}s`
      : `${estimatedTimeSaved}ms`

  return (
    <div className="metrics-bar">
      <div className="metrics-bar-inner">
        <div className="metrics-item">
          <span className="metrics-item-label">Status</span>
          <span className={`metrics-item-value ${settings.isAnticipatedEnabled ? 'metrics-active' : 'metrics-inactive'}`}>
            {settings.isAnticipatedEnabled ? 'Predicting' : 'Disabled'}
          </span>
        </div>

        <div className="metrics-divider" />

        <div className="metrics-item">
          <span className="metrics-item-label">Preloads</span>
          <span className="metrics-item-value metrics-highlight mono">{settings.preloadCount}</span>
        </div>

        <div className="metrics-divider" />

        <div className="metrics-item">
          <span className="metrics-item-label">Est. Time Saved</span>
          <span className="metrics-item-value metrics-highlight mono">{timeSavedDisplay}</span>
        </div>

        <div className="metrics-divider" />

        <div className="metrics-item">
          <span className="metrics-item-label">Latency</span>
          <span className="metrics-item-value mono">{settings.latencyMs}ms</span>
        </div>

        <div className="metrics-divider" />

        <div className="metrics-item">
          <span className="metrics-item-label">Preset</span>
          <span className="metrics-item-value">{settings.activePreset}</span>
        </div>
      </div>
    </div>
  )
}
