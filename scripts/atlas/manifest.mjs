// Generates manifest.json — every dashboard state, hierarchically, with the URL,
// storage seeds, fake-clock and UI interactions needed to reach it.
//   node manifest.mjs > manifest.json
import { writeFileSync } from 'node:fs'

const DAY = 86400000
const dateOnly = t => new Date(t).toISOString().slice(0, 10)
const today = dateOnly(Date.now() + 4 * 3600000)            // AE calendar day (server + client agree)
const aeAt = (hhmm, dayOff = 0) => {                        // ISO instant at HH:MM Asia/Dubai
  const d = new Date(Date.now() + dayOff * DAY)
  return `${dateOnly(d.getTime() + 4 * 3600000)}T${hhmm}:00+04:00`
}
const nextDow = (isoDow) => {                                // days until next given ISO weekday (1=Mon..7=Sun), >0
  const ae = new Date(Date.now() + 4 * 3600000)
  const cur = ae.getUTCDay() === 0 ? 7 : ae.getUTCDay()
  let off = (isoDow - cur + 7) % 7
  if (off === 0) off = 7
  return off
}
const SUNDAY = nextDow(7), SATURDAY = nextDow(6)

const M = []
let section = '', sub = ''
const S = (t) => { section = t; sub = '' }
const SS = (t) => { sub = t }
const add = (id, title, o) => M.push({ id, section, sub, title, ...o })

// Common seeds
const pausingAckKey = `dormers:intake-pausing-ack:${dateOnly(Date.now() - 10 * DAY)}`
const errorRetryStamp = { 'dash-error-auto-retry-at': String(Date.now()) }

// Chat mock (AI SDK v6 UI message stream)
const sse = (events) => events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
const chatReply = (text) => ({
  url: '**/api/support-chat', contentType: 'text/event-stream',
  headers: { 'x-vercel-ai-ui-message-stream': 'v1', 'cache-control': 'no-cache' },
  body: sse([{ type: 'start' }, { type: 'text-start', id: 't1' }, { type: 'text-delta', id: 't1', delta: text }, { type: 'text-end', id: 't1' }, { type: 'finish' }]),
})

// ─────────────────────────────────────────────────────────────────────────────
S('1 · Shell & navigation')
SS('1.1 · Frame and rail')
add('shell-frame', 'Dashboard frame — rail collapsed (desktop) · burger (mobile)', {
  description: 'The shell every dashboard page sits in. Desktop: fixed navy rail with icon-only navigation and the cream content card. Mobile: beige page with the floating burger and no frame.',
  conditions: 'Any signed-in customer, any route. Shown here on the home with a Monthly Premium plan.',
  url: '/dashboard?preview=1&shell=referrals&verified=1', kind: 'page',
})
add('shell-rail-hover', 'Rail expanded on hover (labels + name/CID chip)', {
  description: 'Hovering the desktop rail animates it to 240px and reveals every label plus the two-line profile chip (name, DORM · CID). Content does not shift.',
  conditions: 'Desktop, pointer over the sidebar.', url: '/dashboard?preview=1&shell=referrals,credit&verified=1', kind: 'overlay', viewports: ['desktop'],
  actions: [{ type: 'hover', selector: 'aside.dash-sidebar', settleMs: 700 }],
})
add('shell-drawer-open', 'Mobile navigation drawer open', {
  description: 'Tapping the burger slides a 280px navy drawer over a blurred scrim with full-label navigation, the credit row, Refer & earn, Now, and the account chip.',
  conditions: 'Mobile, burger tapped.', url: '/dashboard?preview=1&shell=referrals,credit,weekly&verified=1', kind: 'overlay', viewports: ['mobile'],
  actions: [{ type: 'click', selector: '.dash-mobile-menu', settleMs: 800 }],
})
add('shell-rail-credit-admin', 'Rail with credit chip and Admin link', {
  description: 'When the customer holds approved credit the wallet icon appears in the rail; admins additionally get the shield link to the admin panel.',
  conditions: 'creditRows non-empty; admin email.', url: '/dashboard?preview=1&shell=credit,admin,referrals&verified=1', kind: 'page', viewports: ['desktop'],
})
add('shell-drawer-credit-admin', 'Drawer with credit row and Admin link', {
  description: 'Same data as the rail, in the open drawer.', conditions: 'Mobile; credit + admin.',
  url: '/dashboard/plan?preview=1&shell=credit,admin,referrals', kind: 'overlay', viewports: ['mobile'],
  actions: [{ type: 'click', selector: '.dash-mobile-menu', settleMs: 800 }],
})

SS('1.2 · Now tray')
const nowTray = (id, title, shell, description, conditions) => {
  add(`shell-now-${id}`, title, {
    description, conditions, url: `/dashboard/plan?preview=1&shell=${shell}`, kind: 'dropdown',
    actions: [{ type: 'click', selector: '.dash-mobile-menu', vp: 'mobile', settleMs: 600 }, { type: 'click', selector: 'button[aria-label^="Now tray"]', settleMs: 700 }],
  })
}
nowTray('empty', 'Now tray — nothing pending', '', 'The tray opened with no time-bound items: the empty state copy.', 'No pending or late reviews, no wrap window, intake open.')
nowTray('weekly', 'Now tray — weekly review pending (4 days left)', 'weekly', 'A pending weekly review card with the days-left chip, the week dots and the cycle stakes strip.', 'weeklyReviewState.current set, daysLeft 4.')
nowTray('weekly-urgent', 'Now tray — weekly review due tomorrow (urgent pulse)', 'weekly-urgent', 'Same card at 1 day left: the rail badge switches to its pulsing halo (the card copy itself only escalates to "Last day" at 0 days).', 'current.daysLeft ≤ 1.')
nowTray('late', 'Now tray — late review (catch-up card)', 'late', 'A missed week within the 30-day late window shows the muted catch-up card at the reduced AED 2 reward.', 'weeklyReviewState.late non-empty.')
nowTray('submitted', 'Now tray — just submitted row', 'submitted', 'Immediately after submitting, the tray shows the "Week N locked in" confirmation row.', 'weeklyReviewState.justSubmitted set.')
nowTray('monthly', 'Now tray — monthly wrap open', 'monthly', 'The monthly wrap card in its open, full-reward state: the cycle ended yesterday and the full AED 5 is available for 7 days.', 'monthlyWindow.eligible, daysSinceCycleEnd 1, daysLeftForFullReward 7.')
nowTray('monthly-locked', 'Now tray — monthly wrap locked', 'monthly-locked', 'The wrap card shown but not yet submittable (weekly preview between day 4 and the 5th delivered meal).', 'monthlyWindow.locked.')
nowTray('monthly-late', 'Now tray — monthly wrap late', 'monthly-late', 'Past the 7-day full-reward window: the wrap card mutes and offers the late reward.', 'eligible, daysLeftForFullReward 0, daysSinceCycleEnd 9.')
nowTray('paused', 'Now tray — new plans paused note', 'intakepaused', 'During the seasonal pause the tray carries a quiet "New plans paused" note.', 'intakePaused true.')
nowTray('everything', 'Now tray — pending + late + wrap + pause together', 'weekly,late,monthly,intakepaused', 'All tray content stacked, to show ordering and scroll.', 'Every tray input set at once.')

SS('1.3 · Account and Refer & earn menus')
add('shell-account-menu', 'Account menu dropdown', {
  description: 'The avatar opens the account menu: name, email, Profile link, bug report icon (desktop) and Sign out.',
  conditions: 'Avatar / account chip tapped.', url: '/dashboard/plan?preview=1&shell=referrals', kind: 'dropdown',
  actions: [{ type: 'click', selector: '.dash-mobile-menu', vp: 'mobile', settleMs: 600 }, { type: 'click', selector: 'button[aria-label="Account menu"]', js: true, settleMs: 700 }],
})
add('shell-refer-menu', 'Refer & earn panel — no referrals yet', {
  description: 'The gift icon opens the Refer & earn panel with the copyable referral link and the milestone ladder.',
  conditions: 'referralData.total 0; Monthly Premium (Dorm Wars eligible → wallet framing).', url: '/dashboard/plan?preview=1', kind: 'dropdown',
  actions: [{ type: 'click', selector: '.dash-mobile-menu', vp: 'mobile', settleMs: 600 }, { type: 'click', selector: 'button[aria-label="Refer a friend"]', settleMs: 700 }],
})
add('shell-refer-menu-active', 'Refer & earn panel — 3 referred, 1 converted, credit', {
  description: 'Same panel with live numbers: referred count badge on the rail icon, credit balance and pending amounts.',
  conditions: 'referralData total 3 / converted 1 / creditBalance 66 / pending 10.', url: '/dashboard/plan?preview=1&shell=referrals', kind: 'dropdown',
  actions: [{ type: 'click', selector: '.dash-mobile-menu', vp: 'mobile', settleMs: 600 }, { type: 'click', selector: 'button[aria-label="Refer a friend"]', settleMs: 700 }],
})
add('shell-refer-menu-ineligible', 'Refer & earn panel — Weekly Flex (no Dorm Wars)', {
  description: 'For Weekly Flex / Trial / no-plan customers the panel frames Refer & earn as a standalone programme (referral-only earnings).',
  conditions: 'planName Weekly Flex → dormWarsEligible false.', url: '/dashboard/plan?preview=1&shell=referrals&plan=weekly-flex', kind: 'dropdown',
  actions: [{ type: 'click', selector: '.dash-mobile-menu', vp: 'mobile', settleMs: 600 }, { type: 'click', selector: 'button[aria-label="Refer a friend"]', settleMs: 700 }],
})

