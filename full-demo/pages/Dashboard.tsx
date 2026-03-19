import { type CSSProperties } from 'react'
import type { TrajectorySnapshot } from 'anticipated/core'
import { useNavigate } from 'react-router-dom'
import { useFakeRequest } from '../lib/useFakeRequest.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import {
  DASHBOARD_STATS,
  ORDERS,
  ONBOARDING_STEPS,
  RECENT_ACTIVITY,
  NOTIFICATIONS,
  TOP_CUSTOMERS,
  getOrderDetail,
  type DashboardStat,
  type ActivityItem,
  type Notification,
  type TopCustomer,
} from '../lib/fakeData.js'
import { SkeletonCard, SkeletonLine } from '../components/LoadingOverlay.js'
import { ConfidenceBadge } from '../components/ConfidenceBadge.js'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'
import { getSettings, useDemoStore, incrementPreloadCount } from '../lib/demoStore.js'
import { preload } from '../lib/cache.js'

function getItemGlow(snapshot: TrajectorySnapshot | undefined, isShowing: boolean): CSSProperties {
  if (!isShowing || !snapshot || snapshot.confidence <= 0.5) return {}
  const intensity: number = (snapshot.confidence - 0.5) / 0.5
  return {
    borderColor: `rgba(74, 222, 128, ${0.3 + intensity * 0.7})`,
    boxShadow: `0 0 ${6 + intensity * 14}px rgba(74, 222, 128, ${intensity * 0.35})`,
  }
}

