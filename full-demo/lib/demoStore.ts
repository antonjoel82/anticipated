import { useSyncExternalStore } from 'react'

export type DemoSettings = {
  isAnticipatedEnabled: boolean
  latencyMs: number
  isShowingPredictions: boolean
  isShowingRadii: boolean
  isShowingRays: boolean
  preloadCount: number
  predictionWindow: number
  smoothingFactor: number
  confidenceSaturationFrames: number
  confidenceDecayRate: number
  confidenceThreshold: number
  minVelocityThreshold: number
  decelerationWindowFloor: number
  decelerationDampening: number
}

type Listener = () => void

const DEFAULT_LATENCY_MS = 250

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback
  return value === '1' || value === 'true' || value === 'on'
}

function parseNum(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback
  const n = Number(value)
  if (Number.isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function readSettingsFromURL(): Partial<DemoSettings> {
  if (typeof window === 'undefined') return {}
  const params: URLSearchParams = new URLSearchParams(window.location.search)
  const patch: Partial<DemoSettings> = {}
  if (params.has('anticipated')) patch.isAnticipatedEnabled = parseBool(params.get('anticipated'), true)
  if (params.has('latency')) patch.latencyMs = parseNum(params.get('latency'), DEFAULT_LATENCY_MS, 50, 3000)
  if (params.has('predictions')) patch.isShowingPredictions = parseBool(params.get('predictions'), true)
  if (params.has('radii')) patch.isShowingRadii = parseBool(params.get('radii'), false)
  if (params.has('rays')) patch.isShowingRays = parseBool(params.get('rays'), false)
  if (params.has('pw')) patch.predictionWindow = parseNum(params.get('pw'), 150, 50, 500)
  if (params.has('sf')) patch.smoothingFactor = parseNum(params.get('sf'), 0.3, 0.05, 1)
  if (params.has('csf')) patch.confidenceSaturationFrames = parseNum(params.get('csf'), 10, 1, 30)
  if (params.has('cdr')) patch.confidenceDecayRate = parseNum(params.get('cdr'), 0.3, 0, 2)
  if (params.has('ct')) patch.confidenceThreshold = parseNum(params.get('ct'), 0.5, 0.1, 1)
  if (params.has('mvt')) patch.minVelocityThreshold = parseNum(params.get('mvt'), 5, 0, 50)
  if (params.has('dwf')) patch.decelerationWindowFloor = parseNum(params.get('dwf'), 0.3, 0.1, 1)
  if (params.has('dd')) patch.decelerationDampening = parseNum(params.get('dd'), 0.5, 0, 2)
  return patch
}

function writeSettingsToURL(): void {
  if (typeof window === 'undefined') return
  const s: DemoSettings = settings
  const params = new URLSearchParams(window.location.search)
  params.set('anticipated', s.isAnticipatedEnabled ? '1' : '0')
  params.set('latency', String(s.latencyMs))
  params.set('predictions', s.isShowingPredictions ? '1' : '0')
  params.set('radii', s.isShowingRadii ? '1' : '0')
  params.set('rays', s.isShowingRays ? '1' : '0')
  params.set('pw', String(s.predictionWindow))
  params.set('sf', String(s.smoothingFactor))
  params.set('csf', String(s.confidenceSaturationFrames))
  params.set('cdr', String(s.confidenceDecayRate))
  params.set('ct', String(s.confidenceThreshold))
  params.set('mvt', String(s.minVelocityThreshold))
  params.set('dwf', String(s.decelerationWindowFloor))
  params.set('dd', String(s.decelerationDampening))
  const newURL: string = `${window.location.pathname}?${params.toString()}`
  window.history.replaceState(null, '', newURL)
}

let settings: DemoSettings = {
  isAnticipatedEnabled: true,
  latencyMs: DEFAULT_LATENCY_MS,
  isShowingPredictions: true,
  isShowingRadii: false,
  isShowingRays: false,
  preloadCount: 0,
  predictionWindow: 150,
  smoothingFactor: 0.3,
  confidenceSaturationFrames: 10,
  confidenceDecayRate: 0.3,
  confidenceThreshold: 0.5,
  minVelocityThreshold: 5,
  decelerationWindowFloor: 0.3,
  decelerationDampening: 0.5,
  ...readSettingsFromURL(),
}

const listeners: Set<Listener> = new Set()

function notify(): void {
  listeners.forEach((l) => l())
}

export function getSettings(): DemoSettings {
  return settings
}

export function updateSettings(patch: Partial<DemoSettings>): void {
  settings = { ...settings, ...patch }
  writeSettingsToURL()
  notify()
}

export function incrementPreloadCount(): void {
  settings = { ...settings, preloadCount: settings.preloadCount + 1 }
  notify()
}

export function resetPreloadCount(): void {
  settings = { ...settings, preloadCount: 0 }
  notify()
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemoStore(): DemoSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}
