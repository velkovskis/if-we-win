# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Premier League fans, starting with the maintainer and their friends. They check it on matchdays on a phone, on the sofa or in the pub, often while a match is on. They want to know whether their team can still win the Title, reach the Champions League places or avoid Relegation, and what has to happen for that. They pass Scenarios around as links. They don't sign up, and they get no cookie banner.

## Product Purpose

If We Win is a "what if" explorer for league football. It shows the current table and each team's Chance of each Zone. Fans Lock the Outcomes of remaining Fixtures and watch the Chances Shift against the Baseline. My team and its Key fixtures answer "which results should I hope for?"

Success is personal utility, measured in `docs/success.md` (review in late May 2027):
- at least 50 visitors a week during the run-in;
- $0 a month running cost;
- at most 1 hour of maintenance a month;
- a Scorecard that beats the Benchmark.

## Positioning

Three things carry equal weight, and no forecast site or plain table offers all three together:

- **Play it out yourself.** Lock any Fixture and see every Chance update within about a second.
- **Honest numbers.** Doubt about team strength is added on purpose. Nothing shows 0% or 100% unless it is mathematically settled.
- **Keeping score.** Weekly Snapshots are scored in public against a naive Benchmark at the end of the season.

## Operating Context

- Phone first, used in passing on matchday, often between or during matches.
- Scenarios are shared as URLs between friends, so a shared link must show the sender exactly the same view.
- Data refreshes every 2 hours through GitHub Actions. An "Updated X ago" line and a banner for data older than 24 hours tell fans how fresh it is.
- Terminology is fixed in `CONTEXT.md` (Fixture, Lock, Shift, Chance, Zone, Matchweek and so on). UI copy uses those terms and avoids the words that file rules out.

## Capabilities and Constraints

- Static Svelte 5, Vite and Tailwind 4 site on GitHub Pages. No server and no database. The simulation (20,000 runs) runs in a Web Worker in the browser.
- Premier League only for v1. The league is a parameter in the data.
- Zones are Title, Champions League places (number set per season in `config/season.json`) and Relegation. Badges are Clinched/Eliminated, worded Relegated/Safe for Relegation.
- Chances show as whole percentages, with "<1%" and ">99%" unless settled. Shifts under 1 point are hidden.
- My team is remembered on the device and also kept in the URL.
- Raw Bookmaker odds are never shown or published (The Odds API terms).
- The football-data.org attribution must stay visible.
- Cloudflare Web Analytics only (cookieless).
- Still to build (#14 Launch polish): the "How this works" note, analytics, and a phone-first design pass. Launch target is Sunday 25 October 2026.

## Brand Commitments

- Name: **If We Win**.
- Voice: "mate at the pub". Plain, warm and a bit wry, like a friend who knows the numbers. It uses British football English, with no hype and no betting-site energy. Example: "These numbers are over a day old. Our update hasn't run, so treat them with a pinch of salt."
- Club-neutral: no club's colours or loyalties in the site's identity. Club crests appear only as data.

## Evidence on Hand

- Live data: table, Fixtures, Results and crests from football-data.org; Ratings in `data/season.json`.
- There are no testimonials, visitor numbers or Scorecard results yet. The first Snapshot is 27 October 2026. Don't make any of these up.

## Product Principles

1. **Never claim certainty you don't have.** Uncertainty is a feature, shown honestly.
2. **Instant "what if".** A Lock should feel like flipping a switch, not submitting a form.
3. **Matchday-proof.** It must work one-handed on a phone, readable in bright sunlight and in a dim pub.
4. **The fan's words, not the modeller's.** Use the CONTEXT.md vocabulary and a friendly tone, and keep the maths in the "How this works" note.
5. **Zero upkeep.** Nothing should need an account, a server or the maintainer's attention on a Saturday.

## Accessibility & Inclusion

- Readable in bright outdoor light and in dim pubs, so contrast has to hold up in both.
- No formal standard beyond that has been committed to yet.
