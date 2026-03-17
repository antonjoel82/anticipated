import type { EngineOptions, ElementConfig, Tolerance, ToleranceRect } from './types.js'
import {
  MIN_PREDICTION_WINDOW_MS,
  MAX_PREDICTION_WINDOW_MS,
  MIN_BUFFER_SIZE,
  MAX_BUFFER_SIZE,
  MAX_TOLERANCE,
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

function validateToleranceValue(value: Tolerance): void {
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

  if (options.confidenceSaturationFrames !== undefined) {
    validateRange(options.confidenceSaturationFrames, 'confidenceSaturationFrames', 1, 60)
  }

  if (options.confidenceDecayRate !== undefined) {
    validateRange(options.confidenceDecayRate, 'confidenceDecayRate', 0, 5)
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
}

export function validateElementConfig(config: ElementConfig): void {
  if (config.tolerance !== undefined) {
    validateToleranceValue(config.tolerance)
  }
}

export function normalizeTolerance(tolerance: Tolerance | undefined): ToleranceRect {
  if (tolerance === undefined) {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }

  if (typeof tolerance === 'number') {
    return { top: tolerance, right: tolerance, bottom: tolerance, left: tolerance }
  }

  return { top: tolerance.top, right: tolerance.right, bottom: tolerance.bottom, left: tolerance.left }
}
