import { describe, expect, it } from 'vitest'
import matches from '../test/recorded/matches.json'
import standings from '../test/recorded/standings.json'
import { update, type Deduction, type MatchesResponse, type StandingsResponse } from './update.ts'

const config = { league: 'PL', season: 2026, championsLeaguePlaces: 4 }
const now = new Date('2026-10-19T20:00:00Z')

const run = (m: MatchesResponse = matches, s: StandingsResponse = standings, deductions: Deduction[] = []) =>
  update({ matches: m, standings: s, config, deductions, now })

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
    expect(run().results).toContainEqual({ id: FINISHED_ID, matchweek: 1, homeTeamId: 57, awayTeamId: 1076, scoreline: { home: 3, away: 0 } })
  })

  it('treats an in-progress match as a Fixture', () => {
    const season = run()
    expect(season.fixtures.map((f) => f.id)).toContain(IN_PLAY_ID)
    expect(season.results.map((r) => r.id)).not.toContain(IN_PLAY_ID)
  })

  it('treats a postponed match as a Fixture that keeps its Matchweek', () => {
    const before = run().fixtures.find((f) => f.id === TIMED_ID)!
    const season = run(editMatch(TIMED_ID, { status: 'POSTPONED' }))
    expect(season.fixtures).toContainEqual(before)
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
