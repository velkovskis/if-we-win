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
  const [seasonId, encoded = '', team] = parts(link)
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

// The League a link names, when it's one of these; undefined for any other League, a malformed link or none.
export function leagueOf(link: string, leagues: string[]): string | undefined {
  const code = /^(\w+)\d{4}$/.exec(parts(link)[0])?.[1]
  return leagues.find((l) => l === code)
}

// Season id, Locks and My team; none when the link won't decode. Some apps percent-encode the ':' and ',' when a link is shared.
function parts(link: string): string[] {
  try {
    return decodeURIComponent(link).split(':')
  } catch {
    return []
  }
}
