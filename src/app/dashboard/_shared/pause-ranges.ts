export interface PauseRange {
  startIso: string
  endIso: string
  dates: Set<string>
  count: number
}

type WeekType = '5DAYS' | '6DAYS'

function isWorkingDay(d: Date, weekType: WeekType): boolean {
  const js = d.getDay()
  const isoDow = js === 0 ? 7 : js
  if (weekType === '5DAYS') return isoDow !== 6 && isoDow !== 7
  return isoDow !== 7
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextWorkingDay(iso: string, weekType: WeekType): string {
  const d = new Date(iso + 'T00:00:00')
  do { d.setDate(d.getDate() + 1) } while (!isWorkingDay(d, weekType))
  return isoOf(d)
}

export function groupPauseRanges(
  pausedDates: string[],
  weekType: WeekType,
  skipSet?: Set<string>,
): PauseRange[] {
  const filtered = skipSet
    ? pausedDates.filter(d => !skipSet.has(d))
    : pausedDates
  const sorted = [...filtered].sort()
  if (sorted.length === 0) return []

  const ranges: PauseRange[] = []
  let current = { startIso: sorted[0], endIso: sorted[0], dates: new Set([sorted[0]]), count: 1 }

  for (let i = 1; i < sorted.length; i++) {
    const expected = nextWorkingDay(current.endIso, weekType)
    if (sorted[i] === expected) {
      current.endIso = sorted[i]
      current.dates.add(sorted[i])
      current.count++
    } else {
      ranges.push(current)
      current = { startIso: sorted[i], endIso: sorted[i], dates: new Set([sorted[i]]), count: 1 }
    }
  }
  ranges.push(current)
  return ranges
}

export function buildPauseLookup(ranges: PauseRange[]): Map<string, PauseRange> {
  const map = new Map<string, PauseRange>()
  for (const r of ranges) {
    for (const d of r.dates) map.set(d, r)
  }
  return map
}
