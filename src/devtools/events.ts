import type { AnticipatedDevEventMap } from './types.js'

type Listener<K extends keyof AnticipatedDevEventMap> = (data: AnticipatedDevEventMap[K]) => void

export class DevEventEmitter {
  private readonly listeners = new Map<keyof AnticipatedDevEventMap, Set<Listener<any>>>()

  on<K extends keyof AnticipatedDevEventMap>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.listeners.delete(event)
    }
  }

  emit<K extends keyof AnticipatedDevEventMap>(event: K, data: AnticipatedDevEventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) {
      try { listener(data) } catch { }
    }
  }

  hasListeners(): boolean {
    return this.listeners.size > 0
  }

  removeAll(): void {
    this.listeners.clear()
  }
}
