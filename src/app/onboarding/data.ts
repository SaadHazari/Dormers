// ─── static data ─────────────────────────────────────────────────────────────

// `value` strings stay as-is so existing customer rows + downstream
// string-matches (e.g. .includes('plant') / .includes('religious')) keep working.
// Only the user-visible `label` changes.
export const PREFERENCES = [
    { value: 'Carnivore',            emoji: '🥩', label: 'Non-Vegetarian',       desc: 'Chicken, mutton & more every day' },
    { value: 'Plant-Based',          emoji: '🥗', label: 'Veg',                  desc: 'Fully vegetarian, every meal' },
    { value: 'Religious Preference', emoji: '☪️', label: 'Religious Preference', desc: 'Halal — choose your veg days below' },
]

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const ALLERGENS = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy']

export const SPICE_LEVELS = [
    { value: 'Mild',       emoji: '🌱', label: 'Mild',       desc: 'Easy on the spice' },
    { value: 'Medium',     emoji: '🌶️', label: 'Medium',     desc: 'A little kick' },
    { value: 'Hot',        emoji: '🔥', label: 'Hot',        desc: 'Bring the heat' },
    { value: 'Extra Hot',  emoji: '💀', label: 'Extra Hot',  desc: 'Absolutely no mercy' },
]

export const DORMS = ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other']

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

// Steps: 1=Preference, 1.5=VegDays(religious only), 2=Allergens, 3=Spice,
//        4=Dorm, 5=University, 6=Contact+OTP, 7=Credentials+OTP→/dashboard.
//        Step 7's EmailStep handles verification inline and routes to the
//        dashboard on success — no dedicated 'confirm' step needed.
export type Step = 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 7

export interface FormState {
    preference: string
    vegDays: string[]
    allergens: string[]
    spiceLevel: string
    dorm: string
    customDorm: string
    university: string
    customUniversity: string
    name: string
    phone: string
    phoneVerified: boolean
    email: string
    password: string
}

// ─── animation variants ──────────────────────────────────────────────────────

export const stepVariants = {
    enter:  (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 380, damping: 34 } },
    exit:   (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0, transition: { duration: 0.14 } }),
}
