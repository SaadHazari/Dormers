import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminSupabaseClient } from '@/infra/supabase/admin-client'
import { STAFF_SATURDAY_MEAL_AED, SATURDAYS_PER_CYCLE } from '@/contexts/staff/domain/staff-plan'
import { getStaffPlanState, staffSeasonNote } from '@/contexts/staff/usecases/renewal'
import StaffPlanClient from './StaffPlanClient'

export const metadata = { title: 'Your staff plan — Dormers' }
export const dynamic = 'force-dynamic'

/**
 * Staff plan chooser — first cycle after claiming, renewals near cycle end,
 * and the waiting room while a renewal sits at the admin's approval gate.
 * Not in the middleware matcher, so auth + staff checks happen here.
 */
export default async function StaffPlanPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const state = await getStaffPlanState(user.id)
    if (state.kind === 'not-staff' || state.kind === 'covered' || state.kind === 'queued') {
        redirect('/dashboard')
    }

    // The season's answer, so a closed kitchen is stated up front rather
    // than discovered by tapping a card that then refuses.
    const seasonNote = await staffSeasonNote(state)

    const sb = createAdminSupabaseClient()
    const [{ data: staff }, { data: customer }] = await Promise.all([
        sb.from('staff_members').select('name').eq('customer_id', user.id).eq('status', 'active').maybeSingle(),
        sb.from('customers').select('name, email, whatsapp_number, dorm_name, meal_preference_type, veg_days').eq('id', user.id).maybeSingle(),
    ])

    return (
        <StaffPlanClient
            firstName={(staff?.name as string)?.split(' ')[0] ?? 'there'}
            mode={state.kind === 'awaiting-approval' ? 'awaiting' : state.kind === 'renewal-open' ? 'renewal' : 'first'}
            seasonNote={seasonNote}
            surchargeAed={STAFF_SATURDAY_MEAL_AED * SATURDAYS_PER_CYCLE}
            perMealAed={STAFF_SATURDAY_MEAL_AED}
            customer={{
                name: customer?.name ?? '',
                email: customer?.email ?? user.email ?? '',
                phone: customer?.whatsapp_number ?? '',
                dorm: customer?.dorm_name ?? '',
                preference: customer?.meal_preference_type ?? 'Non Veg',
                vegDays: (customer?.veg_days as string[] | null) ?? [],
            }}
        />
    )
}
