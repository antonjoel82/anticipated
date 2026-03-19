import { useEffect, useRef, useState } from 'react'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'
import { useDemoStore, updateSettings } from '../lib/demoStore.js'
import type { TrajectorySnapshot, FactorScores } from 'anticipated/core'
import type { PredictionFiredEvent, PredictionCancelledEvent } from 'anticipated/devtools'

type EventEntry = {
  id: number
  type: 'fired' | 'cancelled'
  elementId: string
  confidence?: number
  timestamp: number
}

const MAX_EVENTS = 30

function FactorBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100)
  return (
    <div className="inspector-factor-row">
      <span className="inspector-factor-label">{label}</span>
      <div className="inspector-factor-track">
        <div
          className="inspector-factor-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="inspector-factor-value mono">{value.toFixed(2)}</span>
    </div>
  )
}

function FactorBreakdown({ factors, confidence }: { factors: FactorScores; confidence: number }) {
  return (
    <div className="inspector-factors">
      <FactorBar label="Alignment" value={factors.alignment} color="rgba(96, 165, 250, 0.9)" />
      <FactorBar label="Distance" value={factors.distance} color="rgba(52, 211, 153, 0.9)" />
      <FactorBar label="Decel" value={factors.deceleration} color="rgba(251, 191, 36, 0.9)" />
      <FactorBar label="Erratic" value={factors.erratic} color="rgba(244, 114, 182, 0.9)" />
      <div className="inspector-confidence-row">
        <span className="inspector-factor-label">Confidence</span>
        <div className="inspector-factor-track">
          <div
            className="inspector-factor-fill inspector-confidence-fill"
            style={{ width: `${Math.round(confidence * 100)}%` }}
          />
        </div>
        <span className="inspector-factor-value mono">{confidence.toFixed(2)}</span>
      </div>
    </div>
  )
}

function EventFeed({ events }: { events: readonly EventEntry[] }) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [events.length])

  if (events.length === 0) {
    return <div className="inspector-empty">No events yet</div>
  }

  return (
    <div className="inspector-events" ref={listRef}>
      {events.map((e) => (
        <div key={e.id} className={`inspector-event inspector-event-${e.type}`}>
          <span className="inspector-event-icon">{e.type === 'fired' ? '\u25C9' : '\u00D7'}</span>
          <span className="inspector-event-element mono">{e.elementId}</span>
          {e.confidence !== undefined && (
            <span className="inspector-event-conf mono">{e.confidence.toFixed(2)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export function InspectorPanel() {
  const settings = useDemoStore()
  const { engine } = useSharedTrajectory()
  const [events, setEvents] = useState<EventEntry[]>([])
  const eventIdRef = useRef(0)

  const [, bump] = useState(0)
  useEffect(() => {
    if (!engine) return
    return engine.subscribe(() => bump((n) => n + 1))
  }, [engine])
  const snapshots = engine?.getAllSnapshots() ?? null

  useEffect(() => {
    if (!engine) return

    const unsubs: Array<() => void> = []

    unsubs.push(engine.onDev('prediction:fired', (e: PredictionFiredEvent) => {
      setEvents((prev) => {
        const next = [...prev, {
          id: ++eventIdRef.current,
          type: 'fired' as const,
          elementId: e.elementId,
          confidence: e.confidence,
          timestamp: e.timestamp,
        }]
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
      })
    }))

    unsubs.push(engine.onDev('prediction:cancelled', (e: PredictionCancelledEvent) => {
      setEvents((prev) => {
        const next = [...prev, {
          id: ++eventIdRef.current,
          type: 'cancelled' as const,
          elementId: e.elementId,
          timestamp: e.timestamp,
        }]
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
      })
    }))

    return () => unsubs.forEach((u) => u())
  }, [engine])

  if (!settings.isShowingInspector) return null

  const top = findTopElement(snapshots)

  function findTopElement(
    map: ReadonlyMap<string, TrajectorySnapshot> | null,
  ): { id: string; snap: TrajectorySnapshot } | null {
    if (!map) return null
    let best: { id: string; snap: TrajectorySnapshot } | null = null
    for (const [id, snap] of map) {
      if (!best || snap.confidence > best.snap.confidence) {
        best = { id, snap }
      }
    }
    return best
  }

  return (
    <div className="inspector-panel">
      <div className="inspector-header">
        <span className="inspector-title">Inspector</span>
        <button
          className="inspector-close"
          onClick={() => updateSettings({ isShowingInspector: false })}
        >
          &times;
        </button>
      </div>

      <div className="inspector-body">
        <div className="inspector-section">
          <div className="inspector-section-title">
            {top ? (
              <>Factor Scores <span className="mono inspector-element-id">{top.id}</span></>
            ) : (
              'Factor Scores'
            )}
          </div>
          {top ? (
            <FactorBreakdown
              factors={top.snap.factors}
              confidence={top.snap.confidence}
            />
          ) : (
            <div className="inspector-empty">Move cursor near an element</div>
          )}
        </div>

        <div className="inspector-divider" />

        <div className="inspector-section">
          <div className="inspector-section-title">Event Feed</div>
          <EventFeed events={events} />
        </div>
      </div>
    </div>
  )
}
