# foresee/devtools — Prediction Value Profiler Design

> **Package**: `foresee`
> **Date**: 2026-03-15
> **Status**: Draft
> **Approach**: A — Event Bus + Passive Correlation

## Overview

A developer-facing profiler that measures whether foresee's cursor trajectory predictions actually delivered measurable UX value. Ships as a `foresee/devtools` entrypoint — opt-in, tree-shakeable, zero overhead when not imported.

The core question it answers: *"Did the user navigate to what we predicted? Was the prefetch done in time? How much total time was saved — including across a multi-step flow?"*

## Prior Art & Competitive Analysis

| Tool | What it does | Gap |
|---|---|---|
| **ForesightJS devtools** | Visual debugger — trajectory overlay, element bounds, log panel. Tracks hit counts by strategy (trajectory, hover, tab, scroll). | No value measurement. No "was this prediction confirmed by navigation?" No lead time. No false positive rate. No cross-page tracking. |
| **Guess.js** | Offline prediction quality via Google Analytics transition matrix. | Batch analytics, not real-time instrumentation. No live session measurement. |
| **React DevTools Profiler** | Component render timing via `onRender` callback. Ring buffer per commit. | Component-scoped. No concept of navigation intent or prediction accuracy. |
| **Chrome Performance panel** | `performance.mark/measure` appear as spans in timeline. | Marks cleared on navigation — cannot measure multi-step flows. No aggregate metrics. |

**What's novel here**: Cross-navigation prediction correlation. Nobody has built a tool that says "across this 4-step user journey, foresee's predictions saved 1.2s total and had 85% precision."

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| What to measure | Prediction value (not engine overhead) | Engine overhead is covered by Chrome DevTools. Prediction value is novel and unsolved. |
| Audience | Library consumers (developers using foresee) | The strongest thing foresee can do is prove its own value to adopters. |
| Shipping format | `foresee/devtools` entrypoint | Matches existing `foresee/core`, `foresee/react` pattern. Tree-shakeable, opt-in. |
| Event system | Typed emitter mixin on TrajectoryEngine | Zero cost when unused. Same pattern as existing `subscribe()`. |
| Confirmation strategy | Click correlation (auto) + navigation observation (auto) + manual annotation (escape hatch) | Layered: covers most cases automatically, escape hatch for SPAs. |
| Cross-nav persistence | sessionStorage ring buffer | Survives navigations, tab-scoped, 5MB limit is plenty for event logs. |
| Flow detection | Automatic grouping of consecutive confirmed predictions | No consumer config needed. Breaks on unconfirmed navigations. |
| Metrics | Confusion matrix (TP/FP/FN) + lead time + flow breakdown | Industry-standard prediction quality metrics applied to UI intent. |
| Engine coupling | Event emission only, gated behind listener count | Profiler is fully decoupled. Engine doesn't know about devtools. |

## The Core Problem

foresee fires prefetch callbacks when it predicts the cursor is heading toward an element. But there's no way to measure whether those predictions actually helped:

```
predict → prefetch starts → prefetch completes → user clicks → navigation starts → page loads
         ↑ foresee controls this                  ↑ app controls this — foresee can only observe
```

The profiler bridges this gap by correlating prediction events against actual user actions.

## Event System (Engine Changes)

Add typed event emission to `TrajectoryEngine`. Minimal changes — gated behind a listener count check so there's zero overhead when no profiler is attached.

### Event Types

```typescript
interface ForeseeEventMap {
  'prediction:fired': {
    elementId: string
    timestamp: number          // performance.now()
    confidence: number
    predictedPoint: Point
    triggerReason?: TriggerReason
  }
  'prediction:callback-start': {
    elementId: string
    timestamp: number
  }
  'prediction:callback-end': {
    elementId: string
    timestamp: number
    durationMs: number
    status: 'success' | 'error'
  }
}
```

### Engine Integration

The existing `safeFireCallback` method is the only code that changes:

```typescript
// Before (current)
private safeFireCallback(callback: () => void | Promise<void>): void {
  try {
    Promise.resolve(callback()).catch(() => {})
  } catch {
    // Error-isolated
  }
}

// After (with event emission, gated)
private safeFireCallback(elementId: string, callback: () => void | Promise<void>): void {
  const hasListeners = this.devListeners.size > 0
  if (hasListeners) {
    this.emitDevEvent('prediction:callback-start', { elementId, timestamp: performance.now() })
  }

  const startTime = hasListeners ? performance.now() : 0

  try {
    const result = callback()
    if (result instanceof Promise) {
      result
        .then(() => {
          if (hasListeners) {
            this.emitDevEvent('prediction:callback-end', {
              elementId, timestamp: performance.now(),
              durationMs: performance.now() - startTime, status: 'success'
            })
          }
        })
        .catch(() => {
          if (hasListeners) {
            this.emitDevEvent('prediction:callback-end', {
              elementId, timestamp: performance.now(),
              durationMs: performance.now() - startTime, status: 'error'
            })
          }
        })
    } else if (hasListeners) {
      this.emitDevEvent('prediction:callback-end', {
        elementId, timestamp: performance.now(),
        durationMs: performance.now() - startTime, status: 'success'
      })
    }
  } catch {
    if (hasListeners) {
      this.emitDevEvent('prediction:callback-end', {
        elementId, timestamp: performance.now(),
        durationMs: performance.now() - startTime, status: 'error'
      })
    }
  }
}
```

The `prediction:fired` event is emitted in the `update()` loop, right before `safeFireCallback`, only when `canFire` is true.

### Dev Event Emitter

```typescript
// Added to TrajectoryEngine
private readonly devListeners = new Map<keyof ForeseeEventMap, Set<(data: any) => void>>()

onDev<K extends keyof ForeseeEventMap>(event: K, listener: (data: ForeseeEventMap[K]) => void): () => void {
  let set = this.devListeners.get(event)
  if (!set) {
    set = new Set()
    this.devListeners.set(event, set)
  }
  set.add(listener)
  return () => {
    set!.delete(listener)
    if (set!.size === 0) this.devListeners.delete(event)
  }
}

private emitDevEvent<K extends keyof ForeseeEventMap>(event: K, data: ForeseeEventMap[K]): void {
  const listeners = this.devListeners.get(event)
  if (!listeners) return
  for (const listener of listeners) {
    try { listener(data) } catch { /* never crash engine */ }
  }
}
```

## ForeseeProfiler Class

The consumer-facing API. Imported from `foresee/devtools`.

### Usage

```typescript
import { ForeseeProfiler } from 'foresee/devtools'
import { TrajectoryEngine } from 'foresee/core'

const engine = new TrajectoryEngine()
const profiler = new ForeseeProfiler(engine, {
  confirmationWindowMs: 2000,        // how long after prediction to wait for navigation
  persistAcrossNavigations: true,    // use sessionStorage for cross-page tracking
  maxEventsStored: 500,              // ring buffer size
})

// ... app runs ...

// Get aggregate report
const report = profiler.getReport()
```

### Report Shape

```typescript
type ProfilerReport = {
  // Raw counts
  predictions: number
  confirmed: number            // TP: predicted + user acted
  falsePositives: number       // FP: predicted + user went elsewhere / didn't act
  missedNavigations: number    // FN: user navigated somewhere we didn't predict

  // Derived metrics
  precision: number            // confirmed / (confirmed + falsePositives)
  recall: number               // confirmed / (confirmed + missedNavigations)
  f1: number                   // harmonic mean of precision and recall

  // Value metrics
  avgLeadTimeMs: number        // avg ms between prediction-fired and user-action
  totalTimeSavedMs: number     // sum of lead times for confirmed predictions
  avgCallbackDurationMs: number // avg time the prefetch callback took to complete

  // Multi-step flow breakdown
  flows: FlowReport[]
}

type FlowReport = {
  steps: Array<{
    elementId: string
    sourceUrl: string
    leadTimeMs: number
    callbackDurationMs: number
  }>
  totalLeadTimeMs: number
  predictions: number
  confirmed: number
  precision: number
}
```

