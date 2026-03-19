import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TrajectoryEngine } from './engine.js'
import type { EngineOptions, TrajectorySnapshot, Tolerance } from './types.js'
import { presets } from './presets.js'

// ---------------------------------------------------------------------------
// Test harness: MotionSimulator
// ---------------------------------------------------------------------------

const FRAME_MS = 16.67
const BASE_TIME = 1000

type FrameDispatcher = {
  frame(x: number, y: number): void
  time: number
}

type ScenarioConfig = {
  engineOptions?: Partial<EngineOptions>
  elementRect?: { left: number; top: number; width: number; height: number }
  tolerance?: Tolerance
  motion: (dispatch: FrameDispatcher) => void
}

type ScenarioResult = {
  confidence: number
  snapshot: TrajectorySnapshot | undefined
  peakConfidence: number
}

const DEFAULT_RECT = { left: 200, top: 100, width: 200, height: 100 }

function mockElement(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  const el = document.createElement('div')
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => {},
  })
  return el
}

function makePointerEvent(x: number, y: number, timeStamp: number): PointerEvent {
  const event = new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  return event
}

function runScenario(config: ScenarioConfig): ScenarioResult {
  const target = new EventTarget()
  const rect = config.elementRect ?? DEFAULT_RECT
  const engine = new TrajectoryEngine({
    eventTarget: target,
    smoothingFactor: 1,
    ...config.engineOptions,
  })

  const el = mockElement(rect)
  engine.register('target', el, {
    triggerOn: (snap) => ({ isTriggered: snap.isIntersecting && snap.confidence > 0.1 }),
    whenTriggered: () => {},
    profile: { type: 'every_frame' },
    tolerance: config.tolerance ?? 30,
  })
  engine.connect()

  let peakConfidence = 0

  const dispatcher: FrameDispatcher = {
    time: BASE_TIME,
    frame(x: number, y: number) {
      target.dispatchEvent(makePointerEvent(x, y, this.time))
      vi.advanceTimersByTime(17)
      this.time += FRAME_MS
      const snap = engine.getSnapshot('target')
      if (snap) peakConfidence = Math.max(peakConfidence, snap.confidence)
    },
  }

  config.motion(dispatcher)

  const snapshot = engine.getSnapshot('target')
  engine.destroy()

  return {
    confidence: snapshot?.confidence ?? 0,
    snapshot,
    peakConfidence,
  }
}

// ---------------------------------------------------------------------------
// Motion generators
// ---------------------------------------------------------------------------

function linearMotion(d: FrameDispatcher, fromX: number, toX: number, y: number, frames: number): void {
  for (let i = 0; i <= frames; i++) {
    d.frame(fromX + (toX - fromX) * (i / frames), y)
  }
}

// easeOutQuad: starts fast, ends slow (decelerating)
function deceleratingMotion(d: FrameDispatcher, fromX: number, toX: number, y: number, frames: number): void {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames
    const eased = 1 - (1 - t) * (1 - t)
    d.frame(fromX + (toX - fromX) * eased, y)
  }
}

// easeInQuad: starts slow, ends fast (accelerating)
function acceleratingMotion(d: FrameDispatcher, fromX: number, toX: number, y: number, frames: number): void {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames
    d.frame(fromX + (toX - fromX) * t * t, y)
  }
}

function zigzagMotion(d: FrameDispatcher, fromX: number, toX: number, y: number, amplitude: number, frames: number): void {
  for (let i = 0; i <= frames; i++) {
    const t = i / frames
    const yOffset = amplitude * Math.sin(i * Math.PI * 0.7)
    d.frame(fromX + (toX - fromX) * t, y + yOffset)
  }
}

