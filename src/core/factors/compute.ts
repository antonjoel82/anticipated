import type { WeightedFactor, FactorContext } from './types.js'

/**
 * Compute confidence as the product of weighted factors.
 *
 * For each factor: effective = 1 - weight × (1 - raw)
 * weight=0 makes the factor invisible (always 1.0).
 * weight=1 applies the raw score directly.
 *
 * All inputs are clamped to [0, 1] and guarded against NaN/Infinity.
 */
export function computeConfidence(factors: WeightedFactor[], ctx: FactorContext): number {
  let confidence = 1.0
  for (const { compute, weight } of factors) {
    const rawUnclamped = compute(ctx)
    const raw = Number.isFinite(rawUnclamped) ? Math.max(0, Math.min(1, rawUnclamped)) : 0
    const w = Math.max(0, Math.min(1, weight))
    if (raw === 0 && w === 1) return 0
    confidence *= 1 - w * (1 - raw)
  }
  return confidence
}

/**
 * Confidence result including individual factor scores.
 * `scores` array is parallel to the `factors` input — index 0 is the first factor, etc.
 */
export type ConfidenceBreakdown = {
  confidence: number
  scores: readonly number[]
}

/**
 * Same multiplicative pipeline as `computeConfidence`, but also returns the
 * raw (clamped) score of each individual factor for diagnostic display.
 */
export function computeConfidenceWithFactors(factors: WeightedFactor[], ctx: FactorContext): ConfidenceBreakdown {
  const scores: number[] = new Array(factors.length)
  let confidence = 1.0
  for (let i = 0; i < factors.length; i++) {
    const { compute, weight } = factors[i]
    const rawUnclamped = compute(ctx)
    const raw = Number.isFinite(rawUnclamped) ? Math.max(0, Math.min(1, rawUnclamped)) : 0
    scores[i] = raw
    const w = Math.max(0, Math.min(1, weight))
    if (raw === 0 && w === 1) {
      for (let j = i + 1; j < factors.length; j++) scores[j] = 0
      return { confidence: 0, scores }
    }
    confidence *= 1 - w * (1 - raw)
  }
  return { confidence, scores }
}
