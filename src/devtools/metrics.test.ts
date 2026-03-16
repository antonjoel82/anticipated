import { describe, it, expect } from 'vitest'
import { computeReport } from './metrics.js'
import type { PersistedState } from './types.js'

function createState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    pendingPredictions: [],
    confirmations: [],
    currentFlowSteps: [],
    completedFlows: [],
    missedNavigations: 0,
    sessionStartedAt: 0,
    ...overrides,
  }
}

describe('computeReport', () => {
  it('returns zeros for empty state', () => {
    const report = computeReport(createState())
    expect(report.predictions).toBe(0)
    expect(report.confirmed).toBe(0)
    expect(report.precision).toBe(0)
    expect(report.recall).toBe(0)
    expect(report.f1).toBe(0)
  })

  it('computes precision correctly', () => {
    const report = computeReport(createState({
      confirmations: [
        { elementId: 'a', predictionTimestamp: 100, confirmationTimestamp: 200, leadTimeMs: 100, sourceUrl: '/', confirmationType: 'click' },
        { elementId: 'b', predictionTimestamp: 300, confirmationTimestamp: 400, leadTimeMs: 100, sourceUrl: '/', confirmationType: 'click' },
      ],
      pendingPredictions: [
        { elementId: 'c', timestamp: 500, confidence: 0.8, sourceUrl: '/' },
      ],
    }))
    expect(report.confirmed).toBe(2)
    expect(report.falsePositives).toBe(1)
    expect(report.precision).toBeCloseTo(2 / 3, 2)
  })

  it('computes recall correctly', () => {
    const report = computeReport(createState({
      confirmations: [
        { elementId: 'a', predictionTimestamp: 100, confirmationTimestamp: 200, leadTimeMs: 100, sourceUrl: '/', confirmationType: 'click' },
      ],
      missedNavigations: 2,
    }))
    expect(report.confirmed).toBe(1)
    expect(report.missedNavigations).toBe(2)
    expect(report.recall).toBeCloseTo(1 / 3, 2)
  })

  it('computes F1 as harmonic mean', () => {
    const report = computeReport(createState({
      confirmations: [
        { elementId: 'a', predictionTimestamp: 100, confirmationTimestamp: 200, leadTimeMs: 100, sourceUrl: '/', confirmationType: 'click' },
      ],
      pendingPredictions: [
        { elementId: 'b', timestamp: 300, confidence: 0.8, sourceUrl: '/' },
      ],
      missedNavigations: 1,
    }))
    expect(report.f1).toBeCloseTo(0.5, 2)
  })

  it('computes lead time correctly', () => {
    const report = computeReport(createState({
      confirmations: [
        { elementId: 'a', predictionTimestamp: 100, confirmationTimestamp: 400, leadTimeMs: 300, sourceUrl: '/', confirmationType: 'click' },
        { elementId: 'b', predictionTimestamp: 500, confirmationTimestamp: 700, leadTimeMs: 200, sourceUrl: '/', confirmationType: 'click' },
      ],
    }))
    expect(report.avgLeadTimeMs).toBeCloseTo(250, 0)
    expect(report.totalTimeSavedMs).toBeCloseTo(500, 0)
  })

  it('includes completed flows in report', () => {
    const report = computeReport(createState({
      confirmations: [
        { elementId: 'a', predictionTimestamp: 100, confirmationTimestamp: 200, leadTimeMs: 100, sourceUrl: '/', confirmationType: 'click' },
      ],
      completedFlows: [
        {
          steps: [
            { elementId: 'nav-a', sourceUrl: '/', leadTimeMs: 200, callbackDurationMs: 50 },
            { elementId: 'nav-b', sourceUrl: '/a', leadTimeMs: 150, callbackDurationMs: 30 },
          ],
          totalLeadTimeMs: 350,
          predictions: 2,
          confirmed: 2,
          precision: 1.0,
        },
      ],
    }))
    expect(report.flows).toHaveLength(1)
    expect(report.flows[0].totalLeadTimeMs).toBe(350)
  })
})
