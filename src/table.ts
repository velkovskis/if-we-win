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
export type TieBreaks = 'premierLeague' | 'headToHeadFirst'

type Standing = { points: number; goalDifference: number; goalsFor: number }
type Meeting<T> = { home: T; away: T; homeGoals: number; awayGoals: number }

// premierLeague: points (after Deductions), goal difference, goals scored, then head-to-head points and head-to-head
// away goals in the meetings between all the teams still level. The Handbook uses head-to-head only when a Zone is at
// stake, but a tie with no Zone at stake changes no Zone either way.
// headToHeadFirst (LaLiga, RFEF Bases de Competición 2026-27 art. 10): points, then head-to-head points in the meetings
// between the teams level on points, started again for any teams those leave level; then head-to-head goal difference,
// goal difference and goals scored. As in the official table, head-to-head counts only once the level teams have all
// played each other home and away, which is always so by the end of the season.
// Either way `fallback` settles what is left.
export function rank<T extends Standing>(teams: T[], meetings: Meeting<T>[], tieBreaks: TieBreaks, fallback: (a: T, b: T) => number): T[] {
  if (tieBreaks === 'premierLeague') {
    const overall = (a: T, b: T) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
    return settle(teams.toSorted(overall), overall, (level) => {
      const { stats } = headToHead(level, meetings)
      return level.toSorted((a, b) => stats.get(b)!.points - stats.get(a)!.points || stats.get(b)!.awayGoals - stats.get(a)!.awayGoals || fallback(a, b))
    })
  }
  if (tieBreaks === 'headToHeadFirst') {
    const byHeadToHead = (level: T[]): T[] => {
      const { stats, played } = headToHead(level, meetings)
      const complete = played === level.length * (level.length - 1)
      const points = (a: T, b: T) => stats.get(b)!.points - stats.get(a)!.points
      if (complete && level.some((t) => points(t, level[0]))) return settle(level.toSorted(points), points, byHeadToHead)
      const goalDifference = (a: T, b: T) => (complete ? stats.get(b)!.goalDifference - stats.get(a)!.goalDifference : 0)
      return level.toSorted((a, b) => goalDifference(a, b) || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || fallback(a, b))
    }
    const points = (a: T, b: T) => b.points - a.points
    return settle(teams.toSorted(points), points, byHeadToHead)
  }
  throw new Error(`Unknown tie-break order "${tieBreaks}"`)
}

// Replaces each run of teams in `order` that `compare` finds level with `settleLevel(run)`.
function settle<T>(order: T[], compare: (a: T, b: T) => number, settleLevel: (level: T[]) => T[]): T[] {
  const settled: T[] = []
  for (let start = 0, end = 1; start < order.length; start = end++) {
    while (end < order.length && !compare(order[start], order[end])) end++
    settled.push(...(end - start > 1 ? settleLevel(order.slice(start, end)) : [order[start]]))
  }
  return settled
}

// ponytail: scans every meeting for each tie, about 1.7× the Forecast's run time under headToHeadFirst (ties on points alone
// are common); index the meetings by team if Forecasts get slow.
// Each team's points, goal difference and away goals in the meetings between the teams in `level` only,
// and how many of those meetings there were.
function headToHead<T>(level: T[], meetings: Meeting<T>[]) {
  const stats = new Map(level.map((t) => [t, { points: 0, goalDifference: 0, awayGoals: 0 }]))
  let played = 0
  for (const m of meetings) {
    const [home, away] = [stats.get(m.home), stats.get(m.away)]
    if (!home || !away) continue
    played++
    home.goalDifference += m.homeGoals - m.awayGoals
    away.goalDifference += m.awayGoals - m.homeGoals
    away.awayGoals += m.awayGoals
    if (m.homeGoals >= m.awayGoals) home.points += m.homeGoals > m.awayGoals ? 3 : 1
    if (m.awayGoals >= m.homeGoals) away.points += m.awayGoals > m.homeGoals ? 3 : 1
  }
  return { stats, played }
}
