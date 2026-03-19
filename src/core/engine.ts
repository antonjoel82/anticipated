import type {
  EngineOptions,
  ElementConfig,
  RegisterConfig,
  ConvenienceConfig,
  TrajectorySnapshot,
  FactorScores,
  TriggerResult,
  Rect,
  NormalizedZone,
  ElementState,
  TriggerOptions,
  Point,
  FeatureFlags,
  ActiveTrigger,
} from './types.js'
import { isConvenienceConfig } from './types.js'
import { validateEngineOptions, validateElementConfig, normalizeZones } from './validators.js'
import { createPredictionState, updatePrediction } from './prediction.js'
import type { PredictionState } from './prediction.js'
import { segmentAABB } from './intersection.js'
import { distanceToAABB } from './distance.js'
import { createElementState, shouldFire, updateElementState } from './triggers.js'
import { computeConfidenceWithFactors } from './factors/compute.js'
import { trajectoryAlignmentFactor } from './factors/alignment.js'
import { distanceFactor } from './factors/distance-factor.js'
import { decelerationFactor } from './factors/deceleration.js'
import { erraticPenaltyFactor } from './factors/erratic.js'
import type { WeightedFactor, FactorContext, FactorConfig, ExpandedZoneRect } from './factors/types.js'
import {
  DEFAULT_PREDICTION_WINDOW_MS,
  DEFAULT_SMOOTHING_FACTOR,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_CONFIDENCE_THRESHOLD,
  HOVER_VELOCITY_THRESHOLD,
  DEFAULT_RAY_HIT_CONFIDENCE,
  DEFAULT_DISTANCE_DECAY_RATE,
  DEFAULT_DECELERATION_SENSITIVITY,
  DEFAULT_ERRATIC_SENSITIVITY,
  DEFAULT_CANCEL_THRESHOLD,
  DEFAULT_CONFIDENCE_DECAY_BASE_RATE,
  DEFAULT_CONFIDENCE_DECAY_ACCELERATION,
} from './constants.js'
import { DevEventEmitter } from '../devtools/events.js'
import type { AnticipatedDevEventMap } from '../devtools/types.js'

type RegisteredElement = {
  element: HTMLElement
  config: ElementConfig
  state: ElementState
  cachedRect: Rect
  normalizedZones: NormalizedZone[]
  previousConfidence: number
  consecutiveDecayFrames: number
}

export class TrajectoryEngine {
  private readonly elements = new Map<string, RegisteredElement>()
  private readonly snapshots = new Map<string, TrajectorySnapshot>()
  private readonly globalSubscribers = new Set<() => void>()
  private readonly elementSubscribers = new Map<string, Set<() => void>>()
  private readonly devEmitter = new DevEventEmitter()
  private readonly elementToId = new WeakMap<HTMLElement, string>()
  private readonly activeTriggers = new Map<string, ActiveTrigger>()
  private readonly cancelThreshold: number
  private readonly confidenceDecayBaseRate: number
  private readonly confidenceDecayAcceleration: number

  private predictionState: PredictionState
  private readonly defaultZones: NormalizedZone[]
  private readonly confidenceThreshold: number
  private readonly factors: WeightedFactor[]
  private readonly factorConfig: FactorConfig
  private readonly featureFlags: FeatureFlags
  private lastTimestamp: number = 0
  private isConnected: boolean = false
  private isDestroyed: boolean = false
  private rafId: number = 0
  private rectInvalidationRafId: number = 0
  private latestPointerEvent: PointerEvent | null = null
  private readonly eventTarget: EventTarget | undefined

  private readonly handlePointerMove: (e: Event) => void
  private readonly handleScroll: () => void
  private resizeObserver: ResizeObserver | null = null

