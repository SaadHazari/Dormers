export type OpsRole = 'kitchen' | 'rider'

export interface OpsToken {
  id: string
  token: string
  role: OpsRole
  label: string
  is_active: boolean
  created_at: string
  revoked_at: string | null
  /** Last time the token opened its page. Advisory — never authorises. */
  last_used_at?: string | null
}

/** Path segment each role's token lives under, e.g. /kitchen/<token>. */
export const OPS_ROLE_PATH: Record<OpsRole, string> = {
  kitchen: 'kitchen',
  rider: 'ops',
}

/** Full path (no host) an ops token resolves to, e.g. "ops/a1b2…". */
export function opsTokenPath(role: OpsRole, token: string): string {
  return `${OPS_ROLE_PATH[role]}/${token}`
}

export function isTokenValid(t: OpsToken | null): t is OpsToken {
  return t !== null && t.is_active && t.revoked_at === null
}
