export const DEFAULT_PREDICTION_WINDOW_MS = 150
export const MIN_PREDICTION_WINDOW_MS = 50
export const MAX_PREDICTION_WINDOW_MS = 500

export const DEFAULT_SMOOTHING_FACTOR = 0.3

export const DEFAULT_BUFFER_SIZE = 8
export const MIN_BUFFER_SIZE = 2
export const MAX_BUFFER_SIZE = 30

export const DEFAULT_TOLERANCE = 0
export const MAX_TOLERANCE = 2000

export const DECELERATION_WINDOW_FLOOR = 0.3
export const DECELERATION_DAMPENING = 0.5

export const MIN_VELOCITY_THRESHOLD = 5

export const DEFAULT_COOLDOWN_INTERVAL_MS = 300

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.3

// Hover priority: below this velocity (px/s), cursor is considered "hovering"
// and an element under the cursor gets instant confidence = 1.0.
// Derived from hoverIntent's sensitivity: 6px / 100ms ≈ 60 px/s.
export const HOVER_VELOCITY_THRESHOLD = 50

export const MAX_TOLERANCE_ZONES = 5

export const DEFAULT_RAY_HIT_CONFIDENCE = 0.85
export const DEFAULT_DISTANCE_DECAY_RATE = 0.8
export const DEFAULT_DECELERATION_SENSITIVITY = 0.003
export const DEFAULT_ERRATIC_SENSITIVITY = 1.5
export const DEFAULT_CANCEL_THRESHOLD = 0.15

export const DEFAULT_CONFIDENCE_DECAY_BASE_RATE = 0.03
export const DEFAULT_CONFIDENCE_DECAY_ACCELERATION = 0.04
