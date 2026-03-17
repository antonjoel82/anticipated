import { type CSSProperties } from 'react'
import { useTrajectory } from 'anticipated/react'
import type { TrajectorySnapshot, RegisterConfig } from 'anticipated/core'

const CONFIDENCE_VISIBLE_THRESHOLD = 0.5

function confidenceToGreenGlow(snapshot: TrajectorySnapshot | undefined): CSSProperties {
  if (!snapshot || snapshot.confidence <= CONFIDENCE_VISIBLE_THRESHOLD) {
    return {}
  }

  const intensity: number = (snapshot.confidence - CONFIDENCE_VISIBLE_THRESHOLD) / (1 - CONFIDENCE_VISIBLE_THRESHOLD)
  const glowOpacity: number = intensity * 0.6
  const borderOpacity: number = 0.3 + intensity * 0.7
  const bgOpacity: number = intensity * 0.08

  return {
    borderColor: `rgba(74, 222, 128, ${borderOpacity})`,
    boxShadow: `0 0 ${8 + intensity * 20}px rgba(74, 222, 128, ${glowOpacity}), inset 0 0 ${intensity * 12}px rgba(74, 222, 128, ${bgOpacity})`,
    backgroundColor: `rgba(74, 222, 128, ${bgOpacity})`,
  }
}

type TrackedElementProps = {
  id: string
  label: string
  register: ReturnType<typeof useTrajectory>['register']
  useSnapshot: ReturnType<typeof useTrajectory>['useSnapshot']
  config: RegisterConfig
  as?: 'a' | 'button'
  className?: string
  style?: CSSProperties
}

function TrackedElement({ id, label, register, useSnapshot, config, as: Tag = 'button', className = '', style = {} }: TrackedElementProps) {
  const ref = register(id, config)
  const snapshot: TrajectorySnapshot | undefined = useSnapshot(id)
  const glowStyle: CSSProperties = confidenceToGreenGlow(snapshot)
  const isGlowing: boolean = !!snapshot && snapshot.confidence > CONFIDENCE_VISIBLE_THRESHOLD

  return (
    <Tag
      ref={ref as ReturnType<typeof register>}
      className={`tracked-element ${className} ${isGlowing ? 'glowing' : ''}`}
      style={{ ...style, ...glowStyle }}
      href={Tag === 'a' ? '#' : undefined}
      onClick={(e: React.MouseEvent) => e.preventDefault()}
    >
      <span className="tracked-label">{label}</span>
      {snapshot && (
        <span className="tracked-meta">
          {snapshot.isIntersecting ? '◉' : '○'}{' '}
          <span className="mono">{snapshot.confidence.toFixed(2)}</span>
        </span>
      )}
    </Tag>
  )
}

const NAV_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'nav-dashboard', label: 'Dashboard' },
  { id: 'nav-projects', label: 'Projects' },
  { id: 'nav-analytics', label: 'Analytics' },
  { id: 'nav-team', label: 'Team' },
  { id: 'nav-settings', label: 'Settings' },
]

const FORM_ACTIONS: Array<{ id: string; label: string; variant: string }> = [
  { id: 'btn-save', label: 'Save Draft', variant: 'secondary' },
  { id: 'btn-preview', label: 'Preview', variant: 'secondary' },
  { id: 'btn-publish', label: 'Publish', variant: 'primary' },
]

const APPROACHING_CONFIG: RegisterConfig = {
  whenApproaching: () => {},
  tolerance: 30,
}

export function App() {
  const { register, useSnapshot } = useTrajectory({
    predictionWindow: 150,
    smoothingFactor: 0.3,
  })

  return (
    <>
      <style>{STYLES}</style>
      <div className="app-layout">
        <nav className="sidebar">
          <div className="sidebar-brand">anticipated</div>
          <div className="sidebar-section-label">Navigation</div>
          <div className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <TrackedElement
                key={item.id}
                id={item.id}
                label={item.label}
                register={register}
                useSnapshot={useSnapshot}
                config={APPROACHING_CONFIG}
                as="a"
                className="nav-link"
              />
            ))}
          </div>
          <div className="sidebar-footer">
            <TrackedElement
              id="nav-logout"
              label="Log Out"
              register={register}
              useSnapshot={useSnapshot}
              config={APPROACHING_CONFIG}
              as="a"
              className="nav-link nav-link--danger"
            />
          </div>
        </nav>

        <main className="main-content">
          <header className="page-header">
            <h1>New Project</h1>
            <p className="page-subtitle">Move your cursor toward any element to see trajectory prediction in action.</p>
          </header>

          <section className="card">
            <h2 className="card-title">Project Details</h2>
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Project Name</label>
                <input className="form-input" type="text" placeholder="Enter project name" />
              </div>
              <div className="form-field">
                <label className="form-label">Category</label>
                <select className="form-input">
                  <option>Design</option>
                  <option>Engineering</option>
                  <option>Marketing</option>
                </select>
              </div>
              <div className="form-field form-field--full">
                <label className="form-label">Description</label>
                <textarea className="form-input form-textarea" placeholder="Describe your project" />
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Team Members</h2>
            <div className="member-grid">
              {['Alice Chen', 'Bob Park', 'Carol Wu'].map((name, i) => (
                <TrackedElement
                  key={`member-${i}`}
                  id={`member-${i}`}
                  label={name}
                  register={register}
                  useSnapshot={useSnapshot}
                  config={APPROACHING_CONFIG}
                  className="member-card"
                />
              ))}
            </div>
          </section>

          <div className="form-actions">
            {FORM_ACTIONS.map((action) => (
              <TrackedElement
                key={action.id}
                id={action.id}
                label={action.label}
                register={register}
                useSnapshot={useSnapshot}
                config={APPROACHING_CONFIG}
                className={`action-btn action-btn--${action.variant}`}
              />
            ))}
          </div>
        </main>
      </div>
    </>
  )
}

