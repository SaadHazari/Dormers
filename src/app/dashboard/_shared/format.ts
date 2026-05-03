/**
 * Shared en-AE date formatters used across the dashboard. Was inlined
 * three times (ClientDashboard / PlanClient / HistoryClient) with
 * identical option bags.
 */

export const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })

export const fmtWithDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
