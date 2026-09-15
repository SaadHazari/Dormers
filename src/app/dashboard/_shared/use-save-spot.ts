'use client'

/**
 * One "Save my spot" flow for every season surface (the scheduled notice, and
 * in plan C the held plan card, the break resume sheet and the break notice).
 * Every amount shown after a join comes from the action's own result.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { joinIntakeWaitlist } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { deriveJoinOutcome, type JoinOutcome } from './intake-join-outcome'

export function useSaveSpot(): { outcome: JoinOutcome | null; joining: boolean; join: () => void } {
  const router = useRouter()
  const [outcome, setOutcome] = useState<JoinOutcome | null>(null)
  const [joining, startJoin] = useTransition()
  const join = () => {
    startJoin(async () => {
      const next = deriveJoinOutcome(await joinIntakeWaitlist())
      setOutcome(next)
      if (next.joined) router.refresh()
    })
  }
  return { outcome, joining, join }
}
