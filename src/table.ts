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

// ponytail: no head-to-head yet; ticket #6 adds it.
export function table(teams: Team[], results: Result[], deductions: Deduction[]): Row[] {
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
  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.name.localeCompare(b.team.name),
  )
}
