/**
 * Staff program end-to-end dry run — exercises the REAL modules against the
 * live Ohio database with a disposable test identity. Run with:
 *   npx tsx --env-file=.env.local scripts/staff-dry-run.ts <phase>
 * Phases: setup | lifecycle | cleanup
 *
 * Deliberately uses the production code paths (claim hashing, claim
 * verification, account linkage, provisioning, renewal) rather than SQL
 * mirrors, so a pass here means the wiring is real.
 */

import { createClient } from '@supabase/supabase-js'
import { generateClaimCode, hashClaimCode } from '../src/contexts/staff/domain/claim-code'
import { unusedSaturdays } from '../src/contexts/staff/domain/staff-plan'

const TEST_EMAIL = 'staff-dryrun@dormers-internal.test'
const TEST_PHONE = '+971500000099'
const TEST_PASSWORD = 'DryRun!2026#Staff'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
})

function ok(label: string, cond: boolean, detail?: unknown) {
    if (cond) { console.log(`  ✓ ${label}`); return }
    console.error(`  ✗ FAIL: ${label}`, detail ?? '')
    process.exitCode = 1
}

async function setup() {
    console.log('— setup: invite + account + claim linkage —')
    const code = generateClaimCode()

    const { data: invite, error: invErr } = await sb.from('staff_members').insert({
        name: 'Dry Run Intern',
        email: TEST_EMAIL,
        whatsapp_number: TEST_PHONE,
        claim_code_hash: hashClaimCode(code),
        code_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_by: 'dry-run',
    }).select('id').single()
    if (invErr) { console.error('invite insert failed', invErr); process.exit(1) }
    console.log(`  invite ${invite.id} code ${code}`)

    // The claim door — real server action module.
    const { verifyStaffClaim } = await import('../src/app/staff/claim/actions')
    const wrong = await verifyStaffClaim(TEST_EMAIL, 'AAAA-AAAA')
    ok('wrong code rejected', 'error' in wrong)
    const right = await verifyStaffClaim(TEST_EMAIL, code.toLowerCase()) // case-insensitive
    ok('right code accepted (case-insensitive)', 'ok' in right)

    // Account creation (stand-in for onboarding's signUp) + customers row.
    const { data: au, error: auErr } = await sb.auth.admin.createUser({
        email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true,
    })
    if (auErr || !au.user) { console.error('auth user failed', auErr); process.exit(1) }
    const userId = au.user.id
    const { error: custErr } = await sb.from('customers').upsert({
        id: userId, cid: 'TST9999', email: TEST_EMAIL, name: 'Dry Run Intern',
        whatsapp_number: TEST_PHONE, whatsapp_verified: true,
        whatsapp_verified_at: new Date().toISOString(),
        dorm_name: 'YUGO', meal_preference_type: 'Non Veg',
        allergens: 'None', spice_level_preference: 'Medium',
        week_type: '6DAYS', out_of_zone: false,
    })
    if (custErr) { console.error('customer upsert failed', custErr); process.exit(1) }

    // The linkage — real usecase, must match email + phone + window.
    const { linkStaffClaimIfEligible } = await import('../src/contexts/staff/usecases/link-claim')
    ok('wrong phone does NOT link', !(await linkStaffClaimIfEligible(userId, TEST_EMAIL, '+971511111111')))
    ok('email+phone+window links', await linkStaffClaimIfEligible(userId, TEST_EMAIL, TEST_PHONE))

    const { data: claimed } = await sb.from('staff_members').select('status, customer_id, code_verified_at').eq('id', invite.id).single()
    ok('staff row active + linked + window closed',
        claimed?.status === 'active' && claimed?.customer_id === userId && claimed?.code_verified_at === null, claimed)

    console.log(`USER_ID=${userId}`)
}

