import { useState, type CSSProperties } from 'react'
import type { TrajectorySnapshot } from 'anticipated/core'
import { useFakeRequest } from '../lib/useFakeRequest.js'
import { fakeFetch } from '../lib/fakeFetch.js'
import { ONBOARDING_STEPS, type OnboardingStep } from '../lib/fakeData.js'
import { preload } from '../lib/cache.js'
import { getSettings, useDemoStore, incrementPreloadCount } from '../lib/demoStore.js'
import { useSharedTrajectory } from '../context/TrajectoryContext.js'
import { SkeletonForm } from '../components/LoadingOverlay.js'
import { ConfidenceBadge } from '../components/ConfidenceBadge.js'

function getButtonGlow(snapshot: TrajectorySnapshot | undefined, isShowing: boolean): CSSProperties {
  if (!isShowing || !snapshot || snapshot.confidence <= 0.5) return {}
  const intensity: number = (snapshot.confidence - 0.5) / 0.5
  return {
    borderColor: `rgba(74, 222, 128, ${0.3 + intensity * 0.7})`,
    boxShadow: `0 0 ${8 + intensity * 16}px rgba(74, 222, 128, ${intensity * 0.4})`,
    backgroundColor: `rgba(74, 222, 128, ${0.08 + intensity * 0.08})`,
  }
}

function StepIndicators({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="step-indicators">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div key={i} className="step-indicator-wrapper">
          <div className={`step-indicator ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}>
            {i < currentStep ? '\u2713' : i + 1}
          </div>
          {i < totalSteps - 1 && (
            <div className={`step-connector ${i < currentStep ? 'completed' : ''}`} />
          )}
        </div>
      ))}
    </div>
  )
}

function StepForm({ step }: { step: OnboardingStep }) {
  if (step.fields.length === 0) {
    return (
      <div className="review-summary">
        <p className="review-text">All set! Review your selections and click Finish to complete setup.</p>
        <div className="review-items">
          {ONBOARDING_STEPS.slice(0, -1).map((s) => (
            <div key={s.step} className="review-item">
              <span className="review-item-label">{s.title}</span>
              <span className="review-item-status">{'\u2713'} Completed</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="form-grid">
      {step.fields.map((field) => (
        <div key={field.name} className="form-field">
          <label className="form-label">{field.label}</label>
          {field.type === 'select' ? (
            <select className="form-input" defaultValue={field.defaultValue}>
              <option value="" disabled>{field.placeholder}</option>
              {field.options?.map((opt) => (
                <option key={opt} value={opt.toLowerCase()}>{opt}</option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              className="form-input form-textarea"
              placeholder={field.placeholder}
              defaultValue={field.defaultValue}
            />
          ) : (
            <input
              className="form-input"
              type={field.type}
              placeholder={field.placeholder}
              defaultValue={field.defaultValue}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps: number = ONBOARDING_STEPS.length
  const isLastStep: boolean = currentStep === totalSteps - 1
  const isFirstStep: boolean = currentStep === 0

  const { data: stepData, isLoading } = useFakeRequest<OnboardingStep>(
    `onboarding-step-${currentStep}`,
    () => fakeFetch(ONBOARDING_STEPS[currentStep])
  )

  const { register, useSnapshot } = useSharedTrajectory()
  const settings = useDemoStore()

  const nextRef = register(`wizard-next-${currentStep}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      const nextStep: number = currentStep + 1
      if (nextStep < totalSteps) {
        if (preload(`onboarding-step-${nextStep}`, () => fakeFetch(ONBOARDING_STEPS[nextStep]))) {
          incrementPreloadCount()
        }
      }
    },
    tolerance: 30,
  })

  const backRef = register(`wizard-back-${currentStep}`, {
    whenApproaching: () => {
      if (!getSettings().isAnticipatedEnabled) return
      const prevStep: number = currentStep - 1
      if (prevStep >= 0) {
        if (preload(`onboarding-step-${prevStep}`, () => fakeFetch(ONBOARDING_STEPS[prevStep]))) {
          incrementPreloadCount()
        }
      }
    },
    tolerance: 30,
  })

  const nextSnapshot: TrajectorySnapshot | undefined = useSnapshot(`wizard-next-${currentStep}`)
  const backSnapshot: TrajectorySnapshot | undefined = useSnapshot(`wizard-back-${currentStep}`)

  const nextGlow: CSSProperties = getButtonGlow(nextSnapshot, settings.isShowingPredictions)
  const backGlow: CSSProperties = getButtonGlow(backSnapshot, settings.isShowingPredictions)

  const isNextGlowing: boolean = settings.isShowingPredictions && !!nextSnapshot && nextSnapshot.confidence > 0.5
  const isBackGlowing: boolean = settings.isShowingPredictions && !!backSnapshot && backSnapshot.confidence > 0.5

  const handleNext = () => {
    if (currentStep < totalSteps - 1) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const handleFinish = () => {
    setCurrentStep(0)
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Onboarding</h1>
        <p className="page-subtitle">
          A multi-step wizard. Move toward the Next button to preload the upcoming step's data.
        </p>
      </header>

      <section className="card wizard">
        <StepIndicators currentStep={currentStep} totalSteps={totalSteps} />

        <div className="wizard-content">
          {isLoading ? (
            <>
              <div className="wizard-step-header">
                <div className="skeleton" style={{ width: '40%', height: '22px' }} />
                <div className="skeleton" style={{ width: '60%', height: '14px', marginTop: '8px' }} />
              </div>
              <SkeletonForm />
            </>
          ) : stepData ? (
            <>
              <div className="wizard-step-header">
                <h2 className="wizard-step-title">{stepData.title}</h2>
                <p className="wizard-step-desc">{stepData.description}</p>
              </div>
              <StepForm step={stepData} />
            </>
          ) : null}
        </div>

        <div className="wizard-actions">
          {!isFirstStep && (
            <button
              ref={backRef as React.RefCallback<HTMLButtonElement>}
              className={`btn btn-secondary ${isBackGlowing ? 'glowing' : ''}`}
              style={backGlow}
              onClick={handleBack}
              data-anticipated-id={`wizard-back-${currentStep}`}
              data-anticipated-tolerance="30"
            >
              Back
              <ConfidenceBadge snapshot={backSnapshot} isVisible={settings.isShowingPredictions} />
            </button>
          )}
          <div className="wizard-actions-spacer" />
          {isLastStep ? (
            <button className="btn btn-primary" onClick={handleFinish}>
              Finish Setup
            </button>
          ) : (
            <button
              ref={nextRef as React.RefCallback<HTMLButtonElement>}
              className={`btn btn-primary ${isNextGlowing ? 'glowing' : ''}`}
              style={nextGlow}
              onClick={handleNext}
              data-anticipated-id={`wizard-next-${currentStep}`}
              data-anticipated-tolerance="30"
            >
              Next
              <ConfidenceBadge snapshot={nextSnapshot} isVisible={settings.isShowingPredictions} />
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
