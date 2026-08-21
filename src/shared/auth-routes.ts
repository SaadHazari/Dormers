/**
 * Where the marketing site sends people.
 *
 * Every acquisition CTA on the marketing site used to point at `/maintenance`
 * — a dead-end "under maintenance" page from the pre-launch period. Seven
 * separate call sites each hard-coded that string, which is exactly why they
 * could not be un-gated as one decision. They now share these two constants,
 * so opening or closing the funnel is a one-line change in one file.
 *
 * The split matters for conversion: a button that says "Get Started" must not
 * land on a Sign In form. `?step=signup` opens the signup tab directly (see
 * LoginForm's initialTab), so the acquisition path and the returning-customer
 * path stay distinct even though they share a page.
 *
 * IMPORTANT — these are NOT a purchase gate. Anyone who follows them can
 * complete onboarding and reach checkout. What stops a sale is
 * `intake_settings.paused`, enforced server-side in /api/checkout and
 * free-checkout. If the intent is to collect a waitlist rather than take
 * money, intake must be PAUSED before these links go live.
 */

/** Returning customers. Opens the Sign In tab. */
export const LOGIN_HREF = '/login'

/** New customers. Opens the Sign Up tab, which continues into /onboarding. */
export const SIGNUP_HREF = '/login?step=signup'
