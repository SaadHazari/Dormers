'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Heart, ChevronDown, Calendar, Pencil, X } from 'lucide-react'
import { updateProfile, savePendingPreferences, discardPendingPreferences } from '../actions'
import { OG, NV, NV2, CR, BG, BODY, MONO, S as BASE_S, TIER1, TIER2 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { SecuritySection } from './SecuritySection'
import { ALLERGENS, DORMS, PREFERENCES, SPICE_LEVELS, DAYS_OF_WEEK } from '@/app/onboarding/data'
import { effectivePreferences, hasPendingPreferences, preferenceDiff } from '@/lib/preferences'

// Single typeface across the dashboard — DISPLAY aliases BODY (Montserrat).
// Mirrors Menu/Plan: hierarchy comes from scale + weight + colour, not a
// serif/sans pairing. Brings Profile out of the legacy serif cohort.
const DISPLAY = BODY

const S = {
  ...BASE_S,
  fgMuted: 'rgba(9,24,37,0.62)',
  fgSub:   'rgba(9,24,37,0.50)',
}

// Customer canonical type lives in _shared/types.ts; mirrors what
// getCustomer() returns from supabase. Avoids drift across consumer files.
import type { Customer } from '../_shared/types'

function Field({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>{label}</div>
      <div style={{ fontFamily: mono ? MONO : BODY, fontSize: 14, fontWeight: 500, color: value ? NV : S.fgSub }}>{value || '—'}</div>
    </div>
  )
}

// Shared shell for input + select. Everything that isn't appearance-related is
// identical so the two control types render at exactly the same dimensions.
// Selects layer a custom chevron via padding-right + the inline ChevronDown.
const FIELD_HEIGHT = 44
const fieldShell = {
  width: '100%',
  height: FIELD_HEIGHT,
  padding: '0 14px',
  borderRadius: 10,
  border: `1px solid ${S.border2}`,
  background: '#ffffff',
  fontFamily: BODY,
  fontSize: 13,
  fontWeight: 500,
  color: NV,
  outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  boxSizing: 'border-box' as const,
  lineHeight: `${FIELD_HEIGHT - 2}px`, // -2 for the 1px borders
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>
      {children}
    </label>
  )
}

// Wrap select to overlay the chevron. Native <select> appearance is stripped
// via the global stylesheet at the bottom of this component so all browsers
// match the input height + paddings.
function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <ChevronDown
        size={16}
        strokeWidth={2.2}
        aria-hidden
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: S.fgMuted,
        }}
      />
    </div>
  )
}