### Constructor Options

```typescript
type ProfilerOptions = {
  confirmationWindowMs?: number    // Default: 2000. How long to wait for navigation after prediction.
  persistAcrossNavigations?: boolean // Default: true. Use sessionStorage for cross-page tracking.
  maxEventsStored?: number          // Default: 500. Ring buffer size in sessionStorage.
}
```

## Confirmation Strategies

The profiler needs to know when a prediction was "confirmed" — i.e., the user actually navigated to the predicted element. Three strategies, layered:

### 1. Click Correlation (Automatic)

Listen for `click` events on registered elements. If a prediction fired for element X and user clicks X within the confirmation window → True Positive.

```typescript
// Profiler attaches click listeners to tracked elements via engine's element map
// When click detected on element X:
//   1. Find most recent prediction for X within confirmationWindowMs
//   2. If found → TP, leadTime = click.timestamp - prediction.timestamp
//   3. If not found → this was a navigation without prediction (FN)
```

This is automatic and covers the 80% case (user clicks a link/button that foresee predicted).

### 2. Navigation Observation (Automatic)

Use `PerformanceObserver` for `navigation` entries and `popstate` events. If a prediction fired and a full page navigation occurs within the window → correlate.

```typescript
const navObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === 'navigation') {
      // Cross-reference against pending predictions in sessionStorage
    }
  }
})
navObserver.observe({ type: 'navigation', buffered: true })
```

This catches full page navigations (MPA links, form submissions) that click correlation misses.

### 3. Manual Annotation (Escape Hatch)

For SPA soft navigations (React Router, TanStack Router, etc.) where neither click correlation nor navigation observation work:

```typescript
// Consumer calls this when a soft navigation occurs
profiler.confirmNavigation('settings')
// or with URL context:
profiler.confirmNavigation('settings', { url: '/settings' })
```

### Strategy Priority

1. Click on tracked element → immediate confirmation
2. Full page navigation → sessionStorage correlation on next page load
3. Manual `confirmNavigation()` → explicit consumer signal

A prediction that isn't confirmed within `confirmationWindowMs` by any strategy is classified as a False Positive.

## Cross-Navigation Persistence

### sessionStorage Ring Buffer

```typescript
// Storage key
const STORAGE_KEY = 'foresee:profiler'

// Stored shape
type PersistedState = {
  pendingPredictions: PredictionEvent[]   // predictions awaiting confirmation
  confirmedEvents: ConfirmationEvent[]    // confirmed TP events
  flows: FlowState[]                     // in-progress flow tracking
  sessionStartedAt: number               // session boundary
}

// Ring buffer: when events exceed maxEventsStored, oldest are evicted
// Total payload stays well under sessionStorage's 5MB limit
// (~200 bytes per event × 500 events = ~100KB)
```

### Page Load Lifecycle

```
Page A:
  1. Engine runs, predictions fire
  2. Profiler records prediction events
  3. User clicks tracked element → confirmed (TP)
  4. Profiler writes state to sessionStorage
  5. User clicks a link → full navigation begins

Page B (new page load):
  1. Profiler reads sessionStorage
  2. Checks: was there a pending prediction for this URL/element?
  3. If yes → confirm it (TP), compute lead time
  4. Continue tracking new predictions
  5. Update flow: [Page A prediction → Page B load → Page B predictions → ...]
```

### Flow Detection

A "flow" is a sequence of consecutive confirmed predictions within a session.

```
Flow starts:  First confirmed prediction in a session (or after a break)
Flow continues: Next confirmed prediction within confirmationWindowMs of last action
Flow breaks:   Navigation without preceding prediction (FN), or session timeout
```

