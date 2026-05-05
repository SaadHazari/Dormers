'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Check, Heart, ChevronDown } from 'lucide-react'
import { updateProfile } from '../actions'
import { OG, NV, NV2, CR, BODY, MONO, S as BASE_S, TIER1, TIER2 } from '../_shared/tokens'
import { Eyebrow } from '../_shared/Eyebrow'
import { ALLERGENS, DORMS, PREFERENCES, SPICE_LEVELS } from '@/app/onboarding/data'

// Single typeface across the dashboard — DISPLAY aliases BODY (Montserrat).
// Mirrors Menu/Plan: hierarchy comes from scale + weight + colour, not a
// serif/sans pairing. Brings Profile out of the legacy serif cohort.
const DISPLAY = BODY

const S = {
  ...BASE_S,
  fgMuted: 'rgba(9,24,37,0.62)',
  fgSub:   'rgba(9,24,37,0.50)',
}

interface Customer {
  id: string; cid?: string | null; name?: string | null; email?: string | null
  whatsapp_number?: string | null; dorm_name?: string | null; meal_preference_type?: string | null
  allergens?: string | null; spice_level_preference?: string | null; created_at: string
}

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

export default function ProfileClient({ customer, userEmail }: { customer: Customer | null; userEmail: string }) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName]         = useState(customer?.name ?? '')
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp_number ?? '')
  const [dorm, setDorm]         = useState(customer?.dorm_name ?? '')
  const [spice, setSpice]       = useState(customer?.spice_level_preference ?? '')
  const [mealPref, setMealPref] = useState(customer?.meal_preference_type ?? '')

  // Allergens stored as comma-separated string in DB; edit as a Set
  const parseAllergens = (s: string | null | undefined): Set<string> =>
    new Set((s ?? '').split(',').map(a => a.trim()).filter(a => (ALLERGENS as readonly string[]).includes(a)))
  const [selectedAllergens, setSelectedAllergens] = useState<Set<string>>(() => parseAllergens(customer?.allergens))

  const toggleAllergen = (a: string) => {
    setSelectedAllergens(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a); else next.add(a)
      return next
    })
  }

  const displayName = customer?.name || userEmail.split('@')[0] || ''
  const parts = displayName.split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const allergens = [...selectedAllergens].join(', ')
      const res = await updateProfile({ name, whatsapp_number: whatsapp, dorm_name: dorm, allergens, spice_level_preference: spice, meal_preference_type: mealPref })
      if (res?.error) {
        setError(res.error)
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    })
  }

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

        {/* Read-only info — TIER2 surface (matches Support's secondary cards
            and keeps Profile in the same surface family as the rest of the
            main-app cohort). */}
        <div style={{ ...TIER2, padding: 24, borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          <Eyebrow>Account info</Eyebrow>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="profile-grid-2">
            <Field label="Email"       value={userEmail} />
            <Field label="Customer ID" value={customer?.cid} mono />
            <Field label="Member since" value={customer?.created_at ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : undefined} />
            <Field label="Dorm"        value={customer?.dorm_name} />
          </div>
        </div>

        {/* Editable fields — TIER1 + accent border to call the eye to the
            interactive panel; everything below the avatar that the user can
            actually change lives here. */}
        <div style={{ ...TIER1, padding: 24, borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(245,127,32,0.20)', marginBottom: 20 }}>
          <Eyebrow color="#a35100">Edit details</Eyebrow>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
                <FieldLabel>WhatsApp</FieldLabel>
                <input
                  className="profile-field"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  placeholder="+971 50 000 0000"
                  style={fieldShell}
                />
              </div>
            </div>

            <div className="profile-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
            </div>

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
                  {/* Source from onboarding's SPICE_LEVELS so option values
                      stay in lockstep with what onboarding writes — fixes a
                      mismatch where Profile had 'Spicy / Extra Spicy' while
                      onboarding stored 'Hot / Extra Hot'. */}
                  {SPICE_LEVELS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </SelectWrap>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#b91c1c', fontFamily: BODY, fontSize: 13 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={isPending}
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 28px', borderRadius: 999, border: 'none', background: saved ? '#1d8a30' : OG, color: '#fff', fontFamily: BODY, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1, transition: 'background 300ms, opacity 150ms', boxShadow: saved ? '0 0 16px rgba(29,138,48,0.4)' : '0 0 16px rgba(245,127,32,0.4)' }}
            >
              {saved ? <><Check size={14} strokeWidth={3} aria-hidden /> Saved!</> : isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

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
