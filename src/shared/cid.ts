import { randomInt } from 'crypto'
import { dormCidCode, type DormLocation } from '@/shared/dorm-registry'

// Uppercase-only alphabet — every CID lookup normalizes via .toUpperCase(),
// so the random suffix must stay uppercase to remain matchable.
const CID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const SUFFIX_LEN = 4

export function generateCid(dorm: string, locs: DormLocation[]): string {
  const code = dormCidCode(locs, dorm)
  const now = new Date()
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  // Cryptographic random suffix: CIDs appear in public referral URLs (/r/[cid]),
  // so the keyspace must resist enumeration — Math.random() is predictable and 3
  // chars (~46k) is small. crypto.randomInt over 4 chars (~1.68M) also keeps two
  // signups at the same dorm in the same MM:SS from colliding on UNIQUE(cid).
  let rand = ''
  for (let i = 0; i < SUFFIX_LEN; i++) {
    rand += CID_ALPHABET[randomInt(0, CID_ALPHABET.length)]
  }
  return `${code}${mm}${ss}${rand}`
}
