# if-we-win

## Deductions

When the league takes points off a team, Update fails and names the team with both point totals. Add `{ "teamId": <id>, "points": <points taken off> }` to `config/deductions.json` and commit; the next run passes.

## Ratings

Once a day Update fetches Bookmaker odds from The Odds API (key in the `ODDS_API_KEY` Actions secret) and fits the Ratings in `data/season.json`. Raw odds are never committed or published. If Update fails because a Bookmaker odds name matches no team, extend `normalise` in `src/ratings.ts` so the two names agree.
