import { getDormLocations } from '@/infra/supabase/dorm-locations'
import { dormNames } from '@/shared/dorm-registry'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const locs = await getDormLocations()
  const dorms = dormNames(locs)
  return <OnboardingClient dorms={dorms} />
}
