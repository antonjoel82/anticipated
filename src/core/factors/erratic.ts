import type { FactorContext } from './types.js'
import type { TimestampedPoint } from '../types.js'

const MIN_SAMPLES = 6
const MIN_SEGMENT_LENGTH = 1.0

// Length-weighted circular variance penalizes jittery cursor movement.
// Weights segments by length so tiny jitter doesn't dominate deliberate motion.
export function erraticPenaltyFactor(ctx: FactorContext): number {
  if (ctx.buffer.length < MIN_SAMPLES) return 1.0

  let sumSin = 0
  let sumCos = 0
  let totalWeight = 0
  let prev: TimestampedPoint | null = null

  ctx.buffer.forEach((point) => {
    if (prev) {
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      const segmentLength = Math.hypot(dx, dy)

      if (segmentLength >= MIN_SEGMENT_LENGTH) {
        const angle = Math.atan2(dy, dx)
        sumSin += segmentLength * Math.sin(angle)
        sumCos += segmentLength * Math.cos(angle)
        totalWeight += segmentLength
      }
    }
    prev = point
  })

  if (totalWeight === 0) return 1.0

  const R = Math.hypot(sumCos, sumSin) / totalWeight
  const circularVariance = 1 - R

  return Math.exp(-circularVariance * ctx.config.erraticSensitivity)
}
