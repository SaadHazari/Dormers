# IMPL — Profile & Security · History & Support (mobile rebuild)

> Concrete build plan for the two remaining work items, in build order. Build against `MOBILE-PATTERNS.md` (the pattern contract) — every value, primitive, and rule there applies. Spec folds: §7.5 (Profile & Security), §7.7 (History), §7.8 (Support).
>
> Both items reuse already-shipped primitives (`MobileSheet`, `CompactMetricStrip`, `MobileColumn`, FaqRow disclosure, `SectionTitle`, `StatusPill`-style badges, the full-width-CTA+inline-caption pattern). Net-new component code is small; the work is repacking desktop state and converting modals to sheets.

**Recommended build order:** (1) **Profile & Security** first — it's the high-trust, heaviest-modal item (4 modal flows + meal-prefs + account-edit → sheets) and proves the security-modal-as-sheet pattern. (2) **History & Support** second — lowest daily-use, near-pure reuse, cheap to finish last (History is zero-state, Support is just disclosure + ContactActionRow).

---

# 1. PROFILE & SECURITY

**Job (spec §7.5):** check/correct the facts the kitchen relies on; fix verification. **Verification-first order.**

## 1.1 Files

CREATE:
- `src/app/dashboard/_mobile/MobileProfile.tsx` — presentational shell (header, identity, security rows, banners, meal-prefs read-only grid, account details, footer). Hosts the **account-edit** and **meal-prefs-edit** sheets (these are simpler buffered forms — keep them inside the mobile tree but driven by Client state passed down).

EDIT:
- `src/app/dashboard/profile/ProfileClient.tsx` — render BOTH trees, add the `<768` CSS toggle, pass repacked props + handlers to `<MobileProfile>`. ProfileClient is ALREADY the stateful container, so most lifting is "pass existing state down" not "create new state."
- `src/app/dashboard/profile/SecuritySection.tsx` — its 3 modals (Email/Password/WhatsApp) are **self-contained** with their own state, fetch, ESC/backdrop close. **Reuse as-is** — but swap each modal's bespoke `ModalShell` for `MobileSheet` (no-op on desktop, bottom sheet on mobile). This is the only real edit here. Do NOT flatten these into static props.

REUSE (no change): `security-actions.ts`, `page.tsx` (already server-fetches all 4 props), `preferences-actions.ts`, `profile-actions.ts`, the `effectivePreferences`/`preferenceDiff`/`hasPendingPreferences` domain helpers (`src/contexts/subscriptions/domain/preferences.ts`).

## 1.2 The `<768` toggle (add to ProfileClient)
```tsx
return (<>
  <div className="profile-desktop"> {/* existing tree */} </div>
  <div className="profile-mobile"><MobileProfile {...mobileProfileProps} /></div>
  <style jsx global>{`
    .profile-mobile { display:none; }
    @media (max-width:768px) {
      .profile-desktop { display:none; }
      .profile-mobile  { display:block; }
      .dash-root { padding:0 !important; }
    }
  `}</style>
</>)
```

## 1.3 Prop shape `MobileProfileData` (mirrors `MobileHomeData` — flat, fully-resolved)
```ts
interface MobileProfileData {
  // identity (derived in Client)
  displayName: string          // customer?.name || userEmail.split('@')[0] || ''
  initials: string             // ((p0?.[0]??'')+(p1?.[0]??'')).toUpperCase() || '?'
  userEmail: string
  cid: string | null
  createdAtLabel: string       // created_at → toLocaleDateString('en-AE',{month:'long',year:'numeric'})
  dormName: string | null
  // meal prefs read-only (ALWAYS from canonical customer, never pending)
  mealPrefLabel: string; weekTypeLabel: string; spiceLabel: string | null
  allergensCsv: string         // '' → render 'None'
  vegDaysDisplay: string[] | null   // 3-letter slices, gated on religious + non-empty veg_days
  hasActiveSub: boolean
  // banners
  showsPending: boolean
  pendingDiff: { label:string; from:string; to:string }[]   // pre-formatted from/to strings
  showsPromoted: boolean
  // security row descriptors (3)
  security: {
    email:    { value:string; status:'verified'|'unverified'; actionLabel:string }
    password: { value:'••••••••' }                          // status hidden
    whatsapp: { value:string; status:'verified'|'unverified'|'unset'; actionLabel:string }
  }
  // transient flags (flow down from Client useTransition + saved/error)
  isPending: boolean
  saved: 'account'|'preferences-now'|'preferences-next'|'discarded'|null
  error: string | null
}
// callbacks
onEditAccount, onSaveAccount(name,dorm), onCancelAccount,
onOpenPrefsModal, onSavePreferences(payload), onDiscardPending,
onOpenSecurityModal('email'|'password'|'whatsapp')
```

