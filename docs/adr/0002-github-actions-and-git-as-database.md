# One scheduled GitHub Actions job, with git as the database

One GitHub Actions workflow runs every 2 hours. It fetches Fixtures and Results from football-data.org, updates Ratings, writes a weekly Snapshot (Tuesday 06:00 UTC) and commits it, then deploys the static site to GitHub Pages. There is no server and no database: Snapshots live as committed JSON, and Scenarios are simulated in the browser. Cloudflare Workers was rejected because its cron runs get 10 ms of CPU, which is too little to simulate a season for a Snapshot. Vercel's free cron runs only once a day. Netlify's deploy credits would run out.

## Consequences

- The repo must be public for free GitHub Pages. The football-data.org key lives in an Actions secret.
- GitHub may disable the schedule after 60 days without repository activity, so the site shows a stale-data banner once its data is more than 24 hours old.
- Moving to Cloudflare Pages (e.g. if the site ever becomes commercial) only changes where the static output is deployed.
