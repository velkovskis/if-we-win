import { describe, expect, it } from 'vitest'
import matches from '../test/recorded/matches.json'
import standings from '../test/recorded/standings.json'
import { table } from './table.ts'
import { update, type Result } from './update.ts'

const team = (id: number) => ({ id, name: `T${id}`, crest: '' })
const result = (homeTeamId: number, awayTeamId: number, home: number, away: number): Result => ({
  id: homeTeamId * 100 + awayTeamId,
  matchweek: 1,
  homeTeamId,
  awayTeamId,
  scoreline: { home, away },
})

describe('table', () => {
  it('orders by points, then goal difference, then goals scored', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(1, 2, 2, 0), // 1: 3 pts, +2, 2 scored
      result(3, 4, 3, 1), // 3: 3 pts, +2, 3 scored
      result(4, 2, 1, 0), // 4: 3 pts, -1; 2: 0 pts
    ], [])
    expect(rows.map((r) => r.team.id)).toEqual([3, 1, 4, 2])
    expect(rows[2]).toMatchObject({ played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 3, goalDifference: -1, points: 3 })
  })

  it('settles a tie on points, goal difference and goals scored by head-to-head points', () => {
    const rows = table([1, 2, 3, 4].map(team), [
      result(2, 1, 1, 0), // 2 beat 1
      result(1, 4, 1, 0), // 1: 3 pts, 0, 1 scored
      result(3, 2, 1, 0), // 2: 3 pts, 0, 1 scored
    ], [])
    expect(rows.map((r) => r.team.id)).toEqual([3, 2, 1, 4])
  })

  it('then by head-to-head away goals', () => {
    // Level on points, goal difference, goals scored and head-to-head points; 2 scored 2 away, 1 scored 1.
    const rows = table([1, 2].map(team), [result(1, 2, 2, 2), result(2, 1, 1, 1)], [])
    expect(rows.map((r) => r.team.id)).toEqual([2, 1])
  })

  it('gives each team 1 point for a draw', () => {
    const rows = table([1, 2].map(team), [result(1, 2, 1, 1)], [])
    expect(rows.map((r) => [r.drawn, r.points])).toEqual([[1, 1], [1, 1]])
  })

  it('takes Deductions off a team’s points and orders by the reduced points', () => {
    const rows = table([1, 2].map(team), [result(1, 2, 1, 0)], [{ teamId: 1, points: 4 }])
    expect(rows.map((r) => [r.team.id, r.points])).toEqual([[2, 0], [1, -1]])
  })

  it('matches the official standings for the recorded season', () => {
    const season = update({ matches, standings, config: { league: 'PL', season: 2026, championsLeaguePlaces: 4, firstSnapshot: '2026-10-27' }, deductions: [], now: new Date('2026-10-19T20:00:00Z') }).season
    const official = standings.standings.find((s) => s.type === 'TOTAL')!.table
    const ours = table(season.teams, season.results, season.deductions)
    expect(ours.map((r) => [r.team.id, r.points, r.goalDifference])).toEqual(
      official.map((r) => [r.team.id, r.points, r.goalDifference]),
    )
  })
})