  constructor(options?: EngineOptions) {
    validateEngineOptions(options)

    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
    this.cancelThreshold = options?.cancelThreshold ?? DEFAULT_CANCEL_THRESHOLD
    this.confidenceDecayBaseRate = options?.confidenceDecayBaseRate ?? DEFAULT_CONFIDENCE_DECAY_BASE_RATE
    this.confidenceDecayAcceleration = options?.confidenceDecayAcceleration ?? DEFAULT_CONFIDENCE_DECAY_ACCELERATION

    this.featureFlags = {
      rayCasting: options?.features?.rayCasting ?? true,
      distanceScoring: options?.features?.distanceScoring ?? true,
      erraticDetection: options?.features?.erraticDetection ?? true,
      passThroughDetection: options?.features?.passThroughDetection ?? true,
    }

    this.factorConfig = {
      rayHitConfidence: options?.rayHitConfidence ?? DEFAULT_RAY_HIT_CONFIDENCE,
      distanceDecayRate: options?.distanceDecayRate ?? DEFAULT_DISTANCE_DECAY_RATE,
      decelerationSensitivity: options?.decelerationSensitivity ?? DEFAULT_DECELERATION_SENSITIVITY,
      erraticSensitivity: options?.erraticSensitivity ?? DEFAULT_ERRATIC_SENSITIVITY,
    }

    const weights = options?.factorWeights
    this.factors = [
      { compute: trajectoryAlignmentFactor, weight: this.featureFlags.rayCasting ? (weights?.trajectoryAlignment ?? 1.0) : 0 },
      { compute: distanceFactor, weight: this.featureFlags.distanceScoring ? (weights?.distance ?? 1.0) : 0 },
      { compute: decelerationFactor, weight: this.featureFlags.passThroughDetection ? (weights?.deceleration ?? 1.0) : 0 },
      { compute: erraticPenaltyFactor, weight: this.featureFlags.erraticDetection ? (weights?.erratic ?? 1.0) : 0 },
    ]

    this.predictionState = createPredictionState({
      smoothingFactor: options?.smoothingFactor ?? DEFAULT_SMOOTHING_FACTOR,
      predictionWindowMs: options?.predictionWindow ?? DEFAULT_PREDICTION_WINDOW_MS,
      bufferSize: options?.bufferSize ?? DEFAULT_BUFFER_SIZE,
      decelerationWindowFloor: options?.decelerationWindowFloor,
      decelerationDampening: options?.decelerationDampening,
      minVelocityThreshold: options?.minVelocityThreshold,
    })

    this.defaultZones = normalizeZones(options?.defaultTolerance)
    this.eventTarget = options?.eventTarget
      ?? (typeof document !== 'undefined' ? document : undefined)

    this.handlePointerMove = (e: Event) => {
      this.latestPointerEvent = e as PointerEvent
      this.scheduleUpdate()
    }

    this.handleScroll = () => {
      this.scheduleRectInvalidation()
    }
  }

  register(id: string, element: HTMLElement, config: RegisterConfig): void {
    const resolvedConfig: ElementConfig = isConvenienceConfig(config)
      ? this.expandConvenienceConfig(config)
      : config

    validateElementConfig(resolvedConfig)

    const zones: NormalizedZone[] = resolvedConfig.tolerance !== undefined
      ? normalizeZones(resolvedConfig.tolerance)
      : this.defaultZones

    const existing: RegisteredElement | undefined = this.elements.get(id)
    if (existing) {
      const hasElementChanged: boolean = existing.element !== element
      if (hasElementChanged) {
        this.elementToId.delete(existing.element)
        if (this.resizeObserver) {
          this.resizeObserver.unobserve(existing.element)
          this.resizeObserver.observe(element)
        }
      }
      this.elementToId.set(element, id)
      existing.element = element
      existing.config = resolvedConfig
      existing.normalizedZones = zones
      this.refreshRect(existing)
      return
    }

    this.elementToId.set(element, id)

    const registered: RegisteredElement = {
      element,
      config: resolvedConfig,
      state: createElementState(),
      cachedRect: { left: 0, top: 0, right: 0, bottom: 0 },
      normalizedZones: zones,
      previousConfidence: 0,
      consecutiveDecayFrames: 0,
    }

    this.elements.set(id, registered)
    this.refreshRect(registered)

    if (this.resizeObserver) {
      this.resizeObserver.observe(element)
    }
  }

  unregister(id: string): void {
    const registered: RegisteredElement | undefined = this.elements.get(id)
    if (!registered) return

    this.elementToId.delete(registered.element)
    this.cancelActiveTrigger(id)

    if (this.resizeObserver) {
      this.resizeObserver.unobserve(registered.element)
    }

    this.elements.delete(id)
    this.snapshots.delete(id)
    this.notifyElementSubscribers(id)
    this.notifyGlobalSubscribers()
  }

