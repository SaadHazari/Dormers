// Dev-only harness for the Season admin page's waitlist panel.
//
// The panel is unreviewable in practice: /admin/* needs a real admin session,
// and the list only has anything in it during a live pause with real people on
// it. This renders SeasonClient against fixture rows so the populated table,
// the restart-target progress bar and the empty state can all be looked at.
// Unreachable in production.
//
// Query params:
//   ?members=0     render the empty state instead of the populated table
//   ?target=15     set the restart target (omit for "no target set")
import { notFound } from 'next/navigation'
import { AdminThemeProvider } from '@/app/admin/_components/AdminThemeProvider'
import { SeasonClient } from '@/app/admin/season/SeasonClient'
import type { IntakeSettingsRow, WaitlistMember } from '@/app/admin/season/page'

export const dynamic = 'force-dynamic'

const DAY = 86_400_000

// Deliberately uneven: two dorms carrying most of the list, one person with no
// dorm set, and one whose credit never minted. Those are the three things the
// panel exists to make visible, so the fixture has to contain all of them.
function fixtureMembers(): WaitlistMember[] {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
  return [
    { id: '1', name: 'Aisha Rahman', dormName: 'Dubai Investment Park', mealPreference: 'Veg', whatsapp: '+971501234567', email: 'a@example.com', joinedAt: at(9), creditAed: 15, notifiedAt: null },
    { id: '2', name: 'Omar Farouk', dormName: 'Dubai Investment Park', mealPreference: 'Non Veg', whatsapp: '+971502345678', email: 'o@example.com', joinedAt: at(8), creditAed: 20, notifiedAt: null },
    { id: '3', name: 'Priya Nair', dormName: 'Academic City', mealPreference: 'Veg', whatsapp: '+971503456789', email: 'p@example.com', joinedAt: at(6), creditAed: 15, notifiedAt: at(1) },
    { id: '4', name: 'Yusuf Ali', dormName: 'Academic City', mealPreference: 'Religious Preference', whatsapp: '+971504567890', email: 'y@example.com', joinedAt: at(4), creditAed: 20, notifiedAt: null },
    { id: '5', name: 'Chen Wei', dormName: null, mealPreference: null, whatsapp: null, email: 'c@example.com', joinedAt: at(2), creditAed: null, notifiedAt: null },
    { id: '6', name: 'Layla Haddad', dormName: 'Academic City', mealPreference: 'Non Veg', whatsapp: '+971506789012', email: 'l@example.com', joinedAt: at(1), creditAed: 20, notifiedAt: null },
  ]
}

export default async function SeasonAdminPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ members?: string; target?: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const target = params.target ? Number(params.target) : 15

  const settings: IntakeSettingsRow = {
    paused: true,
    headline: 'We are between semesters.',
    body: 'Dormers cooks when the dorms are full. We have paused new plans until enough of you are back on campus.',
    creditNonvegAed: 20,
    creditVegAed: 15,
    creditReligiousAed: 20,
    pausedAt: new Date(Date.now() - 12 * DAY).toISOString(),
    pausedBy: 'admin@dormers.ae',
    pauseScheduledFor: null,
    reopenTarget: Number.isFinite(target) ? target : null,
  }

  return (
    <AdminThemeProvider>
      <div className="p-6">
        <SeasonClient
          settings={settings}
          members={params.members === '0' ? [] : fixtureMembers()}
          overhangCount={0}
        />
      </div>
    </AdminThemeProvider>
  )
}
