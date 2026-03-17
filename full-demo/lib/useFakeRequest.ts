import { useState, useEffect } from 'react'
import { getCached, getOrFetch } from './cache.js'

type FakeRequestResult<T> = {
  data: T | undefined
  isLoading: boolean
}

export function useFakeRequest<T>(key: string, fetcher: () => Promise<T>): FakeRequestResult<T> {
  const [state, setState] = useState<FakeRequestResult<T>>(() => {
    const cached: T | undefined = getCached<T>(key)
    return { data: cached, isLoading: cached === undefined }
  })

  useEffect(() => {
    const cached: T | undefined = getCached<T>(key)
    if (cached !== undefined) {
      setState({ data: cached, isLoading: false })
      return
    }

    setState({ data: undefined, isLoading: true })
    let isCancelled = false

    getOrFetch<T>(key, fetcher).then((data: T) => {
      if (!isCancelled) {
        setState({ data, isLoading: false })
      }
    })

    return () => {
      isCancelled = true
    }
  }, [key])

  return state
}
