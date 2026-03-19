import type { FactorContext } from './types.js'
import { distanceToAABB } from '../distance.js'

// Formula: exp(-(D/S)² × k)
// D = point-to-AABB distance (0 when inside)
// S = (width + height) / 2 (average element dimension)
// k = distanceDecayRate (default 0.8)
export function distanceFactor(ctx: FactorContext): number {
  const r = ctx.element.rect
  const D = distanceToAABB(ctx.cursor.x, ctx.cursor.y, r)
  if (D === 0) return 1.0

  const w = r.right - r.left
  const h = r.bottom - r.top
  const S = (w + h) / 2

  if (S <= 0) return 0

  const ratio = D / S
  return Math.exp(-ratio * ratio * ctx.config.distanceDecayRate)
}
