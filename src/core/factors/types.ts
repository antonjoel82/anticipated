import type { Point, Velocity, Rect, TimestampedPoint } from '../types.js'
import type { CircularBuffer } from '../buffer.js'

export type FactorConfig = {
  rayHitConfidence: number
  distanceDecayRate: number
  decelerationSensitivity: number
  erraticSensitivity: number
}

export type ExpandedZoneRect = {
  rect: Rect
  factor: number
}

export type FactorContext = {
  cursor: Point
  predicted: Point
  velocity: Velocity
  previousSpeed: number
  dt: number
  element: { rect: Rect; id: string }
  zones: ReadonlyArray<ExpandedZoneRect>
  buffer: CircularBuffer<TimestampedPoint>
  config: FactorConfig
}

export type WeightedFactor = {
  compute: (ctx: FactorContext) => number
  weight: number
}
