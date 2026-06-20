import type { DormShape, DormMapping } from './dorm-shapes'

export interface DormLocation {
  id: string
  canonical_name: string
  display_name: string
  cid_code: string
  shape: DormShape
  sort_order: number
  aliases: string[]
  is_delivery_target: boolean
  is_active: boolean
}

export function dormNames(locs: DormLocation[]): string[] {
  return locs.map((d) => d.canonical_name)
}

export function deliveryDormNames(locs: DormLocation[]): string[] {
  return locs.filter((d) => d.is_delivery_target).map((d) => d.canonical_name)
}

export function dormShapeMap(locs: DormLocation[]): Record<string, DormMapping> {
  return Object.fromEntries(
    locs.map((d) => [
      d.canonical_name,
      { displayName: d.display_name, number: d.sort_order, shape: d.shape },
    ]),
  )
}

export function dormAliasMap(locs: DormLocation[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const d of locs) {
    if (!d.is_delivery_target) continue
    for (const alias of d.aliases) {
      // Lowercase the key — matchDormNameSync looks up by lowercased input, so
      // a verbatim mixed-case alias would otherwise never match.
      map[alias.toLowerCase()] = d.canonical_name
    }
  }
  return map
}

export function dormCidCode(locs: DormLocation[], dormName: string): string {
  const found = locs.find((d) => d.canonical_name === dormName)
  if (found) return found.cid_code
  return dormName
    .replace(/\b(the|and|or|of|in|at|for)\b/gi, '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X')
}
