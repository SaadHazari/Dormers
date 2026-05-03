import type { CSSProperties } from 'react'
import { OG, BODY } from './tokens'

/**
 * Dashboard CTA button styles. Two variants in active use:
 *   - 'primary'        : full-size CTA (NoPlanView "Browse plans →")
 *   - 'primary-tight'  : compact card-CTA (PlanProgress "Renew plan →")
 *
 * Was inlined in ClientDashboard.tsx as a switch — pulled out so
 * extracted sub-components share the same look + transitions.
 */
export type BtnVariant = 'primary' | 'primary-tight'

export function btnStyle(v: BtnVariant): CSSProperties {
    const base: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 18px',
        borderRadius: 'var(--radius-pill)',
        fontFamily: BODY,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        border: 0,
        cursor: 'pointer',
        transition:
            'opacity 150ms, transform 150ms, box-shadow 150ms, background 150ms, border-color 150ms',
        textDecoration: 'none',
    }
    switch (v) {
        case 'primary':
            return { ...base, background: OG, color: '#fff', boxShadow: '0 4px 16px rgba(245,127,32,0.40)' }
        case 'primary-tight':
            return { ...base, background: OG, color: '#fff', padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(245,127,32,0.35)' }
    }
}

/**
 * 12×12 inline circular spinner with a rotating border-top. Used inside
 * pending-state QuickActions buttons. Relies on the global `@keyframes
 * spin` declared in src/app/globals.css.
 */
export function BtnSpinner() {
    return (
        <span
            style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '1.5px solid currentColor',
                borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
                flexShrink: 0,
            }}
        />
    )
}
