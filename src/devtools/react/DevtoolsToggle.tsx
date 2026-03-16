type DevtoolsToggleProps = {
  onClick: () => void
  isOpen: boolean
}

const toggleStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 99999,
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #2a2a4a',
  borderRadius: 12,
  padding: '4px 12px',
  fontSize: 12,
  fontFamily: 'monospace',
  cursor: 'pointer',
  height: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

export function DevtoolsToggle({ onClick, isOpen }: DevtoolsToggleProps) {
  return (
    <button
      style={toggleStyle}
      onClick={onClick}
      aria-label="foresee"
    >
      {isOpen ? '×' : '◉'} foresee
    </button>
  )
}
