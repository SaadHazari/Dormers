/**
 * A file bigger than this is almost certainly a mistake, and would push the
 * server action past what a single request should carry. Splitting a very
 * large export is a two-minute job for a person and keeps this screen honest
 * about what it is: a one-time move, not a sync.
 *
 * Lives here rather than in actions.ts because a 'use server' module may only
 * export async functions — a plain const there is a build error.
 */
export const MAX_IMPORT_ROWS = 20_000
