import { describe, expect, it } from 'vitest'
import plMatches from '../test/recorded/PL/matches.json'
import plStandings from '../test/recorded/PL/standings.json'
import llMatches from '../test/recorded/LL/matches.json'
import llStandings from '../test/recorded/LL/standings.json'
import { table, type TieBreaks } from './table.ts'
import { update, type MatchesResponse, type Result } from './update.ts'

const team = (id: number) => ({ id, name: `T${id}`, crest: '' })
const result = (homeTeamId: number, awayTeamId: number, home: number, away: number): Result => ({
  id: homeTeamId * 100 + awayTeamId,
  matchweek: 1,
  homeTeamId,
  awayTeamId,
  kickoff: '',
  scoreline: { home, away },
})

describe('table', () => {
  it('orders by points, then goal difference, then goals scored', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(1, 2, 2, 0), // 1: 3 pts, +2, 2 scored
      result(3, 4, 3, 1), // 3: 3 pts, +2, 3 scored
      result(4, 2, 1, 0), // 4: 3 pts, -1; 2: 0 pts
    ], [], 'premierLeague')
    expect(rows.map((r) => r.team.id)).toEqual([3, 1, 4, 2])
    expect(rows[2]).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 3 })
  })

  it('settles a tie on points, goal difference and goals scored by head-to-head points', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(2, 1, 1, 0), // 2 beat 1
      result(1, 4, 1, 0), // 1: 3 pts, 0, 1 scored
      result(3, 2, 1, 0), // 2: 3 pts, 0, 1 scored
    ], [], 'premierLeague')
    expect(rows.map((r) => r.team.id)).toEqual([3, 2, 1, 4])
  })

  it('then by head-to-head away goals', () => {
    // Level on points, goal difference, goals scored and head-to-head points; 2 scored 2 away, 1 scored 1.
    const rows = table([1, 2].map(team), [result(1, 2, 2, 2), result(2, 1, 1, 1)], [], 'premierLeague')
    expect(rows.map((r) => r.team.id)).toEqual([2, 1])
  })

  it('settles a tie on points by head-to-head before goal difference in the head-to-head-first order', () => {
    const results = [
      result(2, 1, 1, 0), // 2 beat 1 and drew the return
      result(1, 2, 0, 0),
      result(1, 3, 5, 0), // 1: 4 pts, +4; 2: 4 pts, +1
    ]
    expect(table([1, 2, 3].map(team), results, [], 'premierLeague').map((r) => r.team.id)).toEqual([1, 2, 3])
    expect(table([1, 2, 3].map(team), results, [], 'headToHeadFirst').map((r) => r.team.id)).toEqual([2, 1, 3])
  })

  it('skips head-to-head until the teams level on points have played each other home and away, in the head-to-head-first order', () => {
    const rows = table([1, 2, 3].map(team), [
      result(2, 1, 1, 0), // 2 beat 1, with the return still to play
      result(1, 3, 5, 0), // 1: 3 pts, +4; 2: 3 pts, +1
    ], [], 'headToHeadFirst')
    expect(rows.map((r) => r.team.id)).toEqual([1, 2, 3])
  })

  it('then by head-to-head goal difference, in the head-to-head-first order', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(1, 2, 3, 0), // each beat the other, 1 by more
      result(2, 1, 1, 0),
      result(2, 3, 9, 0), // 2: 6 pts, +7
      result(4, 1, 0, 1), // 1: 6 pts, +3
    ], [], 'headToHeadFirst')
    expect(rows.map((r) => r.team.id).slice(0, 2)).toEqual([1, 2])
  })

  it('then by goal difference and goals scored, in the head-to-head-first order', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(1, 3, 2, 0), // 1: 3 pts, +2, 2 scored; 3: −2, 0 scored
      result(2, 4, 3, 1), // 2: 3 pts, +2, 3 scored; 4: −2, 1 scored
    ], [], 'headToHeadFirst')
    expect(rows.map((r) => r.team.id)).toEqual([2, 1, 4, 3])
  })

  it('starts head-to-head again for the teams a three-way tie leaves level, in the head-to-head-first order', () => {
    // 1, 2 and 3 all on 7 points. Among the three, 2 and 3 have 7 head-to-head points and 1 has 3,
    // and 2 has the better head-to-head goal difference (+5 to +1); but between 2 and 3 alone, 3 has 4 points to 1.
    const rows = table([1, 2, 3, 4].map(team), [
      result(2, 1, 3, 0),
      result(1, 2, 0, 3),
      result(3, 1, 1, 0),
      result(1, 3, 1, 0),
      result(3, 2, 1, 0),
      result(2, 3, 0, 0),
      result(1, 4, 1, 0),
      result(4, 1, 0, 0),
    ], [], 'headToHeadFirst')
    expect(rows.map((r) => r.team.id)).toEqual([3, 2, 1, 4])
  })

  it('gives each team 1 point for a draw', () => {
    const rows = table([1, 2].map(team), [result(1, 2, 1, 1)], [], 'premierLeague')
    expect(rows.map((r) => [r.drawn, r.points])).toEqual([[1, 1], [1, 1]])
  })

  it('takes Deductions off a team’s points and orders by the reduced points', () => {
    const rows = table([1, 2].map(team), [result(1, 2, 1, 0)], [{ teamId: 1, points: 4 }], 'premierLeague')
    expect(rows.map((r) => [r.team.id, r.points])).toEqual([[2, 0], [1, -1]])
  })

  // LaLiga's has teams level on points that haven't yet played each other home and away, ranked by goal difference.
  it.each<[string, TieBreaks, MatchesResponse, typeof plStandings]>([
    ['PL', 'premierLeague', plMatches, plStandings],
    ['LL', 'headToHeadFirst', llMatches, llStandings],
  ])('matches the official standings for the recorded %s season', (league, tieBreaks, matches, standings) => {
    const config = { league, name: league, season: 2026, championsLeaguePlaces: 4, relegationPlaces: 3, tieBreaks, oddsSportKey: '', oddsAliases: {}, firstSnapshot: '2026-10-27', deductions: [] }
    const season = update({ matches, standings, config, now: new Date('2026-10-22T20:00:00Z') }).season
    const official = standings.standings.find((s) => s.type === 'TOTAL')!.table
    const ours = table(season.teams, season.results, season.deductions, season.tieBreaks)
    expect(ours.map((r) => [r.team.id, r.points, r.goalDifference])).toEqual(
      official.map((r) => [r.team.id, r.points, r.goalDifference]),
    )
  })
})
