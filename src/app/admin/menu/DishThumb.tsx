'use client'

import { useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { useAdminTheme } from '../_components/AdminThemeProvider'

/** Dish photo with a quiet placeholder when the image is missing or 404s. */
export function DishThumb({ src, alt, className = '' }: {
    src: string | null
    alt: string
    className?: string
}) {
    const { isLight } = useAdminTheme()
    const [broken, setBroken] = useState(false)

    return (
        <div className={`relative overflow-hidden ${isLight ? 'bg-[#091825]/[0.05]' : 'bg-white/[0.06]'} ${className}`}>
            {src && !broken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    onError={() => setBroken(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    <UtensilsCrossed size={14} className={isLight ? 'text-[#091825]/25' : 'text-[#ede8da]/20'} strokeWidth={2} />
                </div>
            )}
        </div>
    )
}
