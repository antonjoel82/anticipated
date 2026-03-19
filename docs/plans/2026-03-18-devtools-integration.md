# DevTools Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `AnticipatedProfiler` and `AnticipatedDevtools` into the React hook and full-demo so the profiler actually works for React users. Currently the devtools code exists, is tested, but is architecturally unreachable from `useAnticipated()`.

**Architecture:** Expose the `TrajectoryEngine` instance from `useAnticipated()` return value. In the demo, create an `AnticipatedProfiler` from that engine in `TrajectoryContext`, wire click correlation to the DOM, and render `<AnticipatedDevtools>` in `App.tsx`.

**Tech Stack:** TypeScript, React, Vitest

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/react/useAnticipated.ts` | Add `engine` to return value |
| Modify | `src/react/useAnticipated.test.ts` | Test that engine is returned |
| Modify | `full-demo/context/TrajectoryContext.tsx` | Create profiler, expose via context |
| Modify | `full-demo/App.tsx` | Render `<AnticipatedDevtools>` |

---

## Chunk 1: Expose Engine from Hook

### Task 1: Add engine to useAnticipated return type

**Files:**
- Modify: `src/react/useAnticipated.ts`

- [ ] **Step 1: Update the return type**

In `src/react/useAnticipated.ts`, add `engine` to `UseAnticipatedReturn`:

```typescript
type UseAnticipatedReturn = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  trigger: (id: string, options?: TriggerOptions) => void
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  getElementZones: (id: string) => ReadonlyArray<NormalizedZone> | undefined
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  engine: TrajectoryEngine | null
}
```

- [ ] **Step 2: Return engine from the hook**

Update the return statement (line 98) to include the engine ref:

```typescript
return { register, trigger, getSnapshot, getElementZones, useSnapshot, engine: engineRef.current }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean (engine is already imported at top of file).

- [ ] **Step 4: Commit**

```bash
git add src/react/useAnticipated.ts
git commit -m "feat: expose engine instance from useAnticipated hook"
```

---

### Task 2: Test that engine is exposed

**Files:**
- Modify: `src/react/useAnticipated.test.ts`

- [ ] **Step 1: Write the test**

Add a test to `src/react/useAnticipated.test.ts`:

```typescript
it('exposes engine instance', () => {
  const { result } = renderHook(() => useAnticipated())
  expect(result.current.engine).toBeInstanceOf(TrajectoryEngine)
})

it('returns null engine during SSR', () => {
  // engine is null when window is undefined — already handled by the
  // existing conditional at line 29: if (typeof window !== 'undefined')
  // No change needed; existing SSR test covers this.
})
```

The `TrajectoryEngine` import may need to be added to the test file.

- [ ] **Step 2: Run the test**

Run: `pnpm test -- src/react/useAnticipated.test.ts`
Expected: All tests pass, including the new one.

- [ ] **Step 3: Commit**

```bash
git add src/react/useAnticipated.test.ts
git commit -m "test: verify engine is exposed from useAnticipated"
```

---

## Chunk 2: Integrate Profiler into Demo

### Task 3: Create profiler in TrajectoryContext

**Files:**
- Modify: `full-demo/context/TrajectoryContext.tsx`

- [ ] **Step 1: Expand context type to include profiler**

Update the context type and provider to create a profiler from the engine:

```typescript
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAnticipated } from 'anticipated/react'
import { AnticipatedProfiler } from 'anticipated/devtools'
import type { RegisterConfig, TrajectorySnapshot, TriggerOptions, NormalizedZone } from 'anticipated/core'
import type { RefCallback } from 'react'
import { useDemoStore, type DemoSettings } from '../lib/demoStore.js'

type TrajectoryContextType = {
  register: (id: string, config: RegisterConfig) => RefCallback<HTMLElement>
  useSnapshot: (id: string) => TrajectorySnapshot | undefined
  getSnapshot: (id: string) => TrajectorySnapshot | undefined
  getElementZones: (id: string) => ReadonlyArray<NormalizedZone> | undefined
  trigger: (id: string, options?: TriggerOptions) => void
  profiler: AnticipatedProfiler | null
}
```

- [ ] **Step 2: Create profiler from engine in TrajectoryProviderInner**

In `TrajectoryProviderInner`, create the profiler from the exposed engine:

```typescript
function TrajectoryProviderInner({ settings, children }: { settings: DemoSettings; children: ReactNode }) {
  const trajectory = useAnticipated({
    predictionWindow: settings.predictionWindow,
    smoothingFactor: settings.smoothingFactor,
    confidenceThreshold: settings.confidenceThreshold,
    minVelocityThreshold: settings.minVelocityThreshold,
    decelerationWindowFloor: settings.decelerationWindowFloor,
    decelerationDampening: settings.decelerationDampening,
    features: settings.features,
    factorWeights: settings.factorWeights,
  })

  const profilerRef = useRef<AnticipatedProfiler | null>(null)
  if (trajectory.engine && !profilerRef.current) {
    profilerRef.current = new AnticipatedProfiler(trajectory.engine)
  }

  useEffect(() => {
    const profiler = profilerRef.current
    if (!profiler) return

    // Wire click correlation: listen for clicks on tracked elements
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const tracked = target.closest('[data-anticipated-id]')
      if (tracked) {
        const elementId = tracked.getAttribute('data-anticipated-id')
        if (elementId) {
          profiler.confirmNavigation(elementId)
        }
      }
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
      profiler.destroy()
      profilerRef.current = null
    }
  }, [])

  const contextValue: TrajectoryContextType = {
    ...trajectory,
    profiler: profilerRef.current,
  }

  return (
    <TrajectoryContext.Provider value={contextValue}>
      {children}
    </TrajectoryContext.Provider>
  )
}
```

Note: The `data-anticipated-id` attribute approach is optional for initial integration. The profiler's `ClickCorrelator` can also match by element ID manually. A simpler first pass would skip auto-click-correlation and just expose the profiler for the devtools panel.

**Simpler alternative** (recommended for first pass — skip click wiring):

```typescript
function TrajectoryProviderInner({ settings, children }: { settings: DemoSettings; children: ReactNode }) {
  const trajectory = useAnticipated({
    predictionWindow: settings.predictionWindow,
    smoothingFactor: settings.smoothingFactor,
    confidenceThreshold: settings.confidenceThreshold,
    minVelocityThreshold: settings.minVelocityThreshold,
    decelerationWindowFloor: settings.decelerationWindowFloor,
    decelerationDampening: settings.decelerationDampening,
    features: settings.features,
    factorWeights: settings.factorWeights,
  })

  const profilerRef = useRef<AnticipatedProfiler | null>(null)
  if (trajectory.engine && !profilerRef.current) {
    profilerRef.current = new AnticipatedProfiler(trajectory.engine)
  }

  useEffect(() => {
    return () => {
      profilerRef.current?.destroy()
      profilerRef.current = null
    }
  }, [])

  const contextValue: TrajectoryContextType = {
    ...trajectory,
    profiler: profilerRef.current,
  }

  return (
    <TrajectoryContext.Provider value={contextValue}>
      {children}
    </TrajectoryContext.Provider>
  )
}
```

- [ ] **Step 3: Export profiler from useSharedTrajectory**

Update the hook return to include profiler:

```typescript
export function useSharedTrajectory(): TrajectoryContextType {
  const ctx = useContext(TrajectoryContext)
  if (!ctx) throw new Error('useSharedTrajectory must be used within TrajectoryProvider')
  return ctx
}
```

No change needed — the type already includes `profiler` from the updated `TrajectoryContextType`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add full-demo/context/TrajectoryContext.tsx
git commit -m "feat: create AnticipatedProfiler in demo TrajectoryContext"
```

---

### Task 4: Render AnticipatedDevtools in App

**Files:**
- Modify: `full-demo/App.tsx`

- [ ] **Step 1: Create a DevtoolsWrapper component**

Since `AnticipatedDevtools` needs the profiler from context, create a small wrapper component. Add it directly inside `App.tsx` above the `App` function or in a separate file:

```tsx
import { AnticipatedDevtools } from 'anticipated/devtools/react'
import { useSharedTrajectory } from './context/TrajectoryContext.js'

function DevtoolsWrapper() {
  const { profiler } = useSharedTrajectory()
  if (!profiler) return null
  return <AnticipatedDevtools profiler={profiler} />
}
```

- [ ] **Step 2: Add DevtoolsWrapper to App**

Add `<DevtoolsWrapper />` inside the `<TrajectoryProvider>` in App.tsx:

```tsx
export function App() {
  return (
    <BrowserRouter basename="/anticipated">
      <TrajectoryProvider>
        <MetricsBar />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/onboarding" element={<Onboarding />} />
            </Routes>
          </main>
        </div>
        <DebugOverlay />
        <SettingsPanel />
        <DevtoolsWrapper />
      </TrajectoryProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Run typecheck + build**

Run: `pnpm typecheck && pnpm build:demo`
Expected: Both clean. Demo builds with devtools integrated.

- [ ] **Step 4: Manual verification**

Run: `pnpm full-demo`
Expected: Demo launches with a floating "◉ anticipated" toggle button in the bottom-right. Clicking it opens the devtools panel showing prediction metrics, event stream, and controls.

- [ ] **Step 5: Commit**

```bash
git add full-demo/App.tsx
git commit -m "feat: integrate AnticipatedDevtools into full-demo"
```

---

## Chunk 3: Update Documentation

### Task 5: Update CLAUDE.md known gap section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the known gap text**

Replace the "Known gap" section at the end of CLAUDE.md with:

```markdown
### DevTools integration
`AnticipatedDevtools` is integrated in the full-demo via `TrajectoryContext`. The `useAnticipated` hook exposes the engine instance, allowing profiler creation: `new AnticipatedProfiler(engine)`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — devtools integration gap resolved"
```