  trigger(id: string, options?: TriggerOptions): void {
    const registered: RegisteredElement | undefined = this.elements.get(id)
    if (!registered) {
      throw new Error(`No element registered with id "${id}"`)
    }

    const isIgnoringProfile: boolean = options?.dangerouslyIgnoreProfile === true

    if (isIgnoringProfile) {
      this.emitDevEventsAndFire(id, registered)
      return
    }

    const canFire: boolean = shouldFire(registered.config.profile, registered.state, true, performance.now())
    if (canFire) {
      this.emitDevEventsAndFire(id, registered)
      updateElementState(registered.state, true, performance.now(), true)
    }
  }

  onDev<K extends keyof AnticipatedDevEventMap>(
    event: K,
    listener: (data: AnticipatedDevEventMap[K]) => void,
  ): () => void {
    return this.devEmitter.on(event, listener)
  }

  resolveIdFromEventTarget(target: EventTarget | null): string | null {
    if (!target || !(target instanceof HTMLElement)) return null

    let current: HTMLElement | null = target
    while (current) {
      const id = this.elementToId.get(current)
      if (id !== undefined) return id
      current = current.parentElement
    }
    return null
  }

  getElementById(id: string): HTMLElement | null {
    return this.elements.get(id)?.element ?? null
  }

  getSnapshot(id: string): TrajectorySnapshot | undefined {
    return this.snapshots.get(id)
  }

  getAllSnapshots(): ReadonlyMap<string, TrajectorySnapshot> {
    return this.snapshots
  }

  getElementZones(id: string): ReadonlyArray<NormalizedZone> | undefined {
    return this.elements.get(id)?.normalizedZones
  }

  subscribe(callback: () => void): () => void {
    this.globalSubscribers.add(callback)
    return () => {
      this.globalSubscribers.delete(callback)
    }
  }

  subscribeToElement(id: string): (callback: () => void) => () => void {
    return (callback: () => void) => {
      let subscribers: Set<() => void> | undefined = this.elementSubscribers.get(id)
      if (!subscribers) {
        subscribers = new Set()
        this.elementSubscribers.set(id, subscribers)
      }
      subscribers.add(callback)
      return () => {
        subscribers!.delete(callback)
        if (subscribers!.size === 0) {
          this.elementSubscribers.delete(id)
        }
      }
    }
  }

