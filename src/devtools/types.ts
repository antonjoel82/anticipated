import type { Point, TriggerReason } from '../core/types.js'

export type PredictionFiredEvent = {
  elementId: string
  timestamp: number
  confidence: number
  predictedPoint: Point
  triggerReason?: TriggerReason
}

export type CallbackStartEvent = {
  elementId: string
  timestamp: number
}

export type CallbackEndEvent = {
  elementId: string
  timestamp: number
  durationMs: number
  status: 'success' | 'error'
}

export interface AnticipatedDevEventMap {
  'prediction:fired': PredictionFiredEvent
  'prediction:callback-start': CallbackStartEvent
  'prediction:callback-end': CallbackEndEvent
}

export type ProfilerOptions = {
  confirmationWindowMs?: number
  persistAcrossNavigations?: boolean
  maxEventsStored?: number
}

export type PredictionRecord = {
  elementId: string
  timestamp: number
  confidence: number
  callbackDurationMs?: number
  status?: 'success' | 'error'
  sourceUrl: string
}

export type ConfirmationRecord = {
  elementId: string
  predictionTimestamp: number
  confirmationTimestamp: number
  leadTimeMs: number
  sourceUrl: string
  confirmationType: 'click' | 'navigation' | 'manual'
}

export type FlowStep = {
  elementId: string
  sourceUrl: string
  leadTimeMs: number
  callbackDurationMs: number
}

export type FlowReport = {
  steps: FlowStep[]
  totalLeadTimeMs: number
  predictions: number
  confirmed: number
  precision: number
}

export type ProfilerReport = {
  predictions: number
  confirmed: number
  falsePositives: number
  missedNavigations: number
  precision: number
  recall: number
  f1: number
  avgLeadTimeMs: number
  totalTimeSavedMs: number
  avgCallbackDurationMs: number
  flows: FlowReport[]
}

export type PersistedState = {
  pendingPredictions: PredictionRecord[]
  confirmations: ConfirmationRecord[]
  currentFlowSteps: FlowStep[]
  completedFlows: FlowReport[]
  missedNavigations: number
  sessionStartedAt: number
}
