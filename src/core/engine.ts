import type {
  EngineOptions,
  ElementConfig,
  RegisterConfig,
  ConvenienceConfig,
  TrajectorySnapshot,
  TriggerResult,
  Rect,
  ToleranceRect,
  ElementState,
  TriggerOptions,
  Point,
} from './types.js'
import { isConvenienceConfig } from './types.js'
import { validateEngineOptions, validateElementConfig, normalizeTolerance } from './validators.js'
import { createPredictionState, updatePrediction } from './prediction.js'
import type { PredictionState } from './prediction.js'
import { segmentAABB } from './intersection.js'
import { distanceToAABB } from './distance.js'
import { createElementState, shouldFire, updateElementState } from './triggers.js'
import {
  DEFAULT_PREDICTION_WINDOW_MS,
  DEFAULT_SMOOTHING_FACTOR,
  DEFAULT_BUFFER_SIZE,
  DEFAULT_TOLERANCE,
  CONFIDENCE_SATURATION_FRAMES,
  CONFIDENCE_DECAY_RATE,
  DEFAULT_CONFIDENCE_THRESHOLD,
} from './constants.js'
import { DevEventEmitter } from '../devtools/events.js'
import type { AnticipatedDevEventMap } from '../devtools/types.js'

type RegisteredElement = {
  element: HTMLElement
  config: ElementConfig
  state: ElementState
  cachedRect: Rect
  normalizedTolerance: ToleranceRect
}

export class TrajectoryEngine {
  private readonly elements = new Map<string, RegisteredElement>()
  private readonly snapshots = new Map<string, TrajectorySnapshot>()
  private readonly globalSubscribers = new Set<() => void>()
  private readonly elementSubscribers = new Map<string, Set<() => void>>()
  private readonly devEmitter = new DevEventEmitter()
  private readonly elementToId = new WeakMap<HTMLElement, string>()

  private predictionState: PredictionState
  private readonly defaultTolerance: ToleranceRect
  private readonly confidenceSaturationFrames: number
  private readonly confidenceDecayRate: number
  private readonly confidenceThreshold: number
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

    this.confidenceSaturationFrames = options?.confidenceSaturationFrames ?? CONFIDENCE_SATURATION_FRAMES
    this.confidenceDecayRate = options?.confidenceDecayRate ?? CONFIDENCE_DECAY_RATE
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD

    this.predictionState = createPredictionState({
      smoothingFactor: options?.smoothingFactor ?? DEFAULT_SMOOTHING_FACTOR,
      predictionWindowMs: options?.predictionWindow ?? DEFAULT_PREDICTION_WINDOW_MS,
      bufferSize: options?.bufferSize ?? DEFAULT_BUFFER_SIZE,
      decelerationWindowFloor: options?.decelerationWindowFloor,
      decelerationDampening: options?.decelerationDampening,
      minVelocityThreshold: options?.minVelocityThreshold,
    })

    this.defaultTolerance = normalizeTolerance(options?.defaultTolerance)
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

    const tolerance: ToleranceRect = resolvedConfig.tolerance !== undefined
      ? normalizeTolerance(resolvedConfig.tolerance)
      : this.defaultTolerance

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
      existing.normalizedTolerance = tolerance
      this.refreshRect(existing)
      return
    }

    this.elementToId.set(element, id)

    const registered: RegisteredElement = {
      element,
      config: resolvedConfig,
      state: createElementState(),
      cachedRect: { left: 0, top: 0, right: 0, bottom: 0 },
      normalizedTolerance: tolerance,
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

  // Reusable scratch Rect to avoid per-frame allocation in distanceToAABB
  private readonly scratchRect: Rect = { left: 0, top: 0, right: 0, bottom: 0 }

  private update(): void {
    const pointerEvent: PointerEvent | null = this.latestPointerEvent
    if (!pointerEvent) return

    updatePrediction(this.predictionState, {
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      timestamp: pointerEvent.timeStamp,
    })

    const cursorX: number = pointerEvent.clientX
    const cursorY: number = pointerEvent.clientY
    const predicted: Point = this.predictionState.predictedPoint
    const dx: number = predicted.x - cursorX
    const dy: number = predicted.y - cursorY
    const velocity = this.predictionState.smoothedVelocity

    let hasChanges: boolean = false

    for (const [id, registered] of this.elements) {
      const tol: ToleranceRect = registered.normalizedTolerance
      const expandedMinX: number = registered.cachedRect.left - tol.left
      const expandedMinY: number = registered.cachedRect.top - tol.top
      const expandedMaxX: number = registered.cachedRect.right + tol.right
      const expandedMaxY: number = registered.cachedRect.bottom + tol.bottom

      const isIntersecting: boolean = segmentAABB(
        cursorX, cursorY, dx, dy,
        expandedMinX, expandedMinY, expandedMaxX, expandedMaxY,
      )

      this.scratchRect.left = expandedMinX
      this.scratchRect.top = expandedMinY
      this.scratchRect.right = expandedMaxX
      this.scratchRect.bottom = expandedMaxY
      const distancePx: number = distanceToAABB(cursorX, cursorY, this.scratchRect)

      if (isIntersecting) {
        registered.state.consecutiveHitFrames = Math.min(
          this.confidenceSaturationFrames,
          registered.state.consecutiveHitFrames + 1,
        )
      } else {
        registered.state.consecutiveHitFrames = Math.max(
          0,
          registered.state.consecutiveHitFrames - this.confidenceDecayRate,
        )
      }

      const confidence: number = Math.min(
        1,
        registered.state.consecutiveHitFrames / this.confidenceSaturationFrames,
      )

      const snapshot: TrajectorySnapshot = {
        isIntersecting,
        distancePx,
        velocity: { x: velocity.x, y: velocity.y, magnitude: velocity.magnitude, angle: velocity.angle },
        confidence,
        predictedPoint: { x: predicted.x, y: predicted.y },
      }
      this.snapshots.set(id, snapshot)

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

    const startTime = hasDevListeners ? performance.now() : 0
    let status: 'success' | 'error' = 'success'
    try {
      Promise.resolve(registered.config.whenTriggered()).catch(() => {
        status = 'error'
      })
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
