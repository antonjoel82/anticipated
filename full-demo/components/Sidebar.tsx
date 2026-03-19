import { AnticipatedLink } from './AnticipatedLink.js'
import { preload } from '../lib/cache.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import { DASHBOARD_STATS, ORDERS, ONBOARDING_STEPS } from '../lib/fakeData.js'

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">&#x25CE;</span>
        <span>anticipated</span>
        <span className="brand-tag">demo</span>
      </div>

      <div className="sidebar-section-label">Pages</div>

      <div className="sidebar-nav">
        <AnticipatedLink
          to="/"
          icon="&#x25E7;"
          preload={() => preload('dashboard-stats', () => fakeFetch(DASHBOARD_STATS))}
        >
          Dashboard
        </AnticipatedLink>

        <AnticipatedLink
          to="/orders"
          icon="&#x2630;"
          preload={() => preload('orders-list', () => fakeFetch(ORDERS))}
        >
          Orders
        </AnticipatedLink>

        <AnticipatedLink
          to="/onboarding"
          icon="&#x27D0;"
          preload={() => preload('onboarding-step-0', () => fakeFetch(ONBOARDING_STEPS[0]))}
        >
          Onboarding
        </AnticipatedLink>

        <AnticipatedLink
          to="/sandbox"
          icon="&#x29C8;"
          preload={() => false}
        >
          Sandbox
        </AnticipatedLink>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-hint">
          Move your cursor toward a<br />
          nav link to preload its data.
        </div>
      </div>
    </nav>
  )
}
