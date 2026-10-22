# if-we-win

## Leagues

Each League is one entry in `config/leagues.json`: its football-data.org competition code (which also names its folder in `data/`), season, Champions League and Relegation places, tie-break order, The Odds API sport key, Bookmaker odds name aliases, first Snapshot date and Deductions. `homeAdvantage` and `strengthNoise` are optional and default to the Forecast's own; set them only when the backtest shows a League needs its own.

Update runs each League on its own. A League that fails writes nothing and keeps its last good data, the other Leagues still commit and deploy, and the job ends red; the update step's log names each League that failed and why.

## Deductions

When the league takes points off a team, Update fails that League and names the team with both point totals. Add `{ "teamId": <id>, "points": <points taken off> }` to that League's `deductions` in `config/leagues.json` and commit; the next run passes.

## Ratings

Once a day per League, Update fetches that League's Bookmaker odds from The Odds API (key in the `ODDS_API_KEY` Actions secret) and fits the Ratings in its `data/<code>/season.json`. Raw odds are never committed or published. If Update fails because a Bookmaker odds name matches no team, add `"<Bookmaker odds name>": "<football-data.org name>"` to that League's `oddsAliases` in `config/leagues.json`.
