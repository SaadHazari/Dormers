/** Normalise a raw phone string to E.164. Handles UAE local (05xxxxxxxx) and international inputs. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('971') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('05') && digits.length === 10)  return `+971${digits.slice(1)}`
  if (digits.length > 7) return `+${digits}`
  return digits
}
