import { joinIntakeWaitlist, type JoinWaitlistResult } from '@/contexts/subscriptions/usecases/join-intake-waitlist'
import { reportWaitlistJoinInArea } from '@/shared/google-ads'

/**
 * Every waitlist button goes through here so the Google Ads conversion is
 * reported in one place. The server decides whether the join counts.
 */
export async function joinWaitlist(): Promise<JoinWaitlistResult> {
  const result = await joinIntakeWaitlist()
  if (result.ok && result.inAreaFirstJoin) reportWaitlistJoinInArea()
  return result
}
