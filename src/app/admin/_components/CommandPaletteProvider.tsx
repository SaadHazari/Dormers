'use client'

import { createContext, useContext, useState, useCallback } from 'react'

export interface PaletteCommand {
    id: string
    label: string
    group: string
    href?: string
    action?: () => void
    icon?: React.ReactNode
    keywords?: string[]
}

interface CommandPaletteCtx {
    commands: PaletteCommand[]
    register: (cmds: PaletteCommand[]) => void
    open: boolean
    setOpen: (v: boolean) => void
}

const Ctx = createContext<CommandPaletteCtx>({
    commands: [],
    register: () => {},
    open: false,
    setOpen: () => {},
})

export function useCommandPalette() {
    return useContext(Ctx)
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
    const [commands, setCommands] = useState<PaletteCommand[]>([])
    const [open, setOpen] = useState(false)

    const register = useCallback((cmds: PaletteCommand[]) => {
        setCommands(prev => {
            const ids = new Set(cmds.map(c => c.id))
            return [...prev.filter(c => !ids.has(c.id)), ...cmds]
        })
    }, [])

    return (
        <Ctx.Provider value={{ commands, register, open, setOpen }}>
            {children}
        </Ctx.Provider>
    )
}
