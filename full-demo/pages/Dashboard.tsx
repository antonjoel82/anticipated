import { type CSSProperties } from 'react'
import type { TrajectorySnapshot } from 'anticipated/core'
import { useNavigate } from 'react-router-dom'
import { useFakeRequest } from '../lib/useFakeRequest.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import { DASHBOARD_STATS, ORDERS, ONBOARDING_STEPS, type DashboardStat } from '../lib/fakeData.js'
import { SkeletonCard } from '../components/LoadingOverlay.js'
import { ConfidenceBadge } from '../components/ConfidenceBadge.js'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'
import { getSettings, useDemoStore, incrementPreloadCount } from '../lib/demoStore.js'
import { preload } from '../lib/cache.js'

function getCardGlow(snapshot: TrajectorySnapshot | undefined, isShowing: boolean): CSSProperties {
  if (!isShowing || !snapshot || snapshot.confidence <= 0.5) return {}
  const intensity: number = (snapshot.confidence - 0.5) / 0.5
  return {
    borderColor: `rgba(74, 222, 128, ${0.3 + intensity * 0.7})`,
    boxShadow: `0 0 ${6 + intensity * 14}px rgba(74, 222, 128, ${intensity * 0.35})`,
  }
}

const PRELOAD_MAP: Record<string, () => boolean> = {
  '/orders': () => preload('orders-list', () => fakeFetch(ORDERS)),
  '/onboarding': () => preload('onboarding-step-0', () => fakeFetch(ONBOARDING_STEPS[0])),
}

function StatCard({ stat }: { stat: DashboardStat }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()

  const ref = register(`stat-${stat.id}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      const preloadFn: (() => boolean) | undefined = PRELOAD_MAP[stat.linkTo]
      if (preloadFn?.()) incrementPreloadCount()
    },
    tolerance: 20,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot(`stat-${stat.id}`)
  const glowStyle: CSSProperties = getCardGlow(snapshot, settings.isShowingPredictions)
  const isGlowing: boolean = settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  return (
    <button
      ref={ref}
      className={`stat-card ${isGlowing ? 'glowing' : ''}`}
      style={glowStyle}
      onClick={() => navigate(stat.linkTo)}
      data-anticipated-id={`stat-${stat.id}`}
      data-anticipated-tolerance="20"
    >
      <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />
      <span className="stat-label">{stat.label}</span>
      <span className="stat-value">{stat.value}</span>
      <span className={`stat-change ${stat.isChangePositive ? 'positive' : 'negative'}`}>
        {stat.change}
      </span>
    </button>
  )
}

export function Dashboard() {
  const { data: stats, isLoading } = useFakeRequest('dashboard-stats', () => fakeFetch(DASHBOARD_STATS))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">
          Overview of your workspace. Hover toward any card or nav link to see predictive preloading in action.
        </p>
      </header>

      <section className="stat-grid">
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)
          : stats?.map((stat) => <StatCard key={stat.id} stat={stat} />)
        }
      </section>

      <section className="card demo-info">
        <h2 className="card-title">How This Demo Works</h2>
        <div className="demo-info-grid">
          <div className="demo-info-item">
            <span className="demo-info-icon">&#x25CE;</span>
            <div>
              <strong>Cursor Prediction</strong>
              <p>Foresee tracks your cursor trajectory and predicts which element you're heading toward using EWMA-smoothed velocity extrapolation.</p>
            </div>
          </div>
          <div className="demo-info-item">
            <span className="demo-info-icon">&#x26A1;</span>
            <div>
              <strong>Predictive Preloading</strong>
              <p>When confidence is high, data for the target element is preloaded before you click. Toggle Foresee OFF in settings to feel the difference.</p>
            </div>
          </div>
          <div className="demo-info-item">
            <span className="demo-info-icon">&#x23F1;</span>
            <div>
              <strong>Configurable Latency</strong>
              <p>Use the settings panel to adjust simulated request latency. Higher latency makes the preloading benefit more dramatic.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Try These Patterns</h2>
        <div className="patterns-list">
          <div className="pattern-item">
            <span className="pattern-label">Navigation Preloading</span>
            <span className="pattern-desc">Move toward sidebar links &#x2014; page data loads before you click</span>
          </div>
          <div className="pattern-item">
            <span className="pattern-label">Table Row Detail</span>
            <span className="pattern-desc">On the Orders page, approach a row to preload its detail data</span>
          </div>
          <div className="pattern-item">
            <span className="pattern-label">Multi-Step Wizard</span>
            <span className="pattern-desc">On Onboarding, the Next button preloads the upcoming step</span>
          </div>
        </div>
      </section>
    </div>
  )
}
