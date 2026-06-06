'use client'

import { type CSSProperties, type ReactNode } from 'react'
import { Heart, Pencil } from 'lucide-react'
import { MobileColumn, CARD, HERO, OG, BODY, S } from './kit'
import { MONO, TIER_POP_TEXT } from '../_shared/tokens'
import { SecuritySection } from '../profile/SecuritySection'

/**
 * MobileProfile — the height-optimised <768 profile surface.
 *
 * Presentational only; ProfileClient owns all state/handlers and repacks them
 * here (same contract as before — wiring unchanged). The job of this surface is
 * REASSURANCE: "the kitchen has my facts right, and my account is secure." So
 * the design leads with identity + verification STATUS, and keeps every edit
 * affordance quiet — editing is a rare, secondary task, never the loud element.
 *
 * Three blocks, deliberately varied in weight (not a wall of equal cards):
 *   1. Membership card  — the dark spotlight; holds who/where (name, ID, since,
 *      dorm). Reads like a real member card. The signature element.
 *   2. Verification     — light card; status badges lead, manage is a quiet row.
 *   3. What we cook      — light card; calm label/value readout, quiet Edit.
 */

export interface MobileProfileData {
  displayName: string
  initials: string
  userEmail: string
  cid: string | null
  email: string
  emailConfirmed: boolean
  whatsappNumber: string | null
  whatsappVerified: boolean
  fullName: string | null
  dormName: string | null
  createdAtLabel: string | null
  mealPrefLabel: string
  weekTypeLabel: string
  spiceLevel: string | null
  allergensDisplay: string
  vegDaysDisplay: string[] | null
  hasActiveSub: boolean
  pendingBanner: ReactNode | null
  promotedBanner: ReactNode | null
  saved: 'account' | 'preferences-now' | 'preferences-next' | 'discarded' | null
}

interface MobileProfileProps extends MobileProfileData {
  onOpenPrefs: () => void
  onEditAccount: () => void
}

// ── Small atoms ──────────────────────────────────────────────────────────────

/** Label/value pair on a LIGHT surface (de-emphasised label, navy value). */
function Fact({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.fgFaint }}>{label}</span>
      <span style={{ fontFamily: mono ? MONO : BODY, fontSize: 14, fontWeight: 600, color: value ? S.fg : S.fgFaint, lineHeight: 1.3, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}

/** Label/value pair on the DARK membership card (cream, never flips). */
function CardFact({ label, value, accent = false }: { label: string; value?: string | null; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: TIER_POP_TEXT.faint }}>{label}</span>
      <span style={{ fontFamily: accent ? MONO : BODY, fontSize: 13, fontWeight: 700, color: accent ? OG : TIER_POP_TEXT.primary, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '—'}</span>
    </div>
  )
}

/** Section header: eyebrow on the left, a quiet Edit affordance on the right. */
function SectionHead({ label, color = S.fgFaint, onEdit }: { label: string; color?: string; onEdit?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>{label}</span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', margin: '-6px -4px', borderRadius: 999, background: 'transparent', border: 'none', color: OG, fontFamily: BODY, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', touchAction: 'manipulation' }}
        >
          <Pencil size={12} strokeWidth={2.4} aria-hidden /> Edit
        </button>
      )}
    </div>
  )
}

function SavedToast({ kind }: { kind: 'account' | 'preferences-now' | 'preferences-next' | 'discarded' }) {
  const map = {
    account:            { fg: 'var(--ds-success-fg)', text: 'Details saved.' },
    'preferences-now':  { fg: 'var(--ds-success-fg)', text: 'Preferences saved.' },
    'preferences-next': { fg: OG,                     text: 'Saved for your next subscription.' },
    discarded:          { fg: S.fgMuted,              text: 'Pending changes discarded.' },
  }[kind]
  return (
    <div style={{ marginTop: 12, fontFamily: BODY, fontSize: 12, fontWeight: 700, color: map.fg, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: map.fg }} /> {map.text}
    </div>
  )
}

// ── Surface ──────────────────────────────────────────────────────────────────