## 1.4 State to LIFT into ProfileClient (already mostly there)
- **`isPending` (`useTransition`)** — drives disabled/opacity on every submit button; pass as a prop. (Already exists in ProfileClient.)
- **`saved` timed banners** — account 2500ms, prefs 4000ms, discarded 2500ms; `setTimeout` stays in Client handlers; mobile only renders current `saved`. (Already exists.)
- **Prefs-modal buffered form** (`spice/mealPref/weekType/selectedAllergens/vegDays` + the open-edge re-seed effect from `effectivePreferences(customerRef.current)` + the veg-day pruning effect; religious mode + `vegDayCap = W-1` derived from `weekType`). **Keep the whole prefs-modal as a container-owned subcomponent** rendered inside `<MobileProfile>` but with all 5 buffers + 2 effects owned by the Client (or kept as a shared subcomponent both trees mount). Do NOT attempt a pure static-props split of this.
- **Server actions** are direct imports — call from Client handlers, never from the presentational layer.

## 1.5 Fold / scan order (spec §7.5) → mobile move + primitive

| # | Desktop element | Mobile move | Primitive / pattern |
|---|---|---|---|
| 1 | Header (eyebrow `My Account` + H1 `Your profile.`) | H1 ~26px, margin 32→16 | `SectionTitle size={24}` + trailing orange `.`; `paddingLeft:56` to clear hamburger |
| 2 | Identity card (64px gradient avatar) | padding 28→18, avatar 48px, keep horizontal | `CARD`; avatar `linear-gradient(135deg, #ffaa00, #f57f20)`, glow `0 0 20px rgba(245,127,32,0.45)`; ID pill MONO/OG |
| 3 | **Security card (PROMOTED above account details)** | padding 24→16 | `CARD`; eyebrow `Security & verification` (color `#3a6f8c`) |
| 4 | SecurityRow ×3 | whole-row trigger, 44px, no hover-only | `RecessedTile`-style row: 36×36 icon tile (radius 10, `--ds-skeleton-base`) + label (10/700/0.18em/uppercase) + value (14/600, `wordBreak:break-all`) + StatusBadge + `{actionLabel} ›`. Divider `height:1; background:var(--ds-border-soft); margin:4px 0` |
| 5 | StatusBadge | right-aligned, keep icon+label | see §1.7 — color+icon pairings |
| 6 | Pending banner | tighten; Discard 44px | BannerStack pending variant (§10.4 of patterns) |
| 7 | Promoted banner | keep, reduce padding | BannerStack promoted variant |
| 8 | Meal-prefs header (helper + Edit) | full-width Edit CTA | `primaryRaisedBtn` "Edit preferences"; eyebrow `Meal preferences` (color `#a35100`) |
| 9 | Meal-prefs read-only grid | fixed 2-across | `1fr 1fr` grid (or `CompactMetricStrip`-style band): Meal type / Delivery week / Spice level / Allergens (+ Religious-mix veg days chips when religious) |
| 10 | Account details | demote below; 2-up read-only grid | `CARD`; eyebrow `Account details`; Customer ID (mono) / Member since; `Edit details` opens account-edit sheet |
| 11 | Save toasts | keep inline, no jank | render from `saved` flag |
| 12 | Footer | unchanged | `Made with ♥ in Dubai` (heart filled OG) |

## 1.6 Sheets/modals to convert (exact copy to preserve)

**Account edit** (was inline form, now → `MobileSheet`, bottom-pinned Save):
- Fields: `name` (text, placeholder `Your name`), `dorm` (select from `DORMS = ['The Myriad','KSK Homes','Yugo','DSOA Residence','Study World','Other']`, placeholder option `Select…`).
- Footer: `[Cancel]` / `[Save details]` (saving → `Saving…`). Success line `Details saved.`
- `onSaveAccount` → `updateProfile({ name, dorm_name: dorm })`; success auto-clear 2500ms.