function hoverMotion(d: FrameDispatcher, x: number, y: number, frames: number): void {
  for (let i = 0; i < frames; i++) {
    d.frame(x, y)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Confidence V2 behavioral properties', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  // -----------------------------------------------------------------------
  // Deceleration factor ordering
  // -----------------------------------------------------------------------

  describe('deceleration factor', () => {
    it('decelerating approach → higher confidence than constant-speed approach', () => {
      // Both end at x=190 (in tolerance zone, outside raw element [200,100,400,200])
      // Hover shortcut never applies (cursor outside raw element)
      const decel = runScenario({
        motion: (d) => deceleratingMotion(d, 50, 190, 150, 25),
      })
      const constant = runScenario({
        motion: (d) => linearMotion(d, 50, 190, 150, 25),
      })

      expect(decel.confidence).toBeGreaterThan(constant.confidence)
      expect(decel.confidence).toBeGreaterThan(0)
      expect(constant.confidence).toBeGreaterThan(0)
    })

    it('accelerating cursor → lower confidence than constant-speed', () => {
      const accel = runScenario({
        motion: (d) => acceleratingMotion(d, 50, 190, 150, 25),
      })
      const constant = runScenario({
        motion: (d) => linearMotion(d, 50, 190, 150, 25),
      })

      expect(accel.confidence).toBeLessThan(constant.confidence)
    })

    it('cursor hovering inside element → confidence = 1.0 regardless of factors', () => {
      const result = runScenario({
        motion: (d) => hoverMotion(d, 300, 150, 10),
      })

      expect(result.confidence).toBe(1.0)
    })
  })

  // -----------------------------------------------------------------------
  // Erratic penalty ordering
  // -----------------------------------------------------------------------

  describe('erratic penalty factor', () => {
    it('straight-line approach → higher confidence than zigzag approach', () => {
      const straight = runScenario({
        motion: (d) => linearMotion(d, 50, 190, 150, 25),
      })
      const zigzag = runScenario({
        motion: (d) => zigzagMotion(d, 50, 190, 150, 40, 25),
      })

      expect(straight.confidence).toBeGreaterThan(zigzag.confidence)
    })

    it('extreme zigzag produces very low confidence', () => {
      const result = runScenario({
        motion: (d) => zigzagMotion(d, 50, 190, 150, 80, 25),
      })

      expect(result.confidence).toBeLessThan(0.3)
    })
  })

  // -----------------------------------------------------------------------
  // Distance factor sensitivity
  // -----------------------------------------------------------------------

  describe('distance factor', () => {
    it('near cursor → higher confidence than far cursor', () => {
      // Near: ends at x=185 (15px from element), in tolerance zone
      const near = runScenario({
        motion: (d) => linearMotion(d, 50, 185, 150, 20),
      })
      // Far: ends at x=145 (55px from element), still has trajectory toward element
      const far = runScenario({
        motion: (d) => linearMotion(d, 50, 145, 150, 20),
      })

      expect(near.confidence).toBeGreaterThan(far.confidence)
    })

    it('cursor inside element → distance factor is 1.0 (no distance penalty)', () => {
      // Cursor inside element, moving fast (no hover shortcut since speed > 50px/s)
      const result = runScenario({
        motion: (d) => {
          d.frame(100, 150)
          linearMotion(d, 250, 350, 150, 5)
        },
      })

      expect(result.confidence).toBeGreaterThan(0.3)
      expect(result.snapshot!.distancePx).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // Pass-through detection
  // -----------------------------------------------------------------------

  describe('pass-through detection', () => {
    it('cursor that passes through at constant speed has lower peak than decelerating cursor', () => {
      // Pass-through: constant speed, starts before element, ends past it
      const passThrough = runScenario({
        motion: (d) => linearMotion(d, 50, 550, 150, 30),
      })
      // Decel: decelerates into element center
      const decelInto = runScenario({
        motion: (d) => deceleratingMotion(d, 50, 300, 150, 30),
      })

      expect(decelInto.peakConfidence).toBeGreaterThan(passThrough.peakConfidence)
    })

    it('cursor that has left the element → confidence drops to 0', () => {
      const result = runScenario({
        motion: (d) => {
          linearMotion(d, 50, 550, 150, 25)
          linearMotion(d, 550, 1400, 150, 55)
        },
      })

      expect(result.confidence).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // Feature flags: rayCasting=false
  // -----------------------------------------------------------------------

  describe('rayCasting=false (hoverOnly mode)', () => {
    it('produces confidence when cursor is in tolerance zone without ray casting', () => {
      const result = runScenario({
        engineOptions: { features: { rayCasting: false } },
        tolerance: 40,
        motion: (d) => {
          // Move cursor into the tolerance zone (element left=200, tolerance=40 → zone starts at 160)
          d.frame(100, 150)
          linearMotion(d, 165, 195, 150, 10)
        },
      })

      expect(result.confidence).toBeGreaterThan(0)
      expect(result.snapshot!.isIntersecting).toBe(true)
    })

    it('cursor outside tolerance zone → no intersection, no confidence', () => {
      const result = runScenario({
        engineOptions: { features: { rayCasting: false } },
        tolerance: 20,
        motion: (d) => {
          // Cursor at x=140, element left=200, tolerance=20 → zone starts at 180
          // Cursor is outside zone and ray casting disabled → no intersection
          d.frame(100, 150)
          d.frame(140, 150)
          hoverMotion(d, 140, 150, 5)
        },
      })

      expect(result.snapshot!.isIntersecting).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('cursor inside raw element → full confidence (hover shortcut)', () => {
      const result = runScenario({
        engineOptions: { features: { rayCasting: false } },
        motion: (d) => hoverMotion(d, 300, 150, 10),
      })

      expect(result.confidence).toBe(1.0)
    })
  })

  // -----------------------------------------------------------------------
  // Cancellation via natural confidence drop in update()
  // -----------------------------------------------------------------------

  describe('natural cancellation in update loop', () => {
    it('aborts trigger signal when confidence drops below cancelThreshold', () => {
      const target = new EventTarget()
      const engine = new TrajectoryEngine({
        eventTarget: target,
        smoothingFactor: 1,
        cancelThreshold: 0.15,
      })

      const el = mockElement(DEFAULT_RECT)
      let signal: AbortSignal | null = null
      const cleanup = vi.fn()

      engine.register('box', el, {
        triggerOn: (snap) => ({ isTriggered: snap.isIntersecting && snap.confidence > 0.2 }),
        whenTriggered: (s) => { signal = s; return cleanup },
        profile: { type: 'on_enter' },
        tolerance: 30,
      })
      engine.connect()

      // Phase 1: approach element — build confidence → trigger fires
      for (let i = 0; i < 15; i++) {
        target.dispatchEvent(makePointerEvent(80 + i * 10, 150, 1000 + i * FRAME_MS))
        vi.advanceTimersByTime(17)
      }

      expect(signal).not.toBeNull()
      expect(signal!.aborted).toBe(false)
      expect(cleanup).not.toHaveBeenCalled()

      // Phase 2: move cursor far away — confidence drops → cancellation
      for (let i = 0; i < 30; i++) {
        target.dispatchEvent(makePointerEvent(300, -100 - i * 20, 1500 + i * FRAME_MS))
        vi.advanceTimersByTime(17)
      }

      expect(signal!.aborted).toBe(true)
      expect(cleanup).toHaveBeenCalledOnce()

      engine.destroy()
    })
  })

  // -----------------------------------------------------------------------
  // Multi-element confidence discrimination
  // -----------------------------------------------------------------------

  describe('multi-element discrimination', () => {
    it('cursor heading toward element B → B has higher confidence than distant element A', () => {
      const target = new EventTarget()
      const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })

      const elA = mockElement({ left: 100, top: 100, width: 100, height: 100 })
      const elB = mockElement({ left: 400, top: 100, width: 100, height: 100 })

      engine.register('a', elA, {
        triggerOn: (snap) => ({ isTriggered: snap.isIntersecting }),
        whenTriggered: () => {},
        profile: { type: 'every_frame' },
        tolerance: 30,
      })
      engine.register('b', elB, {
        triggerOn: (snap) => ({ isTriggered: snap.isIntersecting }),
        whenTriggered: () => {},
        profile: { type: 'every_frame' },
        tolerance: 30,
      })
      engine.connect()

      // Cursor moves rightward, past A, toward B
      for (let i = 0; i <= 25; i++) {
        target.dispatchEvent(makePointerEvent(250 + i * 8, 150, 1000 + i * FRAME_MS))
        vi.advanceTimersByTime(17)
      }

      const snapA = engine.getSnapshot('a')
      const snapB = engine.getSnapshot('b')

      expect(snapB!.confidence).toBeGreaterThan(snapA!.confidence)
      expect(snapB!.confidence).toBeGreaterThan(0)
      expect(snapA!.confidence).toBe(0)

      engine.destroy()
    })

    it('cursor heading toward element A → A has higher confidence than distant element B', () => {
      const target = new EventTarget()
      const engine = new TrajectoryEngine({ eventTarget: target, smoothingFactor: 1 })

      const elA = mockElement({ left: 100, top: 100, width: 100, height: 100 })
      const elB = mockElement({ left: 400, top: 100, width: 100, height: 100 })

      engine.register('a', elA, {
        triggerOn: (snap) => ({ isTriggered: snap.isIntersecting }),
        whenTriggered: () => {},
        profile: { type: 'every_frame' },
        tolerance: 30,
      })
      engine.register('b', elB, {
        triggerOn: (snap) => ({ isTriggered: snap.isIntersecting }),
        whenTriggered: () => {},
        profile: { type: 'every_frame' },
        tolerance: 30,
      })
      engine.connect()

      // Cursor moves rightward toward A
      for (let i = 0; i <= 15; i++) {
        target.dispatchEvent(makePointerEvent(20 + i * 6, 150, 1000 + i * FRAME_MS))
        vi.advanceTimersByTime(17)
      }

      const snapA = engine.getSnapshot('a')
      const snapB = engine.getSnapshot('b')

      expect(snapA!.confidence).toBeGreaterThan(snapB!.confidence)
      expect(snapA!.confidence).toBeGreaterThan(0)

      engine.destroy()
    })
  })

  // -----------------------------------------------------------------------
  // Presets produce different behaviors
  // -----------------------------------------------------------------------

  describe('presets produce different behaviors', () => {
    it('hoverOnly preset gives confidence from proximity, not ray casting', () => {
      // With hoverOnly: rayCasting disabled. Cursor must be in tolerance zone.
      const hoverOnly = runScenario({
        engineOptions: { ...presets.hoverOnly },
        tolerance: 40,
        motion: (d) => {
          d.frame(100, 150)
          linearMotion(d, 165, 195, 150, 10)
        },
      })

      // With default: rayCasting enabled. Same cursor position.
      const defaultPreset = runScenario({
        engineOptions: { ...presets.default },
        tolerance: 40,
        motion: (d) => {
          d.frame(100, 150)
          linearMotion(d, 165, 195, 150, 10)
        },
      })

      // Both should have confidence, but values differ because different factors are active
      expect(hoverOnly.confidence).toBeGreaterThan(0)
      expect(defaultPreset.confidence).toBeGreaterThan(0)
    })

    it('denseGrid preset uses higher smoothing and lower erratic weight', () => {
      // denseGrid has smoothingFactor: 0.5 and erratic weight: 0.8
      // Zigzag motion should be less penalized with denseGrid than default
      const denseGrid = runScenario({
        engineOptions: { ...presets.denseGrid },
        tolerance: 30,
        motion: (d) => zigzagMotion(d, 50, 190, 150, 30, 25),
      })

      const defaultPreset = runScenario({
        tolerance: 30,
        motion: (d) => zigzagMotion(d, 50, 190, 150, 30, 25),
      })

      // denseGrid should be more forgiving of zigzag (lower erratic weight)
      expect(denseGrid.confidence).toBeGreaterThanOrEqual(defaultPreset.confidence)
    })
  })

  // -----------------------------------------------------------------------
  // Factor weight isolation
  // -----------------------------------------------------------------------

  describe('factor weight isolation', () => {
    it('disabling distance factor changes confidence for distant cursor', () => {
      const withDistance = runScenario({
        motion: (d) => linearMotion(d, 50, 145, 150, 20),
      })
      const withoutDistance = runScenario({
        engineOptions: { factorWeights: { distance: 0 } },
        motion: (d) => linearMotion(d, 50, 145, 150, 20),
      })

      // Without distance factor, confidence should be higher (one less penalty)
      expect(withoutDistance.confidence).toBeGreaterThan(withDistance.confidence)
    })

    it('disabling deceleration factor removes speed sensitivity', () => {
      const decelWithFactor = runScenario({
        motion: (d) => deceleratingMotion(d, 50, 190, 150, 25),
      })
      const constantWithFactor = runScenario({
        motion: (d) => linearMotion(d, 50, 190, 150, 25),
      })
      const decelWithout = runScenario({
        engineOptions: { factorWeights: { deceleration: 0 } },
        motion: (d) => deceleratingMotion(d, 50, 190, 150, 25),
      })
      const constantWithout = runScenario({
        engineOptions: { factorWeights: { deceleration: 0 } },
        motion: (d) => linearMotion(d, 50, 190, 150, 25),
      })

      // With decel factor: decel > constant (decel factor differentiates)
      expect(decelWithFactor.confidence).toBeGreaterThan(constantWithFactor.confidence)
      // Without decel factor: no speed-based differentiation
      const diffWith = decelWithFactor.confidence - constantWithFactor.confidence
      const diffWithout = decelWithout.confidence - constantWithout.confidence
      expect(diffWith).toBeGreaterThan(diffWithout)
    })

    it('disabling erratic factor removes zigzag penalty', () => {
      // Zigzag while inside element so alignment=1.0 and distance=1.0,
      // isolating the erratic factor as the only differentiator
      const zigzagWithFactor = runScenario({
        motion: (d) => {
          d.frame(250, 150)
          zigzagMotion(d, 250, 350, 150, 25, 20)
        },
      })
      const zigzagWithout = runScenario({
        engineOptions: { factorWeights: { erratic: 0 } },
        motion: (d) => {
          d.frame(250, 150)
          zigzagMotion(d, 250, 350, 150, 25, 20)
        },
      })

      expect(zigzagWithout.confidence).toBeGreaterThan(zigzagWithFactor.confidence)
    })
  })
})
