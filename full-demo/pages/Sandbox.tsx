import { type CSSProperties, useRef } from 'react'
import type { TriggerProfile } from 'anticipated/core'
import { DEFAULT_ERRATIC_SENSITIVITY } from 'anticipated/core'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'

const showcaseGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '16px' }
const showcaseCardStyle: CSSProperties = {
  backgroundColor: '#13131a',
  border: '1px solid #252530',
  borderRadius: '8px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '160px',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.1s ease-out',
}

function MagneticGlowCard() {
  const { register, useSnapshot } = useSharedTrajectory()
  const id = 'showcase-magnetic'
  const ref = register(id, {
    triggerOn: (snap) => ({
      isTriggered: snap.confidence > 0.1 || snap.distancePx < 300,
      reason: 'trajectory' as const,
    }),
    whenTriggered: () => {},
    profile: { type: 'every_frame' as const },
    tolerance: 40,
  })
  const snap = useSnapshot(id)
  const conf = snap?.confidence || 0

  const style: CSSProperties = {
    ...showcaseCardStyle,
    boxShadow: `0 0 ${conf * 40}px rgba(74, 222, 128, ${conf * 0.6})`,
    borderColor: `rgba(74, 222, 128, ${0.2 + conf * 0.8})`,
  }

  return (
    <div ref={ref} style={style}>
      <h3 style={{ margin: '0 0 8px 0', color: '#e8e8ec', zIndex: 2, position: 'relative' }}>Magnetic Glow</h3>
      <div style={{ color: '#999', fontFamily: "'JetBrains Mono', monospace", zIndex: 2, position: 'relative' }}>
        Confidence: {conf.toFixed(2)}
      </div>
    </div>
  )
}

function ErraticValueCard() {
  const { register, useSnapshot } = useSharedTrajectory()
  const id = 'showcase-erratic'
  const ref = register(id, {
    triggerOn: (snap) => ({
      isTriggered: snap.confidence > 0.1 || snap.distancePx < 300,
      reason: 'trajectory' as const,
    }),
    whenTriggered: () => {},
    profile: { type: 'every_frame' as const },
    tolerance: 40,
  })
  const snap = useSnapshot(id)
  const factor = snap?.factors?.erratic ?? 1
  // Back-calculate circular variance: factor = exp(-cv * sensitivity)
  const circularVariance = factor >= 1 ? 0 : -Math.log(factor) / DEFAULT_ERRATIC_SENSITIVITY

  const intensity = Math.min(circularVariance / 0.5, 1)
  const style: CSSProperties = {
    ...showcaseCardStyle,
    borderColor: `rgba(248, 113, 113, ${0.2 + intensity * 0.8})`,
    boxShadow: intensity > 0.05 ? `0 0 ${intensity * 24}px rgba(248, 113, 113, ${intensity * 0.4})` : 'none',
  }

  return (
    <div ref={ref} style={style}>
      <h3 style={{ margin: '0 0 8px 0', color: '#e8e8ec', zIndex: 2, position: 'relative' }}>Erratic Value</h3>
      <div style={{ color: '#999', fontFamily: "'JetBrains Mono', monospace", zIndex: 2, position: 'relative' }}>
        {circularVariance.toFixed(3)}
      </div>
    </div>
  )
}

