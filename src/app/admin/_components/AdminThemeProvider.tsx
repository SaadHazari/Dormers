'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { adminTokens, type AdminTokens } from '@/ui-system/tokens/admin-theme'

interface AdminThemeCtx {
    isLight: boolean
    t: AdminTokens
}

const Ctx = createContext<AdminThemeCtx>({
    isLight: false,
    t: adminTokens(false),
})

export function useAdminTheme() {
    return useContext(Ctx)
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
    const [isLight, setIsLight] = useState(false)

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: light)')
        setIsLight(mq.matches)
        const onChange = (e: MediaQueryListEvent) => setIsLight(e.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    const t = adminTokens(isLight)

    return (
        <Ctx.Provider value={{ isLight, t }}>
            {children}
        </Ctx.Provider>
    )
}
