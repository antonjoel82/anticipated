type SkeletonLineProps = {
  width?: string
  height?: string
  className?: string
}

export function SkeletonLine({ width = '100%', height = '16px', className = '' }: SkeletonLineProps) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <SkeletonLine width="40%" height="14px" />
      <SkeletonLine width="60%" height="28px" />
      <SkeletonLine width="30%" height="12px" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        <SkeletonLine width="15%" height="12px" />
        <SkeletonLine width="25%" height="12px" />
        <SkeletonLine width="15%" height="12px" />
        <SkeletonLine width="12%" height="12px" />
        <SkeletonLine width="15%" height="12px" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-table-row">
          <SkeletonLine width="15%" height="14px" />
          <SkeletonLine width="25%" height="14px" />
          <SkeletonLine width="15%" height="14px" />
          <SkeletonLine width="12%" height="14px" />
          <SkeletonLine width="15%" height="14px" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="skeleton-detail">
      <SkeletonLine width="50%" height="20px" />
      <SkeletonLine width="70%" height="14px" />
      <div className="skeleton-detail-section">
        <SkeletonLine width="30%" height="12px" />
        <SkeletonLine width="100%" height="14px" />
        <SkeletonLine width="100%" height="14px" />
        <SkeletonLine width="80%" height="14px" />
      </div>
      <div className="skeleton-detail-section">
        <SkeletonLine width="30%" height="12px" />
        <SkeletonLine width="100%" height="14px" />
        <SkeletonLine width="60%" height="14px" />
      </div>
    </div>
  )
}

export function SkeletonForm() {
  return (
    <div className="skeleton-form">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton-field">
          <SkeletonLine width="30%" height="12px" />
          <SkeletonLine width="100%" height="38px" />
        </div>
      ))}
    </div>
  )
}
