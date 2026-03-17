import { getSettings } from './demoStore.js'

export function fakeFetch<T>(data: T): Promise<T> {
  const { latencyMs } = getSettings()
  return new Promise<T>((resolve) => {
    setTimeout(() => resolve(structuredClone(data)), latencyMs)
  })
}
