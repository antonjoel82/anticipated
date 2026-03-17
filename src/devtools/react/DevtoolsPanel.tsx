import { useState } from 'react'
import type { AnticipatedProfiler, ProfilerSnapshot } from '../profiler.js'
import type { PredictionFiredEvent } from '../types.js'

type DevtoolsPanelProps = {
  snapshot: ProfilerSnapshot
  profiler: AnticipatedProfiler
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 48,
  right: 16,
  width: 480,
  maxHeight: 520,
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #2a2a4a',
  borderRadius: 8,
  fontFamily: 'monospace',
  fontSize: 12,
  zIndex: 99998,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid #2a2a4a',
  alignItems: 'center',
}

const btnStyle: React.CSSProperties = {
  background: '#2a2a4a',
  color: '#e0e0e0',
  border: '1px solid #3a3a5a',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  fontFamily: 'monospace',
  cursor: 'pointer',
}

const scoreboardStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid #2a2a4a',
}

const metricStyle: React.CSSProperties = {
  textAlign: 'center',
  minWidth: 60,
}

const metricLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#888',
}

const metricValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 'bold',
  color: '#00d9ff',
}

const streamStyle: React.CSSProperties = {
  maxHeight: 200,
  overflowY: 'auto',
  borderBottom: '1px solid #2a2a4a',
}

const eventRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '4px 12px',
  cursor: 'pointer',
  alignItems: 'center',
  borderBottom: '1px solid #1e1e38',
}

const inspectorStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  lineHeight: 1.6,
}

function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`
}

function formatMs(n: number): string {
  return `${Math.round(n)}ms`
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
    </div>
  )
}

export function DevtoolsPanel({ snapshot, profiler }: DevtoolsPanelProps) {
  const [selectedEvent, setSelectedEvent] = useState<PredictionFiredEvent | null>(null)
  const { report, events, enabled } = snapshot

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <button
          style={btnStyle}
          onClick={() => profiler.setEnabled(!enabled)}
          aria-label={enabled ? 'Pause' : 'Resume'}
        >
          {enabled ? 'Pause' : 'Resume'}
        </button>
        <button
          style={btnStyle}
          onClick={() => profiler.reset()}
          aria-label="Reset"
        >
          Reset
        </button>
        <button
          style={btnStyle}
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(profiler.getReport(), null, 2))
          }}
          aria-label="Copy"
        >
          Copy
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>
          {enabled ? 'recording' : 'paused'}
        </span>
      </div>

      <div style={scoreboardStyle}>
        <Metric label="Predictions" value={String(report.predictions)} />
        <Metric label="Confirmed" value={String(report.confirmed)} />
        <Metric label="False Pos" value={String(report.falsePositives)} />
        <Metric label="Missed" value={String(report.missedNavigations)} />
        <Metric label="Precision" value={formatPercent(report.precision)} />
        <Metric label="Recall" value={formatPercent(report.recall)} />
        <Metric label="F1" value={formatPercent(report.f1)} />
        <Metric label="Avg Lead" value={formatMs(report.avgLeadTimeMs)} />
        <Metric label="Total Saved" value={formatMs(report.totalTimeSavedMs)} />
      </div>

      <div style={streamStyle}>
        {events.length === 0 && (
          <div style={{ padding: '12px', color: '#666', textAlign: 'center' }}>
            No events yet
          </div>
        )}
        {[...events].reverse().map((event, i) => (
          <div
            key={`${event.elementId}-${event.timestamp}-${i}`}
            style={{
              ...eventRowStyle,
              background: selectedEvent === event ? '#2a2a4a' : 'transparent',
            }}
            onClick={() => setSelectedEvent(event)}
          >
            <span style={{ color: '#00d9ff', fontWeight: 'bold' }}>{event.elementId}</span>
            <span style={{
              background: event.confidence > 0.7 ? '#2d5a27' : event.confidence > 0.3 ? '#5a4a27' : '#5a2727',
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 10,
            }}>
              {formatPercent(event.confidence)}
            </span>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <div style={inspectorStyle}>
          <div><strong>Element:</strong> {selectedEvent.elementId}</div>
          <div><strong>Confidence:</strong> {formatPercent(selectedEvent.confidence)}</div>
          <div><strong>Timestamp:</strong> {formatMs(selectedEvent.timestamp)}</div>
          <div><strong>Predicted Point:</strong> ({Math.round(selectedEvent.predictedPoint.x)}, {Math.round(selectedEvent.predictedPoint.y)})</div>
        </div>
      )}
    </div>
  )
}