async function lifecycle() {
    console.log('— lifecycle: provision → renewal → approval gate —')
    const { data: staff } = await sb.from('staff_members').select('customer_id').eq('email', TEST_EMAIL).eq('status', 'active').single()
    const userId = staff!.customer_id as string

    const { getStaffPlanState, provisionStaffFreeRenewal } = await import('../src/contexts/staff/usecases/renewal')
    const { provisionStaffFreePlan } = await import('../src/contexts/staff/usecases/provision-plan')

    ok('state = first-plan', (await getStaffPlanState(userId)).kind === 'first-plan')
    const prov = await provisionStaffFreePlan(userId)
    ok('first 5-day plan provisions', 'ok' in prov, prov)

    const { data: sub } = await sb.from('subscriptions')
        .select('id, status, start_date, end_date, week_type, total_meals, staff_approval')
        .eq('customer_id', userId).eq('plan_name', 'Staff Monthly').order('created_at', { ascending: false }).limit(1).single()
    ok('sub is 5DAYS / 20 meals / no approval gate on first plan',
        sub?.week_type === '5DAYS' && sub?.total_meals === 20 && sub?.staff_approval === null, sub)
    const spanDays = (new Date(sub!.end_date).getTime() - new Date(sub!.start_date).getTime()) / 86400000
    ok(`end_date trigger computed a ~4-week cycle (span ${spanDays}d)`, spanDays >= 24 && spanDays <= 28, sub)
    // Post-2PM provisioning starts tomorrow as Scheduled → 'queued';
    // pre-2PM starts today as Active → 'covered'. Both are correct.
    const midCycle = (await getStaffPlanState(userId)).kind
    ok(`state mid-cycle is covered/queued (got ${midCycle})`, midCycle === 'covered' || midCycle === 'queued')

    // Push the cycle to its final week → renewal opens. Only touch status +
    // end_date — updating start_date would fire the recompute trigger and
    // overwrite the injected end_date (verified: it did exactly that).
    const todayAE = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10)
    const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    await sb.from('subscriptions').update({ status: 'Active', end_date: soon }).eq('id', sub!.id)
    const rstate = await getStaffPlanState(userId)
    ok('state = renewal-open near cycle end', rstate.kind === 'renewal-open', rstate)

    const renew = await provisionStaffFreeRenewal(userId)
    ok('free renewal queues', 'ok' in renew, renew)
    const { data: queued } = await sb.from('subscriptions')
        .select('id, status, staff_approval, start_date')
        .eq('customer_id', userId).eq('plan_name', 'Staff Monthly').eq('status', 'Scheduled').single()
    ok('DB trigger stamped renewal as pending approval', queued?.staff_approval === 'pending', queued)
    ok('state = awaiting-approval', (await getStaffPlanState(userId)).kind === 'awaiting-approval')

    // The gate: due start date + pending approval must NOT activate.
    await sb.from('subscriptions').update({ start_date: todayAE }).eq('id', queued!.id)
    await sb.rpc('subscription_status_tick')
    const { data: held } = await sb.from('subscriptions').select('status').eq('id', queued!.id).single()
    ok('status tick HOLDS pending renewal at the gate', held?.status === 'Scheduled', held)

    // Approval opens the gate on the next tick.
    await sb.from('subscriptions').update({ staff_approval: 'approved' }).eq('id', queued!.id)
    await sb.rpc('subscription_status_tick')
    const { data: released } = await sb.from('subscriptions').select('status').eq('id', queued!.id).single()
    ok('approved renewal activates on next tick', released?.status === 'Active', released)

    // Offboard math (pure): Thu 2026-06-11 → end 2026-07-08 spans 4 Saturdays.
    ok('unusedSaturdays math', unusedSaturdays('2026-06-11', '2026-07-08') === 4
        && unusedSaturdays('2026-06-13', '2026-06-19') === 0  // Sat 13th excluded (already today)
        && unusedSaturdays('2026-06-12', '2026-06-13') === 1)
}

async function cleanup() {
    console.log('— cleanup —')
    // Find the auth user by email (robust against partial runs where the
    // staff row never got linked).
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const authUser = list?.users.find(u => u.email === TEST_EMAIL)
    // FK order: staff row references customers, customers references auth.
    await sb.from('staff_members').delete().eq('email', TEST_EMAIL)
    if (authUser) {
        await sb.from('subscriptions').delete().eq('customer_id', authUser.id).eq('plan_name', 'Staff Monthly')
        const { error: ce } = await sb.from('customers').delete().eq('id', authUser.id)
        const { error: ae } = await sb.auth.admin.deleteUser(authUser.id)
        if (ce || ae) console.error('  cleanup errors:', ce?.message, ae?.message)
    }
    console.log('  test identity removed')
}

async function main() {
    const phase = process.argv[2]
    if (phase === 'setup') await setup()
    else if (phase === 'lifecycle') await lifecycle()
    else if (phase === 'cleanup') await cleanup()
    else { console.error('phase required: setup | lifecycle | cleanup'); process.exit(1) }
}
void main()