function getRowGlow(snapshot: TrajectorySnapshot | undefined, isShowing: boolean): CSSProperties {
  if (!isShowing || !snapshot || snapshot.confidence <= 0.5) return {}
  const intensity: number = (snapshot.confidence - 0.5) / 0.5
  return {
    backgroundColor: `rgba(74, 222, 128, ${intensity * 0.04})`,
    boxShadow: `inset 3px 0 0 rgba(74, 222, 128, ${0.3 + intensity * 0.7})`,
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
  const glowStyle: CSSProperties = getItemGlow(snapshot, settings.isShowingPredictions)
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

const SEVERITY_COLORS: Record<Notification['severity'], string> = {
  success: 'var(--green-rgb)',
  warning: 'var(--amber-rgb)',
  error: 'var(--red-rgb)',
  info: 'var(--blue-rgb)',
}

const SEVERITY_ICONS: Record<Notification['severity'], string> = {
  success: '\u2713',
  warning: '\u26A0',
  error: '\u2717',
  info: '\u2139',
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()
  const hasOrder = !!item.orderId

  const ref = register(`activity-${item.id}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (item.orderId) {
        if (preload(`order-detail-${item.orderId}`, () => fakeFetch(getOrderDetail(item.orderId!)))) {
          incrementPreloadCount()
        }
      }
    },
    tolerance: 10,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot(`activity-${item.id}`)
  const glowStyle: CSSProperties = hasOrder ? getRowGlow(snapshot, settings.isShowingPredictions) : {}
  const isGlowing: boolean = hasOrder && settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  return (
    <div
      ref={ref}
      className={`activity-item ${hasOrder ? 'clickable' : ''} ${isGlowing ? 'glowing' : ''}`}
      style={glowStyle}
      onClick={hasOrder ? () => navigate('/orders') : undefined}
      data-anticipated-id={`activity-${item.id}`}
    >
      <div className="activity-dot" />
      <div className="activity-body">
        <span className="activity-text">
          <strong>{item.user}</strong> {item.action}{item.target ? ' ' : ''}
          {item.target && <span className="activity-target">{item.target}</span>}
        </span>
        <span className="activity-time">{item.time}</span>
      </div>
      {hasOrder && <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />}
    </div>
  )
}

function NotificationRow({ item }: { item: Notification }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()
  const hasLink = !!item.linkTo

  const ref = register(`notif-${item.id}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (item.orderId) {
        if (preload(`order-detail-${item.orderId}`, () => fakeFetch(getOrderDetail(item.orderId!)))) {
          incrementPreloadCount()
        }
      } else if (item.linkTo) {
        const preloadFn: (() => boolean) | undefined = PRELOAD_MAP[item.linkTo]
        if (preloadFn?.()) incrementPreloadCount()
      }
    },
    tolerance: 10,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot(`notif-${item.id}`)
  const rgb = SEVERITY_COLORS[item.severity]
  const glowStyle: CSSProperties = hasLink ? getItemGlow(snapshot, settings.isShowingPredictions) : {}
  const isGlowing: boolean = hasLink && settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  return (
    <div
      ref={ref}
      className={`notification-item ${hasLink ? 'clickable' : ''} ${isGlowing ? 'glowing' : ''}`}
      style={{ borderLeftColor: `rgb(${rgb})`, opacity: item.read ? 0.6 : 1, ...glowStyle }}
      onClick={hasLink ? () => navigate(item.linkTo!) : undefined}
      data-anticipated-id={`notif-${item.id}`}
    >
      <span className="notification-icon" style={{ color: `rgb(${rgb})` }}>
        {SEVERITY_ICONS[item.severity]}
      </span>
      <div className="notification-body">
        <span className="notification-title">{item.title}</span>
        <span className="notification-message">{item.message}</span>
      </div>
      <span className="notification-time">{item.time}</span>
      {hasLink && <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />}
    </div>
  )
}

function TopCustomerRow({ customer }: { customer: TopCustomer }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()
  const navigate = useNavigate()

  const ref = register(`customer-${customer.id}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (preload('orders-list', () => fakeFetch(ORDERS))) {
        incrementPreloadCount()
      }
    },
    tolerance: 12,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot(`customer-${customer.id}`)
  const glowStyle: CSSProperties = getRowGlow(snapshot, settings.isShowingPredictions)
  const isGlowing: boolean = settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  return (
    <tr
      ref={ref as React.RefCallback<HTMLTableRowElement>}
      className={`table-row ${isGlowing ? 'glowing' : ''}`}
      style={glowStyle}
      onClick={() => navigate('/orders')}
      data-anticipated-id={`customer-${customer.id}`}
    >
      <td className="table-cell" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{customer.name}</td>
      <td className="table-cell" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        ${customer.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td className="table-cell" style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{customer.orders}</td>
      <td className="table-cell table-cell--badge" style={{ color: 'var(--text-muted)' }}>
        {customer.lastOrder}
        <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />
      </td>
    </tr>
  )
}

function ActivitySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SkeletonLine width="8px" height="8px" />
          <SkeletonLine width="70%" height="14px" />
          <SkeletonLine width="15%" height="12px" />
        </div>
      ))}
    </div>
  )
}

function NotificationsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px', background: 'var(--bg-dark)', borderRadius: '8px' }}>
          <SkeletonLine width="20px" height="20px" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <SkeletonLine width="40%" height="14px" />
            <SkeletonLine width="80%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useFakeRequest('dashboard-stats', () => fakeFetch(DASHBOARD_STATS))
  const { data: activity, isLoading: activityLoading } = useFakeRequest('recent-activity', () => fakeFetch(RECENT_ACTIVITY))
  const { data: notifications, isLoading: notificationsLoading } = useFakeRequest('notifications', () => fakeFetch(NOTIFICATIONS))
  const { data: topCustomers, isLoading: customersLoading } = useFakeRequest('top-customers', () => fakeFetch(TOP_CUSTOMERS))

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
        <section className="card">
          <h2 className="card-title">Recent Activity</h2>
          {activityLoading
            ? <ActivitySkeleton />
            : <div className="activity-feed">
                {activity?.map((item) => <ActivityRow key={item.id} item={item} />)}
              </div>
          }
        </section>

        <section className="card">
          <h2 className="card-title">Notifications</h2>
          {notificationsLoading
            ? <NotificationsSkeleton />
            : <div className="notifications-list">
                {notifications?.map((item) => <NotificationRow key={item.id} item={item} />)}
              </div>
          }
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Top Customers</h2>
        {customersLoading
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ display: 'flex', gap: '16px' }}>
                  <SkeletonLine width="25%" height="14px" />
                  <SkeletonLine width="15%" height="14px" />
                  <SkeletonLine width="10%" height="14px" />
                  <SkeletonLine width="15%" height="14px" />
                </div>
              ))}
            </div>
          : <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th style={{ textAlign: 'right' }}>Total Spent</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th>Last Order</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers?.map((c) => <TopCustomerRow key={c.id} customer={c} />)}
              </tbody>
            </table>
        }
      </section>
    </div>
  )
}
