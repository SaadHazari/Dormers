/** What reopening changed, read from season_reopen's result (spec §5). */

export interface SeasonReopenSummary {
  readyHolds: number
  readyCustomerPauses: number
}

export function reopenSummaryFrom(state: unknown): SeasonReopenSummary {
  const row = (state ?? {}) as { ready_holds?: unknown; ready_customer_pauses?: unknown }
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  return { readyHolds: count(row.ready_holds), readyCustomerPauses: count(row.ready_customer_pauses) }
}
