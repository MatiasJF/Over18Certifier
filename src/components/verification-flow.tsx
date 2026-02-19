'use client'

import React, { useState, useEffect, useRef } from 'react'
import config from '@/certifier.config'
import type { VerificationStep } from '@/lib/config-types'
import EmailVerification from '@/components/email-verification'

interface Props {
  onComplete: (verifiedValues: Record<string, string>) => void
}

export default function VerificationFlow({ onComplete }: Props) {
  const steps = config.verificationSteps ?? []
  const [currentIndex, setCurrentIndex] = useState(0)
  const [verifiedValues, setVerifiedValues] = useState<Record<string, string>>({})
  const completedRef = useRef(false)

  const allDone = steps.length === 0 || currentIndex >= steps.length

  useEffect(() => {
    if (allDone && !completedRef.current) {
      completedRef.current = true
      onComplete(verifiedValues)
    }
  }, [allDone, verifiedValues, onComplete])

  if (allDone) return null

  const currentStep = steps[currentIndex]

  function handleStepComplete(value: string) {
    const next = { ...verifiedValues }
    if (currentStep.injectsField) {
      next[currentStep.injectsField] = value
    }
    setVerifiedValues(next)

    if (currentIndex + 1 >= steps.length) {
      completedRef.current = true
      onComplete(next)
    } else {
      setCurrentIndex(currentIndex + 1)
    }
  }

  function handleSkip() {
    if (currentIndex + 1 >= steps.length) {
      completedRef.current = true
      onComplete(verifiedValues)
    } else {
      setCurrentIndex(currentIndex + 1)
    }
  }

  return renderStep(currentStep, handleStepComplete, handleSkip)
}

function renderStep(
  step: VerificationStep,
  onComplete: (value: string) => void,
  onSkip: () => void
) {
  switch (step.type) {
    case 'email':
      return (
        <EmailVerification
          onVerified={onComplete}
          onSkip={!step.required ? onSkip : undefined}
          label={step.label}
        />
      )
    default:
      return null
  }
}
