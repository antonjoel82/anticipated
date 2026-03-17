import { useEffect, useRef } from 'react'
import { getSettings, useDemoStore } from '../lib/demoStore.js'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'

const GREEN = { r: 74, g: 222, b: 128 }

function rgba(alpha: number): string {
  return `rgba(${GREEN.r}, ${GREEN.g}, ${GREEN.b}, ${alpha})`
}

export function DebugOverlay() {
  const settings = useDemoStore()
  const { getSnapshot } = useSharedTrajectory()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef({ x: 0, y: 0 })

  const isActive: boolean = settings.isShowingRadii || settings.isShowingRays

  useEffect(() => {
    if (!isActive) return

    const canvas: HTMLCanvasElement | null = canvasRef.current
    if (!canvas) return
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr: number = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const handlePointerMove = (e: PointerEvent) => {
      cursorRef.current = { x: e.clientX, y: e.clientY }
    }
    document.addEventListener('pointermove', handlePointerMove)

    let rafId = 0

    const render = () => {
      const { isShowingRadii, isShowingRays } = getSettings()
      const w: number = canvas.width / (window.devicePixelRatio || 1)
      const h: number = canvas.height / (window.devicePixelRatio || 1)
      ctx.clearRect(0, 0, w, h)

      const tracked: NodeListOf<Element> = document.querySelectorAll('[data-anticipated-id]')
      let predictedX = 0
      let predictedY = 0
      let hasPrediction = false

      tracked.forEach((el) => {
        const id: string = el.getAttribute('data-anticipated-id')!
        const tolerance: number = Number(el.getAttribute('data-anticipated-tolerance') ?? '0')
        const rect: DOMRect = el.getBoundingClientRect()

        if (!hasPrediction) {
          const snap = getSnapshot(id)
          if (snap && (snap.velocity.magnitude > 5 || snap.isIntersecting)) {
            predictedX = snap.predictedPoint.x
            predictedY = snap.predictedPoint.y
            hasPrediction = true
          }
        }

        if (isShowingRadii && tolerance > 0) {
          const ex: number = rect.left - tolerance
          const ey: number = rect.top - tolerance
          const ew: number = rect.width + tolerance * 2
          const eh: number = rect.height + tolerance * 2

          ctx.strokeStyle = rgba(0.3)
          ctx.lineWidth = 1
          ctx.setLineDash([5, 4])
          ctx.beginPath()
          ctx.roundRect(ex, ey, ew, eh, 6)
          ctx.stroke()

          ctx.strokeStyle = rgba(0.1)
          ctx.lineWidth = 1
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.roundRect(rect.left, rect.top, rect.width, rect.height, 4)
          ctx.stroke()
        }
      })

      if (isShowingRays && hasPrediction) {
        const cx: number = cursorRef.current.x
        const cy: number = cursorRef.current.y
        const dx: number = predictedX - cx
        const dy: number = predictedY - cy
        const len: number = Math.sqrt(dx * dx + dy * dy)

        if (len > 2) {
          ctx.setLineDash([])
          ctx.strokeStyle = rgba(0.5)
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(predictedX, predictedY)
          ctx.stroke()

          ctx.fillStyle = rgba(0.7)
          ctx.beginPath()
          ctx.arc(cx, cy, 3, 0, Math.PI * 2)
          ctx.fill()

          ctx.strokeStyle = rgba(0.5)
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(predictedX, predictedY, 5, 0, Math.PI * 2)
          ctx.stroke()

          const arrowLen = 8
          const angle: number = Math.atan2(dy, dx)
          ctx.fillStyle = rgba(0.5)
          ctx.beginPath()
          ctx.moveTo(predictedX, predictedY)
          ctx.lineTo(
            predictedX - arrowLen * Math.cos(angle - 0.4),
            predictedY - arrowLen * Math.sin(angle - 0.4),
          )
          ctx.lineTo(
            predictedX - arrowLen * Math.cos(angle + 0.4),
            predictedY - arrowLen * Math.sin(angle + 0.4),
          )
          ctx.closePath()
          ctx.fill()
        }
      }

      rafId = requestAnimationFrame(render)
    }

    rafId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('resize', resize)
    }
  }, [isActive])

  if (!isActive) return null

  return <canvas ref={canvasRef} className="debug-overlay" />
}
