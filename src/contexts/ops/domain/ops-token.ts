export type OpsRole = 'kitchen' | 'rider'

export interface OpsToken {
  id: string
  token: string
  role: OpsRole
  label: string
  is_active: boolean
  created_at: string
  revoked_at: string | null
}

export function isTokenValid(t: OpsToken | null): t is OpsToken {
  return t !== null && t.is_active && t.revoked_at === null
}
