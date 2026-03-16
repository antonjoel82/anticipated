import type { PersistedState, ProfilerReport } from './types.js'

export function computeReport(state: PersistedState): ProfilerReport {
  const confirmed = state.confirmations.length
  const falsePositives = state.pendingPredictions.length
  const missedNavigations = state.missedNavigations
  const predictions = confirmed + falsePositives

  const precision = predictions > 0 ? confirmed / predictions : 0
  const recall = (confirmed + missedNavigations) > 0
    ? confirmed / (confirmed + missedNavigations)
    : 0
  const f1 = (precision + recall) > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0

  const leadTimes = state.confirmations.map((c) => c.leadTimeMs)
  const avgLeadTimeMs = leadTimes.length > 0
    ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
    : 0
  const totalTimeSavedMs = leadTimes.reduce((a, b) => a + b, 0)

  const callbackDurations = state.confirmations
    .map((c) => {
      const pred = state.pendingPredictions.find(
        (p) => p.elementId === c.elementId && p.timestamp === c.predictionTimestamp
      )
      return pred?.callbackDurationMs
    })
    .filter((d): d is number => d !== undefined)
  const avgCallbackDurationMs = callbackDurations.length > 0
    ? callbackDurations.reduce((a, b) => a + b, 0) / callbackDurations.length
    : 0

  return {
    predictions,
    confirmed,
    falsePositives,
    missedNavigations,
    precision,
    recall,
    f1,
    avgLeadTimeMs,
    totalTimeSavedMs,
    avgCallbackDurationMs,
    flows: [...state.completedFlows],
  }
}
