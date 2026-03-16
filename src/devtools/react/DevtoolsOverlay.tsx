import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'

type DevtoolsOverlayProps = {
  element: HTMLElement | null
}

export function DevtoolsOverlay({ element }: DevtoolsOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!element) {
      setRect(null)
      return
    }
    setRect(element.getBoundingClientRect())
  }, [element])

  if (!rect || !element) return null

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    border: '2px solid #00d9ff',
    borderRadius: 4,
    pointerEvents: 'none',
    zIndex: 99998,
    boxSizing: 'border-box',
  }

  return createPortal(<div style={overlayStyle} />, document.body)
}
