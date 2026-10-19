---
version: 1
slug: "src-app-svelte"
primary_target: "src/App.svelte"
related_targets: ["index.html"]
---

# Surface brief: the app (src/App.svelte)

Mode: Operate. Whole app, phone first, table first. Fans on matchday ask "where do we stand, and what has to happen?"

Confirmed decisions:
- Phone order: header plate, Scenario band (whenever any Lock is on), stale banner, table, My team + Key fixtures, Matchweek, "How this works", attribution. Desktop: table left, sticky panel right.
- Scenario band: Lock count, My team's lead Chance with its Shift, "Clear all Locks". Shows on arrival from a link.
- Stale banner copy: "These numbers are over a day old. Our update hasn't run, so treat them with a pinch of salt."
- Light and dark themes: the system's setting until the header toggle picks one (remembered in this browser). Numerals ≥7:1, all text ≥4.5:1. Lock targets ≥44px.
- Cloudflare Web Analytics beacon in index.html.
- Unchanged: all behaviour, CONTEXT.md vocabulary, attribution, "Updated X ago", stale banner logic.

## Direction contract

THESIS: The table signed like a British ground: each Zone a block, each Shift an arrow plate, My team a slate plate. Refuses the score-app default of a grey table with green and red text.

OWN-WORLD: Cool white enamel ground; slate enamel plates with a white inner keyline; enamel blue (CL places), signal red (Relegation), gold (Title); green/red Shift plates by good news. A condensed block-letter grotesque on signs and labels, a workhorse sans with tabular numerals for data. Numerals always full ink. Plates only on signs: header, headings, Zone tabs, badges, Shifts, My team row, Scenario band.

STORY: A fan sees where every team stands in one phone screen, Locks a Fixture, and sees what moved without scrolling back, then learns which results to hope for.

FIRST VIEWPORT: Phone 390 wide: slate header plate (name, season, Updated X ago, How this works link); gold Scenario band when Locks are on; the full 20-row table (# · Team · GD · Pts · Title · CL · Rel) with Zone tabs on its left edge and plate column headings; rows that moved on a lit band. Primary action, the Lock buttons, sits directly below, Key fixtures first.

FORM: Stand Signage, position 6 of 7 on the grounded list. seed:defb1e302db52448. Raises: whole table on one screen (high-density web); full-ink numerals (datamatics); Lock rows mirrored about Draw (labanotation); one column grid app-wide (grid specimen); lit band on moved rows (streaming wall). Signature interaction: a Lock lights the moved rows and drops in their Shift plates.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
