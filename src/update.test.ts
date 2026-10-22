import { describe, expect, it } from 'vitest'
import matches from '../test/recorded/matches.json'
import standings from '../test/recorded/standings.json'
import { DEFAULT_SETTINGS, outcomeProbabilities } from './forecast.ts'
import type { OddsResponse, Ratings } from './ratings.ts'
import { update, type Deduction, type MatchesResponse, type StandingsResponse } from './update.ts'

const config = { league: 'PL', season: 2026, championsLeaguePlaces: 4, firstSnapshot: '2026-10-27' }
const now = new Date('2026-10-19T20:00:00Z')

const run = (m: MatchesResponse = matches, s: StandingsResponse = standings, deductions: Deduction[] = []) =>
  update({ matches: m, standings: s, config, deductions, now }).season

const ratingsFrom = (odds?: OddsResponse, ratings?: Ratings) => update({ matches, standings, config, deductions: [], now, odds, ratings }).season.ratings

// A copy of the recorded matches response with one match edited.
const editMatch = (id: number, edit: object): MatchesResponse => ({
  ...matches,
  matches: matches.matches.map((m) => (m.id === id ? { ...m, ...edit } : m)),
})

// A copy of the recorded standings with some teams' official points edited, keyed by team id.
const editPoints = (points: Record<number, number>): StandingsResponse => ({
  standings: standings.standings.map((s) => ({ ...s, table: s.table.map((r) => ({ ...r, points: points[r.team.id] ?? r.points })) })),
})

const IN_PLAY_ID = 560606
const FINISHED_ID = 560542 // Arsenal 3-0 Coventry, Matchweek 1
const TIMED_ID = matches.matches.find((m) => m.status === 'TIMED')!.id

describe('update', () => {
  it('publishes the league, season, config and current time', () => {
    const season = run()
    expect(season.league).toBe('PL')
    expect(season.leagueName).toBe('Premier League')
    expect(season.season).toBe(2026)
    expect(season.championsLeaguePlaces).toBe(4)
    expect(season.updatedAt).toBe('2026-10-19T20:00:00.000Z')
  })

  it('publishes all 20 teams', () => {
    const season = run()
    expect(season.teams).toHaveLength(20)
    expect(season.teams).toContainEqual({ id: 57, name: 'Arsenal', crest: 'https://crests.football-data.org/57.png' })
  })

  it('splits matches into Results and Fixtures', () => {
    const season = run()
    expect(season.results).toHaveLength(69)
    expect(season.fixtures).toHaveLength(311)
  })

  it('gives a Result its final Scoreline', () => {
    expect(run().results).toContainEqual({ id: FINISHED_ID, matchweek: 1, homeTeamId: 57, awayTeamId: 1076, kickoff: '2026-08-21T19:00:00Z', scoreline: { home: 3, away: 0 } })
  })

  it('gives a Fixture its kick-off', () => {
    expect(run().fixtures).toContainEqual({ id: 560620, matchweek: 8, homeTeamId: 349, awayTeamId: 351, kickoff: '2026-10-23T19:00:00Z' })
  })

  it('treats an in-progress match as a Fixture', () => {
    const season = run()
    expect(season.fixtures.map((f) => f.id)).toContain(IN_PLAY_ID)
    expect(season.results.map((r) => r.id)).not.toContain(IN_PLAY_ID)
  })

  it('treats a postponed match as a Fixture that keeps its Matchweek', () => {
    const before = run().fixtures.find((f) => f.id === TIMED_ID)!
    const season = run(editMatch(TIMED_ID, { status: 'POSTPONED' }))
    expect(season.fixtures).toContainEqual({ ...before, status: 'postponed' })
  })

  it('marks a Fixture whose time is unconfirmed as TBC', () => {
    expect(run(editMatch(TIMED_ID, { status: 'SCHEDULED' })).fixtures.find((f) => f.id === TIMED_ID)?.status).toBe('tbc')
  })

  it.each(['POSTPONED', 'SUSPENDED', 'CANCELLED'])('marks a %s Fixture as postponed', (status) => {
    expect(run(editMatch(TIMED_ID, { status })).fixtures.find((f) => f.id === TIMED_ID)?.status).toBe('postponed')
  })

  it('gives a confirmed or in-progress Fixture no status', () => {
    const fixtures = run().fixtures
    expect(fixtures.find((f) => f.id === TIMED_ID)).not.toHaveProperty('status')
    expect(fixtures.find((f) => f.id === IN_PLAY_ID)).not.toHaveProperty('status')
    expect(run(editMatch(IN_PLAY_ID, { status: 'PAUSED' })).fixtures.find((f) => f.id === IN_PLAY_ID)).not.toHaveProperty('status')
  })

  it('keeps a rearranged Fixture’s id and Matchweek', () => {
    const before = run().fixtures.find((f) => f.id === TIMED_ID)!
    const season = run(editMatch(TIMED_ID, { utcDate: '2027-05-30T15:00:00Z' }))
    const after = season.fixtures.find((f) => f.id === TIMED_ID)!
    expect(after.id).toBe(before.id)
    expect(after.matchweek).toBe(before.matchweek)
  })

  it('keeps Fixture ids stable when the response order changes', () => {
    const reversed = { ...matches, matches: [...matches.matches].reverse() }
    const ids = (m: MatchesResponse) => new Set(run(m).fixtures.map((f) => f.id))
    expect(ids(reversed)).toEqual(ids(matches))
  })

  it('numbers Matchweeks 1–38 with 10 matches each', () => {
    const season = run()
    const counts = new Map<number, number>()
    for (const m of [...season.results, ...season.fixtures]) counts.set(m.matchweek, (counts.get(m.matchweek) ?? 0) + 1)
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1))
    expect([...counts.values()].every((n) => n === 10)).toBe(true)
  })

  it('fails when computed points disagree with the official standings, naming the team and both totals', () => {
    expect(() => run(matches, editPoints({ 65: 18 }))).toThrow(/Man City \(id 65\): computed 21, official 18/)
  })

  it('passes once the matching Deduction is added, and publishes it', () => {
    const deductions = [{ teamId: 65, points: 3 }]
    expect(run(matches, editPoints({ 65: 18 }), deductions).deductions).toEqual(deductions)
  })

  it('names every team that disagrees', () => {
    expect(() => run(matches, editPoints({ 65: 18, 57: 17 }))).toThrow(/Man City.*\n.*Arsenal \(id 57\): computed 18, official 17/)
  })

  it('rejects a Deduction for a team not in the league', () => {
    expect(() => run(matches, standings, [{ teamId: 1, points: 3 }])).toThrow(/Deduction for unknown team 1/)
  })
})

