// A Scenario as a link: "PL2026:537412h,537413d" is the season id, then each Lock as Fixture id + Outcome initial.
import type { Outcome } from './forecast.ts'
import type { Season } from './update.ts'

type Link = Pick<Season, 'league' | 'season'> & { fixtures: { id: number }[] }

const INITIALS = { home: 'h', draw: 'd', away: 'a' } as const satisfies Record<Outcome, string>
const OUTCOMES: Record<string, Outcome> = { h: 'home', d: 'draw', a: 'away' }

export function encode(season: Link, locks: Record<number, Outcome>): string {
  const ids = Object.keys(locks).map(Number).toSorted((a, b) => a - b)
  return ids.length ? `${season.league}${season.season}:${ids.map((id) => `${id}${INITIALS[locks[id]]}`).join(',')}` : ''
}

// Never throws: anything it can't use is dropped, so a bad link opens as the Baseline.
export function decode(season: Link, link: string): Record<number, Outcome> {
  // Some apps percent-encode the ':' and ',' when a link is shared.
  try {
    link = decodeURIComponent(link)
  } catch {
    return {}
  }
  const [seasonId, encoded = ''] = link.split(':')
  if (seasonId !== `${season.league}${season.season}`) return {}
  const fixtures = new Set(season.fixtures.map((f) => f.id))
  const locks: Record<number, Outcome> = {}
  for (const lock of encoded.split(',')) {
    const match = /^(\d+)([hda])$/.exec(lock)
    if (match && fixtures.has(Number(match[1]))) locks[Number(match[1])] = OUTCOMES[match[2]]
  }
  return locks
}
