'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Flame, Truck } from 'lucide-react'
import { SpiceMeter } from '@/app/components/SpiceMeter'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SPICE_LABELS = ['No heat', 'Mild', 'Medium', 'Spicy']

interface SerializedDish {
  id: number
  name: string
  week: string
  description: string
  image: string
  isVeg: boolean
  dayOfWeek: number
  spiceLevel: number
  allergens: string[]
  nutrients: {
    calories: string
    protein: string
    carbs: string
    fat: string
    microNutrients: { name: string; amount: string; percentage: string }[]
  }
}

// Navy-on-cream heading — same treatment as the /r/[cid] light mode.
const navyHeading =
  'bg-clip-text text-transparent bg-gradient-to-b from-[#1c4255] via-[#091825] to-[#061520] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)] pb-1'

const sectionLabel = 'text-[11px] font-bold uppercase tracking-widest text-[#091825]/45'

// tracking-wide (not widest) per the system button spec — widest wraps the
// label to two lines on a 375pt phone.
const ctaStyles =
  'rounded-full bg-[#f57f20] hover:bg-[#ff8f36] active:scale-[0.98] text-white text-[13px] font-bold uppercase tracking-wide shadow-[0_4px_20px_rgba(245,127,32,0.25)] hover:shadow-[0_6px_28px_rgba(245,127,32,0.4)] transition-all'

function splitUnit(raw: string): { value: string; unit: string } {
  const m = raw.trim().match(/^([\d.]+)\s*(.*)$/)
  return m ? { value: m[1], unit: m[2] } : { value: raw, unit: '' }
}

