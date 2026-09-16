/**
 * The audiences, in the words a person uses for them.
 *
 * The keys are the broadcast_audience cases in SQL and must not drift from
 * them; the labels are what someone deciding who eats tonight would call these
 * groups. "ended_not_renewed" is not a thing anyone says — "Lapsed" is.
 */

export type AudienceKey =
    | 'everyone' | 'customers' | 'never_customers' | 'imported'
    | 'active_plans' | 'waitlist_all' | 'early_signup' | 'ended_not_renewed'
    | 'early_access' | 'dorm'

export interface AudienceDef {
    key: AudienceKey
    label: string
    hint: string
    /** The whole book, or a slice of the people who have dealt with you. */
    group: 'book' | 'people'
}

export const AUDIENCES: AudienceDef[] = [
    { key: 'everyone',          label: 'Everyone',              hint: 'The whole contact book',            group: 'book' },
    { key: 'imported',          label: 'From Zoho',             hint: 'Your two-year list',                group: 'book' },
    { key: 'never_customers',   label: 'Never signed up',       hint: 'Forms, referrals, old orders',      group: 'book' },
    { key: 'customers',         label: 'Has an account',        hint: 'Signed up on the site',             group: 'book' },

    { key: 'active_plans',      label: 'On a plan now',         hint: 'Active, paused or starting',        group: 'people' },
    { key: 'waitlist_all',      label: 'Waitlist',              hint: 'Holding a spot, nothing running',   group: 'people' },
    { key: 'early_signup',      label: 'Early signups',         hint: 'Made an account, never bought',     group: 'people' },
    { key: 'ended_not_renewed', label: 'Lapsed',                hint: 'Had a plan, didn’t come back',      group: 'people' },
    { key: 'early_access',      label: 'Asked to hear first',   hint: 'This pause’s early-access list',    group: 'people' },
    { key: 'dorm',              label: 'One dorm',              hint: 'Everyone in a single building',     group: 'people' },
]

export const AUDIENCE_LABELS: Record<string, string> = {
    ...Object.fromEntries(AUDIENCES.map(a => [a.key, a.label])),
    reopen: 'Reopening list',
}
