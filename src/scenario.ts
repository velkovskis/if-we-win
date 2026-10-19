// A Scenario as a link, with My team riding along: "PL2026:537412h,537413d:57" is the season id,
// then each Lock as Fixture id + Outcome initial, then My team's id when there is one.
import type { Outcome } from './forecast.ts'
import type { Season } from './update.ts'

type Link = Pick<Season, 'league' | 'season'> & { fixtures: { id: number }[]; teams: { id: number }[] }

const INITIALS = { home: 'h', draw: 'd', away: 'a' } as const satisfies Record<Outcome, string>
const OUTCOMES: Record<string, Outcome> = { h: 'home', d: 'draw', a: 'away' }

export function encode(season: Link, locks: Record<number, Outcome>, myTeam?: number): string {
  const ids = Object.keys(locks).map(Number).toSorted((a, b) => a - b)
  const encoded = `${season.league}${season.season}:${ids.map((id) => `${id}${INITIALS[locks[id]]}`).join(',')}`
  return myTeam ? `${encoded}:${myTeam}` : ids.length ? encoded : ''
}

// Never throws: anything it can't use is dropped, so a bad link opens as the Baseline.
export function decode(season: Link, link: string): { locks: Record<number, Outcome>; myTeam?: number } {
  // Some apps percent-encode the ':' and ',' when a link is shared.
  try {
    link = decodeURIComponent(link)
  } catch {
    return { locks: {} }
  }
  const [seasonId, encoded = '', team] = link.split(':')
  if (seasonId !== `${season.league}${season.season}`) return { locks: {} }
  const fixtures = new Set(season.fixtures.map((f) => f.id))
  const locks: Record<number, Outcome> = {}
  for (const lock of encoded.split(',')) {
    const match = /^(\d+)([hda])$/.exec(lock)
    if (match && fixtures.has(Number(match[1]))) locks[Number(match[1])] = OUTCOMES[match[2]]
  }
  const myTeam = season.teams.find((t) => String(t.id) === team)?.id
  return myTeam ? { locks, myTeam } : { locks }
}
