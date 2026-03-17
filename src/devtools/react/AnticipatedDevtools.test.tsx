import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { AnticipatedDevtools } from './AnticipatedDevtools.js'
import { AnticipatedProfiler } from '../profiler.js'
import { TrajectoryEngine } from '../../core/engine.js'

afterEach(() => {
  cleanup()
})

describe('AnticipatedDevtools', () => {
  it('renders closed by default', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    render(<AnticipatedDevtools profiler={profiler} />)
    expect(screen.getByRole('button', { name: /anticipated/i })).toBeDefined()
    expect(screen.queryByText('Predictions')).toBeNull()
    profiler.destroy()
  })

  it('opens panel on toggle click', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    render(<AnticipatedDevtools profiler={profiler} />)
    fireEvent.click(screen.getByRole('button', { name: /anticipated/i }))
    expect(screen.getByText('Predictions')).toBeDefined()
    expect(screen.getByText('Confirmed')).toBeDefined()
    expect(screen.getByText('Precision')).toBeDefined()
    profiler.destroy()
  })

  it('renders with initialIsOpen=true', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    expect(screen.getByText('Predictions')).toBeDefined()
    profiler.destroy()
  })

  it('displays metrics from profiler snapshot', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    profiler.destroy()
  })
})

describe('live event stream', () => {
  it('shows prediction events as they occur', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })
    engine.register('settings', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })

    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    act(() => { engine.trigger('settings') })
    expect(screen.getByText('settings')).toBeDefined()
    profiler.destroy()
  })

  it('shows inspector when event row is clicked', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })
    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })

    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    act(() => { engine.trigger('btn') })
    fireEvent.click(screen.getByText('btn'))
    expect(screen.getByText(/confidence/i)).toBeDefined()
    profiler.destroy()
  })
})

describe('devtools controls', () => {
  it('pause button stops new events', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    fireEvent.click(screen.getByRole('button', { name: /pause/i }))
    expect(profiler.getSnapshot().enabled).toBe(false)
    profiler.destroy()
  })

  it('reset button clears data', () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 200, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON: () => {},
    })
    engine.register('btn', el, {
      triggerOn: () => ({ isTriggered: false }),
      whenTriggered: () => {},
      profile: { type: 'on_enter' },
    })
    engine.trigger('btn')

    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    const report = profiler.getReport()
    expect(report.predictions).toBe(0)
    profiler.destroy()
  })

  it('copy button writes report JSON to clipboard', async () => {
    const engine = new TrajectoryEngine()
    const profiler = new AnticipatedProfiler(engine)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(<AnticipatedDevtools profiler={profiler} initialIsOpen={true} />)
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledOnce()
    const json = JSON.parse(writeText.mock.calls[0][0])
    expect(json).toHaveProperty('predictions')
    profiler.destroy()
  })
})