**Meal-prefs edit** (→ `MobileSheet`, sticky footer, week toggle full-width <360):
- Kicker `Edit preferences`, title `Update what we cook for you.`; (hasActiveSub) note `Your live plan keeps cooking with its current preferences. Anything you change here applies from your next subscription.`
- Fields: `Meal preference` (select `PREFERENCES`), `Delivery week` (toggle `6DAYS`/`5DAYS`, full-width <360), `Religious-mix veg days` (chips `DAYS_OF_WEEK.slice(0,W)`, cap `W-1`; caption `{n} of up to {cap} chosen.` + right `Pick at least 1` (red, 0) / `{W-n} day(s) non-veg` (green)), `Allergens` (`ALLERGENS = ['Nuts','Dairy','Gluten','Shellfish','Eggs','Soy']`, empty hint `None selected — tap any allergen above to flag it.`), `Spice level` (select `SPICE_LEVELS`).
- Footer: `[Cancel]` / `[Save for next subscription]` (hasActiveSub) or `[Save preferences]`; saving → `Saving…`.
- `onSavePreferences` → `savePendingPreferences({...})`; success → `saved = res.applied==='next' ? 'preferences-next' : 'preferences-now'`, clear 4000ms. Save messages: `Preferences saved.` / `Saved for your next subscription. See the queued changes above.` / discard → `Pending changes discarded.`

**3 Security flows** (`SecuritySection` — swap `ModalShell` → `MobileSheet`, keep all internal state/copy verbatim):
- **ChangeEmailModal** — title `Change email` / `Verify or change email`. Field `New email address` (`type=email`, placeholder `you@example.com`). Unconfirmed: blue resend block `Resend verification to {email}`. Submit `Send verification` → `requestEmailChange`. Success `Check your inbox at the new address — we sent a verification link. The change takes effect once you confirm it.`
- **ChangePasswordModal** — title `Change password`. 3 `PasswordInput` fields (eye toggle, `autoComplete` current/new/new). Live `DashboardPasswordChecklist` (5 rules: `At least 8 characters`, `One uppercase letter`, `One lowercase letter`, `One number`, `One special character`). Mismatch `Doesn't match the new password yet.` Submit `Update password` → `changePassword`. Reset link `Forgot it? Email me a reset link`. Success `Password updated.`
- **WhatsappVerifyModal** — TWO-STAGE (`enter`/`sent`). Title `Verify WhatsApp` / `Change & verify WhatsApp`. Field 1 `WhatsApp number` (`type=tel`, placeholder `+971 50 000 0000`). Field 2 (sent) `6-digit code` (`inputMode=numeric autoComplete=one-time-code`, MONO, `letterSpacing:0.30em`, centered). Buttons enter `[Cancel]`/`[Send code]`; sent `[Use different number]`/`[Verify]` + `Resend code`. Direct `fetch` to `/api/whatsapp/start|check` + `markWhatsappVerified` + `router.refresh()` after success (`WhatsApp verified.`). On mobile use `inputMode="numeric"` for the code; password sheet body scrolls, button pinned.

