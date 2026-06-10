'use client'

import Image from 'next/image'
import Link from 'next/link'
import { SpiceMeter } from '@/app/components/SpiceMeter'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

const warmHeading = 'bg-clip-text text-transparent bg-gradient-to-b from-[#fdf8ef] via-[#f0e6cf] to-[#d6c8a8] drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] pb-1'

export default function DishPageClient({ dish }: { dish: SerializedDish }) {
  const weekLabel = dish.week.replace('week', 'Week ')
  const dayLabel = DAYS[dish.dayOfWeek] ?? ''
  const cals = dish.nutrients.calories.replace(/kcal/i, '').trim()

  return (
    <div className="min-h-screen bg-[#061520]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-5 py-4 max-w-2xl mx-auto">
        <Link href="/home">
          <Image src="/logo-dark.svg" alt="Dormers'" width={100} height={28} priority />
        </Link>
        <Link
          href="/login"
          className="text-[13px] text-[#f5f0e8]/55 hover:text-[#f5f0e8]/80 transition-colors"
        >
          Sign in
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto pb-32">
        {/* Hero image */}
        <div className="relative w-full aspect-[16/10] overflow-hidden rounded-2xl mx-auto px-4">
          <div className="relative w-full h-full rounded-2xl overflow-hidden">
            {dish.image && (
              <Image
                src={dish.image}
                alt={dish.name}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 672px, 100vw"
                priority
              />
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#061520] via-transparent to-transparent" />

            {/* Veg / Non-veg badge */}
            <span
              className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-sm ${
                dish.isVeg
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-[#f57f20]/20 text-[#f5a623] border border-[#f57f20]/30'
              }`}
            >
              {dish.isVeg ? 'Veg' : 'Non-Veg'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 mt-5">
          {/* Eyebrow */}
          <p className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase mb-2">
            {weekLabel} &middot; {dayLabel}
          </p>

          {/* Name */}
          <h1 className={`text-[28px] sm:text-[34px] font-black tracking-tight leading-tight mb-3 ${warmHeading}`}>
            {dish.name}
          </h1>

          {/* Description */}
          <p className="text-[14px] text-[#f5f0e8]/65 leading-relaxed mb-8">
            {dish.description}
          </p>

          {/* Nutrition grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <NutrientCard label="Calories" value={cals} unit="kcal" accent />
            <NutrientCard label="Protein" value={dish.nutrients.protein} />
            <NutrientCard label="Carbs" value={dish.nutrients.carbs} />
            <NutrientCard label="Fat" value={dish.nutrients.fat} />
          </div>

          {/* Micronutrients */}
          {dish.nutrients.microNutrients.length > 0 && (
            <div className="mb-8">
              <p className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase mb-3">
                Micronutrients
              </p>
              <div className="flex flex-wrap gap-2">
                {dish.nutrients.microNutrients.map((mn, i) => (
                  <span
                    key={i}
                    className="text-[12px] text-[#f5f0e8]/70 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5"
                  >
                    {mn.name} <span className="text-[#f5f0e8]/40">{mn.amount}</span>{' '}
                    <span className="text-[#f57f20]/80 font-semibold">{mn.percentage} DV</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Spice + Allergens */}
          <div className="flex flex-col gap-4 mb-10">
            <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
              <span className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase">
                Spice
              </span>
              <SpiceMeter level={dish.spiceLevel} fontSize={18} />
            </div>

            <div className="flex items-center justify-between py-3 border-t border-white/[0.06]">
              <span className="text-[#f57f20] font-bold text-[11px] tracking-widest uppercase">
                Allergens
              </span>
              <div className="flex gap-1.5 flex-wrap justify-end">
                {dish.allergens.length > 0 ? (
                  dish.allergens.map((a, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/[0.06] text-[#f5f0e8]/60 border border-white/[0.08]"
                    >
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-[#f5f0e8]/40">None</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#061520] via-[#061520]/95 to-transparent">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/home"
            className="block w-full text-center rounded-xl px-6 py-3.5 text-[14px] font-bold uppercase tracking-widest bg-[#f57f20] text-white hover:bg-[#ff8f36] transition-colors"
          >
            Get meals like this delivered
          </Link>
          <p className="text-center text-[11px] text-[#f5f0e8]/35 mt-2">
            Student meal delivery in Dubai
          </p>
        </div>
      </div>
    </div>
  )
}

function NutrientCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#f5f0e8]/40 mb-1">
        {label}
      </p>
      <p className={`text-[20px] font-bold ${accent ? 'text-[#f57f20]' : 'text-[#f5f0e8]'}`}>
        {value}
        {unit && <span className="text-[10px] ml-1 font-semibold text-[#f5f0e8]/40 uppercase">{unit}</span>}
      </p>
    </div>
  )
}
