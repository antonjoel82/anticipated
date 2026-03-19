import type { FactorContext } from './types.js'
import { segmentAABB } from '../intersection.js'

/**
 * Trajectory alignment factor (hard gate).
 *
 * - Cursor inside element → 1.0
 * - Ray hits any expanded zone AABB → rayHitConfidence (default 0.85)
 * - Ray misses all zones → 0.0
 */
export function trajectoryAlignmentFactor(ctx: FactorContext): number {
  const { cursor, predicted, element, zones, config } = ctx
  const r = element.rect

  const inside =
    cursor.x >= r.left && cursor.x <= r.right &&
    cursor.y >= r.top && cursor.y <= r.bottom

  if (inside) return 1.0

  const dx = predicted.x - cursor.x
  const dy = predicted.y - cursor.y

  for (const zone of zones) {
    const zr = zone.rect
    const cursorInZone =
      cursor.x >= zr.left && cursor.x <= zr.right &&
      cursor.y >= zr.top && cursor.y <= zr.bottom

    if (cursorInZone) return config.rayHitConfidence

    if (segmentAABB(cursor.x, cursor.y, dx, dy, zr.left, zr.top, zr.right, zr.bottom)) {
      return config.rayHitConfidence
    }
  }

  return 0
}
