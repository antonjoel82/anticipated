import type { EngineOptions, ElementConfig, Tolerance, ToleranceRect, ToleranceZone, NormalizedZone } from './types.js'
import {
  MIN_PREDICTION_WINDOW_MS,
  MAX_PREDICTION_WINDOW_MS,
  MIN_BUFFER_SIZE,
  MAX_BUFFER_SIZE,
  MAX_TOLERANCE,
  MAX_TOLERANCE_ZONES,
} from './constants.js'

function validateRange(
  value: number,
  fieldName: string,
  min: number,
  max: number,
): void {
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}, got ${value}`)
  }
}

function validateSimpleTolerance(value: number | ToleranceRect): void {
  if (typeof value === 'number') {
    if (value < 0 || value > MAX_TOLERANCE) {
      throw new Error(`tolerance must be between 0 and ${MAX_TOLERANCE}, got ${value}`)
    }
    return
  }

  const sides: Array<keyof ToleranceRect> = ['top', 'right', 'bottom', 'left']
  for (const side of sides) {
    if (value[side] < 0 || value[side] > MAX_TOLERANCE) {
      throw new Error(`tolerance.${side} must be between 0 and ${MAX_TOLERANCE}, got ${value[side]}`)
    }
  }
}

function validateToleranceValue(value: Tolerance): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error('tolerance zones array must not be empty')
    }
    if (value.length > MAX_TOLERANCE_ZONES) {
      throw new Error(`tolerance zones array must have at most ${MAX_TOLERANCE_ZONES} entries, got ${value.length}`)
    }
    for (const zone of value) {
      validateSimpleTolerance(zone.distance)
      if (zone.factor < 0 || zone.factor > 1) {
        throw new Error(`tolerance zone factor must be between 0 and 1, got ${zone.factor}`)
      }
    }
    return
  }
  validateSimpleTolerance(value)
}

export function validateEngineOptions(options: EngineOptions | undefined): void {
  if (options === undefined) return

  if (options.predictionWindow !== undefined) {
    validateRange(options.predictionWindow, 'predictionWindow', MIN_PREDICTION_WINDOW_MS, MAX_PREDICTION_WINDOW_MS)
  }

  if (options.smoothingFactor !== undefined) {
    if (options.smoothingFactor <= 0 || options.smoothingFactor > 1) {
      throw new Error(`smoothingFactor must be between 0 (exclusive) and 1 (inclusive), got ${options.smoothingFactor}`)
    }
  }

  if (options.bufferSize !== undefined) {
    validateRange(options.bufferSize, 'bufferSize', MIN_BUFFER_SIZE, MAX_BUFFER_SIZE)
  }

  if (options.defaultTolerance !== undefined) {
    validateToleranceValue(options.defaultTolerance)
  }

  if (options.confidenceThreshold !== undefined) {
    validateRange(options.confidenceThreshold, 'confidenceThreshold', 0, 1)
  }

  if (options.minVelocityThreshold !== undefined) {
    validateRange(options.minVelocityThreshold, 'minVelocityThreshold', 0, 50)
  }

  if (options.decelerationWindowFloor !== undefined) {
    validateRange(options.decelerationWindowFloor, 'decelerationWindowFloor', 0.1, 1)
  }

  if (options.decelerationDampening !== undefined) {
    validateRange(options.decelerationDampening, 'decelerationDampening', 0, 2)
  }

  if (options.rayHitConfidence !== undefined) {
    validateRange(options.rayHitConfidence, 'rayHitConfidence', 0, 1)
  }

  if (options.distanceDecayRate !== undefined) {
    validateRange(options.distanceDecayRate, 'distanceDecayRate', 0, 5)
  }

  if (options.decelerationSensitivity !== undefined) {
    validateRange(options.decelerationSensitivity, 'decelerationSensitivity', 0, 1)
  }

  if (options.erraticSensitivity !== undefined) {
    validateRange(options.erraticSensitivity, 'erraticSensitivity', 0, 10)
  }

  if (options.cancelThreshold !== undefined) {
    validateRange(options.cancelThreshold, 'cancelThreshold', 0, 1)
  }

  if (options.factorWeights !== undefined) {
    const fw = options.factorWeights
    if (fw.trajectoryAlignment !== undefined) validateRange(fw.trajectoryAlignment, 'factorWeights.trajectoryAlignment', 0, 1)
    if (fw.distance !== undefined) validateRange(fw.distance, 'factorWeights.distance', 0, 1)
    if (fw.deceleration !== undefined) validateRange(fw.deceleration, 'factorWeights.deceleration', 0, 1)
    if (fw.erratic !== undefined) validateRange(fw.erratic, 'factorWeights.erratic', 0, 1)
  }
}

export function validateElementConfig(config: ElementConfig): void {
  if (config.tolerance !== undefined) {
    validateToleranceValue(config.tolerance)
  }
}

export function normalizeTolerance(tolerance: number | ToleranceRect | undefined): ToleranceRect {
  if (tolerance === undefined) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  if (typeof tolerance === 'number') {
    return { top: tolerance, right: tolerance, bottom: tolerance, left: tolerance }
  }

  return { top: tolerance.top, right: tolerance.right, bottom: tolerance.bottom, left: tolerance.left }
}

export function normalizeZones(tolerance: Tolerance | undefined): NormalizedZone[] {
  if (tolerance === undefined) {
    return [{ tolerance: { top: 0, right: 0, bottom: 0, left: 0 }, factor: 1.0 }]
  }

  if (Array.isArray(tolerance)) {
    return tolerance.map((zone: ToleranceZone) => ({
      tolerance: normalizeTolerance(zone.distance),
      factor: zone.factor,
    }))
  }

  return [{ tolerance: normalizeTolerance(tolerance), factor: 1.0 }]
}