export default function ProfileClient({
  customer, userEmail, emailConfirmed = false, activeSubscription = null,
}: {
  customer: Customer | null
  userEmail: string
  emailConfirmed?: boolean
  /** Used purely to surface the locked veg-day snapshot for religious-mix
   *  subs. Editing veg_days mid-cycle isn't permitted; the chips are
   *  read-only with a tooltip pointing the user at renewal.
   *  When present, also gates meal-preference editing — those fields are
   *  locked into the active sub and only changeable from the next cycle. */
  activeSubscription?: { week_type?: '5DAYS' | '6DAYS' | null; veg_days?: string[] | null } | null
}) {
  const hasActiveSub = !!activeSubscription
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState<null | 'account' | 'preferences-now' | 'preferences-next' | 'discarded'>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Account-side fields (always editable, but gated behind Edit details) ──
  // The fields stay read-only until the user clicks "Edit details" — keeps
  // the page calm by default and prevents stray-keystroke edits while the
  // user is just glancing at their profile.
  const [editAccount, setEditAccount] = useState(false)
  const [name, setName]               = useState(customer?.name ?? '')
  const [dorm, setDorm]               = useState(customer?.dorm_name ?? '')

  // ── Meal-pref fields (modal-edit only) ──
  // Buffered locally and only persisted when "Save preferences" is clicked,
  // so the snapshot in the read-only card stays in sync with the saved DB
  // state until confirmation. Initial values come from the EFFECTIVE
  // preferences — pending if queued, current otherwise — so a re-open of
  // the modal shows whatever's queued, not the stale current.
  const initialEff = effectivePreferences(customer)
  const [spice, setSpice]       = useState(initialEff.spice_level_preference ?? '')
  const [mealPref, setMealPref] = useState(initialEff.meal_preference_type ?? '')
  const [weekType, setWeekType] = useState<'5DAYS' | '6DAYS'>(
    initialEff.week_type === '5DAYS' ? '5DAYS' : '6DAYS'
  )

  // Allergens stored as comma-separated string in DB; edit as a Set
  const parseAllergens = (s: string | null | undefined): Set<string> =>
    new Set((s ?? '').split(',').map(a => a.trim()).filter(a => (ALLERGENS as readonly string[]).includes(a)))
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(() => parseAllergens(initialEff.allergens))

  const toggleAllergen = (a: string) => {
    setSelectedAllergens(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a); else next.add(a)
      return next
    })
  }

  // Religious-mix veg-day picks. Only consumed when mealPref is religious.
  // Cap = (W-1) where W is the chosen delivery week — picking all-veg
  // defeats "mix" and the customer should switch their pref to plain Veg
  // instead. Same constraint /api/checkout enforces.
  // Seed precedence: pending (queued change wins) → live sub snapshot
  // (kitchen contract for current cycle) → customer canonical preference
  // (post-end memory + standalone profile saves) → empty.
  const initialVegDays =
    customer?.pending_veg_days ?? activeSubscription?.veg_days ?? customer?.veg_days ?? []
  const [vegDays, setVegDays] = useState<string[]>(initialVegDays.slice())
  const isReligiousMode = /religious/i.test(mealPref)
  const W = weekType === '5DAYS' ? 5 : 6
  const workingDays = DAYS_OF_WEEK.slice(0, W)
  const vegDayCap = W - 1
  const toggleVegDay = (day: string) => {
    setVegDays(prev => {
      if (prev.includes(day)) return prev.filter(d => d !== day)
      if (prev.length >= vegDayCap) return prev   // hard cap
      return [...prev, day]
    })
  }
  // When the user flips week_type or away from religious-mix, prune any
  // veg-day picks that no longer fit so the cap-validation passes on save.
  useEffect(() => {
    if (!isReligiousMode) return
    setVegDays(prev => prev.filter(d => workingDays.includes(d)).slice(0, vegDayCap))
    // workingDays / vegDayCap are derived from weekType + isReligiousMode;
    // pruning runs whenever those primary inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekType, isReligiousMode])

  const displayName = customer?.name || userEmail.split('@')[0] || ''
  const parts = displayName.split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  // ── Meal-pref modal state ──
  // Reset buffered values when the modal opens so the user always edits
  // against the latest persisted snapshot (not whatever was lingering
  // from a previous open-cancel cycle). Pulling the customer fields off a
  // ref that updates each render lets the effect depend ONLY on the
  // open/close edge — no clobber of in-progress edits when `customer`
  // re-references during a modal-open session.
  const customerRef = useRef(customer)
  useEffect(() => { customerRef.current = customer })
  const [showPrefsModal, setShowPrefsModal] = useState(false)
  useEffect(() => {
    if (!showPrefsModal) return
    const c = customerRef.current
    const eff = effectivePreferences(c)
    setSpice(eff.spice_level_preference ?? '')
    setMealPref(eff.meal_preference_type ?? '')
    setWeekType(eff.week_type === '5DAYS' ? '5DAYS' : '6DAYS')
    setSelectedAllergens(parseAllergens(eff.allergens))
    setVegDays((c?.pending_veg_days ?? activeSubscription?.veg_days ?? c?.veg_days ?? []).slice())
    setError(null)
    // activeSubscription is stable per render — included so re-opens after
    // a sub change pull in the latest veg_days seed.
  }, [showPrefsModal, activeSubscription])

  // Save the name + dorm fields. Always immediate — these are never
  // snapshotted onto subscriptions, so no pending-flow needed.
  const handleSaveAccount = () => {
    setError(null)
    startTransition(async () => {
      const res = await updateProfile({ name, dorm_name: dorm })
      if (res?.error) {
        setError(res.error)
      } else {
        setSaved('account')
        setEditAccount(false)
        setTimeout(() => setSaved(null), 2500)
      }
    })
  }

  // Save meal preferences via the pending-preferences flow. The action
  // routes the write to pending_* when a live sub exists (so the kitchen
  // ↔ dashboard contract stays intact for the current cycle), or to the
  // canonical fields immediately when no live sub exists.
  const handleSavePreferences = () => {
    setError(null)
    startTransition(async () => {
      const allergens = [...selectedAllergens].join(', ') || 'None'
      const res = await savePendingPreferences({
        meal_preference_type: mealPref,
        week_type: weekType,
        allergens,
        spice_level_preference: spice,
        veg_days: isReligiousMode ? vegDays : undefined,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      setShowPrefsModal(false)
      setSaved(res.applied === 'next' ? 'preferences-next' : 'preferences-now')
      setTimeout(() => setSaved(null), 4000)
    })
  }

  const handleDiscardPending = () => {
    setError(null)
    startTransition(async () => {
      const res = await discardPendingPreferences()
      if ('error' in res) {
        setError(res.error)
        return
      }
      setSaved('discarded')
      setTimeout(() => setSaved(null), 2500)
    })
  }

  // Read-only display values for the Meal Preferences card. Always sourced
  // from the customer's CURRENT canonical row (never from buffered modal
  // state, never from pending) so the card shows "what we cook for you
  // RIGHT NOW". The pending-changes banner above the card is the channel
  // for "what's queued for next time".
  const mealPrefLabel =
    PREFERENCES.find(p => p.value === customer?.meal_preference_type)?.label
    ?? customer?.meal_preference_type
    ?? ''
  const weekTypeLabel = (customer?.week_type === '5DAYS') ? 'Mon–Fri (5 days)' : 'Mon–Sat (6 days)'
  const allergensCsv = (customer?.allergens ?? '').split(',').map(a => a.trim()).filter(Boolean)

  const pendingDiff = preferenceDiff(customer)
  const showsPending = hasPendingPreferences(customer) && pendingDiff.length > 0

  // Post-end auto-promotion banner: when the dashboard layout has drained
  // pending_* into canonical because the last sub ended, show a green
  // "preferences applied" notice in place of the now-stale orange one.
  // Gated on !hasActiveSub so a fresh renewal hides it automatically.
  const showsPromoted = !!customer?.preferences_promoted_at && !hasActiveSub

  // Pretty-print helpers for the pending banner — labels users recognise
  // (PREFERENCES.label) instead of raw db values.
  const prefLabel = (v: string | null) =>
    !v ? '—' : (PREFERENCES.find(p => p.value === v)?.label ?? v)
  const weekLabel = (v: '5DAYS' | '6DAYS' | null) =>
    v === '5DAYS' ? 'Mon–Fri (5 days)' : v === '6DAYS' ? 'Mon–Sat (6 days)' : '—'
  const allergensLabel = (v: string | null) =>
    !v?.trim() ? 'None' : v

  return (
    <div className="profile-root" style={{ padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header — matches Menu/Plan: motion fade-in, single typeface, period accent */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ marginBottom: 32 }}>
          <Eyebrow>My Account</Eyebrow>
          <h1 style={{
            margin: '10px 0 0',
            fontFamily: DISPLAY, fontSize: 'clamp(28px, 4vw, 38px)',
            fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.05, color: NV,
          }}>
            Your profile<span style={{ color: OG }}>.</span>
          </h1>
        </motion.div>

        {/* Avatar + identity card — focal moment kept on the dark NV gradient.
            Reads as a "passport" — the user's main identity card on the page. */}
        <div style={{ padding: 28, borderRadius: 'var(--radius-md)', background: `linear-gradient(180deg, ${NV} 0%, ${NV2} 100%)`, color: CR, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 6px 18px rgba(9,24,37,0.10)' }}>
          <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: '50%', background: `linear-gradient(135deg, #ffaa00, ${OG})`, color: '#fff', fontFamily: BODY, fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(245,127,32,0.45)' }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: BODY, fontSize: 22, fontWeight: 800, color: CR, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{displayName}</div>
            <div style={{ fontFamily: BODY, fontSize: 12, color: 'rgba(237,232,218,0.65)', marginTop: 4 }}>{userEmail}</div>
            {customer?.cid && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,127,32,0.15)', border: '1px solid rgba(245,127,32,0.25)' }}>
                <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,232,218,0.65)' }}>ID</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: OG }}>{customer.cid}</span>
              </div>
            )}
          </div>
        </div>

        {/* Security & verification — credentials live here so users have one
            obvious place to manage email, password, and WhatsApp. Each row
            shows live verification status; actions open dedicated modals. */}
        <SecuritySection
          email={userEmail}
          emailConfirmed={emailConfirmed}
          whatsapp={{
            number: customer?.whatsapp_number ?? null,
            verified: !!customer?.whatsapp_verified,
          }}
        />

        {/* Account details — Customer ID, member-since are read-only context.
              Full name + Dorm building are editable but gated behind the
              "Edit details" toggle so the page reads as calm by default and
              stray clicks can't mutate the row. Email is intentionally NOT
              here — it lives in Security & verification above where the
              change-email flow is anchored. */}
        <div style={{ ...TIER2, padding: 24, borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Eyebrow>Account details</Eyebrow>
            {!editAccount && (
              <button
                type="button"
                onClick={() => setEditAccount(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 999,
                  border: `1px solid ${S.border2}`,
                  background: '#ffffff', color: NV,
                  fontFamily: BODY, fontSize: 11.5, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
                className="prefs-edit-btn"
              >
                <Pencil size={12} strokeWidth={2.4} aria-hidden /> Edit details
              </button>
            )}
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="profile-grid-2">
            <Field label="Customer ID"  value={customer?.cid} mono />
            <Field label="Member since" value={customer?.created_at ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : undefined} />
          </div>

          <div style={{ height: 1, background: 'rgba(9,24,37,0.07)', margin: '20px 0' }} />

          {/* Read-only mode by default — flips to the input pair when the
              user taps Edit details above. Save commits, Cancel reverts. */}
          {!editAccount ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="profile-grid-2">
              <Field label="Full name"      value={customer?.name} />
              <Field label="Dorm / building" value={customer?.dorm_name} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <FieldLabel>Full name</FieldLabel>
                <input
                  className="profile-field"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  style={fieldShell}
                />
              </div>

              <div>
                <FieldLabel>Dorm / building</FieldLabel>
                <SelectWrap>
                  <select
                    className="profile-field profile-select"
                    value={dorm}
                    onChange={e => setDorm(e.target.value)}
                    style={{ ...fieldShell, paddingRight: 36, cursor: 'pointer' }}
                  >
                    <option value="">Select…</option>
                    {DORMS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </SelectWrap>
              </div>

              {error && saved !== 'preferences-now' && saved !== 'preferences-next' && (
                <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#b91c1c', fontFamily: BODY, fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setName(customer?.name ?? '')
                    setDorm(customer?.dorm_name ?? '')
                    setEditAccount(false)
                    setError(null)
                  }}
                  disabled={isPending}
                  style={{
                    padding: '12px 22px', borderRadius: 999,
                    border: `1px solid ${S.border2}`, background: '#ffffff', color: NV,
                    fontFamily: BODY, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAccount}
                  disabled={isPending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 28px', borderRadius: 999, border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1, transition: 'background 300ms, opacity 150ms', boxShadow: '0 0 16px rgba(245,127,32,0.4)' }}
                >
                  {isPending ? 'Saving…' : 'Save details'}
                </button>
              </div>
            </div>
          )}

          {saved === 'account' && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(29,138,48,0.08)', border: '1px solid rgba(29,138,48,0.22)', color: '#176626', fontFamily: BODY, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Check size={13} strokeWidth={3} aria-hidden /> Details saved.
            </div>
          )}
        </div>

        {/* Pending preferences banner — only renders when there's an actual
            queued change. Sticky-feeling presence (sits above the Meal
            preferences container) so the customer can always see what's
            queued without opening the modal. Discard reverts; opening the
            modal lets them tweak the queued change in place. */}
        {showsPending && (
          <div style={{
            marginBottom: 20,
            padding: '14px 18px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, rgba(255,170,0,0.12) 0%, rgba(245,127,32,0.10) 100%)',
            border: '1.5px solid rgba(245,127,32,0.40)',
            boxShadow: '0 4px 14px rgba(245,127,32,0.10)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                background: '#FFAA00', color: '#3a2200',
                fontFamily: BODY, fontSize: 10, fontWeight: 800,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                boxShadow: '0 0 0 3px rgba(255,170,0,0.20)',
              }}>
                <Calendar size={11} strokeWidth={2.6} aria-hidden /> From next plan
              </span>
              <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: '#a35100' }}>
                You&rsquo;ve queued these for your next subscription. Today&rsquo;s plan keeps cooking as before.
              </span>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 4px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: BODY, fontSize: 13, color: NV, lineHeight: 1.55 }}>
              {pendingDiff.map(d => {
                let from: string
                let to: string
                if (d.key === 'meal_preference_type') {
                  from = prefLabel(d.from); to = prefLabel(d.to)
                } else if (d.key === 'week_type') {
                  from = weekLabel(d.from); to = weekLabel(d.to)
                } else if (d.key === 'allergens') {
                  from = allergensLabel(d.from); to = allergensLabel(d.to)
                } else if (d.key === 'veg_days') {
                  from = '—'; to = d.to.join(', ')
                } else {
                  from = d.from ?? '—'; to = d.to
                }
                return (
                  <li key={d.key} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: BODY, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a35100', minWidth: 110 }}>
                      {d.label}
                    </span>
                    <span style={{ color: S.fgMuted, textDecoration: 'line-through', textDecorationColor: 'rgba(9,24,37,0.40)' }}>
                      {from}
                    </span>
                    <span style={{ color: 'rgba(9,24,37,0.50)' }}>→</span>
                    <strong style={{ color: NV, fontWeight: 700 }}>{to}</strong>
                  </li>
                )
              })}
            </ul>
            <div>
              <button
                type="button"
                onClick={handleDiscardPending}
                disabled={isPending}
                style={{
                  fontFamily: BODY, fontSize: 11.5, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: 'transparent', border: 'none',
                  color: '#a35100',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  padding: '4px 0',
                  textDecoration: 'underline',
                  textDecorationColor: 'rgba(245,127,32,0.40)',
                  textUnderlineOffset: 3,
                }}
              >
                Discard these changes
              </button>
            </div>
          </div>
        )}

        {/* Post-end "preferences applied" banner — replaces the orange
            "queued for next sub" banner once the layout's auto-promotion
            has drained pending_* into canonical. Stays visible until the
            customer starts a new sub (then hasActiveSub flips and the
            banner naturally hides). */}
        {showsPromoted && (
          <div style={{
            marginBottom: 20,
            padding: '14px 18px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, rgba(29,138,48,0.10) 0%, rgba(29,138,48,0.06) 100%)',
            border: '1.5px solid rgba(29,138,48,0.32)',
            boxShadow: '0 4px 14px rgba(29,138,48,0.08)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 999,
              background: '#1d8a30', color: '#fff', flexShrink: 0,
              boxShadow: '0 0 0 3px rgba(29,138,48,0.18)',
            }}>
              <Check size={14} strokeWidth={3} aria-hidden />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{
                fontFamily: BODY, fontSize: 10.5, fontWeight: 800,
                letterSpacing: '0.16em', textTransform: 'uppercase',
                color: '#176626',
              }}>
                New meal preferences applied
              </span>
              <span style={{ fontFamily: BODY, fontSize: 12.5, fontWeight: 600, color: '#176626' }}>
                Your queued changes are now your active preferences. They&rsquo;ll power your next plan&rsquo;s deliveries.
              </span>
            </div>
          </div>
        )}

        {/* Meal preferences — read-only snapshot of what we cook for the
              CURRENT subscription. Edits go through the modal; if a live
              sub exists they're queued for the next one and surfaced via
              the pending banner above. The card itself never blocks or
              greys out — just opens the modal. */}
        <div style={{ ...TIER1, padding: 24, borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(245,127,32,0.20)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Eyebrow color="#a35100">Meal preferences</Eyebrow>
              <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.5, maxWidth: 460 }}>
                {hasActiveSub
                  ? 'These power your live deliveries. Update any field — changes apply from your next subscription.'
                  : 'These power your next plan’s deliveries. Edit any time before checkout.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPrefsModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 999,
                border: '1px solid rgba(245,127,32,0.40)',
                background: OG, color: '#fff',
                fontFamily: BODY, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 120ms, border-color 120ms',
                boxShadow: '0 4px 12px rgba(245,127,32,0.32)',
              }}
              className="prefs-edit-btn"
            >
              <Pencil size={12} strokeWidth={2.4} aria-hidden /> Edit preferences
            </button>
          </div>

          <div style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 18,
            padding: 18,
            borderRadius: 12,
            background: 'rgba(9,24,37,0.03)',
            border: `1px solid ${S.border}`,
          }}>
            <Field label="Meal type"     value={mealPrefLabel} />
            <Field label="Delivery week" value={weekTypeLabel} />
            <Field label="Spice level"   value={customer?.spice_level_preference} />
            <Field
              label="Allergens"
              value={allergensCsv.length > 0 ? allergensCsv.join(', ') : 'None'}
            />
            {/* Religious-mix only — show this cycle's veg days inline so
                the customer never has to leave Profile to remember them.
                Source precedence: live sub snapshot (kitchen contract for
                current cycle) → customer.veg_days (canonical preference,
                used when no live sub OR for pre-checkout users). Renders
                as 3-letter abbreviation chips in the same green palette
                as the MealTag.Veg pill below. */}
            {(() => {
              const displayVegDays = activeSubscription?.veg_days ?? customer?.veg_days ?? null
              if (!displayVegDays || displayVegDays.length === 0) return null
              // No gridColumn span — sits as a normal cell so it lands at
              // col 2, row 2 (right of Allergens, under Delivery week).
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgMuted }}>
                    Religious-mix veg days
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {displayVegDays.map(d => (
                      <span
                        key={d}
                        style={{
                          fontFamily: BODY, fontSize: 11, fontWeight: 700,
                          letterSpacing: '0.14em', textTransform: 'uppercase',
                          padding: '4px 10px', borderRadius: 'var(--radius-pill)',
                          background: 'rgba(29,138,48,0.12)',
                          color: '#1d8a30',
                          border: '1px solid rgba(29,138,48,0.22)',
                        }}
                      >
                        {d.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          {saved === 'preferences-now' && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(29,138,48,0.08)', border: '1px solid rgba(29,138,48,0.22)',
              color: '#176626', fontFamily: BODY, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Check size={13} strokeWidth={3} aria-hidden /> Preferences saved.
            </div>
          )}
          {saved === 'preferences-next' && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,170,0,0.10)', border: '1px solid rgba(255,170,0,0.30)',
              color: '#a35100', fontFamily: BODY, fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Check size={13} strokeWidth={3} aria-hidden /> Saved for your next subscription. See the queued changes above.
            </div>
          )}
          {saved === 'discarded' && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(9,24,37,0.04)', border: '1px solid rgba(9,24,37,0.10)',
              color: S.fgMuted, fontFamily: BODY, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              Pending changes discarded.
            </div>
          )}
        </div>

        {/* ── Edit Preferences modal — gates ALL meal-pref edits behind a
              confirm step so a mid-cycle change can't silently flip the
              kitchen's plate decisions. The warning at the top makes it
              explicit: changes don't touch the live sub, only the next one. */}
        <AnimatePresence>
          {showPrefsModal && (
            <motion.div
              key="prefs-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => !isPending && setShowPrefsModal(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(9,24,37,0.65)',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24, overflow: 'auto',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: BG,
                  borderRadius: 'var(--radius-md)',
                  padding: 28,
                  maxWidth: 520, width: '100%',
                  border: '1px solid rgba(245,127,32,0.20)',
                  boxShadow: 'var(--shadow-lg)',
                  position: 'relative',
                  maxHeight: 'calc(100vh - 48px)',
                  overflow: 'auto',
                }}
              >
                <button
                  onClick={() => !isPending && setShowPrefsModal(false)}
                  aria-label="Close"
                  style={{
                    position: 'absolute', top: 14, right: 14,
                    background: 'none', border: 'none',
                    color: S.fgMuted, cursor: 'pointer',
                    width: 28, height: 28, borderRadius: 6,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={16} strokeWidth={2.4} />
                </button>

                <div style={{ fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: OG, lineHeight: 1 }}>
                  Edit preferences
                </div>
                <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 22, fontWeight: 800, color: NV, lineHeight: 1.18, letterSpacing: '-0.01em', paddingRight: 28 }}>
                  Update what we cook for you.
                </div>
                {/* Friendly forward-looking note — not a lockout wall.
                    Tells the user the change is for the NEXT plan so they
                    can save it confidently. We surface the diff in the
                    pending banner outside the modal once saved. */}
                {hasActiveSub && (
                  <p style={{
                    margin: '12px 0 0 0',
                    fontFamily: BODY, fontSize: 13, color: S.fgMuted, lineHeight: 1.55,
                  }}>
                    Your live plan keeps cooking with its current preferences. Anything you change here applies <strong style={{ color: NV }}>from your next subscription</strong>.
                  </p>
                )}

                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <FieldLabel>Meal preference</FieldLabel>
                    <SelectWrap>
                      <select
                        className="profile-field profile-select"
                        value={mealPref}
                        onChange={e => setMealPref(e.target.value)}
                        style={{ ...fieldShell, paddingRight: 36, cursor: 'pointer' }}
                      >
                        <option value="">Select…</option>
                        {PREFERENCES.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </SelectWrap>
                  </div>

                  <div>
                    <FieldLabel>Delivery week</FieldLabel>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { value: '6DAYS' as const, label: 'Mon–Sat (6 days)' },
                        { value: '5DAYS' as const, label: 'Mon–Fri (5 days)' },
                      ].map(opt => {
                        const active = weekType === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setWeekType(opt.value)}
                            style={{
                              flex: '1 1 200px',
                              padding: '12px 16px',
                              borderRadius: 10,
                              cursor: 'pointer',
                              fontFamily: BODY, fontSize: 13, fontWeight: 600,
                              border: `1px solid ${active ? 'rgba(245,127,32,0.40)' : S.border2}`,
                              background: active ? 'rgba(245,127,32,0.10)' : '#ffffff',
                              color: active ? '#a35100' : NV,
                              transition: 'background 120ms, border-color 120ms, color 120ms',
                              textAlign: 'left',
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Religious-mix only — veg-day picker. Sits right after
                      Delivery week (it's tied to the same week_type
                      constraint) and ABOVE Allergens so the foundational
                      religious-mix decision is finalised before the user
                      moves on to allergen selection. Cap = W-1 (picking
                      all-veg defeats "mix"; switch to plain Veg instead). */}
                  {isReligiousMode && (
                    <div>
                      <FieldLabel>Religious-mix veg days</FieldLabel>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${workingDays.length}, minmax(0, 1fr))`, gap: 6 }}>
                          {workingDays.map(day => {
                            const active = vegDays.includes(day)
                            const atCap = !active && vegDays.length >= vegDayCap
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleVegDay(day)}
                                disabled={atCap}
                                style={{
                                  padding: '10px 0', borderRadius: 8,
                                  border: `1px solid ${active ? 'rgba(58,111,140,0.55)' : 'rgba(9,24,37,0.10)'}`,
                                  background: active ? 'rgba(58,111,140,0.16)' : (atCap ? 'rgba(9,24,37,0.03)' : '#ffffff'),
                                  color: active ? '#3a6f8c' : (atCap ? 'rgba(9,24,37,0.40)' : NV),
                                  fontFamily: BODY, fontSize: 12, fontWeight: 700,
                                  letterSpacing: '0.04em', textTransform: 'uppercase',
                                  cursor: atCap ? 'not-allowed' : 'pointer',
                                  transition: 'background 120ms, border-color 120ms, color 120ms',
                                }}
                              >
                                {day.slice(0, 3)}
                              </button>
                            )
                          })}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: BODY, fontSize: 11.5, color: S.fgMuted, lineHeight: 1.45 }}>
                          <span>{vegDays.length} of up to {vegDayCap} chosen.</span>
                          <span style={{ color: vegDays.length === 0 ? '#9a2828' : '#176626', fontWeight: 700 }}>
                            {vegDays.length === 0 ? 'Pick at least 1' : `${W - vegDays.length} day${W - vegDays.length === 1 ? '' : 's'} non-veg`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <FieldLabel>Allergens</FieldLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {ALLERGENS.map(a => {
                        const active = selectedAllergens.has(a)
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() => toggleAllergen(a)}
                            style={{
                              padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
                              fontFamily: BODY, fontSize: 12, fontWeight: 600,
                              border: `1px solid ${active ? 'rgba(245,127,32,0.40)' : S.border2}`,
                              background: active ? 'rgba(245,127,32,0.10)' : '#ffffff',
                              color: active ? '#a35100' : NV,
                              transition: 'background 120ms, border-color 120ms, color 120ms',
                            }}
                          >
                            {a}
                          </button>
                        )
                      })}
                    </div>
                    {selectedAllergens.size === 0 && (
                      <div style={{ marginTop: 8, fontFamily: BODY, fontSize: 11, color: S.fgSub }}>None selected — tap any allergen above to flag it.</div>
                    )}
                  </div>

                  <div>
                    <FieldLabel>Spice level</FieldLabel>
                    <SelectWrap>
                      <select
                        className="profile-field profile-select"
                        value={spice}
                        onChange={e => setSpice(e.target.value)}
                        style={{ ...fieldShell, paddingRight: 36, cursor: 'pointer' }}
                      >
                        <option value="">Select…</option>
                        {SPICE_LEVELS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </SelectWrap>
                  </div>

                  {error && (
                    <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#9a2828', fontFamily: BODY, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
                      {error}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button
                      onClick={() => setShowPrefsModal(false)}
                      disabled={isPending}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(9,24,37,0.15)', background: '#ffffff', color: NV, fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', opacity: isPending ? 0.6 : 1 }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePreferences}
                      disabled={isPending}
                      style={{ flex: 1, padding: '12px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', letterSpacing: '0.04em', boxShadow: '0 0 16px rgba(245,127,32,0.45)', opacity: isPending ? 0.7 : 1 }}
                    >
                      {isPending ? 'Saving…' : (hasActiveSub ? 'Save for next subscription' : 'Save preferences')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Religious-mix veg days now live INSIDE the Meal Preferences card
            above (read-only display) and inside the Edit Preferences modal
            (editable). The standalone LockedVegDays component used to sit
            here; it was removed because two places to read the same fact
            was redundant and broke the "preferences live in one card" mental
            model. */}

        <div style={{ textAlign: 'center', padding: '16px 0', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgSub }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
          </span>
        </div>
      </div>

      <style jsx global>{`
        /* Strip native browser appearance from selects so they render at the
           exact same height + padding as inputs. The chevron is added via the
           SelectWrap component instead. */
        .profile-field.profile-select {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }
        /* Hover + focus rings — matches across input + select for visual unity */
        .profile-field:hover:not(:disabled):not(:focus) {
          border-color: rgba(9,24,37,0.25) !important;
        }
        .profile-field:focus {
          border-color: rgba(245,127,32,0.55) !important;
          box-shadow: 0 0 0 3px rgba(245,127,32,0.14) !important;
        }
        .profile-field::placeholder {
          color: rgba(9,24,37,0.35);
        }
        @media (max-width: 640px) {
          .profile-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