const STYLES = `
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    background: #0a0a0f;
    color: #c8c8d0;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75em;
  }

  .app-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
  }

  /* --- Sidebar --- */

  .sidebar {
    background: #111118;
    border-right: 1px solid #1e1e2a;
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sidebar-brand {
    font-weight: 600;
    font-size: 1.1rem;
    color: #e8e8ec;
    letter-spacing: -0.02em;
    padding: 0 12px 20px;
    border-bottom: 1px solid #1e1e2a;
    margin-bottom: 8px;
  }

  .sidebar-section-label {
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #555566;
    padding: 8px 12px 4px;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .sidebar-footer {
    border-top: 1px solid #1e1e2a;
    padding-top: 12px;
    margin-top: auto;
  }

  /* --- Tracked Elements --- */

  .tracked-element {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    font-family: inherit;
    font-size: inherit;
    background: transparent;
    transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
  }

  .tracked-element.glowing {
    transition: border-color 0.08s, box-shadow 0.08s, background-color 0.08s;
  }

  .tracked-meta {
    font-size: 0.7rem;
    color: #666;
    opacity: 0.7;
    white-space: nowrap;
  }

  .tracked-element.glowing .tracked-meta {
    color: rgba(74, 222, 128, 0.8);
    opacity: 1;
  }

  /* --- Nav Links --- */

  .nav-link {
    padding: 10px 12px;
    font-size: 0.9rem;
    font-weight: 400;
    color: #999;
    border-radius: 8px;
  }

  .nav-link:hover {
    color: #ddd;
    background: rgba(255, 255, 255, 0.04);
  }

  .nav-link--danger {
    color: #886;
  }

  /* --- Main Content --- */

  .main-content {
    padding: 40px 48px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    max-width: 800px;
  }

  .page-header h1 {
    font-size: 1.6rem;
    font-weight: 600;
    color: #e8e8ec;
    letter-spacing: -0.03em;
  }

  .page-subtitle {
    margin-top: 6px;
    font-size: 0.85rem;
    color: #666;
    line-height: 1.5;
  }

  /* --- Cards --- */

  .card {
    background: #13131a;
    border: 1px solid #1e1e2a;
    border-radius: 12px;
    padding: 24px;
  }

  .card-title {
    font-size: 1rem;
    font-weight: 500;
    color: #b8b8c0;
    margin-bottom: 20px;
  }

  /* --- Form --- */

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-field--full {
    grid-column: 1 / -1;
  }

  .form-label {
    display: block;
    font-size: 0.78rem;
    font-weight: 500;
    color: #888;
    margin-bottom: 6px;
  }

  .form-input {
    width: 100%;
    padding: 10px 14px;
    background: #0a0a0f;
    border: 1px solid #252530;
    border-radius: 8px;
    color: #c8c8d0;
    font-family: inherit;
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-input:focus {
    border-color: #4a4a5a;
  }

  .form-textarea {
    min-height: 80px;
    resize: vertical;
  }

  /* --- Members --- */

  .member-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .member-card {
    padding: 16px;
    background: #0e0e14;
    border-color: #1e1e2a;
    border-radius: 10px;
    text-align: center;
    font-size: 0.88rem;
    color: #b0b0b8;
    flex-direction: column;
    gap: 6px;
  }

  /* --- Action Buttons --- */

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .action-btn {
    padding: 10px 22px;
    font-size: 0.88rem;
    font-weight: 500;
    border-radius: 8px;
  }

  .action-btn--secondary {
    background: #18181f;
    border-color: #2a2a36;
    color: #aaa;
  }

  .action-btn--primary {
    background: #1a2a1a;
    border-color: #2a3a2a;
    color: #a0d8a0;
  }
`