// The 20 recorded teams, named as The Odds API names them (no FC, "and" for "&").
const TEAMS = standings.standings[0].table.map(({ team }) => ({ id: team.id, oddsName: team.name.replace(/^AFC | A?FC$/, '').replace('&', 'and') }))
// Known Ratings with mean 0, from strongest to weakest.
const KNOWN: Ratings = { teams: Object.fromEntries(TEAMS.map((t, i) => [t.id, 0.57 - i * 0.06])) }
const LAST: Ratings = { teams: Object.fromEntries(TEAMS.map((t, i) => [t.id, i % 2 ? 0.1 : -0.1])), oddsFetchedAt: '2026-10-18T06:00:00.000Z' }
const KICK_OFF = '2026-10-24T14:00:00Z'

// Bookmaker odds from two bookmakers for every pair at home and away from the Known Ratings and a home advantage, each with its own margin.
const oddsFrom = (ratings: Ratings, teams = TEAMS, commenceTime = KICK_OFF, homeAdvantage = DEFAULT_SETTINGS.homeAdvantage): OddsResponse =>
  teams.flatMap((home) =>
    teams
      .filter((away) => away !== home)
      .map((away) => {
        const p = outcomeProbabilities(ratings.teams[home.id] - ratings.teams[away.id] + homeAdvantage)
        const bookmaker = (margin: number) => ({
          key: `book${margin}`,
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: home.oddsName, price: 1 / (p.home * margin) },
                { name: away.oddsName, price: 1 / (p.away * margin) },
                { name: 'Draw', price: 1 / (p.draw * margin) },
              ],
            },
          ],
        })
        return { commence_time: commenceTime, home_team: home.oddsName, away_team: away.oddsName, bookmakers: [bookmaker(1.04), bookmaker(1.07)] }
      }),
  )