function VelocityMeterCard() {
  const { register, useSnapshot } = useSharedTrajectory()
  const id = 'showcase-velocity'
  const ref = register(id, {
    triggerOn: (snap) => ({
      isTriggered: snap.confidence > 0.1 || snap.distancePx < 300,
      reason: 'trajectory' as const,
    }),
    whenTriggered: () => {},
    profile: { type: 'every_frame' as const },
    tolerance: 40,
  })
  const snap = useSnapshot(id)
  const mag = snap?.velocity.magnitude || 0
  const angle = snap?.velocity.angle || 0
  const fillPct = Math.min(100, (mag / 500) * 100)

  return (
    <div ref={ref} style={showcaseCardStyle}>
      <h3 style={{ margin: '0 0 8px 0', color: '#e8e8ec', zIndex: 2, position: 'relative' }}>Velocity Meter</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '0 20px', zIndex: 2, position: 'relative' }}>
        <div style={{ flex: 1, height: '6px', background: '#252530', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${fillPct}%`, height: '100%', background: 'rgb(251, 191, 36)', transition: 'width 0.1s' }} />
        </div>
        <div style={{
          color: 'rgb(251, 191, 36)',
          transform: `rotate(${angle}rad)`,
          transition: 'transform 0.1s',
          fontSize: '32px',
          lineHeight: 1,
        }}>&#x25B8;</div>
      </div>
      <div style={{ color: '#999', fontFamily: "'JetBrains Mono', monospace", marginTop: '12px', zIndex: 2, position: 'relative' }}>
        {Math.round(mag)} px/s
      </div>
    </div>
  )
}

function PredictionDotCard() {
  const { register, useSnapshot } = useSharedTrajectory()
  const id = 'showcase-prediction'
  const cardRef = useRef<HTMLDivElement | null>(null)

  const ref = register(id, {
    triggerOn: (snap) => ({
      isTriggered: snap.confidence > 0.1 || snap.distancePx < 300,
      reason: 'trajectory' as const,
    }),
    whenTriggered: () => {},
    profile: { type: 'every_frame' as const },
    tolerance: 40,
  })
  const snap = useSnapshot(id)

  let dotX = 0
  let dotY = 0
  let showDot = false

  if (snap && cardRef.current) {
    const rect = cardRef.current.getBoundingClientRect()
    const predX = snap.predictedPoint.x - window.scrollX
    const predY = snap.predictedPoint.y - window.scrollY

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    let dx = predX - centerX
    let dy = predY - centerY

    const maxDx = rect.width / 2 - 6
    const maxDy = rect.height / 2 - 6

    dx = Math.max(-maxDx, Math.min(maxDx, dx))
    dy = Math.max(-maxDy, Math.min(maxDy, dy))

    dotX = dx
    dotY = dy
    showDot = true
  }

  return (
    <div
      ref={(el) => {
        ref(el)
        cardRef.current = el
      }}
      style={showcaseCardStyle}
    >
      <h3 style={{ margin: '0 0 8px 0', color: '#e8e8ec', position: 'relative', zIndex: 2 }}>Prediction Dot</h3>
      <div style={{ color: '#999', fontFamily: "'JetBrains Mono', monospace", position: 'relative', zIndex: 2 }}>
        {snap ? `${Math.round(snap.predictedPoint.x)}, ${Math.round(snap.predictedPoint.y)}` : '---, ---'}
      </div>

      {showDot && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '12px',
          height: '12px',
          backgroundColor: 'rgb(74, 222, 128)',
          borderRadius: '50%',
          transform: `translate(calc(-50% + ${dotX}px), calc(-50% + ${dotY}px))`,
          boxShadow: '0 0 10px rgb(74, 222, 128)',
          transition: 'transform 0.1s linear',
          zIndex: 1,
        }} />
      )}
    </div>
  )
}

const profilesGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '16px' }
const profileCardStyle: CSSProperties = {
  backgroundColor: '#13131a',
  border: '1px solid #252530',
  borderRadius: '8px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
}
const badgeStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: '#1e1e2a',
  color: '#c8c8d0',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  fontFamily: "'JetBrains Mono', monospace",
  marginBottom: '12px',
}
const counterStyle: CSSProperties = {
  fontSize: '48px',
  fontWeight: 'bold',
  color: '#e8e8ec',
  margin: '12px 0',
  fontFamily: "'JetBrains Mono', monospace",
}
const descStyle: CSSProperties = {
  color: '#999',
  fontSize: '13px',
  lineHeight: 1.4,
}

function ProfileCard({
  title,
  type,
  profile,
  desc,
}: {
  title: string
  type: string
  profile: TriggerProfile
  desc: string
}) {
  const { register } = useSharedTrajectory()
  const counterRef = useRef(0)
  const counterEl = useRef<HTMLDivElement>(null)

  const ref = register(`profile-${type}`, {
    triggerOn: (snap) => ({
      isTriggered: snap.isIntersecting && snap.confidence > 0.5,
    }),
    whenTriggered: () => {
      counterRef.current++
      if (counterEl.current) {
        counterEl.current.textContent = String(counterRef.current) + (profile.type === 'once' ? ' \u2713' : '')
      }
    },
    profile,
    tolerance: 25,
  })

  return (
    <div ref={ref} style={profileCardStyle}>
      <div style={badgeStyle}>{type}</div>
      <h3 style={{ margin: 0, color: '#e8e8ec', fontSize: '16px' }}>{title}</h3>
      <div ref={counterEl} style={counterStyle}>0</div>
      <div style={descStyle}>{desc}</div>
    </div>
  )
}

export function Sandbox() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Sandbox</h1>
        <p className="page-subtitle">
          Interactive showcase of trajectory prediction effects and trigger profiles. Move your cursor toward elements to see them respond.
        </p>
      </header>

      <section className="card">
        <h2 className="card-title">Visual Effects</h2>
        <p className="page-subtitle" style={{ marginTop: '4px', marginBottom: '0' }}>
          Each element responds to cursor trajectory in real-time. Move your cursor toward them.
        </p>
        <div style={showcaseGridStyle}>
          <MagneticGlowCard />
          <ErraticValueCard />
          <VelocityMeterCard />
          <PredictionDotCard />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Trigger Profiles</h2>
        <p className="page-subtitle" style={{ marginTop: '4px', marginBottom: '0' }}>
          Four different firing strategies. Watch the counters — each behaves differently.
        </p>
        <div style={profilesGridStyle}>
          <ProfileCard
            title="Prefetch"
            type="once"
            profile={{ type: 'once' as const }}
            desc="Counter fires exactly once. After firing, append ' \u2713' to show it's done."
          />
          <ProfileCard
            title="Hover Prep"
            type="on_enter"
            profile={{ type: 'on_enter' as const }}
            desc="Counter increments each time cursor trajectory enters the element."
          />
          <ProfileCard
            title="Live Track"
            type="every_frame"
            profile={{ type: 'every_frame' as const }}
            desc="Counter increments RAPIDLY every frame while triggered. Will show high numbers quickly."
          />
          <ProfileCard
            title="Rate Limited"
            type="cooldown"
            profile={{ type: 'cooldown' as const, intervalMs: 500 }}
            desc="Counter increments at most once per 500ms. Visibly slower than every_frame."
          />
        </div>
      </section>
    </div>
  )
}
