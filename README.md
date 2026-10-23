# if-we-win

## Leagues

Each League is one entry in `config/leagues.json`, in the order of the site's League tabs: its code, which names its folder in `data/` and starts its Scenario links (football-data.org's competition code, unless `competition` gives that, as `PD` for LaLiga's `LL`), its name as fans call it (for the tab and header), season, Champions League and Relegation places, tie-break order (`premierLeague`, `headToHeadFirst`, `serieA` or `bundesliga`, described in `src/table.ts`), The Odds API sport key, Bookmaker odds name aliases, first Snapshot date and Deductions. `relegationPlayOffPlace` is optional: the final position whose team plays a play-off to stay up (16 in the Bundesliga), marked in the table but not a Zone. `teamNames` is optional: team id → the name shown, for a team whose football-data.org short name isn't what fans call it (e.g. "Barça"). `homeAdvantage` and `strengthNoise` are optional and default to the Forecast's own; set them only when the backtest shows a League needs its own.

Update runs each League on its own. A League that fails writes nothing and keeps its last good data, the other Leagues still commit and deploy, and the job ends red; the update step's log names each League that failed and why.

## Deductions

When the league takes points off a team, Update fails that League and names the team with both point totals. Add `{ "teamId": <id>, "points": <points taken off> }` to that League's `deductions` in `config/leagues.json` and commit; the next run passes.

## Ratings

Once a day per League, Update fetches that League's Bookmaker odds from The Odds API (key in the `ODDS_API_KEY` Actions secret) and fits the Ratings in its `data/<code>/season.json`. Raw odds are never committed or published. Names match ignoring case, accents and FC/CF. If Update fails because a Bookmaker odds name still matches no team, add `"<Bookmaker odds name>": "<football-data.org name>"` to that League's `oddsAliases` in `config/leagues.json`.