SS('1.4 · Shell overlays')
add('shell-bug-report', 'Bug report — Sentry feedback dialog', {
  description: 'The ghost bug icon at the top-right of the cream card opens the Sentry feedback dialog (name, email, what went wrong, screenshot). Desktop only — mobile has no entry point.',
  conditions: 'Desktop, any page.', url: '/dashboard/plan?preview=1', kind: 'overlay', viewports: ['desktop'],
  actions: [{ type: 'hover', selector: 'button[aria-label="Report a bug"]', settleMs: 600 }, { type: 'click', selector: 'button[aria-label="Report a bug"]', settleMs: 1500 }],
})
add('shell-idle-toast', 'Idle refresh toast', {
  description: 'After 30 minutes without activity (or 15 minutes hidden) a bottom-right toast offers a refresh.',
  conditions: 'Idle ≥ 30 min while visible.', url: '/dashboard/plan?preview=1', kind: 'toast', clock: 'now',
  actions: [{ type: 'clockForward', ms: 31 * 60 * 1000 }, { type: 'wait', ms: 800 }],
})
add('shell-wrap-force', 'Monthly wrap forcing overlay (last delivery evening)', {
  description: 'On the evening of the last delivery day the shell forces the wrap prompt once per session, on whichever page the customer lands.',
  conditions: 'monthlyWindow.preCron, no queued plan.', url: '/dashboard/plan?preview=1&shell=precron', kind: 'overlay',
})
add('shell-wrap-force-queued', 'Monthly wrap forcing overlay — queued plan copy', {
  description: 'Same overlay reframed as "rate it before your new plan starts" when a queued plan exists.',
  conditions: 'preCron + queuedPlanSummary.', url: '/dashboard/plan?preview=1&shell=precron,queued', kind: 'overlay',
})