Example:
```
User journey: Home → Products → Product Detail → Cart → Checkout

foresee predictions:
  Home:          predicted "Products" ✓ (TP, lead: 340ms)
  Products:      predicted "Product Detail" ✓ (TP, lead: 210ms)
  Product Detail: predicted "Cart" ✓ (TP, lead: 450ms)
  Cart:          predicted "Checkout" ✓ (TP, lead: 180ms)

Flow report:
  steps: 4, confirmed: 4, precision: 1.0, totalLeadTime: 1180ms
  → "foresee saved 1.18 seconds across this 4-step checkout flow"
```

## Package Architecture

```
src/
  devtools/
    profiler.ts              # ForeseeProfiler class — main consumer API
    events.ts                # ForeseeEventMap types + emitter mixin
    session-store.ts         # sessionStorage ring buffer read/write
    correlation.ts           # Click / navigation / manual confirmation logic
    metrics.ts               # Precision, recall, lead time, flow computation
    types.ts                 # ProfilerReport, FlowReport, ProfilerOptions, etc.
    index.ts                 # Public exports
```

New entrypoint in `package.json`:
```json
{
  "./devtools": {
    "types": "./dist/devtools.d.ts",
    "import": "./dist/devtools.js",
    "require": "./dist/devtools.cjs"
  }
}
```

New entry in `tsup.config.ts`:
```typescript
entry: ['src/index.ts', 'src/core/index.ts', 'src/react/index.ts', 'src/devtools/index.ts']
```

## Public API Summary

### From `foresee/core` (engine changes)

```typescript
class TrajectoryEngine {
  // ... existing methods ...

  // NEW: Dev event subscription (zero overhead when no listeners)
  onDev<K extends keyof ForeseeEventMap>(
    event: K,
    listener: (data: ForeseeEventMap[K]) => void
  ): () => void
}
```

### From `foresee/devtools`

```typescript
class ForeseeProfiler {
  constructor(engine: TrajectoryEngine, options?: ProfilerOptions)

  // Reports
  getReport(): ProfilerReport
  getFlows(): FlowReport[]

  // Manual confirmation (SPA escape hatch)
  confirmNavigation(elementId: string, context?: { url?: string }): void

  // Lifecycle
  reset(): void       // Clear all recorded data
  destroy(): void     // Unsubscribe from engine, clear listeners
}
```

## Testing Strategy

### Unit Tests
- Event emission: verify events fire with correct payloads
- Click correlation: simulated clicks on tracked elements → TP classification
- Confirmation window: predictions that expire → FP classification
- Metrics computation: precision, recall, F1, lead time from known event sequences
- sessionStorage persistence: write/read round-trip, ring buffer eviction
- Flow detection: consecutive confirmations group into flows, breaks on missed navigations

### Integration Tests
- Full loop: engine predicts → callback fires → user clicks → profiler confirms → report accurate
- Cross-navigation: write prediction on page A → read + confirm on page B (simulated via sessionStorage)
- Multiple elements: independent predictions for different elements, correct per-element tracking

## Out of Scope (This Iteration)

- **Visual overlay / React component** — can be built later on top of the event bus
- **Chrome DevTools extension / custom Performance panel track** — `performance.mark` integration can be a thin layer later
- **Engine overhead profiling** — Chrome DevTools handles this natively
- **Automatic URL-to-element mapping** — consumers use click correlation or manual annotation
- **Server-side analytics pipeline** — consumers can `getReport()` and send data wherever they want
- **Bandwidth waste measurement** — would require wrapping fetch/XHR, too invasive for v1

## Constants

```typescript
export const DEFAULT_CONFIRMATION_WINDOW_MS = 2000
export const DEFAULT_MAX_EVENTS_STORED = 500
export const SESSION_STORAGE_KEY = 'foresee:profiler'
export const FLOW_BREAK_TIMEOUT_MS = 30000   // 30s without activity breaks a flow
```
