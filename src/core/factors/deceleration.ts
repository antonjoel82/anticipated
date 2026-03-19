import type { FactorContext } from './types.js'

const NEUTRAL = 0.5

// Sigmoid of smoothed acceleration:
// Decelerating → approaches 1.0 (intent to stop)
// Constant speed → 0.5 (neutral)
// Accelerating → approaches 0.0 (passing through)
export function decelerationFactor(ctx: FactorContext): number {
  if (!Number.isFinite(ctx.dt) || ctx.dt <= 0) return NEUTRAL

  const acceleration = (ctx.velocity.magnitude - ctx.previousSpeed) / ctx.dt

  if (!Number.isFinite(acceleration)) return NEUTRAL

  return 1 / (1 + Math.exp(acceleration * ctx.config.decelerationSensitivity))
}
