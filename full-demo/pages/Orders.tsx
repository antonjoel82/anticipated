import { useState, type CSSProperties } from 'react'
import type { TrajectorySnapshot } from 'anticipated/core'
import { useFakeRequest } from '../lib/useFakeRequest.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import { ORDERS, getOrderDetail, type Order, type OrderDetail as OrderDetailType } from '../lib/fakeData.js'
import { preload } from '../lib/cache.js'
import { getSettings, useDemoStore, incrementPreloadCount } from '../lib/demoStore.js'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'
import { SkeletonTable, SkeletonDetail } from '../components/LoadingOverlay.js'
import { ConfidenceBadge } from '../components/ConfidenceBadge.js'

const STATUS_CLASSES: Record<string, string> = {
  completed: 'status-completed',
  processing: 'status-processing',
  shipped: 'status-shipped',
  cancelled: 'status-cancelled',
}

function getRowGlow(snapshot: TrajectorySnapshot | undefined, isShowing: boolean): CSSProperties {
  if (!isShowing || !snapshot || snapshot.confidence <= 0.5) return {}
  const intensity: number = (snapshot.confidence - 0.5) / 0.5
  return {
    backgroundColor: `rgba(74, 222, 128, ${intensity * 0.04})`,
    boxShadow: `inset 3px 0 0 rgba(74, 222, 128, ${0.3 + intensity * 0.7})`,
  }
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function OrderRow({ order, isSelected, onSelect }: { order: Order; isSelected: boolean; onSelect: () => void }) {
  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()

  const ref = register(`order-${order.id}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      if (preload(`order-detail-${order.id}`, () => fakeFetch(getOrderDetail(order.id)))) {
        incrementPreloadCount()
      }
    },
    tolerance: 15,
  })

  const snapshot: TrajectorySnapshot | undefined = useSnapshot(`order-${order.id}`)
  const glowStyle: CSSProperties = getRowGlow(snapshot, settings.isShowingPredictions)
  const isGlowing: boolean = settings.isShowingPredictions && !!snapshot && snapshot.confidence > 0.5

  return (
    <tr
      ref={ref as React.RefCallback<HTMLTableRowElement>}
      className={`table-row ${isSelected ? 'selected' : ''} ${isGlowing ? 'glowing' : ''}`}
      style={glowStyle}
      onClick={onSelect}
      data-anticipated-id={`order-${order.id}`}
      data-anticipated-tolerance="15"
    >
      <td className="table-cell mono">{order.id}</td>
      <td className="table-cell">{order.customerName}</td>
      <td className="table-cell mono">{formatCurrency(order.amount)}</td>
      <td className="table-cell">
        <span className={`status-badge ${STATUS_CLASSES[order.status]}`}>{order.status}</span>
      </td>
      <td className="table-cell mono">{order.date}</td>
      <td className="table-cell table-cell--badge mono">
        {order.itemCount}
        <ConfidenceBadge snapshot={snapshot} isVisible={settings.isShowingPredictions} />
      </td>
    </tr>
  )
}

function OrderDetailPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useFakeRequest<OrderDetailType>(
    `order-detail-${orderId}`,
    () => fakeFetch(getOrderDetail(orderId))
  )

  if (isLoading) {
    return (
      <div className="detail-panel open">
        <div className="detail-header">
          <h3>Order Detail</h3>
          <button className="detail-close" onClick={onClose}>&#x2715;</button>
        </div>
        <SkeletonDetail />
      </div>
    )
  }

  if (!detail) return null

  return (
    <div className="detail-panel open">
      <div className="detail-header">
        <div>
          <h3 className="mono">{detail.id}</h3>
          <span className={`status-badge ${STATUS_CLASSES[detail.status]}`}>{detail.status}</span>
        </div>
        <button className="detail-close" onClick={onClose}>&#x2715;</button>
      </div>

      <div className="detail-body">
        <div className="detail-section">
          <h4 className="detail-section-title">Customer</h4>
          <p className="detail-text">{detail.customerName}</p>
          <p className="detail-text-muted">{detail.email}</p>
        </div>

        <div className="detail-section">
          <h4 className="detail-section-title">Shipping Address</h4>
          <p className="detail-text">{detail.shippingAddress.street}</p>
          <p className="detail-text">
            {detail.shippingAddress.city}, {detail.shippingAddress.state} {detail.shippingAddress.zip}
          </p>
        </div>

        <div className="detail-section">
          <h4 className="detail-section-title">Line Items</h4>
          <table className="line-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {detail.lineItems.map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td className="mono">{item.quantity}</td>
                  <td className="mono">{formatCurrency(item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}><strong>Total</strong></td>
                <td className="mono"><strong>{formatCurrency(detail.amount)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="detail-section">
          <h4 className="detail-section-title">Timeline</h4>
          <div className="timeline">
            {detail.timeline.map((event, i) => (
              <div key={i} className="timeline-event">
                <div className="timeline-dot" />
                {i < detail.timeline.length - 1 && <div className="timeline-line" />}
                <div className="timeline-content">
                  <span className="timeline-event-name">{event.event}</span>
                  <span className="timeline-date mono">{event.date}</span>
                  <span className="timeline-desc">{event.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {detail.notes && (
          <div className="detail-section">
            <h4 className="detail-section-title">Notes</h4>
            <p className="detail-text-muted">{detail.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function Orders() {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const { data: orders, isLoading } = useFakeRequest('orders-list', () => fakeFetch(ORDERS))

  return (
    <div className="page">
      <header className="page-header">
        <h1>Orders</h1>
        <p className="page-subtitle">
          Move your cursor toward a table row to preload its detail. Click to open the detail panel.
        </p>
      </header>

      <div className={`orders-layout ${selectedOrderId ? 'with-detail' : ''}`}>
        <section className="card orders-table-card">
          {isLoading ? (
            <SkeletonTable rows={8} />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {orders?.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    isSelected={order.id === selectedOrderId}
                    onSelect={() => setSelectedOrderId(order.id === selectedOrderId ? null : order.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </section>

        {selectedOrderId && (
          <OrderDetailPanel
            orderId={selectedOrderId}
            onClose={() => setSelectedOrderId(null)}
          />
        )}
      </div>
    </div>
  )
}