// ─────────────────────────────────────────────────────────────────────────────
S('2 · Home — no active plan')
SS('2.1 · First visit and returning')
add('home-noplan-new', 'Brand-new signup — no plan, no history', {
  description: 'The first dashboard a new customer sees: "Welcome, Saad." greeting, the Get started hero with the Orbit art and "Pick a plan".',
  conditions: 'No subscriptions at all; WhatsApp verified from onboarding.', url: '/dashboard?preview=1&nosub=1&first=1', kind: 'page',
})
add('home-noplan-returning', 'Returning customer — plan ended, profile gate', {
  description: '"Welcome back" with the equity ledger (dinners, since, past plans), the Renew hero and the past-plans tiles. The base fixture is WhatsApp-unverified, so the profile gate banner sits under the greeting and the CTA is greyed.',
  conditions: 'Ended subscriptions present; profile incomplete.', url: '/dashboard?preview=1&nosub=1', kind: 'page',
})
add('home-noplan-returning-ok', 'Returning customer — verified (Renew enabled)', {
  description: 'Same returning shape with a complete profile: orange "Renew Monthly Premium" and "Browse all plans".',
  conditions: 'Ended plans; profile complete.', url: '/dashboard?preview=1&nosub=1&verified=1&benchmark=1', kind: 'page',
})
add('home-noplan-outofzone', 'Out-of-zone customer', {
  description: 'A customer whose dorm is outside the delivery radius: the out-of-zone banner leads, the profile banner is de-prioritised and purchase is blocked.',
  conditions: 'customer.out_of_zone true.', url: '/dashboard?preview=1&nosub=1&verified=1&zone=0', kind: 'page',
})
add('home-noplan-cancelled', 'Checkout cancelled notice', {
  description: 'Returning from a Stripe cancel: a quiet "Checkout was cancelled — no charge was made" line under the greeting.',
  conditions: '?checkout_canceled=true with no active plan.', url: '/dashboard?preview=1&nosub=1&verified=1&checkout_canceled=true', kind: 'page',
})
add('home-noplan-wrap', 'Monthly wrap empty banner (rate the last cycle first)', {
  description: 'With no plan but an open wrap window for the previous cycle, a banner invites the customer to wrap the last cycle before picking the next.',
  conditions: 'monthlyWindow.eligible, no active subscription.', url: '/dashboard?preview=1&nosub=1&verified=1&wrap=open', kind: 'page',
})
SS('2.2 · Seasonal pause (waitlist)')
add('home-noplan-pause-offer', 'Seasonal pause — save-your-spot offer', {
  description: 'Intake paused and not yet joined: mobile renders the waitlist card in flow as the hero (shelf); desktop keeps the hero behind the warm-glass tease with the card on the glass.',
  conditions: 'intake.paused, alreadyJoined false.', url: '/dashboard?preview=1&nosub=1&paused=1&joined=0', kind: 'page',
})
add('home-noplan-pause-joined', 'Seasonal pause — spot reserved', {
  description: 'After joining: the navy "Your spot is saved" pass with the credit line and the reopen promise.',
  conditions: 'intake.paused, alreadyJoined true, waitlistCreditAed 15.', url: '/dashboard?preview=1&nosub=1&paused=1', kind: 'page',
})
add('home-noplan-pause-new', 'Seasonal pause — brand-new signup', {
  description: 'A new signup arriving during the pause: greeting, then the offer card, no hero on mobile.',
  conditions: 'No history; paused; not joined.', url: '/dashboard?preview=1&nosub=1&first=1&paused=1&joined=0', kind: 'page',
})
add('home-noplan-pause-join-error', 'Seasonal pause — join failed (error line)', {
  description: 'Tapping "Save my spot" when the join cannot complete: the inline error under the card. (The success place card needs a live account.)',
  conditions: 'joinIntakeWaitlist returns an error.', url: '/dashboard?preview=1&nosub=1&paused=1&joined=0', kind: 'page',
  actions: [{ type: 'click', text: '^Save my spot$', settleMs: 2500 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('3 · Home — active plan')
SS('3.1 · Everyday looks')
add('home-active-base', 'Active Monthly Premium — mid-cycle, ending in 3 days (profile gate)', {
  description: 'The default active home: greeting + equity line, profile gate banner (WhatsApp unverified), renew banner with the blocked grey CTA, stat tiles, tonight\'s dish hero, quick actions and the plan progress card.',
  conditions: 'Active sub, 6 delivered, 1 skip, ends in 3 days, profile incomplete.', url: '/dashboard?preview=1', kind: 'page',
})
add('home-active-verified', 'Active — verified profile (orange Renew)', {
  description: 'Same shape with a complete profile: no gate banner, orange Renew now, and the greeting equity line with lifetime savings.',
  conditions: 'whatsapp_verified; benchmark set.', url: '/dashboard?preview=1&verified=1&benchmark=1', kind: 'page',
})
add('home-active-far', 'Active — mid-cycle, no renew banner', {
  description: 'Plan ending in 20 days: outside the 7-day renew window, so no banner and Days-left reads 20.',
  conditions: 'end_date +20d.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page',
})
add('home-active-fresh', 'Active — under 5 lifetime dinners (short greeting)', {
  description: 'A customer early in their first plan: the greeting drops the equity ledger and the progress shows 2 of 6.',
  conditions: 'totalDelivered < 5 (first plan, no history).', url: '/dashboard?preview=1&verified=1&fresh=1&far=1', kind: 'page', rev: 3, clock: aeAt('15:30'),
})
add('home-active-benchmark-unset', 'Savings tile — benchmark not set', {
  description: 'The "Saved this cycle" tile in its dashed CTA state ("Set your dinner spend") and the mobile greeting\'s "Add your usual dinner spend" link.',
  conditions: 'takeout_benchmark_aed null.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page',
})
add('home-active-dayone', 'Day one — plan started today, nothing delivered yet', {
  description: 'First day of a plan: zero delivered, the day-one chip on the mobile hero, full progress bar of empty pills.',
  conditions: 'start_date today, delivered 0.', url: '/dashboard?preview=1&verified=1&sub=dayone&far=1', kind: 'page',
})
add('home-active-lastday', 'Last day — plan ends today', {
  description: 'The final delivery day with no queued plan: renew banner in its last-day wording, Days-left 0.',
  conditions: 'end_date today, no queued sub.', url: '/dashboard?preview=1&verified=1&sub=lastday', kind: 'page',
})
add('home-active-ended0', 'All meals delivered (24 of 24)', {
  description: 'Every meal consumed: the progress card at 0 remaining and, on mobile, the in-card "Plan ended · Renew" row.',
  conditions: 'delivered_meals = total_meals.', url: '/dashboard?preview=1&verified=1&sub=ended0', kind: 'page',
})
SS('3.2 · Plan tiers and preferences')
add('home-active-trial', 'Trial — single welcome meal', {
  description: 'The one-meal Trial plan: single-pill progress, no Plan a skip, pause unavailable, trial copy on the hero.',
  conditions: 'plan Trial, total 1.', url: '/dashboard?preview=1&verified=1&sub=trial', kind: 'page',
})
add('home-active-weekly', 'Weekly Flex — 6 meals, 1 skip', {
  description: 'Weekly Flex: six pills, one skip allowance, no pause (weekly plans cannot pause), ends Saturday.',
  conditions: 'plan Weekly Flex.', url: '/dashboard?preview=1&verified=1&sub=weekly', kind: 'page', rev: 2,
})
add('home-active-max', 'Monthly Max — 48 meals (2 per delivery)', {
  description: 'Monthly Max: 48-meal progress (two meals per delivery), Max glyph.',
  conditions: 'plan Monthly Max.', url: '/dashboard?preview=1&verified=1&sub=max&far=1', kind: 'page',
})
add('home-active-veg', 'Vegetarian preference', {
  description: 'Veg customer: tonight\'s dish is the veg option and the VEG tag replaces N.VEG.',
  conditions: 'meal_preference_type Veg.', url: '/dashboard?preview=1&verified=1&pref=veg&far=1', kind: 'page',
})
add('home-active-mix', 'Religious mix — veg on Mon/Wed', {
  description: 'Religious-preference customer with two veg days: the hero picks the veg dish on veg days and the non-veg dish otherwise.',
  conditions: 'Religious Preference, veg_days Mon+Wed.', url: '/dashboard?preview=1&verified=1&pref=mix&far=1', kind: 'page',
})
add('home-active-5days', '5-day cadence (Mon–Fri)', {
  description: 'Weekday-only plan: Saturday is an off day in the progress grid and hero.',
  conditions: 'week_type 5DAYS.', url: '/dashboard?preview=1&verified=1&week=5&far=1', kind: 'page',
})
SS('3.3 · Tonight\'s dish — delivery phases (Asia/Dubai clock)')
add('home-hero-morning', 'Morning — "Arriving in ~N hours"', {
  description: 'Before the kitchen cutoff: live countdown, Skip tonight enabled, ACTIVE badge.',
  conditions: 'Delivery day, 09:30 AE.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page', clock: aeAt('09:30'),
})
add('home-hero-afternoon', 'After 2 PM cutoff — skip locked for tonight', {
  description: 'Past the 14:00 kitchen cutoff: tonight can no longer be skipped; the skip control explains why and points at Plan a skip.',
  conditions: '15:30 AE.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page', clock: aeAt('15:30'),
})
add('home-hero-soon', '"Arriving soon" (18:45)', {
  description: 'Within 30 minutes of the 7 PM window: urgent orange countdown.',
  conditions: '18:45 AE.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page', clock: aeAt('18:45'),
})
add('home-hero-now', '"Arriving now" (19:15)', {
  description: 'During the delivery hour.', conditions: '19:15 AE.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page', clock: aeAt('19:15'),
})
add('home-hero-delivered', 'Delivered (after 8 PM)', {
  description: 'Once delivered the hero calms down: DELIVERED badge, no countdown, today\'s pill filled.',
  conditions: '≥ 20:00 AE (also &state=delivered).', url: '/dashboard?preview=1&verified=1&far=1&state=delivered', kind: 'page', clock: aeAt('20:30'),
})
add('home-hero-sunday', 'Sunday — no delivery (dusk canopy on mobile)', {
  description: 'The weekly rest day: "No delivery today" card; the mobile canopy turns navy (sun down).',
  conditions: 'Sunday, any plan.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'page', clock: aeAt('12:00', SUNDAY),
})
add('home-hero-saturday-5day', 'Saturday off — 5-day plan', {
  description: 'For Mon–Fri plans Saturday is also a rest day.', conditions: 'week_type 5DAYS, Saturday.',
  url: '/dashboard?preview=1&verified=1&far=1&week=5', kind: 'page', clock: aeAt('12:00', SATURDAY),
})
add('home-hero-skipped', 'Skipped tonight', {
  description: 'Today skipped: the hero shows "Skipped tonight", the skip pill turns hatched, the end date has moved out a day.',
  conditions: 'status Skipped, last_skipped_date today.', url: '/dashboard?preview=1&verified=1&sub=skipped&far=1', kind: 'page', clock: aeAt('11:00'),
})
add('home-hero-resumed', 'Resumed after the cutoff — first meal tomorrow', {
  description: 'Resuming after 2 PM: no delivery tonight, "First meal lands tomorrow" framing.',
  conditions: 'sessionStorage dorm-resumed-after-cutoff = today (also &state=resumed).', url: '/dashboard?preview=1&verified=1&far=1&state=resumed', kind: 'page',
  storage: { session: { 'dorm-resumed-after-cutoff': today } },
})
add('home-hero-closure', 'Company closure days in the grid', {
  description: 'Kitchen closure dates render as "kitchen closed" pills instead of upcoming meals.',
  conditions: 'closureDates tomorrow + day after.', url: '/dashboard?preview=1&verified=1&far=1&closure=1', kind: 'page',
})
SS('3.4 · Paused, scheduled and planned pause')
add('home-active-paused', 'Plan paused', {
  description: 'Paused plan: cream "Plan paused" hero, Resume plan as the primary action, paused days marked in the grid, end date tentative.',
  conditions: 'status Paused, has_paused_before, paused_dates.', url: '/dashboard?preview=1&verified=1&sub=paused&far=1', kind: 'page', rev: 2, clock: aeAt('15:30'),
})
add('home-active-paused-sunday', 'Paused on a rest day', {
  description: 'Paused plan on Sunday: dusk canopy with the paused card and a collapsed footer row.',
  conditions: 'Paused + Sunday.', url: '/dashboard?preview=1&verified=1&sub=paused&far=1', kind: 'page', clock: aeAt('12:00', SUNDAY), rev: 2,
})
add('home-active-scheduled', 'Scheduled — starts in 5 days', {
  description: 'A plan bought for a future start: "Starting soon" hero, countdown to the first delivery, no skip/pause.',
  conditions: 'status Scheduled, start_date +5d.', url: '/dashboard?preview=1&verified=1&sub=scheduled', kind: 'page',
})
add('home-active-planned-pause', 'Pause scheduled for a future day', {
  description: 'A planned pause: the pause action reads "Pause scheduled" with the date, the grid shows the pause start, and Cancel is offered.',
  conditions: 'planned_pause_start +4d.', url: '/dashboard?preview=1&verified=1&sub=planned-pause&far=1', kind: 'page',
})
add('home-active-pause-used', 'Pause credit already used this cycle', {
  description: 'After one pause the action is spent: "Pause used this cycle — resets at next renewal", paused range legend in the progress card.',
  conditions: 'has_paused_before true, paused_dates.', url: '/dashboard?preview=1&verified=1&sub=pause-used&far=1', kind: 'page', rev: 3, clock: aeAt('15:30'),
})
add('home-active-noskips', 'No skips left', {
  description: 'All three skips consumed: Skip tonight disabled with "None left", three hatched pills.',
  conditions: 'skipped_meals_count 3.', url: '/dashboard?preview=1&verified=1&sub=noskips&far=1', kind: 'page',
})
add('home-active-queued', 'Next plan queued (Monthly Max)', {
  description: 'A renewal already bought: the queued-plan coda replaces the renew banner and shows the start date.',
  conditions: 'queuedSubscription present.', url: '/dashboard?preview=1&verified=1&sub=queued', kind: 'page',
})

// ─────────────────────────────────────────────────────────────────────────────
S('4 · Home — banners, takeovers & dialogs')
SS('4.1 · Banners')
add('home-banner-wrap-locked', 'Monthly wrap strip — locked', {
  description: 'The slim wrap strip in its pre-unlock state (top-right on desktop, last tile on mobile).',
  conditions: 'monthlyWindow.locked.', url: '/dashboard?preview=1&verified=1&far=1&wrap=locked', kind: 'page',
})
add('home-banner-wrap-open', 'Monthly wrap strip — open (7 days left)', {
  description: 'Clickable wrap strip with the days chip and the AED reward.', conditions: 'eligible.', url: '/dashboard?preview=1&verified=1&far=1&wrap=open', kind: 'page',
})
add('home-banner-wrap-late', 'Monthly wrap strip — late', {
  description: 'Past the full-reward window the strip mutes to grey and shows "Nd late".', conditions: 'daysLeftForFullReward 0, daysSinceCycleEnd 9.', url: '/dashboard?preview=1&verified=1&far=1&wrap=late', kind: 'page',
})
add('home-banner-pause-joined', 'Plan ending + seasonal pause — spot saved', {
  description: 'Plan ends in 3 days while intake is paused: the plan-ending banner replaces Renew and confirms the reserved spot and credit.',
  conditions: 'intake paused, alreadyJoined, end within 7 days.', url: '/dashboard?preview=1&verified=1&paused=1', kind: 'page',
  storage: { local: { [pausingAckKey]: '1' } },
})
add('home-banner-pause-offer', 'Plan ending + seasonal pause — not yet joined', {
  description: 'Same banner expanded with the "Save my spot" offer.', conditions: 'paused, not joined.', url: '/dashboard?preview=1&verified=1&paused=1&joined=0', kind: 'page',
  storage: { local: { [pausingAckKey]: '1' } },
})
add('home-banner-outofzone', 'Out-of-zone banner on an active plan', {
  description: 'An active customer flagged out of zone: the banner leads the page.', conditions: 'out_of_zone true.', url: '/dashboard?preview=1&verified=1&far=1&zone=0', kind: 'page',
})
SS('4.2 · Takeovers')
add('home-takeover-pausing', 'Seasonal pause announcement takeover', {
  description: 'First visit after the operator pauses intake: a full-screen announcement of the break, the credit, and the last delivery day.',
  conditions: 'intake paused, active sub, not yet acknowledged this cycle.', url: '/dashboard?preview=1&verified=1&paused=1&joined=0', kind: 'takeover',
})
add('home-takeover-reopened', 'Plans reopened takeover (credit ready)', {
  description: 'After the pause lifts, a joined customer is welcomed back with their waitlist credit and a path to the plans.',
  conditions: 'intake open, alreadyJoined, waitlistCreditAed > 0, not acknowledged.', url: '/dashboard?preview=1&verified=1&reopened=1', kind: 'takeover',
})
add('home-takeover-checkout-success', 'Checkout success takeover', {
  description: 'Returning from Stripe with the new plan provisioned: the celebration screen with plan, first delivery date, meals and amount paid.',
  conditions: '?checkout_success=true and the new subscription landed.', url: '/dashboard?preview=1&verified=1&checkout_success=true', kind: 'takeover',
})
add('home-takeover-provisioning', 'Order received — setting up (webhook pending)', {
  description: 'Stripe redirected but the webhook has not created the plan yet: spinner with "Order received! Setting up your meal plan…".',
  conditions: 'checkout_success with no subscription yet.', url: '/dashboard?preview=1&nosub=1&checkout_success=true', kind: 'takeover', clock: 'now',
})
add('home-takeover-provisioning-slow', 'Order received — taking longer (WhatsApp escape hatch)', {
  description: 'After 20 seconds the copy switches to reassurance and offers WhatsApp.', conditions: 'Same, 20 s elapsed.',
  url: '/dashboard?preview=1&nosub=1&checkout_success=true', kind: 'takeover', clock: 'now', actions: [{ type: 'clockForward', ms: 21000 }, { type: 'wait', ms: 600 }],
})
SS('4.3 · Quick-action dialogs')
add('home-dialog-skip', 'Skip tonight — confirmation', {
  description: 'Skip tonight opens a confirm sheet (centered dialog on desktop, bottom sheet on mobile) stating what happens to the meal and the skips left.',
  conditions: 'Before 2 PM, skips remaining.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet', clock: aeAt('10:00'),
  actions: [{ type: 'click', selector: 'button[aria-label="Skip today\'s meal"]', vp: 'desktop', settleMs: 800 }, { type: 'click', text: '^Skip$', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-plan-skip', 'Plan a skip — date picker', {
  description: 'The future-skip modal: a calendar of upcoming delivery days with make-up days locked and the chosen day highlighted.',
  conditions: 'Skips remaining.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button[aria-label="Plan a skip for a future date"]', vp: 'desktop', settleMs: 800 }, { type: 'click', text: '^Plan a skip$', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-pause', 'Pause my plan — pick a start day', {
  description: 'The pause modal: explains the one free pause, lets the customer pause now or pick a future day, and shows the tentative end date.',
  conditions: 'Monthly plan, pause unused.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button[aria-label="Pause plan"]', vp: 'desktop', settleMs: 800 }, { type: 'click', text: '^Pause$', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-resume', 'Resume plan — confirmation', {
  description: 'On a paused plan the same action resumes; the sheet confirms the resume timing (today before 2 PM, tomorrow after).',
  conditions: 'status Paused.', url: '/dashboard?preview=1&verified=1&sub=paused&far=1', kind: 'sheet', clock: aeAt('10:00'), rev: 2,
  actions: [{ type: 'click', selector: 'button[aria-label="Resume plan"]', vp: 'desktop', settleMs: 800 }, { type: 'click', text: '^Resume plan$', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-cancel-planned-pause', 'Cancel a planned pause', {
  description: 'With a pause scheduled, the action offers to cancel it: "Keep it planned" vs cancel.',
  conditions: 'planned_pause_start set.', url: '/dashboard?preview=1&verified=1&sub=planned-pause&far=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button[aria-label*="Pause"]', vp: 'desktop', settleMs: 800 }, { type: 'click', text: 'Pause scheduled|Cancel', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-benchmark', 'Savings benchmark — set your dinner spend', {
  description: 'The one-time slider asking what a typical takeout dinner costs, which powers the savings tile and greeting.',
  conditions: 'Benchmark unset; CTA tapped.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet',
  actions: [{ type: 'click', text: 'Set your dinner spend', vp: 'desktop', settleMs: 800 }, { type: 'click', text: 'Add your usual dinner spend', vp: 'mobile', settleMs: 800 }],
})
add('home-dialog-renew-details', 'Renew banner expanded (details)', {
  description: 'The renew banner\'s chevron reveals the renewal explanation and start-date rule.', conditions: 'Renew banner visible.',
  url: '/dashboard?preview=1&verified=1', kind: 'page', actions: [{ type: 'click', selector: 'button[aria-label="Show renewal details"]', settleMs: 600 }],
})
SS('4.4 · Mobile-only sheets')
add('home-sheet-dish-delivered', 'Delivered day — dish sheet (mobile)', {
  description: 'Tapping a delivered (orange) pill on the mobile progress card opens the dish that was served that day.',
  conditions: 'Mobile, delivered pill tapped.', url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet', viewports: ['mobile'],
  actions: [{ type: 'click', selector: 'button[aria-label^="delivered "]', settleMs: 800 }],
})
add('home-sheet-cell-skipped', 'Skipped day — cell info sheet (mobile)', {
  description: 'Tapping a hatched skipped pill explains the skip and the moved end date.', conditions: 'Mobile, skipped pill tapped.',
  url: '/dashboard?preview=1&verified=1&sub=noskips&far=1', kind: 'sheet', viewports: ['mobile'],
  actions: [{ type: 'click', selector: 'button[aria-label^="skipped "]', settleMs: 800 }],
})
add('home-sheet-cell-paused', 'Paused day — info sheet (mobile)', {
  description: 'Tapping a paused pill explains that no meal was delivered that day (a multi-day pause collapses into one range pill with the days-paused summary).', conditions: 'Mobile, paused pill tapped.',
  url: '/dashboard?preview=1&verified=1&sub=pause-used&far=1', kind: 'sheet', viewports: ['mobile'], rev: 3, clock: aeAt('15:30'),
  actions: [{ type: 'click', selector: 'button[aria-label^="paused "]', settleMs: 800 }],
})
add('home-sheet-upcoming-skip', 'Upcoming day tapped — skip that day (mobile)', {
  description: 'Tapping an upcoming pill offers to skip that specific day.', conditions: 'Mobile, upcoming pill tapped, skips left.',
  url: '/dashboard?preview=1&verified=1&far=1', kind: 'sheet', viewports: ['mobile'],
  actions: [{ type: 'click', selector: 'button[aria-label^="upcoming "]', settleMs: 800 }],
})
add('home-mobile-wrap-tile', 'Monthly wrap tile (mobile, open)', {
  description: 'The rewarded wrap nudge at the bottom of the mobile home.', conditions: 'eligible.', url: '/dashboard?preview=1&verified=1&far=1&wrap=open', kind: 'page', viewports: ['mobile'],
  actions: [{ type: 'scrollIntoView', text: 'Rate your' }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('5 · My Plan')
SS('5.1 · Plan states')
const planState = (st, title, description, conditions, extra = '') => add(`plan-${st}`, title, { description, conditions, url: `/dashboard/plan?preview=1&state=${st}${extra}`, kind: 'page' })
planState('active', 'Active — mid-cycle', 'The current-plan hero (navy) with dates, meals left, the metric strip, then "Your setup" (preference, cadence, allergens, spice) and past plans.', 'Active sub, 8 of 24 delivered.')
planState('renew', 'Ending in 3 days — renew prompt', 'The hero carries the renew call to action and the days-left countdown.', 'end_date +3d.')
planState('scheduled', 'Scheduled — starts in 5 days', 'A plan that has not started: "Beginning <date>" hero with the Change start date action.', 'status Scheduled.')
planState('paused', 'Paused', 'Paused hero with the pause date and a pointer to the dashboard to resume.', 'status Paused.')
planState('planned-pause', 'Pause planned for a future day', 'The hero notes the upcoming pause and offers to cancel it.', 'planned_pause_start +4d.')
planState('queued', 'Active with a queued next plan', 'Below the current plan, the queued Monthly Max callout with its start date and Change date action.', 'Scheduled sub in allSubscriptions.')
planState('paused-queued', 'Paused with a queued next plan', 'Paused primary plan; the queued plan\'s start becomes tentative.', 'Paused + Scheduled.')
planState('empty', 'No plan (empty state)', 'No active plan: the NoPlanView callout inside the plan page ("Welcome. Pick your plan.") and setup card.', 'activeSubscription null.')
planState('waitlist', 'Seasonal pause — save-your-spot', 'Intake paused: mobile shows the waitlist card in flow above "Your setup"; desktop frosts the surface and floats the card.', 'intake.paused, not joined.')
planState('waitlist-joined', 'Seasonal pause — spot saved', 'The navy "Your spot is saved" pass on the plan page.', 'intake.paused, joined.')
planState('season', 'Season ending — last delivery day set', 'An operator scheduled the seasonal pause: the season-ending banner and taper copy on the current plan.', 'lastDeliveryDay +18d, active sub.')
add('plan-credit-row', 'Active with credit to spend (credit pointer row)', {
  description: 'With approved credit the plan page adds the slim credit row pointing at My credit with the amount sentence.',
  conditions: 'creditRows AED 100 monthly + AED 50 universal.', url: '/dashboard/plan?preview=1&state=active&credit=1', kind: 'page',
})
add('plan-mix', 'Religious mix setup (veg days dial)', {
  description: '"Your setup" for a religious-mix customer shows the veg-days count and days.', conditions: 'Religious Preference, veg_days Mon+Wed.',
  url: '/dashboard/plan?preview=1&state=active&pref=mix', kind: 'page',
})
add('plan-empty-gated', 'No plan — profile incomplete', {
  description: 'Empty plan page for an unverified customer: the CTA is inert and explains the gate.', conditions: 'empty + WhatsApp unverified.',
  url: '/dashboard/plan?preview=1&state=empty&unverified=1', kind: 'page',
})
SS('5.2 · Plan dialogs')
add('plan-dialog-change-start', 'Change start date (scheduled plan)', {
  description: 'The date-change dialog for a plan that has not started: a start-date picker limited to allowed days, one change allowed.',
  conditions: 'Scheduled sub, date not yet changed.', url: '/dashboard/plan?preview=1&state=scheduled', kind: 'sheet',
  actions: [{ type: 'click', text: '^Change start date$', settleMs: 800 }],
})
add('plan-dialog-change-start-queued', 'Change start date (queued plan)', {
  description: 'Same modal from the queued-plan callout.', conditions: 'Queued sub.', url: '/dashboard/plan?preview=1&state=queued', kind: 'sheet',
  actions: [{ type: 'click', text: 'Change start date|Change date', settleMs: 800 }],
})
add('plan-dialog-cancel-pause', 'Cancel planned pause (plan page)', {
  description: 'Cancelling the scheduled pause from the plan page.', conditions: 'planned_pause_start set.', url: '/dashboard/plan?preview=1&state=planned-pause', kind: 'sheet',
  actions: [{ type: 'click', text: '^Cancel$', settleMs: 800 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('6 · Explore Plans & Checkout')
SS('6.1 · Plan grid')
const explore = (id, title, q, description, conditions, actions) => add(`explore-${id}`, title, { description, conditions, url: `/dashboard/explore-plans?preview=1${q}`, kind: actions ? 'sheet' : 'page', actions })
explore('default', 'Explore plans — no plan yet (Non-Veg, 6 days)', '&state=empty', 'The pricing grid: Trial, Weekly Flex, Monthly Premium (Most popular) and Monthly Max with per-meal prices, plus the checkout panel awaiting a selection.', 'No active plan, verified profile.')
explore('active', 'Explore with a live plan (renew framing)', '&state=active', 'A customer already on a plan sees the grid framed as renewal: the current plan is marked and the next start is the day after it ends.', 'Active sub.')
explore('paused', 'Explore while paused — browse-only notice', '&state=paused', 'A paused plan adds a notice above the grid (desktop links to Resume).', 'status Paused.')
explore('cancelled', 'Checkout cancelled banner', '&state=empty&checkout_canceled=true', 'Back from a Stripe cancel: the dismissible banner (desktop tree only).', '?checkout_canceled=true.')
explore('veg', 'Vegetarian pricing', '&state=empty&pref=veg', 'Veg prices across the four plans.', 'meal_preference_type Veg.')
explore('mix-unset', 'Religious mix — veg-day picker (opens at 2 days)', '&state=empty&pref=mix', 'Religious-mix customers choose how many veg days a week; the picker opens on the two days already on the account (Mon + Wed) and the cards price from that split.', 'Religious Preference, veg_days Mon+Wed.')
explore('5days', '5-day cadence', '&state=empty&week=5', 'Mon–Fri prices and meal counts.', 'week_type 5DAYS.')
explore('gate', 'Profile gate overlay', '&state=empty&unverified=1', 'Incomplete profile: the frosted "Finish your profile to unlock plans" card over the grid.', 'WhatsApp unverified.')
explore('outofzone', 'Out of zone — purchase blocked', '&state=empty&zone=0', 'The grid stays browsable but checkout is disabled with the out-of-zone explanation.', 'out_of_zone true.')
explore('waitlist', 'Seasonal pause — offer', '&state=waitlist', 'Intake paused: mobile shelf with the offer card above the resting priced stack; desktop glass over the grid with the card on it.', 'intake paused, not joined.')
explore('waitlist-joined', 'Seasonal pause — spot saved', '&state=waitlist-joined', 'The joined pass over/above the grid.', 'intake paused, joined.')
explore('season', 'Season ending — taper (active plan)', '&state=season', 'A scheduled pause with an active plan: every plan is "done for this term" and the season banner explains the last delivery day.', 'lastDeliveryDay +18d, active sub.')
explore('season-open', 'Season ending — taper (no plan, partial availability)', '&state=season-open', 'Without a plan the shorter plans remain available and the date picker is clamped to the season end.', 'lastDeliveryDay +18d, no sub.')
SS('6.2 · Checkout')
add('checkout-trial', 'Trial selected — checkout', {
  description: 'Selecting the Trial: desktop checkout panel with start date, week type and price; mobile bottom sheet step 1.',
  conditions: 'Trial selected.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan")', settleMs: 900 }],
})
add('checkout-weekly', 'Weekly Flex selected — checkout', {
  description: 'Weekly Flex checkout with the 6 vs 5 day choice and skip allowance.', conditions: 'Weekly Flex selected.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=1', settleMs: 900 }],
})
add('checkout-premium', 'Monthly Premium selected — checkout', {
  description: 'The most popular plan in checkout: 24 meals, pause + 3 skips, start date.', conditions: 'Monthly Premium selected.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }],
})
add('checkout-max', 'Monthly Max selected — checkout', {
  description: 'Monthly Max (48 meals) in checkout.', conditions: 'Monthly Max selected.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=3', settleMs: 900 }],
})
add('checkout-credit', 'Checkout with credit applied (+ locked credit note)', {
  description: 'Approved credit is applied automatically; a plan-restricted credit that does not apply to the selected plan is explained by the locked-credit note.',
  conditions: 'creditByPlan split: AED 50 universal + AED 100 monthly-only; Weekly Flex selected.', url: '/dashboard/explore-plans?preview=1&state=empty&credit=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=1', settleMs: 900 }],
})
add('checkout-credit-monthly', 'Checkout with credit applied — Monthly Premium (all credit applies)', {
  description: 'On a monthly plan the full AED 150 applies and the receipt-style total appears.', conditions: 'credit=1, Monthly Premium.', url: '/dashboard/explore-plans?preview=1&state=empty&credit=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }],
})
add('checkout-date-picker', 'Start date picker open', {
  description: 'The start-date calendar with disabled days and the earliest start: a popover on desktop (DateField), inline inside the checkout sheet on mobile (MobileDatePicker).',
  conditions: 'Monthly Premium selected, date field tapped.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }, { type: 'click', selector: 'button[aria-label^="Pick your start date"], button[aria-label^="Start date:"]', vp: 'desktop', js: true, timeout: 20000, settleMs: 900 }],
})
// Raise the count instead of re-picking the default 2 — :has-text is a substring
// match over 5 buttons, and clicking "2" changed nothing.
add('checkout-mix-count', 'Religious mix — veg-day count raised to 4 (weighted prices)', {
  description: 'Raising the count to 4 veg days re-blends every card: the monthly price drops from AED 504 to AED 456 and the savings line follows.', conditions: 'Religious Preference, count 4.', url: '/dashboard/explore-plans?preview=1&state=empty&pref=mix', kind: 'page',
  actions: [{ type: 'click', selector: 'button:text-is("4")', settleMs: 1200 }],
})
add('checkout-mix-days', 'Religious mix checkout — pick which days are veg', {
  description: 'The veg-day picker inside checkout, pre-filled from saved preferences.', conditions: 'Religious mix, Monthly Premium selected.', url: '/dashboard/explore-plans?preview=1&state=empty&pref=mix', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("2") >> nth=0', settleMs: 700 }, { type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }],
})
add('checkout-mobile-review', 'Mobile checkout — step 2 review & pay', {
  description: 'The mobile receipt step: meals, preference, schedule, start, deliver-to, plan price, total due today and Pay.',
  conditions: 'Mobile, "Review & pay" tapped.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'sheet', viewports: ['mobile'],
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }, { type: 'click', text: 'Review & pay', settleMs: 900 }],
})
add('checkout-outofzone', 'Checkout blocked — out of zone', {
  description: 'The disabled Pay/Continue with the out-of-zone explanation.', conditions: 'out_of_zone, plan selected.', url: '/dashboard/explore-plans?preview=1&state=empty&zone=0', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 900 }],
})
add('checkout-post-cutoff', 'Post-cutoff overlay — "First meal lands tomorrow" (desktop)', {
  description: 'Selecting a plan after 2 PM Dubai time surfaces a once-per-day overlay explaining the first delivery is tomorrow.',
  conditions: 'Desktop, AE clock ≥ 14:00, plan selected.', url: '/dashboard/explore-plans?preview=1&state=empty', kind: 'overlay', viewports: ['desktop'], clock: aeAt('15:00'),
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan") >> nth=2', settleMs: 1200 }],
})
add('checkout-season-open-date', 'Season taper — clamped date picker', {
  description: 'With the season ending, later start dates are closed off in the picker and explained.', conditions: 'season-open, Weekly Flex selected.',
  url: '/dashboard/explore-plans?preview=1&state=season-open', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Choose plan")', settleMs: 900 }, { type: 'click', selector: 'button[aria-label^="Pick your start date"], button[aria-label^="Start date:"]', vp: 'desktop', js: true, timeout: 20000, settleMs: 900 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('7 · My Menu')
SS('7.1 · Week views')
const menu = (st, title, description, conditions, extra = '', o = {}) => add(`menu-${st.replace(/[^a-z0-9]/g, '-')}`, title, { description, conditions, url: `/dashboard/menu?preview=1&state=${st}${extra}`, kind: 'page', ...o })
menu('nosub', 'No active plan', 'The menu for a customer without a plan: today\'s spotlight reads "No active plan"; the week grid is browsable.', 'activeSubscription null.')
menu('active', 'Active plan — this week and next', 'Today\'s spotlight with the live countdown and macros; this week\'s six cards (delivered / today / upcoming) and next week\'s preview strip.', 'Active sub.')
menu('skipped', 'Skips in the week (past, today, future)', 'Yesterday skipped, tonight "Not tonight", and a future skip scheduled — each with the moon chip.', 'skipped_dates yesterday/today/+2, status Skipped.')
menu('paused', 'Plan paused', 'Every remaining day reads "Paused"; the spotlight says no delivery today.', 'status Paused.')
menu('planned-pause', 'Pause begins in two days', 'The pause-start day is marked "Pause begins", later days "Paused".', 'planned_pause_start +2d.')
menu('plan-ends', 'Plan ends — days beyond are locked', 'Days after the end date go grey with a lock and "Renew to unlock"; tapping routes to Explore.', 'end_date +2d, no queued renewal.')
menu('plan-ends', 'Plan ends — queued renewal covers the days', 'With a queued plan the same days stay normal "Upcoming".', 'end_date +2d, hasQueuedRenewal.', '&queued=1', { id: 'menu-plan-ends-queued' })
menu('scheduled', 'Plan starts soon', 'A scheduled plan: spotlight reads "Plan starts soon".', 'status Scheduled.')
menu('resumed', 'Resumed after the cutoff — no delivery tonight', 'Resuming after 2 PM: the spotlight becomes the "No delivery tonight" card with the next delivery.', 'resume_cutoff_date today.')
menu('active', 'Sunday — rest day', 'Sunday spotlight: "Sunday — no delivery".', 'Sunday.', '', { id: 'menu-sunday', clock: aeAt('12:00', SUNDAY) })
// The countdown span carries suppressHydrationWarning, so React keeps the SERVER's
// text unless the client's own value CHANGES after mount — a static fake clock can
// never move it. Land at 19:52 and jump 15 min so the re-render crosses 20:00.
// The jump stays under IdleRefreshToast's 30-min threshold, or "You've been away"
// covers a card.
menu('active', 'Delivered today (evening)', 'After 8 PM the countdown reads "Delivered today".', '20:07 AE (clock lands at 19:52, then jumps 15 min so the countdown re-renders).', '', { id: 'menu-delivered', clock: aeAt('19:52'), actions: [{ type: 'clockForward', ms: 900000, settleMs: 1200 }] })
menu('active', 'Vegetarian menu', 'Veg dishes across the week with green spines.', 'Veg preference.', '&pref=veg', { id: 'menu-veg' })
menu('active', 'Religious mix (Mon/Wed veg)', 'Mixed week: veg on Monday and Wednesday, non-veg elsewhere; MIX tag in the header.', 'Religious Preference.', '&pref=mix', { id: 'menu-mix' })
menu('active', '5-day plan — Saturday off', 'Saturday renders as an off day.', 'week_type 5DAYS.', '&week=5', { id: 'menu-5days' })
SS('7.2 · Dish detail')
add('menu-dish-detail', 'Dish detail (modal / sheet)', {
  description: 'Tapping a day opens the dish: photo, calories, protein, veg tag, spice level and description.',
  conditions: 'Any non-off day tapped.', url: '/dashboard/menu?preview=1&state=active', kind: 'sheet',
  actions: [{ type: 'click', selector: '.week-day-card[data-state="today"]', vp: 'desktop', settleMs: 900 }, { type: 'click', selector: 'button[aria-label^="Tonight:"]', vp: 'mobile', settleMs: 900 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('8 · My Credit & Plan History')
add('credit-items', 'My credit — credit available', {
  description: 'The two-futures hero ("AED 50 on any plan" / "AED 150 on a Monthly plan"), the Available ledger with eligibility tags and the Used ledger.',
  conditions: 'Approved + applied credit rows.', url: '/dashboard/credit?preview=1', kind: 'page',
})
add('credit-empty', 'My credit — nothing yet', { description: 'The empty statement: "No credit right now" and how credit is earned.', conditions: 'No credit rows.', url: '/dashboard/credit?preview=1&empty=1', kind: 'page' })
add('history-list', 'Plan history — finished plans', { description: 'Every completed plan with delivered/skipped/completion.', conditions: 'Ended subscriptions.', url: '/dashboard/history?preview=1', kind: 'page' })
add('history-empty', 'Plan history — empty', { description: '"No past plans yet."', conditions: 'No ended subscriptions.', url: '/dashboard/history?preview=1&empty=1', kind: 'page' })

// ─────────────────────────────────────────────────────────────────────────────
S('9 · Help & Support')
add('support-landing', 'Help & Support — landing (42 dinners)', {
  description: 'Desktop: header, the three contact cards (Account info, Ask Doro, WhatsApp) and the FAQ. Mobile: the assistant spotlight, WhatsApp line, your details and a flat FAQ.',
  conditions: 'totalDelivered ≥ 5.', url: '/dashboard/support?preview=1', kind: 'page',
})
add('support-landing-fresh', 'Help & Support — new customer copy', { description: 'Under five dinners the header reads "Real humans, real food, real support."', conditions: 'totalDelivered < 5.', url: '/dashboard/support?preview=1&fresh=1', kind: 'page', viewports: ['desktop'] })
add('support-faq-open', 'FAQ items expanded', {
  description: 'Two FAQ rows opened.', conditions: 'Rows tapped.', url: '/dashboard/support?preview=1', kind: 'page',
  actions: [{ type: 'click', text: 'When is my meal delivered', settleMs: 300 }, { type: 'click', text: 'How does pausing work', settleMs: 500 }],
})
const openChat = [{ type: 'click', text: 'Start chatting', vp: 'desktop', settleMs: 900 }, { type: 'click', text: 'Dormers Assistant', vp: 'mobile', settleMs: 900 }]
add('support-chat-welcome', 'Doro chat — welcome and starters', {
  description: 'The assistant dialog (centered on desktop, bottom sheet on mobile) with the greeting and four starter prompts.', conditions: 'Chat opened.',
  url: '/dashboard/support?preview=1', kind: 'sheet', actions: openChat,
})
add('support-chat-typing', 'Doro chat — thinking', {
  description: 'After sending, the user bubble and the animated "thinking…" loader.', conditions: 'Message sent, reply pending.',
  url: '/dashboard/support?preview=1', kind: 'sheet', mocks: [{ url: '**/api/support-chat', hang: true }],
  actions: [...openChat, { type: 'click', text: 'How do skips work', settleMs: 1200 }],
})
add('support-chat-reply', 'Doro chat — reply with action buttons', {
  description: 'An assistant reply rendered with bold markdown plus the "Go to my plan" and WhatsApp escalation buttons the model can attach.', conditions: 'Reply received with [MANAGE_PLAN] and [WHATSAPP_ESCALATION] flags.',
  url: '/dashboard/support?preview=1', kind: 'sheet',
  mocks: [chatReply('Skips are simple: **Weekly Flex** includes 1 skip and **Monthly** plans include 3 per cycle. Tap *Skip tonight* before 2 PM Dubai time and your end date moves out by a day — you never lose the meal. [MANAGE_PLAN] [WHATSAPP_ESCALATION]')],
  actions: [...openChat, { type: 'click', text: 'How do skips work', settleMs: 2200 }],
})
add('support-chat-error', 'Doro chat — could not reach the assistant', {
  description: 'The error bubble with the WhatsApp fallback when the API fails.', conditions: 'API 500.', url: '/dashboard/support?preview=1', kind: 'sheet',
  mocks: [{ url: '**/api/support-chat', status: 500, body: '{"error":"boom"}' }],
  actions: [...openChat, { type: 'click', text: 'How do skips work', settleMs: 1800 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('10 · Profile & Security')
SS('10.1 · Profile looks')
const prof = (st, title, description, conditions) => add(`profile-${st}`, title, { description, conditions, url: `/dashboard/profile?preview=1&state=${st}`, kind: 'page' })
prof('verified', 'Profile — everything verified, live plan', 'Identity card, Security & verification rows (email verified, password set, WhatsApp verified), account details, meal preferences and past plans.', 'Email + WhatsApp verified, active sub, 3 past plans.')
prof('unverified', 'Profile — email and WhatsApp unverified', 'Both verification rows in their unverified state with "Verify or change" / "Verify now".', 'emailConfirmed false, whatsapp_verified false.')
prof('nowhatsapp', 'Profile — no WhatsApp number', 'WhatsApp row "Not set".', 'whatsapp_number null.')
prof('nosub', 'Profile — no live plan', 'Preferences copy switches to "Edit any time before your next checkout."', 'activeSubscription null.')
prof('pending', 'Profile — preferences queued for the next plan', 'The pending-preferences banner lists each queued change (from → to) with Discard.', 'pending_* set with a live sub.')
prof('promoted', 'Profile — new preferences applied', 'After the last plan ended, queued preferences became active: the green applied banner.', 'preferences_promoted_at set, no sub.')
prof('mix', 'Profile — religious mix with veg days', 'The veg-day chips inside meal preferences.', 'Religious Preference, veg_days Mon+Wed.')
prof('noplans', 'Profile — no past plans', 'The past-plans section at zero.', 'endedPlans empty.')
SS('10.2 · Profile dialogs')
add('profile-edit-account', 'Edit details (name + dorm)', {
  description: 'Desktop flips the account card into inputs inline; mobile opens the edit sheet.', conditions: 'Edit tapped.',
  url: '/dashboard/profile?preview=1', kind: 'sheet',
  actions: [{ type: 'click', text: 'Edit details', vp: 'desktop', settleMs: 700 }, { type: 'click', selector: 'button[aria-label="Edit your details"]', vp: 'mobile', settleMs: 800 }, { type: 'scrollIntoView', text: 'SAVE DETAILS', vp: 'desktop', settleMs: 400 }],
})
add('profile-edit-prefs', 'Edit preferences sheet (live plan → save for next)', {
  description: 'Meal type, delivery week, spice, allergens; with a live plan the primary reads "Save for next subscription".', conditions: 'Edit preferences tapped, active sub.',
  url: '/dashboard/profile?preview=1', kind: 'sheet',
  actions: [{ type: 'click', text: 'Edit preferences', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button:has-text("Edit") >> nth=1', vp: 'mobile', settleMs: 800 }],
})
add('profile-edit-prefs-mix', 'Edit preferences — religious mix veg-day picker', {
  description: 'Choosing Religious Preference reveals the per-day veg picker capped at working days minus one.', conditions: 'Religious mix.',
  url: '/dashboard/profile?preview=1&state=mix', kind: 'sheet',
  actions: [{ type: 'click', text: 'Edit preferences', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button:has-text("Edit") >> nth=1', vp: 'mobile', settleMs: 800 }],
})
add('profile-change-email', 'Change email', {
  description: 'The change-email sheet for a confirmed address.', conditions: 'Email verified.', url: '/dashboard/profile?preview=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Change email")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Change email — Email"]', vp: 'mobile', settleMs: 800 }],
})
add('profile-verify-email', 'Verify or change email (unconfirmed)', {
  description: 'For an unverified address the sheet leads with "Resend verification".', conditions: 'emailConfirmed false.', url: '/dashboard/profile?preview=1&state=unverified', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Verify or change")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Verify or change — Email"]', vp: 'mobile', settleMs: 800 }],
})
add('profile-change-password', 'Change password', {
  description: 'Current + new + confirm with the strength checklist.', conditions: 'Password row tapped.', url: '/dashboard/profile?preview=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Change password")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Change password — Password"]', vp: 'mobile', settleMs: 800 }, { type: 'fill', selector: 'input[type="password"] >> nth=1', value: 'Sunshine42' }, { type: 'wait', ms: 400 }],
})
add('profile-whatsapp-verify', 'Verify WhatsApp — enter number', {
  description: 'Step one of WhatsApp verification.', conditions: 'WhatsApp unverified.', url: '/dashboard/profile?preview=1&state=unverified', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Verify now")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Verify now — WhatsApp"]', vp: 'mobile', settleMs: 800 }],
})
add('profile-whatsapp-code', 'Verify WhatsApp — enter the 6-digit code', {
  description: 'Step two after the code is sent: OTP input, resend link, "Use different number".', conditions: 'Code sent.',
  url: '/dashboard/profile?preview=1&state=unverified', kind: 'sheet', mocks: [{ url: '**/api/whatsapp/start', status: 200, body: '{"ok":true}' }],
  actions: [{ type: 'click', selector: 'button:has-text("Verify now")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Verify now — WhatsApp"]', vp: 'mobile', settleMs: 800 }, { type: 'fill', selector: 'input[type="tel"]', value: '+971500000000' }, { type: 'click', text: '^Send code$', settleMs: 1200 }],
})
add('profile-whatsapp-change', 'Change & re-verify WhatsApp', {
  description: 'The same sheet from a verified number.', conditions: 'WhatsApp verified.', url: '/dashboard/profile?preview=1', kind: 'sheet',
  actions: [{ type: 'click', selector: 'button:has-text("Change & re-verify")', vp: 'desktop', settleMs: 800 }, { type: 'click', selector: 'button[aria-label="Change & re-verify — WhatsApp"]', vp: 'mobile', settleMs: 800 }],
})

// ─────────────────────────────────────────────────────────────────────────────
S('11 · Dorm Wars')
SS('11.1 · Hub looks')
const hubSeen = { local: { 'dw-hub:reward-event-seen': 'ev-1' } }   // the fixture's newest non-celebration reward is already seen
const hub = (id, title, q, description, conditions, o = {}) => add(`dormwars-${id}`, title, { description, conditions, url: `/dashboard/dorm-wars?preview=1${q}`, kind: 'page', storage: hubSeen, ...o })
hub('default', 'Hub — eligible (Monthly Premium), 12-day streak', '', 'The full immersive hub: progression chip, wallet, streak chip, the Send a Free Meal hero, This Month / Lifetime Path / Side Quests columns, Happening Now and Your Squad.', 'dormWarsEligible, 2 lifetime recruits, 1 this cycle, weekly review pending.')
// The gate scrim is position:fixed, so a full-page shot dims only the first viewport
// and the hub renders sharp below a hard edge. Capture what the customer sees.
const GATE = { fullPage: false }
hub('gate-none', 'Premium gate — no plan', '&gate=none', 'Ineligible customers see the blurred hub under the Premium perk upsell ("Pick a plan").', 'currentPlanId null.', GATE)
hub('gate-trial', 'Premium gate — Trial', '&gate=trial', 'Trial copy: "upgrade to a Monthly Premium plan to start earning" → "Upgrade my plan".', 'currentPlanId trial.', GATE)
hub('gate-weekly', 'Premium gate — Weekly Flex', '&gate=weekly', 'Weekly Flex copy.', 'currentPlanId weekly-flex.', GATE)
hub('gate-gift', 'Premium gate — Welcome gift', '&gate=gift', 'Welcome-gift (referred friend) copy → "Pick a plan".', 'currentPlanId welcome-gift.', GATE)
hub('streak-0', 'No streak yet', '&streak=0', 'Streak chip at 0d, Side Quests "Visit daily · chest unlocks at day 8".', 'count 0.')
hub('streak-ready', 'Streak chest ready to open', '&streak=ready', 'The gift icon pulses gold; Side Quests row "Tap to open".', 'count 14, lastChestDay 7.')
hub('doubler', '2× doubler active banner', '&streak=doubler', 'The gold "2× rewards active" banner with time remaining.', 'activeDoubler 5d remaining.')
hub('perks', 'Early Access + GOAT badges', '&perks=1&recruits=12', 'Perk badges beside the progression title; GOAT tag in the feed.', 'earlyAccess + hallWall.')
hub('recruits-high', 'High lifetime recruits (tiers unlocked)', '&recruits=25&cycle=4', 'Lifetime path with several tiers earned and cycle milestones cleared.', 'converted 25, cycle 4.')
hub('scouts-all', 'Squad — every scout stage', '&scouts=all', 'Sent, scheduled, delivered, decided, subscribed and "Already here" tiles.', 'invites at every stage.')
hub('scouts-empty', 'Squad — empty', '&scouts=empty', 'No invites yet: only the "Send new" tile.', 'invites [].')
hub('feed-empty', 'Happening Now — quiet', '&feed=empty', '"Quiet across the dorms right now."', 'crossDormRecent [].')
hub('google-pending', 'Google review pending', '&google=pending', 'Side quest row "Pending · in manual review".', 'layer4 google_review pending.')
hub('google-earned', 'Google review earned', '&google=earned', 'Side quest row "Earned".', 'google_review approved.')
hub('weekly-late', 'Weekly reviews — late week', '&weekly=late', 'Side quest with the late catch-up amount.', 'late non-empty.')
hub('weekly-allin', 'Weekly reviews — all four in (locked)', '&weekly=allin', 'Green "Locked" with AED earned and the full progress ring.', 'submitted 4 of 4.')
hub('monthly-open', 'Monthly wrap open', '&monthly=open', '"Tap to wrap" with days left.', 'eligible.')
hub('monthly-late', 'Monthly wrap late', '&monthly=late', 'Gold late row.', 'daysLeftForFullReward 0.')
hub('monthly-done', 'Monthly wrap done', '&monthly=done', 'Green "Done".', 'submitted.')
hub('monthly-expired', 'Monthly wrap window closed', '&monthly=expired', '"Closed".', 'expired.')
SS('11.2 · Celebration banners')
// The banner auto-dismisses after 14 s; under capture load a page can take longer than that to settle, so hold that one timer.
const holdCelebration = 'const __st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => __st(fn, ms === 14000 ? 3600000 : ms, ...a)'
for (const [k, t] of [['referral', 'Friend joined (+AED 30)'], ['milestone', 'Cycle milestone unlocked'], ['tier4', 'Tier 4 — The GOAT'], ['jacket', 'Tier 3 — jacket on its way'], ['anniversary', '1-year anniversary'], ['monthly', 'Monthly wrap complete']]) {
  hub(`celebrate-${k}`, `Celebration — ${t}`, `&celebrate=${k}`, 'A fresh reward since the last visit slides in as a dismissable banner at the top of the hub (auto-dismisses after 14 seconds).', `newest reward source ${k}.`, { initScript: holdCelebration })
}
SS('11.3 · Hub modals')
const hubModal = (id, title, actions, description, conditions, q = '') => add(`dormwars-modal-${id}`, title, { description, conditions, url: `/dashboard/dorm-wars?preview=1${q}`, kind: 'modal', actions, storage: hubSeen })
hubModal('send', 'Send a Free Meal — name your friend', [{ type: 'click', text: 'Send a Free Meal', settleMs: 900 }], 'The invite flow step one: enter the friend\'s name before opening WhatsApp.', 'Hero CTA tapped.')
hubModal('send-sent', 'Send a Free Meal — sent confirmation', [{ type: 'click', text: 'Send a Free Meal', settleMs: 700 }, { type: 'fill', selector: 'input[type="text"]', value: 'Omar' }, { type: 'eval', js: 'window.open = () => null' }, { type: 'press', key: 'Enter', settleMs: 900 }], 'After the WhatsApp hand-off: "Sent" with Track journey.', 'Name entered, link sent.')
hubModal('journey', 'Scout journey (delivered stage)', [{ type: 'click', selector: 'button:has-text("Layla")', settleMs: 900 }], 'A friend\'s journey timeline: sent → scheduled → delivered → decided → subscribed, with a WhatsApp nudge.', 'Scout tile tapped.', '&scouts=all')
hubModal('journey-subscribed', 'Scout journey (subscribed — win)', [{ type: 'click', selector: 'button:has-text("Aisha")', settleMs: 900 }], 'A converted friend: the win state.', 'Converted scout.', '&scouts=all')
hubModal('quests', 'This Month\'s Rewards (cycle milestones)', [{ type: 'click', selector: '.hub-progress-grid span:has-text("Details") >> nth=0', settleMs: 900 }], 'The cycle milestone ladder with reveal-able rewards.', 'This Month column opened.')
hubModal('ladder', 'Lifetime Path', [{ type: 'click', selector: '.hub-progress-grid span:has-text("Details") >> nth=1', settleMs: 900 }], 'The lifetime tiers and perks.', 'Lifetime column opened.')
hubModal('chest', 'Streak Chest — mid-cycle calendar', [{ type: 'click', selector: 'button[aria-label*="streak"]', js: true, settleMs: 900 }], 'The 4-week reward calendar: claimed chests, the next chest and days to go.', 'Streak chip tapped, 12-day streak.')
hubModal('chest-ready', 'Streak Chest — ready to open', [{ type: 'click', selector: 'button[aria-label*="streak"]', js: true, settleMs: 900 }], 'The claim button is live.', 'chestReady.', '&streak=ready')
hubModal('chest-opened', 'Streak Chest — just opened (cash result)', [{ type: 'click', selector: 'button[aria-label*="streak"]', js: true, settleMs: 900 }], 'The result chip for the most recent claim.', 'recentChest streak_day = lastChestDay.', '&chest=opened')
hubModal('squad', 'Your Squad (full list)', [{ type: 'click', selector: '.hub-activity-grid span:has-text("Details")', settleMs: 900 }], 'Every scout with stage and age.', 'Squad column opened.', '&scouts=all')
hubModal('google', 'Google review — upload a screenshot', [{ type: 'click', selector: 'button:has-text("Google review")', settleMs: 900 }], 'The AED 10 Google review side quest: instructions and screenshot upload.', 'Side quest row tapped.')
hubModal('wallet', 'Wallet history', [{ type: 'click', selector: 'button[aria-label^="Wallet"]', settleMs: 900 }], 'Every credit that landed, pending rows flagged, plus the review explainer rows.', 'Wallet chip tapped.')
hubModal('wallet-empty', 'Wallet history — empty', [{ type: 'click', selector: 'button[aria-label^="Wallet"]', settleMs: 900 }], 'No credits yet.', 'recentRewards [].', '&wallet=empty')
hubModal('progression', 'Titles & Progression', [{ type: 'click', selector: 'button[aria-label$="view progression"]', settleMs: 900 }], 'The title ladder with the customer\'s current title highlighted.', 'Progression chip tapped.')
hubModal('weekly-chooser', 'Weekly reviews chooser', [{ type: 'click', selector: 'button:has-text("4 weekly reviews")', settleMs: 900 }], 'Pending and completed weeks for the cycle.', 'Weekly side quest tapped (pending).')
hubModal('monthly-chooser', 'Monthly wrap chooser', [{ type: 'click', selector: 'button:has-text("Monthly wrap")', settleMs: 900 }], 'The wrap entry point with reward and timing.', 'Monthly side quest tapped (open).', '&monthly=open')
hubModal('info-monthly', 'Side quest info — monthly wrap (soon)', [{ type: 'click', selector: 'button:has-text("Monthly wrap")', settleMs: 900 }], 'Tapping a passive row explains the quest.', 'Monthly wrap "Soon".')
hubModal('info-chest', 'Side quest info — streak chest', [{ type: 'click', selector: 'button:has-text("Weekly Streak Reward")', settleMs: 900 }], 'How streak chests work.', 'count 0 row tapped.', '&streak=0')
hubModal('info-weekly', 'Side quest info — weekly reviews (all in)', [{ type: 'click', selector: 'button:has-text("4 weekly reviews")', settleMs: 900 }], 'The locked-in explanation.', 'allin row tapped.', '&weekly=allin')
SS('11.4 · First-visit tour')
const tourStep = (n, title, description) => add(`dormwars-tour-${n}`, title, {
  description, conditions: 'dorm_wars_tour_completed_at null; opens ~600 ms after mount.', url: '/dashboard/dorm-wars?preview=1&tour=1', kind: 'overlay', storage: hubSeen,
  actions: Array.from({ length: n }, () => ({ type: 'click', selector: '[aria-label="Dorm Wars walkthrough"] button:not([aria-label="Skip tour"]) >> nth=-1', settleMs: 700 })),
})
tourStep(0, 'Tour — step 1 (This Month)', 'The spotlight walkthrough opens on "Your current cycle", over the This Month card.')
tourStep(1, 'Tour — step 2 (Lifetime Path)', '"Lifetime rewards" — the Lifetime Path card.')
tourStep(2, 'Tour — step 3 (Streak chest)', '"Weekly streak chest", anchored to the streak pill in the header.')
tourStep(3, 'Tour — step 4 (Side quests)', 'The final spotlight, over the Side Quests card.')
tourStep(4, 'Tour — consent dialog', 'The closing consent dialog (don\'t show again).')

// ─────────────────────────────────────────────────────────────────────────────
S('12 · Weekly review takeover')
const wkDraft = (step, extra = {}) => ({ local: { 'dormers:weekly-review:draft:v1:2': JSON.stringify({ step, rating: 4, favorites: ['1', '3'], misses: ['5'], missReasons: { '5': ['Too spicy'] }, delivery: 'up', packaging: 'down', packagingReasons: ['Spilled'], kitchenNote: 'The biryani was unreal.', ...extra }) } })
// Seeded meal ids drift with the preview week (they were '1','3','5'; the real week
// is 1,2,50,4,6,51), which left step 2 claiming "2 / 3 picked" with one card marked
// and step 3 claiming "1 flagged" with nothing flagged. Seed the step with an EMPTY
// selection and click the grid by position instead — index-stable in any week.
const wkEmpty = (step) => wkDraft(step, { favorites: [], misses: [], missReasons: {} })
const CARD = 'button[style*="aspect-ratio"] >> nth='
add('review-ack', 'All-or-nothing acknowledgement (first review)', {
  description: 'Before the first weekly review of a cycle the customer must acknowledge the rule: all four reviews or the credit is forfeit.',
  conditions: 'priorSubmissions 0, weeksExpected > 1, not yet acknowledged.', url: '/dashboard/menu/review/2?preview=1&first=1', kind: 'takeover',
})
add('review-step1', 'Step 1 — rate the week (stars)', { description: 'Week 2 review opening: five stars with the reactive caption.', conditions: 'Step 1.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkDraft(1, { rating: null }) })
add('review-step1-rated', 'Step 1 — 4 stars picked', { description: 'Caption "Solid week", Continue enabled.', conditions: 'rating 4.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkDraft(1) })
// The takeover is a fixed overlay whose BODY scrolls, so on the 393px tree the grid,
// the counter and CONTINUE all sit below the fold — each mobile capture scrolls to
// the part the page is documenting.
add('review-step2', 'Step 2 — favourites grid', { description: 'Up to three picks from the six delivered dinners; two chosen.', conditions: 'Step 2.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkEmpty(2), actions: [{ type: 'click', selector: CARD + '4', settleMs: 300 }, { type: 'click', selector: CARD + '5', settleMs: 500 }, { type: 'scrollIntoView', text: 'CONTINUE', vp: 'mobile', settleMs: 500 }] })
add('review-step2-skipped', 'Step 2 — with a skipped and a paused meal', { description: 'Non-delivered days stay in the grid greyed and unselectable.', conditions: 'skipped + paused meals.', url: '/dashboard/menu/review/2?preview=1&skipped=1', kind: 'takeover', storage: wkEmpty(2), actions: [{ type: 'click', selector: CARD + '0', settleMs: 300 }, { type: 'click', selector: CARD + '3', settleMs: 500 }, { type: 'scrollIntoView', selector: CARD + '2', vp: 'mobile', settleMs: 500 }] })
add('review-step3', 'Step 3 — misses with reason chips', { description: 'A flagged dinner expands its "what didn\'t land" reasons.', conditions: 'Step 3, one miss.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkEmpty(3), actions: [{ type: 'click', selector: CARD + '4', settleMs: 600 }, { type: 'click', text: 'Too spicy', settleMs: 500 }, { type: 'scrollIntoView', text: 'Too spicy', vp: 'mobile', settleMs: 500 }] })
add('review-step4', 'Step 4 — delivery & packaging thumbs', { description: 'Two thumbs rows; packaging down reveals reason chips.', conditions: 'Step 4.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkDraft(4) })
add('review-step5', 'Step 5 — note for the kitchen', { description: 'Optional free text and Submit.', conditions: 'Step 5.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkDraft(5) })
add('review-late', 'Late review banner (AED 2)', { description: 'Outside the 7-day window the takeover flags the reduced reward.', conditions: 'daysLeftForFullReward 0.', url: '/dashboard/menu/review/2?preview=1&late=1', kind: 'takeover', storage: wkDraft(1) })
const submit = [{ type: 'click', text: '^Submit review$', settleMs: 1500 }]
add('review-thankyou', 'Thank-you — review locked (in progress)', { description: 'Logged: the pending-pool reminder and Back to dashboard.', conditions: 'Submitted, more weeks pending.', url: '/dashboard/menu/review/2?preview=1', kind: 'takeover', storage: wkDraft(5), actions: submit })
add('review-thankyou-chain', 'Thank-you — continue to the next week', { description: 'When another week is pending the primary CTA chains into it.', conditions: 'nextPendingWeek set.', url: '/dashboard/menu/review/2?preview=1&result=chain', kind: 'takeover', storage: wkDraft(5), actions: submit })
add('review-thankyou-locked', 'Thank-you — cycle locked in (lump sum)', { description: 'The last review of the cycle: green check and the AED that landed in the wallet.', conditions: 'lumpSumApprovedAed 20.', url: '/dashboard/menu/review/2?preview=1&result=locked', kind: 'takeover', storage: wkDraft(5), actions: submit })
add('review-thankyou-late', 'Thank-you — late (50%)', { description: 'Late submission thank-you at AED 2.', conditions: 'rewardPct 50.', url: '/dashboard/menu/review/2?preview=1&late=1', kind: 'takeover', storage: wkDraft(5), actions: submit })
add('review-error', 'Submit failed', { description: 'The inline error above Submit.', conditions: 'Server action error.', url: '/dashboard/menu/review/2?preview=1&result=error', kind: 'takeover', storage: wkDraft(5), actions: submit })

// ─────────────────────────────────────────────────────────────────────────────
S('13 · Monthly wrap takeover')
const moDraft = (step, extra = {}, cycleLabel = 'Monthly Premium') => ({ local: { 'dormers:monthly-review:draft:v1': JSON.stringify({ cycleLabel, step, signupTriggers: ['Friend told me'], jobs: ['Saved time'], bestMoment: 'Late study night, dinner just showed up.', frictionMoment: '', alternative: 'Delivery apps', alternativeCostAed: '25-40', renewalIntent: 'probably', recommend: 'yes_specific', recommendText: 'My roommate', ...extra }) } })
add('wrap-open', 'Opening — "your Dormers month"', { description: 'The wrap intro with the reward and Start.', conditions: 'Monthly tier, step 0.', url: '/dashboard/menu/review/monthly?preview=1', kind: 'takeover', storage: moDraft(0) })
add('wrap-open-weekly', 'Opening — weekly plan vocabulary', { description: 'Weekly Flex wraps say "week".', conditions: 'planTier weekly.', url: '/dashboard/menu/review/monthly?preview=1&tier=weekly', kind: 'takeover', storage: moDraft(0, {}, 'Weekly Flex') })
add('wrap-open-late', 'Opening — late wrap', { description: 'Late framing with the reduced reward.', conditions: 'daysLeftForFullReward 0.', url: '/dashboard/menu/review/monthly?preview=1&late=1', kind: 'takeover', storage: moDraft(0) })
for (const [n, t, d] of [[1, 'What got you to try Dormers?', 'Multi-select chips + Other.'], [2, 'What did Dormers do for you?', 'Multi-select chips.'], [3, 'A meal moment that worked', 'Free text.'], [4, 'One that didn\'t land', 'Free text.'], [5, 'Without us — alternative and its cost', 'Single choice + cost bands.'], [6, 'Will you renew?', 'Intent stack with reason.'], [7, 'Would you recommend Dormers?', 'Recommend options + who.']]) {
  add(`wrap-step${n}`, `Question ${n} — ${t}`, { description: d, conditions: `Monthly tier, step ${n}.`, url: '/dashboard/menu/review/monthly?preview=1', kind: 'takeover', storage: moDraft(n) })
}
for (const [n, t] of [[1, 'Before tonight — usual dinners and cost'], [2, 'How was your first Dormers meal?'], [3, 'Want dinner handled for the month?']]) {
  add(`wrap-trial-step${n}`, `Trial wrap — ${t}`, { description: 'The shorter three-question trial wrap.', conditions: `planTier trial, step ${n}.`, url: '/dashboard/menu/review/monthly?preview=1&tier=trial', kind: 'takeover', storage: moDraft(n, {}, 'Trial') })
}
const wrapSubmit = [{ type: 'click', selector: 'button:has-text("See your wrap"), button:has-text("See your meal wrap")', settleMs: 1800 }]
add('wrap-reveal', 'Reveal — your month in numbers', { description: 'Post-submit stats: meals, favourite dish with social proof, top week, AED earned, reviews submitted.', conditions: 'rewardPct 100.', url: '/dashboard/menu/review/monthly?preview=1', kind: 'takeover', storage: moDraft(7), actions: wrapSubmit })
add('wrap-reveal-late', 'Reveal — late (50%)', { description: 'Reveal at the late reward.', conditions: 'rewardPct 50.', url: '/dashboard/menu/review/monthly?preview=1&late=1', kind: 'takeover', storage: moDraft(7), actions: wrapSubmit })
add('wrap-error', 'Submit failed', { description: 'Inline error on the last question.', conditions: 'Server action error.', url: '/dashboard/menu/review/monthly?preview=1&result=error', kind: 'takeover', storage: moDraft(7), actions: wrapSubmit })

// ─────────────────────────────────────────────────────────────────────────────
S('14 · Loading & error states')
SS('14.1 · Route loading skeletons')
for (const [r, t] of [['', 'Home'], ['/plan', 'My Plan'], ['/explore-plans', 'Explore Plans'], ['/menu', 'My Menu'], ['/credit', 'My Credit'], ['/history', 'Plan History'], ['/support', 'Help & Support'], ['/profile', 'Profile'], ['/dorm-wars', 'Dorm Wars']]) {
  add(`loading-${(r || '/home').slice(1)}`, `${t} — loading skeleton`, { description: `What streams in while ${t} is fetching.`, conditions: 'Route suspense.', url: `/dashboard${r}?preview=1&loading=1`, kind: 'page' })
}
SS('14.2 · Error boundaries')
add('error-home-retry', 'Dashboard error — silent retry spinner', { description: 'The first failure retries quietly after 1.5 s with a spinner.', conditions: 'Render error, no retry in the last 30 s.', url: '/dashboard?preview=1&error=1', kind: 'page', clock: 'freeze' })
add('error-home-dialog', 'Dashboard error — dialog', { description: 'If the retry fails too, the error card with Try again and WhatsApp.', conditions: 'Second failure within 30 s.', url: '/dashboard?preview=1&error=1', kind: 'page', storage: { session: errorRetryStamp } })
add('error-dormwars-dialog', 'Dorm Wars error — dialog', { description: 'The hub\'s own boundary, on its dark canvas.', conditions: 'Hub render error.', url: '/dashboard/dorm-wars?preview=1&error=1', kind: 'page', storage: { session: errorRetryStamp } })

writeFileSync(new URL('./manifest.json', import.meta.url), JSON.stringify(M, null, 1))
console.log(`${M.length} entries`)
