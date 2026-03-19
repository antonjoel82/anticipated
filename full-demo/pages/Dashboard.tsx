import { type CSSProperties } from 'react'
import type { TrajectorySnapshot } from 'anticipated/core'
import { useNavigate } from 'react-router-dom'
import { useFakeRequest } from '../lib/useFakeRequest.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import {
  DASHBOARD_STATS,
  ORDERS,
  ONBOARDING_STEPS,
  REVENUE_BY_DAY,
  STATUS_BREAKDOWN,
  type DashboardStat,
  type RevenueDataPoint,
  type StatusBreakdown,
  type OrderStatus,
} from '../lib/fakeData.js'
import { SkeletonCard, SkeletonLine } from '../components/LoadingOverlay.js'
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
    tolerance: [
      { distance: 60, factor: 0.3 },
      { distance: 30, factor: 0.7 },
      { distance: 0, factor: 1.0 },
    ],
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
      data-anticipated-tolerance="multi-zone"
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

const STATUS_COLORS: Record<OrderStatus, string> = {
  completed: 'rgb(var(--green-rgb))',
  shipped: 'rgb(var(--blue-rgb))',
  processing: 'rgb(var(--amber-rgb))',
  cancelled: 'rgb(var(--red-rgb))',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  completed: 'Completed',
  shipped: 'Shipped',
  processing: 'Processing',
  cancelled: 'Cancelled',
}

function RevenueChart({ data }: { data: Array<RevenueDataPoint> }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()

  const ref = register('chart-revenue', {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (preload('orders-list', () => fakeFetch(ORDERS))) incrementPreloadCount()
    },
    tolerance: 20,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot('chart-revenue')
  const glowStyle: CSSProperties = getCardGlow(snapshot, settings.isShowingPredictions)
  const isGlowing: boolean = settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  const maxRevenue: number = Math.max(...data.map((d) => d.revenue))
  const chartW = 560
  const chartH = 180
  const barGap = 8
  const barW = (chartW - barGap * (data.length - 1)) / data.length

  return (
    <div
      ref={ref}
      className={`card chart-card ${isGlowing ? 'glowing' : ''}`}
      style={{ ...glowStyle, cursor: 'pointer' }}
      onClick={() => navigate('/orders')}
      data-anticipated-id="chart-revenue"
    >
      <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />
      <h2 className="card-title">Revenue</h2>
      <svg viewBox={`0 0 ${chartW} ${chartH + 28}`} className="chart-svg">
        {data.map((point, i) => {
          const barH: number = Math.max(4, (point.revenue / maxRevenue) * chartH)
          const x: number = i * (barW + barGap)
          const y: number = chartH - barH

          return (
            <g key={point.date}>
              <rect
                x={x} y={y} width={barW} height={barH}
                rx={4}
                fill="rgba(74, 222, 128, 0.5)"
              />
              <text
                x={x + barW / 2} y={chartH + 14}
                textAnchor="middle"
                fill="var(--text-subtle)"
                fontSize="11"
                fontFamily="var(--font-sans)"
              >
                {point.label}
              </text>
              <text
                x={x + barW / 2} y={y - 6}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                ${(point.revenue / 1000).toFixed(1)}k
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function StatusChart({ data }: { data: Array<StatusBreakdown> }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()

  const ref = register('chart-status', {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (preload('orders-list', () => fakeFetch(ORDERS))) incrementPreloadCount()
    },
    tolerance: 20,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot('chart-status')
  const glowStyle: CSSProperties = getCardGlow(snapshot, settings.isShowingPredictions)
  const isGlowing: boolean = settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  const total: number = data.reduce((sum, d) => sum + d.count, 0)
  const r = 70
  const circumference: number = 2 * Math.PI * r
  let offset = 0

  return (
    <div
      ref={ref}
      className={`card chart-card ${isGlowing ? 'glowing' : ''}`}
      style={{ ...glowStyle, cursor: 'pointer' }}
      onClick={() => navigate('/orders')}
      data-anticipated-id="chart-status"
    >
      <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />
      <h2 className="card-title">Orders by Status</h2>
      <div className="chart-donut-layout">
        <svg viewBox="0 0 200 200" className="chart-donut-svg">
          {data.map((segment) => {
            const pct: number = segment.count / total
            const dashLen: number = pct * circumference
            const dash: string = `${dashLen} ${circumference - dashLen}`
            const rotation: number = (offset / circumference) * 360 - 90
            offset += dashLen

            return (
              <circle
                key={segment.status}
                cx="100" cy="100" r={r}
                fill="none"
                strokeWidth="24"
                stroke={STATUS_COLORS[segment.status]}
                strokeDasharray={dash}
                strokeDashoffset="0"
                transform={`rotate(${rotation} 100 100)`}
                strokeLinecap="round"
              />
            )
          })}
          <text x="100" y="96" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="600" fontFamily="var(--font-mono)">
            {total}
          </text>
          <text x="100" y="116" textAnchor="middle" fill="var(--text-subtle)" fontSize="12" fontFamily="var(--font-sans)">
            total orders
          </text>
        </svg>
        <div className="chart-donut-legend">
          {data.map((segment) => (
            <div key={segment.status} className="chart-legend-item">
              <span className="chart-legend-dot" style={{ background: STATUS_COLORS[segment.status] }} />
              <span className="chart-legend-label">{STATUS_LABELS[segment.status]}</span>
              <span className="chart-legend-value">{segment.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SkeletonLine width="30%" height="16px" />
      <SkeletonLine width="100%" height={`${height}px`} />
    </div>
  )
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useFakeRequest('dashboard-stats', () => fakeFetch(DASHBOARD_STATS))
  const { data: revenue, isLoading: revenueLoading } = useFakeRequest('revenue-chart', () => fakeFetch(REVENUE_BY_DAY))
  const { data: statusData, isLoading: statusLoading } = useFakeRequest('status-chart', () => fakeFetch(STATUS_BREAKDOWN))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">
          Overview of your workspace. Hover toward any element to see predictive preloading in action.
        </p>
      </header>

      <section className="stat-grid">
        {statsLoading
          ? Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)
          : stats?.map((stat) => <StatCard key={stat.id} stat={stat} />)
        }
      </section>

      <div className="dashboard-grid">
        {revenueLoading ? <ChartSkeleton height={220} /> : revenue && <RevenueChart data={revenue} />}
        {statusLoading ? <ChartSkeleton height={200} /> : statusData && <StatusChart data={statusData} />}
      </div>
    </div>
  )
}
