# if-we-win

## Deductions

When the league takes points off a team, Update fails and names the team with both point totals. Add `{ "teamId": <id>, "points": <points taken off> }` to `config/deductions.json` and commit; the next run passes.
