import type { TrajectorySnapshot } from 'anticipated/core'
import type { CSSProperties } from 'react'

type ConfidenceBadgeProps = {
  snapshot: TrajectorySnapshot | undefined
  isVisible: boolean
}

export function ConfidenceBadge({ snapshot, isVisible }: ConfidenceBadgeProps) {
  if (!isVisible) return null

  const confidence: number = snapshot?.confidence ?? 0
  const isActive: boolean = confidence > 0

  const badgeStyle: CSSProperties = isActive
    ? {
        borderColor: `rgba(74, 222, 128, ${0.2 + confidence * 0.8})`,
        boxShadow: confidence > 0.3
          ? `0 0 ${confidence * 14}px rgba(74, 222, 128, ${confidence * 0.5})`
          : 'none',
        color: `rgba(74, 222, 128, ${0.4 + confidence * 0.6})`,
      }
    : {}

  return (
    <span
      className={`confidence-badge ${isActive ? 'confidence-badge--active' : ''}`}
      style={badgeStyle}
    >
      {confidence.toFixed(2)}
    </span>
  )
}