export function MobileProfile({
  displayName, initials, userEmail, cid,
  email, emailConfirmed, whatsappNumber, whatsappVerified,
  dormName, createdAtLabel,
  mealPrefLabel, weekTypeLabel, spiceLevel, allergensDisplay, vegDaysDisplay, hasActiveSub,
  pendingBanner, promotedBanner, saved,
  onOpenPrefs, onEditAccount,
}: MobileProfileProps) {
  const cardStyle: CSSProperties = { ...CARD, padding: 18 }

  return (
    <MobileColumn style={{ color: S.fg, gap: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>

      {/* Header — small eyebrow + title, cleared of the fixed hamburger. */}
      <div style={{ paddingLeft: 56, paddingTop: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: S.fgFaint }}>My account</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', color: S.fg, lineHeight: 1.1 }}>
          Your profile<span style={{ color: OG }}>.</span>
        </h1>
      </div>

      {/* 1 — Membership card: the dark spotlight. Identity + the facts a real
          member card carries (ID, since, dorm). Edit (name/dorm) is a quiet
          cream affordance; it never competes with the data. */}
      <section style={{ ...HERO, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: '50%', background: `linear-gradient(135deg, #ffaa00, ${OG})`, color: '#fff', fontFamily: BODY, fontSize: 19, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(245,127,32,0.40)' }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: TIER_POP_TEXT.primary, letterSpacing: '-0.01em', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: TIER_POP_TEXT.muted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
          </div>
          <button
            type="button"
            onClick={onEditAccount}
            aria-label="Edit your details"
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 999, background: 'rgba(245,240,232,0.08)', border: '1px solid rgba(245,240,232,0.22)', color: TIER_POP_TEXT.primary, fontFamily: BODY, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', touchAction: 'manipulation' }}
          >
            <Pencil size={11} strokeWidth={2.4} aria-hidden /> Edit
          </button>
        </div>

        <div style={{ height: 1, background: 'rgba(245,240,232,0.12)', margin: '16px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <CardFact label="Member ID" value={cid} accent />
          <CardFact label="Member since" value={createdAtLabel} />
          <CardFact label="Dorm" value={dormName} />
        </div>
        {saved === 'account' && (
          <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: '#7ee29a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: '#7ee29a' }} /> Details saved.
          </div>
        )}
      </section>

      {/* 2 — Verification: the same wired SecuritySection (rows + their three
          sheets), in its mobile/embedded form where status badges lead and the
          manage action is a quiet whole-row tap. */}
      <SecuritySection
        email={email}
        emailConfirmed={emailConfirmed}
        whatsapp={{ number: whatsappNumber, verified: whatsappVerified }}
        embedded
      />

      {/* Queued / applied preference banners sit with the thing they describe. */}
      {pendingBanner}
      {promotedBanner}

      {/* 3 — What we cook for you: a calm readout of current preferences. Edit is
          a quiet header affordance, not a page-dominating button. */}
      <section style={cardStyle}>
        <SectionHead label="What we cook for you" color="#a35100" onEdit={onOpenPrefs} />
        <div style={{ marginTop: 4, fontSize: 12, color: S.fgMuted, lineHeight: 1.45 }}>
          {hasActiveSub ? 'Live deliveries use these. Edits apply from your next plan.' : 'Edit any time before your next checkout.'}
        </div>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 16, columnGap: 14 }}>
          <Fact label="Meal type" value={mealPrefLabel} />
          <Fact label="Delivery week" value={weekTypeLabel} />
          <Fact label="Spice level" value={spiceLevel} />
          <Fact label="Allergens" value={allergensDisplay || 'None'} />
          {vegDaysDisplay && vegDaysDisplay.length > 0 && (
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.fgFaint }}>Veg days</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {vegDaysDisplay.map(d => (
                  <span key={d} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, background: 'rgba(29,138,48,0.12)', color: 'var(--ds-success-fg)', border: '1px solid rgba(29,138,48,0.22)' }}>{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        {(saved === 'preferences-now' || saved === 'preferences-next' || saved === 'discarded') && <SavedToast kind={saved} />}
      </section>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '6px 0 2px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: S.fgSub }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Made with <Heart size={11} fill={OG} strokeWidth={0} aria-hidden /> in Dubai
        </span>
      </div>
    </MobileColumn>
  )
}
