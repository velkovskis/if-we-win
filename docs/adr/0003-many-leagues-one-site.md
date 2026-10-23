# Many Leagues on one site, each configured and updated on its own

v2 covers the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 and Eredivisie, the domestic Leagues football-data.org's free tier offers that fans asked for, so running cost stays $0. They live on one site: a switcher (a row of tabs) chooses the League. A Scenario link already starts with its League and season (e.g. `PL2026:`), so links shared before v2 keep working; an empty hash opens the League last viewed, or else the Premier League. Every League has the same three Zones (Title, Champions League places and Relegation). Each League's config sets its season, the sizes of those Zones, its Relegation play-off place if it has one, its tie-break order, team-name aliases for Bookmaker odds, and optionally its own model settings. The scheduled job updates each League on its own: a League that fails (a missing Deduction, an unknown name) keeps its last good data, while the others still commit and deploy, and the job ends red.

## Considered Options

- **A separate site per League, built from the same code**: no switcher, but each site has its own deploy, and fans who follow two Leagues have to visit two sites.
- **A general list of Zones in each League's config**: it could describe play-off and Europa places with config alone, but every v2 League uses the same three Zones, so the code, colours and badges stay fixed and only the sizes change.

## Consequences

- Champions League qualifying-round places count as Champions League places (e.g. Ligue 1's 4th, Eredivisie's 2nd), because that's what fans mean by "getting into the Champions League".
- The Relegation play-off place (16th in the Bundesliga, Ligue 1 and Eredivisie) is not a Zone and gets no Chance column, badges or Key fixtures, only a stripe in the table and its own legend entry. Counting it as Relegation would overstate the risk, and a fourth column doesn't fit on a phone. It can become a Zone with a small code change if fans ask for it.
- Europa League and Conference League places are not Zones in v2.
- The Champions League itself is a separate feature. Nothing in v2 is built for its league phase or knockouts.
- Leagues are added one per PR, starting with LaLiga, and each League's tie-break order and Zones are checked against its official regulations.
- `docs/success.md` is unchanged and still judged on the Premier League alone.
