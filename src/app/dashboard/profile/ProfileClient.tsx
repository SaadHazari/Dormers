'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Check, Heart } from 'lucide-react'
import { updateProfile } from '../actions'
import { Eyebrow } from '../_shared/Eyebrow'

const ALLERGENS = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy']
const DORMS = ['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other']

const OG  = '#f57f20'
const NV  = '#091825'
const NV2 = '#1e3a4f'
const CR  = '#ede8da'
const BG  = 'linear-gradient(160deg, #f5f0e8 0%, #ede8da 60%, #e4dfd6 100%)'
const DISPLAY = 'var(--font-lora), Georgia, "Times New Roman", serif'
const BODY    = 'var(--font-montserrat), Arial, Helvetica, sans-serif'
const MONO    = 'var(--font-jetbrains), ui-monospace, monospace'

const S = {
  surface2: 'rgba(255,255,255,0.60)',
  border:   'rgba(9,24,37,0.09)',
  border2:  'rgba(9,24,37,0.15)',
  fgMuted:  'rgba(9,24,37,0.52)',
  fgSub:    'rgba(9,24,37,0.50)',
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
    new Set((s ?? '').split(',').map(a => a.trim()).filter(a => ALLERGENS.includes(a)))
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

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: `1px solid ${S.border2}`, background: 'rgba(255,255,255,0.7)',
    fontFamily: BODY, fontSize: 13, fontWeight: 500, color: NV,
    outline: 'none', transition: 'border-color 150ms',
    boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: 'clamp(20px, 3vw, 40px)', fontFamily: BODY, color: NV }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} style={{ marginBottom: 32 }}>
          <Eyebrow>My Account</Eyebrow>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10, lineHeight: 1.05, color: NV }}>
            Your profile<span style={{ color: OG }}>.</span>
          </div>
        </motion.div>

        {/* Avatar + identity card */}
        <div style={{ padding: 28, borderRadius: 20, background: `linear-gradient(180deg, ${NV} 0%, ${NV2} 100%)`, color: CR, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, flexShrink: 0, borderRadius: '50%', background: `linear-gradient(135deg, #ffaa00, ${OG})`, color: '#fff', fontFamily: DISPLAY, fontSize: 22, fontWeight: 800, fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(245,127,32,0.45)' }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: CR, lineHeight: 1.1 }}>{displayName}</div>
            <div style={{ fontFamily: BODY, fontSize: 12, color: 'rgba(237,232,218,0.65)', marginTop: 4 }}>{userEmail}</div>
            {customer?.cid && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, background: 'rgba(245,127,32,0.15)', border: '1px solid rgba(245,127,32,0.25)' }}>
                <span style={{ fontFamily: BODY, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,232,218,0.65)' }}>ID</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: OG }}>{customer.cid}</span>
              </div>
            )}
          </div>
        </div>

        {/* Read-only info */}
        <div style={{ padding: 24, borderRadius: 16, background: S.surface2, border: `1px solid ${S.border}`, marginBottom: 20 }}>
          <Eyebrow>Account info</Eyebrow>
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Field label="Email"       value={userEmail} />
            <Field label="Customer ID" value={customer?.cid} mono />
            <Field label="Member since" value={customer?.created_at ? new Date(customer.created_at).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' }) : undefined} />
            <Field label="Dorm"        value={customer?.dorm_name} />
          </div>
        </div>

        {/* Editable fields */}
        <div style={{ padding: 24, borderRadius: 16, background: S.surface2, border: `1px solid ${S.border}`, marginBottom: 20 }}>
          <Eyebrow>Edit details</Eyebrow>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>Full name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>WhatsApp</label>
                <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+971 50 000 0000" style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>Dorm / building</label>
                <select value={dorm} onChange={e => setDorm(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select…</option>
                  {DORMS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>Meal preference</label>
                <select value={mealPref} onChange={e => setMealPref(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select…</option>
                  <option value="Carnivore">Non-Veg</option>
                  <option value="Plant-Based">Vegetarian</option>
                  <option value="Religious Preference">Religious Preference</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 8 }}>Allergens</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALLERGENS.map(a => {
                  const active = selectedAllergens.has(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggleAllergen(a)}
                      style={{
                        padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                        fontFamily: BODY, fontSize: 12, fontWeight: 600,
                        border: `1px solid ${active ? 'rgba(245,127,32,0.40)' : S.border2}`,
                        background: active ? 'rgba(245,127,32,0.10)' : 'rgba(255,255,255,0.7)',
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
                <div style={{ marginTop: 6, fontFamily: BODY, fontSize: 11, color: S.fgSub }}>None selected — tap any allergen above to flag it.</div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: BODY, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgMuted, marginBottom: 6 }}>Spice level</label>
              <select value={spice} onChange={e => setSpice(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Select…</option>
                <option value="Mild">Mild</option>
                <option value="Medium">Medium</option>
                <option value="Spicy">Spicy</option>
                <option value="Extra Spicy">Extra Spicy</option>
              </select>
            </div>

            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)', color: '#b91c1c', fontFamily: BODY, fontSize: 13 }}>
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
        .profile-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) {
          .profile-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
