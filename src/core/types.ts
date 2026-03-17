export type Point = {
  x: number
  y: number
}

export type Velocity = {
  x: number
  y: number
  magnitude: number
  angle: number
}

export type ToleranceRect = {
  top: number
  right: number
  bottom: number
  left: number
}

export type Tolerance = number | ToleranceRect

export type Rect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type TrajectorySnapshot = {
  isIntersecting: boolean
  distancePx: number
  velocity: Velocity
  confidence: number
  predictedPoint: Point
}

export type TriggerReason = 'trajectory' | 'distance' | 'velocity' | 'confidence' | 'custom'

export type TriggerResult = {
  isTriggered: boolean
  reason?: TriggerReason
}

export type TriggerProfileOnce = { type: 'once' }
export type TriggerProfileOnEnter = { type: 'on_enter' }
export type TriggerProfileEveryFrame = { type: 'every_frame' }
export type TriggerProfileCooldown = { type: 'cooldown'; intervalMs: number }

export type TriggerProfile =
  | TriggerProfileOnce
  | TriggerProfileOnEnter
  | TriggerProfileEveryFrame
  | TriggerProfileCooldown

export type ElementConfig = {
  triggerOn: (snapshot: TrajectorySnapshot) => TriggerResult
  whenTriggered: () => void | Promise<void>
  profile: TriggerProfile
  tolerance?: Tolerance
}

export type ConvenienceConfig = {
  whenApproaching: () => void | Promise<void>
  tolerance?: Tolerance
}

export type RegisterConfig = ElementConfig | ConvenienceConfig

export type EngineOptions = {
  predictionWindow?: number
  smoothingFactor?: number
  bufferSize?: number
  eventTarget?: EventTarget
  defaultTolerance?: Tolerance
  confidenceSaturationFrames?: number
  confidenceDecayRate?: number
  confidenceThreshold?: number
  minVelocityThreshold?: number
  decelerationWindowFloor?: number
  decelerationDampening?: number
}

export type ElementState = {
  wasTriggeredLastFrame: boolean
  hasFiredOnce: boolean
  lastFireTimestamp: number
  consecutiveHitFrames: number
}

export type TimestampedPoint = {
  x: number
  y: number
  timestamp: number
}

export type TriggerOptions = {
  dangerouslyIgnoreProfile?: boolean
}

export function isConvenienceConfig(config: RegisterConfig): config is ConvenienceConfig {
  return 'whenApproaching' in config
}
