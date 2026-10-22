import type { Deduction, Result, Team } from './update.ts'

export type Row = {
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export function table(teams: Team[], results: Result[], deductions: Deduction[], tieBreaks: TieBreaks): Row[] {
  const rows = new Map(
    teams.map((team) => [team.id, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }]),
  )
  const add = (row: Row, scored: number, conceded: number) => {
    row.played++
    row.goalsFor += scored
    row.goalsAgainst += conceded
    row.goalDifference += scored - conceded
    if (scored > conceded) {
      row.won++
      row.points += 3
    } else if (scored === conceded) {
      row.drawn++
      row.points++
    } else {
      row.lost++
    }
  }
  for (const r of results) {
    add(rows.get(r.homeTeamId)!, r.scoreline.home, r.scoreline.away)
    add(rows.get(r.awayTeamId)!, r.scoreline.away, r.scoreline.home)
  }
  for (const d of deductions) rows.get(d.teamId)!.points -= d.points
  const meetings = results.map((r) => ({ home: rows.get(r.homeTeamId)!, away: rows.get(r.awayTeamId)!, homeGoals: r.scoreline.home, awayGoals: r.scoreline.away }))
  // Officially a tie left after head-to-head shares a position; the name just keeps the order stable.
  return rank([...rows.values()], meetings, tieBreaks, (a, b) => a.team.name.localeCompare(b.team.name))
}

// Each League's official order for teams level on points, by name; a League's config names its own.
export type TieBreaks = 'premierLeague'

type Standing = { points: number; goalDifference: number; goalsFor: number }
type Meeting<T> = { home: T; away: T; homeGoals: number; awayGoals: number }

// The Premier League order: points (after Deductions), goal difference, goals scored, then head-to-head points
// and head-to-head away goals in the meetings between all the teams still level; `fallback` settles what is left.
// The Handbook uses head-to-head only when a Zone is at stake, but a tie with no Zone at stake changes no Zone either way.
export function rank<T extends Standing>(teams: T[], meetings: Meeting<T>[], tieBreaks: TieBreaks, fallback: (a: T, b: T) => number): T[] {
  if (tieBreaks !== 'premierLeague') throw new Error(`Unknown tie-break order "${tieBreaks}"`)
  const order = teams.toSorted((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
  for (let start = 0, end = 1; start < order.length; start = end++) {
    const first = order[start]
    while (end < order.length && order[end].points === first.points && order[end].goalDifference === first.goalDifference && order[end].goalsFor === first.goalsFor) end++
    if (end - start === 1) continue
    const level = order.slice(start, end)
    const points = new Map(level.map((t) => [t, 0]))
    const awayGoals = new Map(level.map((t) => [t, 0]))
    for (const m of meetings) {
      if (!points.has(m.home) || !points.has(m.away)) continue
      awayGoals.set(m.away, awayGoals.get(m.away)! + m.awayGoals)
      if (m.homeGoals >= m.awayGoals) points.set(m.home, points.get(m.home)! + (m.homeGoals > m.awayGoals ? 3 : 1))
      if (m.awayGoals >= m.homeGoals) points.set(m.away, points.get(m.away)! + (m.awayGoals > m.homeGoals ? 3 : 1))
    }
    level.sort((a, b) => points.get(b)! - points.get(a)! || awayGoals.get(b)! - awayGoals.get(a)! || fallback(a, b))
    order.splice(start, level.length, ...level)
  }
  return order
}
