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

export type ToleranceZone = {
  distance: number | ToleranceRect
  factor: number
}

export type Tolerance = number | ToleranceRect | ToleranceZone[]

export type Rect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type FactorScores = {
  alignment: number
  distance: number
  deceleration: number
  erratic: number
}

export type TrajectorySnapshot = {
  isIntersecting: boolean
  distancePx: number
  velocity: Velocity
  confidence: number
  predictedPoint: Point
  factors: FactorScores
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

export type TriggerCleanup = () => void

export type WhenTriggered =
  | ((signal: AbortSignal) => void | TriggerCleanup | Promise<void | TriggerCleanup>)

export type ElementConfig = {
  triggerOn: (snapshot: TrajectorySnapshot) => TriggerResult
  whenTriggered: WhenTriggered
  profile: TriggerProfile
  tolerance?: Tolerance
}

export type ConvenienceConfig = {
  whenApproaching: WhenTriggered
  tolerance?: Tolerance
}

export type ActiveTrigger = {
  controller: AbortController
  cleanup: TriggerCleanup | null
}

export type RegisterConfig = ElementConfig | ConvenienceConfig

export type FeatureFlags = {
  rayCasting: boolean
  distanceScoring: boolean
  erraticDetection: boolean
  passThroughDetection: boolean
}

export type FactorWeights = {
  trajectoryAlignment: number
  distance: number
  deceleration: number
  erratic: number
}

export type EngineOptions = {
  predictionWindow?: number
  smoothingFactor?: number
  bufferSize?: number
  eventTarget?: EventTarget
  defaultTolerance?: Tolerance
  confidenceThreshold?: number
  minVelocityThreshold?: number
  decelerationWindowFloor?: number
  decelerationDampening?: number
  features?: Partial<FeatureFlags>
  factorWeights?: Partial<FactorWeights>
  rayHitConfidence?: number
  distanceDecayRate?: number
  decelerationSensitivity?: number
  erraticSensitivity?: number
  cancelThreshold?: number
  confidenceDecayBaseRate?: number
  confidenceDecayAcceleration?: number
}

export type NormalizedZone = {
  tolerance: ToleranceRect
  factor: number
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
