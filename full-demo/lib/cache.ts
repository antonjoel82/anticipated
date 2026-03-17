type CacheEntry<T> = {
  promise: Promise<T>
  resolvedValue: T | undefined
  timestamp: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function preload<T>(key: string, fetcher: () => Promise<T>): boolean {
  if (store.has(key)) return false
  const promise: Promise<T> = fetcher().then((value: T) => {
    const entry = store.get(key) as CacheEntry<T> | undefined
    if (entry) entry.resolvedValue = value
    return value
  })
  store.set(key, { promise, resolvedValue: undefined, timestamp: Date.now() })
  return true
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined
  return entry?.resolvedValue
}

export async function getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = store.get(key) as CacheEntry<T> | undefined
  if (existing) return existing.promise as Promise<T>
  const promise: Promise<T> = fetcher().then((value: T) => {
    const entry = store.get(key) as CacheEntry<T> | undefined
    if (entry) entry.resolvedValue = value
    return value
  })
  store.set(key, { promise, resolvedValue: undefined, timestamp: Date.now() })
  return promise
}

export function invalidate(key: string): void {
  store.delete(key)
}

export function clearCache(): void {
  store.clear()
}