## 1.7 StatusBadge color+icon pairings (NEVER color-alone — preserve exactly)
| status | bg | fg | icon (lucide) | label |
|---|---|---|---|---|
| `verified` | `var(--ds-success-wash)` | `var(--ds-success-fg)` (#1d8a30) | `ShieldCheck` | `Verified` |
| `unverified` | `rgba(255,170,0,0.16)` | `#c89417` | `ShieldAlert` | `Unverified` |
| `unset` | `var(--ds-skeleton-base)` | `var(--ds-fg-soft)` | `ShieldAlert` | `Not set` |
| `set` (password) | — | — | — | returns `null` (no badge) |
Pill chrome: `padding:'4px 10px 4px 8px'; radius:999; fontSize:10.5/700; letterSpacing:0.6; uppercase; icon size 11`.

## 1.8 Risks / gotchas (Profile)
- **The prefs modal resists a pure split** — it owns 5 buffers + 2 effects (open-edge re-seed from `effectivePreferences`, veg-day pruning on week/religious change) + `vegDayCap = W-1`. Keep it container-owned; do NOT flatten to static props.
- **The 3 security modals are the most stateful part** — each owns buffers, password show-toggles, the 2-stage WhatsApp `stage`, direct `fetch`, ESC/backdrop, `router.refresh()`. Reuse as-is; only swap the shell to `MobileSheet`. WhatsApp verify success closes + refreshes after 1200ms — preserve that timing.
- **Read-only grids must read CANONICAL `customer`, never pending** (pending only feeds the modal buffers + the pending banner). Veg-day display gated on `effectivePreferences(customer).meal_preference_type` being religious AND non-empty `activeSubscription?.veg_days ?? customer?.veg_days`.
- **Profile-local `S` override:** ProfileClient sets `S.fgMuted = var(--ds-fg-sub)`, `S.fgSub = var(--ds-fg-faint)` — SecuritySection uses the shared `S`. Keep mobile consistent with whichever component owns the element.
- **`isPending` must reach every submit button** as a prop or buttons won't disable mid-save.

---

# 2. HISTORY & SUPPORT

## 2.A HISTORY

**Job (spec §7.7):** find a past plan I liked to re-order it. **NOTE: there is NO re-order action** — "re-ordering an old favorite" is copy only; no button/link exists. Pure render.

### Files
CREATE: `src/app/dashboard/_mobile/MobileHistory.tsx` (pure presentational, zero state).
EDIT: `src/app/dashboard/history/HistoryClient.tsx` — add both trees + `<768` toggle. HistoryClient is already `'use client'` with **zero state/handlers**; mobile is a pure render of `plans`.

### Prop shape
```ts
HistoryClient already receives: { plans: EndedPlan[] }
EndedPlan = { id; plan_name; status; start_date; end_date; total_meals; delivered_meals; skipped_meals_count }
```
`MobileHistory({ plans }: { plans: EndedPlan[] })`. Per-row derive: `cleanPlanName(plan_name)`, `completionPct = total_meals>0 ? Math.round(delivered/total*100) : 0`. `fmt(iso) = toLocaleDateString('en-AE',{day:'numeric',month:'short',year:'numeric'})`.

### Fold / scan order (spec §7.7)
| # | Desktop element | Mobile move | Primitive |
|---|---|---|---|
| 1 | Back link | 44px hit area, keep label | `<Link href="/dashboard">` `← Back to dashboard` (ArrowLeft size 13), `padding:'6px 0'` |
| 2 | Header (eyebrow `Past plans` + H1 + caption) | H1 22–24px, trim caption | `SectionTitle size={22}` `Your subscription history.`; caption verbatim `Every plan you've completed, with delivery and skip totals. Useful for re-ordering an old favorite.` |
| 3 | Empty state | reduce padding; optional menu link | `CARD` centered: `No past plans yet.` (16/700) + `When your current plan ends, it'll show up here.` (13/`S.fgMuted`) |
| 4 | Row (name+glyph → dates → stats) | stacked block, ~6/screen | **list-row pattern** (§10.7): `{ ...CARD, padding:'12px 14px', borderRadius:14 }`, `<PlanGlyph planName size={16}/>` + cleanName, dates `{fmt(start)} → {fmt(end)}` |
| 5 | Stat blocks ×3 | left-aligned CompactMetricStrip, one orange accent | `CompactMetricStrip columns={3}` metrics `Delivered {delivered}/{total}` · `Skipped {n}` · `Completion {pct}%` (accent) |

History has **no footer**, **no sheets/modals**, no handlers. Container `MobileColumn`, list `gap:10`.

## 2.B SUPPORT

**Job (spec §7.8):** reach a human now with least friction. **Channels-first, WhatsApp primary.**

### Files
CREATE: `src/app/dashboard/_mobile/MobileSupport.tsx` (presentational; only per-FAQ collapse state, owned by each FaqRow).
EDIT: `src/app/dashboard/support/SupportClient.tsx` — add both trees + `<768` toggle. SupportClient has **no state** (FAQ collapse lives inside `FAQItem`); contact links are plain anchors.

### Prop shape (unchanged — server lifts all 3)
```ts
SupportClient({ customer: Customer|null, userEmail: string, totalDelivered: number })
MobileSupport receives the same three.
```
WhatsApp via `whatsAppHref()` (→ `https://wa.me/971504619384`), email via `SUPPORT_EMAIL` (`care@dormers.ae`) — both from `@/shared/contacts`. **Never inline.**

### Fold / scan order (spec §7.8)
| # | Desktop element | Mobile move | Primitive |
|---|---|---|---|
| 1 | Header (eyebrow `Help & Support` + H1 `We're here for you.`) | H1 ~22–24px, margin 36→20, keep 15-min line | `SectionTitle size={22}`; sub: `totalDelivered>=5` → `{n} dinners delivered — we've got your back. Usually reply within 15 minutes.` else `Real humans, real food, real support. Usually reply within 15 minutes.` |
| 2 | Section eyebrow `Get in touch` | keep cheap divider | section-eyebrow pattern (§10.8) |
| 3 | **WhatsApp card (PRIMARY, was last in DOM)** | ContactActionRow primary; kill minHeight 260; full-width green CTA | §10.6 primary: `<a href={whatsAppHref()} target=_blank>` green `#25D366`, `Open WhatsApp →`; eyebrow `Fastest · ~15 min`; body `The fastest way to reach us. Available 7 AM – 9 PM, 7 days a week.` |
| 4 | Email card | secondary compact row, relabel `Email us` | §10.6 secondary: ghost-orange `mailto:`, label `care@dormers.ae`, eyebrow `Within 24 hours`, body `For billing, plan changes, or anything that needs a paper trail.` |
| 5 | Account info card (dark TIER_POP) | collapsible reference strip; optional copy-ID | `DisclosureCard` over `TIER_POP` (the ONE dark spotlight): fields Name / Email (`customer?.email ?? userEmail`) / ID (mono, `customer?.cid ?? '—'`); footer `Quote your ID so we can pull up your account instantly.` |
| 6 | FAQ accordion `Common questions` | keep; reduce padding; **urgent-first order** | FaqRow disclosure (§10.5); reorder per §2.B-FAQ below |
| 7 | Footer | keep; clear safe-area | `Made with ♥ in Dubai` |
| — | data-tooltips | DROP / convert to visible sub-labels | (the `data-tooltip="Opens WhatsApp"` etc. die) |

### Sheets/modals
Support has **no modals** — only the per-FAQ collapse (FaqRow, self-contained `useState(false)`). Contact rows are plain `<a>`/`mailto:`/`wa.me` anchors, no JS handlers.

### Support FAQ — urgent-first reorder proposal
Current DOM order is delivery-info-first. For "reach a human now," lead with the actions a stuck user most likely needs (skip/pause deadlines, allergy, delivery-zone confirmation), then settle into reference. Proposed mobile order (copy preserved verbatim, just reordered):

1. **Can I skip a meal?** — "Yes — Weekly Flex includes 1 skip, Monthly Premium includes 3 skips per cycle. Credits are automatically added back when you skip. Use the Skip button on your dashboard before midnight the day prior."
2. **How does pausing work?** — "Monthly Premium subscribers get 1 free pause per cycle (indefinite duration). When you resume, your end date extends by the exact number of days paused — you never lose meals."
3. **What if I have an allergy?** — "Update your allergens on the Plan page. Our kitchen team reviews all allergen flags before preparing your meal. For severe allergies, message us on WhatsApp directly."
4. **Do you deliver to my dorm?** — "We currently deliver to YUGO, Study World, and partnered university accommodations in Dubai. Message us on WhatsApp to confirm your building."
5. **When is my meal delivered?** — "Every weekday (Monday–Saturday) by 7-8 PM, directly to your dorm building. Sunday is always a rest day — no delivery."
6. **Can I change my meal preference (Veg/Non-Veg)?** — "Yes — update your preference on the Plan page. Changes apply from the next delivery cycle. Mid-cycle changes are not supported."
7. **How do I renew my plan?** — "Tap \"Renew plan\" on your dashboard before your end date. Your new cycle starts immediately after the current one ends."
8. **What payment methods do you accept?** — "We accept all major cards (Visa, Mastercard, Amex) via Stripe. All transactions are encrypted — we never store your card details."

### Risks / gotchas (History/Support)
- **WhatsApp link sourcing** — must stay `whatsAppHref()` from `@/shared/contacts`; never inline `wa.me/...` or the number. Email via `SUPPORT_EMAIL`. The desktop already imports both — reuse the same import in the mobile component.
- **Support's TIER_POP account card is the single dark spotlight** on the surface — keep exactly one; the WhatsApp green CTA is a *color accent*, not a second dark card. Its text tokens (`TIER_POP_TEXT`) do NOT flip in dark mode — use literal `#f5f0e8` / `rgba(245,240,232,…)`.
- **History dark-mode `S`** — HistoryClient overrides local `S` to CSS variables (`--ds-glass-bg`, `--ds-border`, `--ds-fg-sub`) so the desktop flips in dark mode; the mobile surface is light-theme (mobile dashboard is intentionally light), so use the light `S` tokens from kit, not the desktop's flipping vars.
- **No re-order action in History** — don't invent one; the "re-order a favorite" line is copy only.
- **FAQ reorder is mobile-only** unless the PO says otherwise — keep desktop DOM order untouched (it already stacks at `max-width:1024px`).
- **`totalDelivered` two-variant header** — the `>=5` strong-number variant needs the number in `var(--ds-fg)`/700; below 5 use the generic line.
