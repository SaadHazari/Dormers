// ─── static data ─────────────────────────────────────────────────────────────

// Canonical `value` strings persist to customers.meal_preference_type and
// flow through Stripe metadata → orders.meal_preference. Downstream detectors
// match on .includes('veg') / .includes('religious') (case-insensitive).
//
// Onboarding intentionally uses warm chat-style emojis here — the dark navy
// onboarding cards are the only surface in the app where they belong. The
// dashboard uses Lucide line-icons exclusively for an editorial / interface
// feel; never re-introduce emojis there.
export const PREFERENCES = [
    { value: 'Non Veg', emoji: '🍗', label: 'Non-Vegetarian', desc: 'Chicken, mutton & more every day' },
    { value: 'Veg', emoji: '🥗', label: 'Veg', desc: 'Fully vegetarian, every meal' },
    { value: 'Religious Preference', emoji: '☪️', label: 'Religious Preference', desc: 'Mix Veg & Non Veg meals' },
]

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const ALLERGENS = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy']

export const SPICE_LEVELS = [
    { value: 'Mild', emoji: '🌱', label: 'Mild', desc: 'Easy on the spice' },
    { value: 'Medium', emoji: '🌶️', label: 'Medium', desc: 'A little kick' },
    { value: 'Hot', emoji: '🔥', label: 'Hot', desc: 'Bring the heat' },
    { value: 'Extra Hot', emoji: '💀', label: 'Extra Hot', desc: 'Absolutely no mercy' },
]

// Dorm list is now DB-backed via dorm_locations table.
// Server components fetch via getDormLocations() and pass as props.
// This static fallback exists only for backwards compatibility during hydration.
export const DORMS_FALLBACK = ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other']

export const WEEK_TYPES = [
    { value: '6DAYS' as const, emoji: '📅', label: 'Mon–Sat (6 days)', desc: 'One day off (Sundays). The standard cadence.' },
    { value: '5DAYS' as const, emoji: '🗓️', label: 'Mon–Fri (5 days)', desc: 'Weekends off. Lower price, fewer meals.' },
]

export const UNIVERSITIES = [
    'American University in Dubai',
    'Murdoch University Dubai',
    'Middlesex University Dubai',
    'Heriot-Watt University Dubai',
    'British University in Dubai',
    'Manipal University Dubai',
    'SP Jain School of Global Management',
    'University of Dubai',
    'Amity University Dubai',
    'Other',
]

export const DRAFT_KEY = 'dormers_onboarding_draft_v1'

// ─── types ────────────────────────────────────────────────────────────────────

// Steps: 1=Preference, 1.25=WeekType, 1.5=VegDays(religious only), 2=Allergens,
//        3=Spice, 4=Dorm, 5=University, 6=Contact+OTP,
//        7=Credentials+OTP→/dashboard. Step 7's EmailStep handles verification
//        inline and routes to the dashboard on success — no dedicated 'confirm'
//        step needed.
//
// WeekType sits at 1.25 (BEFORE 1.5 VegDays) because the religious-mix veg
// day picker caps its options at W-1 (5 for 6DAYS, 4 for 5DAYS). Placing
// WeekType later would force a retroactive validation when the user picks
// 5DAYS after already choosing 5 veg days.
export type Step = 1 | 1.25 | 1.5 | 2 | 3 | 4 | 5 | 6 | 7

export interface FormState {
    preference: string
    vegDays: string[]
    allergens: string[]
    spiceLevel: string
    dorm: string
    customDorm: string
    university: string
    customUniversity: string
    weekType: '' | '5DAYS' | '6DAYS'
    name: string
    phone: string
    phoneVerified: boolean
    /**
     * Release It! L8 (Phase 6): set only after a WhatsApp OTP send FAILED, when
     * the user opts to continue via email. The server re-confirms a real send
     * failure before honouring it and marks the phone unverified.
     */
    emailFallback: boolean
    email: string
    password: string
}

// ─── animation variants ──────────────────────────────────────────────────────

export const stepVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 34 } },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.14 } }),
}
