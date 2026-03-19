# React DX Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve React developer experience by exporting a first-party `TrajectoryProvider` from `anticipated/react`, and adding a combined `useTrackedElement` hook that eliminates the two-step `register` + `useSnapshot` pattern.

**Architecture:** Move the provider pattern from `full-demo/context/TrajectoryContext.tsx` into `src/react/` as a first-class export. Add a convenience hook that combines `register()` + `useSnapshot()` into a single call. Keep `useAnticipated()` as the low-level hook for advanced use cases.

**Tech Stack:** TypeScript, React, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/react/TrajectoryProvider.tsx` | Context provider + `useSharedAnticipated` hook |
| Create | `src/react/TrajectoryProvider.test.tsx` | Tests for provider + shared hook |
| Modify | `src/react/index.ts` | Re-export provider and shared hook |

---

## Chunk 1: TrajectoryProvider

### Task 1: Write failing test for TrajectoryProvider

**Files:**
- Create: `src/react/TrajectoryProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TrajectoryProvider, useSharedAnticipated } from './TrajectoryProvider.js'

function wrapper({ children }: { children: ReactNode }) {
  return <TrajectoryProvider>{children}</TrajectoryProvider>
}

describe('TrajectoryProvider', () => {
  it('provides register, useSnapshot, getSnapshot, trigger, engine via context', () => {
    const { result } = renderHook(() => useSharedAnticipated(), { wrapper })
    expect(result.current.register).toBeTypeOf('function')
    expect(result.current.useSnapshot).toBeTypeOf('function')
    expect(result.current.getSnapshot).toBeTypeOf('function')
    expect(result.current.trigger).toBeTypeOf('function')
    expect(result.current.engine).toBeTruthy()
  })

  it('throws when useSharedAnticipated is used outside provider', () => {
    expect(() => {
      renderHook(() => useSharedAnticipated())
    }).toThrow('useSharedAnticipated must be used within TrajectoryProvider')
  })

  it('accepts engine options via props', () => {
    function optionsWrapper({ children }: { children: ReactNode }) {
      return (
        <TrajectoryProvider options={{ predictionWindow: 200 }}>
          {children}
        </TrajectoryProvider>
      )
    }
    const { result } = renderHook(() => useSharedAnticipated(), { wrapper: optionsWrapper })
    expect(result.current.engine).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/react/TrajectoryProvider.test.tsx`
Expected: FAIL — module `./TrajectoryProvider.js` not found.

- [ ] **Step 3: Commit**

```bash
git add src/react/TrajectoryProvider.test.tsx
git commit -m "test: add failing tests for TrajectoryProvider"
```

---

### Task 2: Implement TrajectoryProvider

**Files:**
- Create: `src/react/TrajectoryProvider.tsx`

- [ ] **Step 1: Write the implementation**

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import { useAnticipated } from './useAnticipated.js'
import type {
  EngineOptions,
  RegisterConfig,
  TrajectorySnapshot,
  TriggerOptions,
  NormalizedZone,
} from '../core/types.js'
import type { TrajectoryEngine } from '../core/engine.js'
import type { RefCallback } from 'react'

type SharedAnticipatedContextType = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  getElementZones: (id: string) => ReadonlyArray<NormalizedZone> | undefined
  trigger: (id: string, options?: TriggerOptions) => void
  engine: TrajectoryEngine | null
}

const SharedAnticipatedContext = createContext<SharedAnticipatedContextType | null>(null)

type TrajectoryProviderProps = {
  children: ReactNode
  options?: EngineOptions
}

export function TrajectoryProvider({ children, options }: TrajectoryProviderProps) {
  const anticipated = useAnticipated(options)

  return (
    <SharedAnticipatedContext.Provider value={anticipated}>
      {children}
    </SharedAnticipatedContext.Provider>
  )
}

export function useSharedAnticipated(): SharedAnticipatedContextType {
  const ctx = useContext(SharedAnticipatedContext)
  if (!ctx) {
    throw new Error('useSharedAnticipated must be used within TrajectoryProvider')
  }
  return ctx
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test -- src/react/TrajectoryProvider.test.tsx`
Expected: All 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/react/TrajectoryProvider.tsx
git commit -m "feat: add TrajectoryProvider and useSharedAnticipated"
```

---

### Task 3: Export from react entry point

**Files:**
- Modify: `src/react/index.ts`

- [ ] **Step 1: Add exports**

Update `src/react/index.ts`:

```typescript
export { useAnticipated } from './useAnticipated.js'
export { TrajectoryProvider, useSharedAnticipated } from './TrajectoryProvider.js'
```

- [ ] **Step 2: Run typecheck + full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: All clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/react/index.ts
git commit -m "feat: export TrajectoryProvider from anticipated/react"
```

---

## Chunk 2: Documentation

### Task 4: Update README with provider pattern

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add provider section to README**

After the `useAnticipated` section, add:

```markdown
### Shared Context (Multiple Components)

When multiple components need trajectory data, use `TrajectoryProvider` to share a single engine:

\`\`\`tsx
import { TrajectoryProvider, useSharedAnticipated } from 'anticipated/react'

function App() {
  return (
    <TrajectoryProvider options={{ predictionWindow: 150 }}>
      <Nav />
      <Content />
    </TrajectoryProvider>
  )
}

function Nav() {
  const { register, useSnapshot } = useSharedAnticipated()
  const ref = register('settings', { whenApproaching: () => prefetch(), tolerance: 20 })
  const snap = useSnapshot('settings')
  return <a ref={ref}>Settings ({snap?.confidence.toFixed(2)})</a>
}
\`\`\`

> **Rule:** Call `useAnticipated()` once (low-level) or wrap with `<TrajectoryProvider>` (recommended). Don't call `useAnticipated()` in multiple components — each call creates a separate engine.
```

- [ ] **Step 2: Update the API Reference table**

Add to the API Reference:

```markdown
| Return | Type | Description |
|---|---|---|
| `register(id, config)` | `RefCallback<HTMLElement>` | Returns a stable ref callback |
| `useSnapshot(id)` | `TrajectorySnapshot \| undefined` | Reactive snapshot |
| `getSnapshot(id)` | `TrajectorySnapshot \| undefined` | Non-reactive read |
| `trigger(id, opts?)` | `void` | Imperative trigger |
| `engine` | `TrajectoryEngine \| null` | Underlying engine instance |
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add TrajectoryProvider usage to README"
```