  connect(): void {
    if (this.isConnected || this.isDestroyed) return

    this.eventTarget?.addEventListener('pointermove', this.handlePointerMove)

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.handleScroll, { passive: true })

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.scheduleRectInvalidation()
        })

        for (const [, registered] of this.elements) {
          this.resizeObserver.observe(registered.element)
        }
      }
    }

    this.isConnected = true
  }

  disconnect(): void {
    if (!this.isConnected) return

    this.eventTarget?.removeEventListener('pointermove', this.handlePointerMove)

    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.handleScroll)
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.rectInvalidationRafId !== 0) {
      cancelAnimationFrame(this.rectInvalidationRafId)
      this.rectInvalidationRafId = 0
    }

    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    this.isConnected = false
    this.latestPointerEvent = null
  }

  destroy(): void {
    if (this.isDestroyed) return
    this.disconnect()
    this.cancelAllActiveTriggers()
    this.elements.clear()
    this.snapshots.clear()
    this.globalSubscribers.clear()
    this.elementSubscribers.clear()
    this.devEmitter.removeAll()
    this.isDestroyed = true
  }

  invalidateRects(): void {
    for (const [, registered] of this.elements) {
      this.refreshRect(registered)
    }
  }

  private scheduleRectInvalidation(): void {
    if (this.rectInvalidationRafId !== 0) return
    this.rectInvalidationRafId = requestAnimationFrame(() => {
      this.rectInvalidationRafId = 0
      this.invalidateRects()
    })
  }

  private expandConvenienceConfig(config: ConvenienceConfig): ElementConfig {
    const threshold = this.confidenceThreshold
    return {
      triggerOn: (snapshot) => ({
        isTriggered: snapshot.isIntersecting && snapshot.confidence > threshold,
        reason: 'trajectory',
      }),
      whenTriggered: config.whenApproaching,
      profile: { type: 'on_enter' },
      tolerance: config.tolerance,
    }
  }

  private refreshRect(registered: RegisteredElement): void {
    const domRect: DOMRect = registered.element.getBoundingClientRect()
    registered.cachedRect = {
      left: domRect.left,
      top: domRect.top,
      right: domRect.right,
      bottom: domRect.bottom,
    }
  }

  private scheduleUpdate(): void {
    if (this.rafId !== 0) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      this.update()
    })
  }

  private readonly scratchRect: Rect = { left: 0, top: 0, right: 0, bottom: 0 }

  private update(): void {
    const pointerEvent: PointerEvent | null = this.latestPointerEvent
    if (!pointerEvent) return

    const currentTimestamp = pointerEvent.timeStamp
    const dt = this.lastTimestamp > 0 ? (currentTimestamp - this.lastTimestamp) / 1000 : 0
    this.lastTimestamp = currentTimestamp

    const capturedPreviousSpeed = this.predictionState.previousSpeed

    updatePrediction(this.predictionState, {
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      timestamp: currentTimestamp,
    })

    // Cold-start guard: on the first frame with velocity, previousSpeed is 0
    // which looks like massive acceleration. Use current speed for neutral decel factor.
    const previousSpeed = capturedPreviousSpeed === 0
      ? this.predictionState.smoothedVelocity.magnitude
      : capturedPreviousSpeed

    const cursorX: number = pointerEvent.clientX
    const cursorY: number = pointerEvent.clientY
    const cursor: Point = { x: cursorX, y: cursorY }
    const predicted: Point = this.predictionState.predictedPoint
    const dx: number = predicted.x - cursorX
    const dy: number = predicted.y - cursorY
    const velocity = this.predictionState.smoothedVelocity
    const useRayCasting = this.featureFlags.rayCasting

    let hasChanges: boolean = false

    for (const [id, registered] of this.elements) {
      const rawRect: Rect = registered.cachedRect

      const cursorIsInside: boolean =
        cursorX >= rawRect.left && cursorX <= rawRect.right &&
        cursorY >= rawRect.top && cursorY <= rawRect.bottom

      let bestFactor: number = 0
      let anyZoneHit: boolean = false
      const expandedZoneRects: ExpandedZoneRect[] = []

      for (const zone of registered.normalizedZones) {
        const tol = zone.tolerance
        const expandedMinX: number = rawRect.left - tol.left
        const expandedMinY: number = rawRect.top - tol.top
        const expandedMaxX: number = rawRect.right + tol.right
        const expandedMaxY: number = rawRect.bottom + tol.bottom

        const expandedRect: Rect = {
          left: expandedMinX,
          top: expandedMinY,
          right: expandedMaxX,
          bottom: expandedMaxY,
        }
        expandedZoneRects.push({ rect: expandedRect, factor: zone.factor })

        const cursorInZone: boolean =
          cursorX >= expandedMinX && cursorX <= expandedMaxX &&
          cursorY >= expandedMinY && cursorY <= expandedMaxY

        let trajectoryHitsZone = false
        if (useRayCasting) {
          trajectoryHitsZone = segmentAABB(
            cursorX, cursorY, dx, dy,
            expandedMinX, expandedMinY, expandedMaxX, expandedMaxY,
          )
        }

        if (cursorInZone || trajectoryHitsZone) {
          bestFactor = Math.max(bestFactor, zone.factor)
          anyZoneHit = true
        }
      }

      const isIntersecting: boolean = cursorIsInside || anyZoneHit

      this.scratchRect.left = rawRect.left
      this.scratchRect.top = rawRect.top
      this.scratchRect.right = rawRect.right
      this.scratchRect.bottom = rawRect.bottom
      const distancePx: number = distanceToAABB(cursorX, cursorY, this.scratchRect)

      let confidence: number
      let pipelineFactors: FactorScores = { alignment: 1, distance: 1, deceleration: 1, erratic: 1 }

      if (cursorIsInside && velocity.magnitude < HOVER_VELOCITY_THRESHOLD) {
        confidence = 1.0
      } else {
        const factorCtx: FactorContext = {
          cursor,
          predicted: { x: predicted.x, y: predicted.y },
          velocity: { x: velocity.x, y: velocity.y, magnitude: velocity.magnitude, angle: velocity.angle },
          previousSpeed,
          dt,
          element: { rect: rawRect, id },
          zones: expandedZoneRects,
          buffer: this.predictionState.buffer,
          config: this.factorConfig,
        }

        const breakdown = computeConfidenceWithFactors(this.factors, factorCtx)
        pipelineFactors = {
          alignment: breakdown.scores[0],
          distance: breakdown.scores[1],
          deceleration: breakdown.scores[2],
          erratic: breakdown.scores[3],
        }
        const pipelineConfidence = breakdown.confidence
        confidence = cursorIsInside ? pipelineConfidence : Math.min(bestFactor, pipelineConfidence)
      }

      const prev = registered.previousConfidence
      if (confidence >= prev) {
        registered.consecutiveDecayFrames = 0
      } else {
        registered.consecutiveDecayFrames++
        const rate = this.confidenceDecayBaseRate * (1 + registered.consecutiveDecayFrames * this.confidenceDecayAcceleration)
        const decayed = prev * (1 - rate)
        confidence = Math.max(confidence, decayed)
        if (confidence < 0.01) confidence = 0
      }
      registered.previousConfidence = confidence

      const snapshot: TrajectorySnapshot = {
        isIntersecting,
        distancePx,
        velocity: { x: velocity.x, y: velocity.y, magnitude: velocity.magnitude, angle: velocity.angle },
        confidence,
        predictedPoint: { x: predicted.x, y: predicted.y },
        factors: pipelineFactors,
      }
      this.snapshots.set(id, snapshot)

      if (this.activeTriggers.has(id) && confidence < this.cancelThreshold) {
        this.cancelActiveTrigger(id)
      }

      const triggerResult: TriggerResult = registered.config.triggerOn(snapshot)
      const now: number = performance.now()
      const canFire: boolean = shouldFire(registered.config.profile, registered.state, triggerResult.isTriggered, now)

      if (canFire) {
        this.emitDevEventsAndFire(id, registered)
      }

      updateElementState(registered.state, triggerResult.isTriggered, now, canFire)
      this.notifyElementSubscribers(id)
      hasChanges = true
    }

    if (hasChanges) {
      this.notifyGlobalSubscribers()
    }
  }

  private emitDevEventsAndFire(elementId: string, registered: RegisteredElement): void {
    const hasDevListeners = this.devEmitter.hasListeners()

    if (hasDevListeners) {
      const snapshot = this.snapshots.get(elementId)
      this.devEmitter.emit('prediction:fired', {
        elementId,
        timestamp: performance.now(),
        confidence: snapshot?.confidence ?? 0,
        predictedPoint: snapshot?.predictedPoint ?? { x: 0, y: 0 },
      })
      this.devEmitter.emit('prediction:callback-start', {
        elementId,
        timestamp: performance.now(),
      })
    }

    this.cancelActiveTrigger(elementId)

    const controller = new AbortController()
    const activeTrigger: ActiveTrigger = { controller, cleanup: null }
    this.activeTriggers.set(elementId, activeTrigger)

    const startTime = hasDevListeners ? performance.now() : 0
    let status: 'success' | 'error' = 'success'
    try {
      const result = registered.config.whenTriggered(controller.signal)
      if (result instanceof Promise) {
        result.then((cleanup) => {
          if (typeof cleanup === 'function') {
            const current = this.activeTriggers.get(elementId)
            if (current === activeTrigger) {
              activeTrigger.cleanup = cleanup
            }
            if (controller.signal.aborted) {
              cleanup()
            }
          }
        }).catch(() => {
          status = 'error'
        })
      } else if (typeof result === 'function') {
        activeTrigger.cleanup = result
      }
    } catch {
      status = 'error'
    }

    if (hasDevListeners) {
      this.devEmitter.emit('prediction:callback-end', {
        elementId,
        timestamp: performance.now(),
        durationMs: performance.now() - startTime,
        status,
      })
    }
  }

  private cancelActiveTrigger(elementId: string): void {
    const active = this.activeTriggers.get(elementId)
    if (!active) return

    active.controller.abort()
    if (active.cleanup) {
      active.cleanup()
    }
    this.activeTriggers.delete(elementId)

    if (this.devEmitter.hasListeners()) {
      this.devEmitter.emit('prediction:cancelled', {
        elementId,
        timestamp: performance.now(),
      })
    }
  }

  private cancelAllActiveTriggers(): void {
    for (const [id] of this.activeTriggers) {
      this.cancelActiveTrigger(id)
    }
  }

  private safeFireCallback(callback: () => void | Promise<void>): void {
    try {
      Promise.resolve(callback()).catch(() => {})
    } catch { }
  }

  private notifyGlobalSubscribers(): void {
    for (const callback of this.globalSubscribers) {
      try {
        callback()
      } catch {
        // Subscriber errors never crash the engine
      }
    }
  }

  private notifyElementSubscribers(id: string): void {
    const subscribers: Set<() => void> | undefined = this.elementSubscribers.get(id)
    if (!subscribers) return
    for (const callback of subscribers) {
      try {
        callback()
      } catch {
        // Subscriber errors never crash the engine
      }
    }
  }
}
