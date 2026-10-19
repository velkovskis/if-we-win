# Team Ratings come from Bookmaker odds, not Elo

Once a day we fetch Bookmaker odds for the upcoming Fixtures from The Odds API (free tier) and work backwards to one Rating per team. Those Ratings then price every remaining Fixture. We chose this over our own Elo because the market already reflects injuries, new managers and transfers, and it prices promoted teams from Matchweek 1 without needing years of history. When there are no fresh odds, we keep using the last good Ratings stored in the repo. We publish only Ratings, never the raw odds, because The Odds API's terms ban redistributing their data as a feed.

## Considered Options

- **Elo from Results only**: no outside dependency, but slower to react and less accurate, especially early in the season.
- **Elo plus odds**: the most robust option, but it means building and looking after two systems. Add Elo as a fallback only if The Odds API actually goes away.
