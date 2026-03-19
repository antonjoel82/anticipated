import type { EngineOptions } from './types.js'

export const presets = {
  default: {} satisfies Partial<EngineOptions>,

  hoverOnly: {
    features: {
      rayCasting: false,
      erraticDetection: false,
      passThroughDetection: false,
    },
    predictionWindow: 80,
    minVelocityThreshold: 30,
  } satisfies Partial<EngineOptions>,

  denseGrid: {
    smoothingFactor: 0.5,
    defaultTolerance: 2,
    factorWeights: { erratic: 0.8 },
  } satisfies Partial<EngineOptions>,

  dashboard: {
    defaultTolerance: 20,
    predictionWindow: 120,
    factorWeights: { distance: 0.8 },
  } satisfies Partial<EngineOptions>,

  navigation: {
    defaultTolerance: 5,
    predictionWindow: 100,
  } satisfies Partial<EngineOptions>,
} as const