export default function DishPageClient({ dish }: { dish: SerializedDish }) {
  const weekLabel = dish.week.replace('week', 'Week ')
  const dayLabel = DAYS[dish.dayOfWeek]
  const cal = splitUnit(dish.nutrients.calories ?? '')

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      {/* Fixed cream backing — viewport-pinned so the gradient (and the CTA
          backdrop matched to it) stays constant regardless of page height. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-gradient-to-b from-[#fcf2dd] via-[#ede8da] to-[#d9c9a8]"
      />
      {/* Bottom sunset band — warm orange wash fading up, same as /r/[cid].
          Mobile: above the opaque content sheet (z-2) so the wash still shows;
          desktop: behind the content as on the referral page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-[200px] lg:-z-10"
        style={{
          background:
            'linear-gradient(to top, rgba(245,127,32,0.22) 0%, rgba(245,127,32,0.10) 45%, transparent 100%)',
        }}
      />

      {/* Nav */}
      <nav className="relative z-10 mx-auto flex h-14 max-w-5xl items-center justify-between px-5 lg:px-8">
        <Link href="/home" className="-ml-1 flex items-center p-1 transition-opacity hover:opacity-80">
          <Image src="/logo-light.svg" alt="Dormers'" width={36} height={36} priority />
        </Link>
        <Link
          href="/login"
          className="-mr-3 px-3 py-2.5 text-[13px] font-semibold text-[#091825]/55 transition-colors hover:text-[#091825]/85"
        >
          Sign in
        </Link>
      </nav>

      <main className="mx-auto max-w-5xl lg:grid lg:grid-cols-[5fr_6fr] lg:items-start lg:gap-12 lg:px-8 lg:pb-24 lg:pt-4">
        {/* Hero — full-bleed rounded-bottom photo on mobile, sticky card on desktop */}
        <div className="relative lg:sticky lg:top-8">
          <div className="dish-photo relative aspect-[4/5] w-full overflow-hidden bg-[#ece4d2] sm:aspect-[16/10] lg:aspect-square lg:rounded-3xl lg:shadow-[0_16px_40px_rgba(9,24,37,0.16)]">
            {dish.image && (
              <Image
                src={dish.image}
                alt={dish.name}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 440px, 100vw"
                priority
              />
            )}
            {/* Base scrim for card depth — desktop only; on the cream mobile
                photos a dark fade reads as a smudge, not depth. */}
            <div className="absolute inset-0 hidden bg-gradient-to-t from-black/25 via-transparent to-transparent lg:block" />
            {/* Mobile: a soft warm fade at the very bottom so the photo melts
                into the cream content sheet instead of ending on a hard line. */}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#fdf8ef] to-transparent lg:hidden"
            />

            {/* Cream glass badge — the dish photos are light studio shots,
                so a dark scrim pill reads muddy on them. */}
            <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-[#091825]/10 bg-[#fdfaf2]/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#091825]/75 backdrop-blur-md">
              <span className={`h-1.5 w-1.5 rounded-full ${dish.isVeg ? 'bg-emerald-500' : 'bg-[#f57f20]'}`} />
              {dish.isVeg ? 'Veg' : 'Non-Veg'}
            </span>

            {/* At-a-glance calorie chip — the single number a hungry student
                cares about, readable before they scroll past the photo. */}
            {cal.value && (
              <span className="absolute right-4 top-4 inline-flex items-baseline gap-1 rounded-full border border-[#091825]/10 bg-[#fdfaf2]/80 px-3 py-1 text-[#091825] backdrop-blur-md">
                <span className="text-[13px] font-black leading-none">{cal.value}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#091825]/55">
                  {cal.unit || 'kcal'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Content — on mobile this is a static bottom-sheet over the photo:
            same 20px top radius + upward shadow as the dashboard MobileSheet.
            Opaque cream gradient so the photo reads as background behind it. */}
        <div className="relative z-[1] -mt-9 rounded-t-[28px] bg-gradient-to-b from-[#fdf8ef] via-[#ede8da] to-[#d9c9a8] px-5 pb-32 pt-7 shadow-[0_-16px_44px_rgba(9,24,37,0.25)] lg:z-auto lg:mt-2 lg:rounded-none lg:bg-none lg:px-0 lg:pb-0 lg:pt-0 lg:shadow-none">
          {/* Grip handle — signifies "this sheet sits over the photo"; mobile only */}
          <div aria-hidden className="mx-auto mb-5 h-1 w-9 rounded-full bg-[#091825]/15 lg:hidden" />

          <p className="dish-rise dish-d1 mb-2 text-[11px] font-bold uppercase tracking-widest text-[#f57f20]">
            {weekLabel}
            {dayLabel && <> &middot; {dayLabel}</>}
          </p>

          <h1
            className={`dish-rise dish-d1 mb-3 text-[30px] font-black leading-tight tracking-tight sm:text-[36px] lg:text-[40px] ${navyHeading}`}
          >
            {dish.name}
          </h1>

          <p className="dish-rise dish-d2 mb-8 max-w-[52ch] text-[15px] leading-relaxed text-[#091825]/65">
            {dish.description}
          </p>

          {/* Macros */}
          <div className="dish-rise dish-d2 mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NutrientCard label="Calories" raw={dish.nutrients.calories} accent />
            <NutrientCard label="Protein" raw={dish.nutrients.protein} />
            <NutrientCard label="Carbs" raw={dish.nutrients.carbs} />
            <NutrientCard label="Fat" raw={dish.nutrients.fat} />
          </div>

          {/* Micronutrients */}
          {dish.nutrients.microNutrients.length > 0 && (
            <div className="dish-rise dish-d3 mb-8">
              <p className={`${sectionLabel} mb-3`}>Micronutrients</p>
              <div className="flex flex-wrap gap-2">
                {dish.nutrients.microNutrients.map((mn, i) => (
                  <span
                    key={i}
                    className="rounded-lg border border-[#091825]/10 bg-[#fcf8ee] px-3 py-1.5 text-[12px] text-[#091825]/70 transition-colors hover:border-[#091825]/20 hover:bg-white"
                  >
                    {mn.name} <span className="text-[#091825]/45">{mn.amount}</span>{' '}
                    <span className="font-bold text-[#f57f20]">{mn.percentage} DV</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Spice + Allergens */}
          <div className="dish-rise dish-d3 mb-8 divide-y divide-[#091825]/10 border-y border-[#091825]/10">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <span className={sectionLabel}>Spice</span>
              <div className="flex items-center gap-2.5">
                <SpiceMeter level={dish.spiceLevel} fontSize={15} gap={4} />
                <span className="text-[12px] font-semibold text-[#091825]/70">
                  {SPICE_LABELS[dish.spiceLevel] ?? ''}
                </span>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 py-3.5">
              <span className={`${sectionLabel} pt-1`}>Allergens</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {dish.allergens.length > 0 ? (
                  dish.allergens.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-[#091825]/10 bg-[#091825]/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#091825]/70"
                    >
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="py-0.5 text-[12px] text-[#091825]/55">None listed</span>
                )}
              </div>
            </div>
          </div>

          {/* Trust strip — two honest reassurances at the point of decision.
              Cooked-fresh + dorm delivery are the brand's core promise; no
              invented numbers (no fake review counts or prices). */}
          <div className="dish-rise dish-d4 mb-9 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#091825]/70">
              <Flame size={15} className="text-[#f57f20]" strokeWidth={2.5} />
              Cooked fresh daily
            </span>
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#091825]/70">
              <Truck size={15} className="text-[#f57f20]" strokeWidth={2.5} />
              Delivered to your dorm
            </span>
          </div>

          {/* Desktop CTA — inline, where the story ends */}
          <div className="dish-rise dish-d4 hidden lg:block">
            <Link href="/home" className={`${ctaStyles} inline-block px-6 py-3 text-center`}>
              Get meals like this delivered
            </Link>
            <Link
              href="/home"
              className="ml-5 text-[13px] font-semibold text-[#091825]/55 underline-offset-4 transition-colors hover:text-[#091825]/85 hover:underline"
            >
              See this week&apos;s full menu
            </Link>
          </div>
        </div>
      </main>

      {/* Mobile CTA — fixed, safe-area aware. The from-color matches the
          composite of the fixed cream backing + sunset band at the viewport
          bottom edge, so the fade is seamless. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 lg:hidden">
        <div className="bg-gradient-to-t from-[#dfb98a] via-[#e8d8b6] to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
          <Link href="/home" className={`${ctaStyles} pointer-events-auto block w-full px-6 py-3.5 text-center`}>
            Get meals like this delivered
          </Link>
          <Link
            href="/home"
            className="pointer-events-auto mt-2.5 block text-center text-[12px] font-semibold text-[#091825]/55 transition-colors hover:text-[#091825]/80"
          >
            See this week&apos;s full menu
          </Link>
        </div>
      </div>

      {/* Plain <style> (not styled-jsx): SSR-inlined so the entry animation
          runs from first paint — styled-jsx CSS only attaches post-hydration here. */}
      <style>{`
        .dish-rise { animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .dish-d1 { animation-delay: 0.06s; }
        .dish-d2 { animation-delay: 0.12s; }
        .dish-d3 { animation-delay: 0.18s; }
        .dish-d4 { animation-delay: 0.24s; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }
        /* Slow settle on the hero photo — gives the food a premium "arrive"
           moment instead of a static slap-down. This is a plain global style
           block, so a normal child selector reaches the next/image element
           directly (no :global, a styled-jsx-only pseudo that drops here). */
        .dish-photo { animation: dishPhotoIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .dish-photo > img {
          animation: dishPhotoScale 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes dishPhotoIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dishPhotoScale { from { transform: scale(1.06); } to { transform: scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .dish-rise, .dish-photo, .dish-photo > img { animation: none; }
        }
      `}</style>
    </div>
  )
}

function NutrientCard({ label, raw, accent }: { label: string; raw: string; accent?: boolean }) {
  const { value, unit } = splitUnit(raw)
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-[#fcf8ee] px-4 py-3.5 shadow-[0_1px_3px_rgba(9,24,37,0.05)] transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_6px_18px_rgba(9,24,37,0.10)] ${
        accent ? 'border-[#f57f20]/30' : 'border-[#091825]/10'
      }`}
    >
      {/* Accent rail on the headline macro — gives the grid a focal point
          without a second color. */}
      {accent && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[#f57f20]" />}
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#091825]/45">{label}</p>
      <p className={`text-[22px] font-black leading-none ${accent ? 'text-[#f57f20]' : 'text-[#091825]'}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-semibold text-[#091825]/45">{unit}</span>}
      </p>
    </div>
  )
}