describe('update Ratings', () => {
  it('fits Bookmaker odds generated from known Ratings back to those Ratings', () => {
    const ratings = ratingsFrom(oddsFrom(KNOWN))
    for (const t of TEAMS) expect(ratings.teams[t.id]).toBeCloseTo(KNOWN.teams[t.id], 2)
    expect(ratings.oddsFetchedAt).toBe(now.toISOString())
  })

  it('fits with the home advantage from the Forecast settings, not one of its own', () => {
    // Odds priced with a bigger home advantage can only be matched by fitting one, which would recover the Known Ratings.
    const ratings = ratingsFrom(oddsFrom(KNOWN, TEAMS, KICK_OFF, DEFAULT_SETTINGS.homeAdvantage + 0.3))
    expect(ratings).not.toHaveProperty('homeAdvantage')
    expect(Math.max(...TEAMS.map((t) => Math.abs(ratings.teams[t.id] - KNOWN.teams[t.id])))).toBeGreaterThan(0.01)
  })

  it('fits a single Matchweek of Bookmaker odds, where each team plays once', () => {
    // Team i plays team 19 − i, with the even-numbered team at home.
    const index = (name: string) => TEAMS.findIndex((t) => t.oddsName === name)
    const matchweek = oddsFrom(KNOWN).filter((e) => index(e.home_team) + index(e.away_team) === 19 && index(e.home_team) % 2 === 0)
    expect(matchweek).toHaveLength(10)
    const ratings = ratingsFrom(matchweek, LAST)
    for (const e of matchweek) {
      const [home, away] = [e.home_team, e.away_team].map((n) => TEAMS[index(n)].id)
      // One Matchweek pins only each pair's gap, not the Ratings themselves.
      const gap = (r: Ratings) => r.teams[home] - r.teams[away]
      expect(gap(ratings)).toBeCloseTo(gap(KNOWN), 2)
    }
  })

  it('keeps the last good Ratings when there are no Bookmaker odds', () => {
    expect(ratingsFrom(undefined, LAST)).toEqual(LAST)
  })

  it('keeps the last good Ratings, but records the fetch, when there are none', () => {
    expect(ratingsFrom([], LAST)).toEqual({ ...LAST, oddsFetchedAt: now.toISOString() })
  })

  it('falls back to equal Ratings on the very first run', () => {
    const ratings = ratingsFrom()
    expect(Object.keys(ratings.teams)).toHaveLength(20)
    expect(Object.values(ratings.teams).every((r) => r === 0)).toBe(true)
  })

  it('keeps the last Rating of a team absent from the Bookmaker odds', () => {
    const [absent, ...rest] = TEAMS
    const ratings = ratingsFrom(oddsFrom(KNOWN, rest), LAST)
    expect(ratings.teams[absent.id]).toBe(LAST.teams[absent.id])
    expect(ratings.teams[rest[0].id]).not.toBe(LAST.teams[rest[0].id])
  })

  it('ignores matches that have already kicked off', () => {
    expect(ratingsFrom(oddsFrom(KNOWN, TEAMS, '2026-10-19T19:30:00Z'), LAST).teams).toEqual(LAST.teams)
  })

  it('fails on a Bookmaker odds team it cannot match, naming it', () => {
    const odds = oddsFrom(KNOWN, TEAMS.slice(0, 2)).map((e) => ({ ...e, home_team: 'Real Madrid' }))
    expect(() => ratingsFrom(odds)).toThrow(/Real Madrid/)
  })

  it('publishes no raw Bookmaker odds', () => {
    const odds = oddsFrom(KNOWN)
    const published = JSON.stringify(update({ matches, standings, config, deductions: [], now, odds }))
    expect(published).not.toMatch(/bookmaker|h2h|price|book1/i)
    expect(published).not.toContain(String(odds[0].bookmakers[0].markets[0].outcomes[0].price))
  })
})

// Each due Snapshot runs two full Forecasts, so a test that takes two can pass 5 seconds on a busy machine.
describe('update Snapshot', { timeout: 30_000 }, () => {
  const snapshotAt = (iso: string, lastSnapshot?: string, ratings?: Ratings) =>
    update({ matches, standings, config, deductions: [], now: new Date(iso), lastSnapshot, ratings }).snapshot

  it('is not due before the first Snapshot date, even on a Tuesday after 06:00 UTC', () => {
    expect(snapshotAt('2026-10-20T06:00:00Z')).toBeUndefined()
  })

  it('is not due at Tuesday 05:59 UTC', () => {
    expect(snapshotAt('2026-10-27T05:59:59Z')).toBeUndefined()
  })

  it('is due on the first run at or after Tuesday 06:00 UTC', () => {
    expect(snapshotAt('2026-10-27T06:00:00Z')?.date).toBe('2026-10-27T06:00:00.000Z')
    expect(snapshotAt('2026-10-29T14:00:00Z')?.date).toBe('2026-10-29T14:00:00.000Z')
  })

  it('is not due again in the same week', () => {
    expect(snapshotAt('2026-10-27T08:00:00Z', '2026-10-27T06:00:00.000Z')).toBeUndefined()
    expect(snapshotAt('2026-11-03T05:59:59Z', '2026-10-27T06:00:00.000Z')).toBeUndefined()
  })

  it('is due again from the next Tuesday 06:00 UTC', () => {
    expect(snapshotAt('2026-11-03T06:00:00Z', '2026-10-27T06:00:00.000Z')).toBeDefined()
  })

  it('records the Ratings, Forecast settings and seed, and every team’s Baseline and Benchmark Chances', () => {
    const snapshot = snapshotAt('2026-10-27T06:00:00Z', undefined, LAST)!
    expect(snapshot.ratings).toEqual(LAST)
    expect(snapshot.seed).toEqual(expect.any(Number))
    expect(snapshot.settings).toEqual({ ...DEFAULT_SETTINGS, championsLeaguePlaces: 4 })
    for (const chances of [snapshot.baseline, snapshot.benchmark]) {
      expect(Object.keys(chances)).toHaveLength(20)
      const total = Object.values(chances).reduce((sum, c) => sum + c.title, 0)
      expect(total).toBeCloseTo(1)
    }
    expect(snapshot.baseline).not.toEqual(snapshot.benchmark)
  })

  it('gives every team the same Rating for the Benchmark', () => {
    const equal = { ...LAST, teams: Object.fromEntries(TEAMS.map((t) => [t.id, 0])) }
    expect(snapshotAt('2026-10-27T06:00:00Z', undefined, LAST)!.benchmark).toEqual(snapshotAt('2026-10-27T06:00:00Z', undefined, equal)!.baseline)
  })
})
