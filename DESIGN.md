---
name: If We Win
description: League football Chances, signed like a British ground.
colors:
  ground: "#f3f5f4"
  surface: "#ffffff"
  ink: "#15202b"
  ink-2: "#3c4a56"
  rule: "#d3dad8"
  plate: "#1e2a36"
  on-plate: "#ffffff"
  sel: "#1e2a36"
  on-sel: "#ffffff"
  lit: "#dde7f3"
  gold: "#e2b33c"
  cl: "#2f5fa8"
  rel: "#b3362c"
  up: "#1f7a4d"
  down: "#b3362c"
typography:
  display:
    fontFamily: "Barlow Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  headline:
    fontFamily: "Barlow Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "0.025em"
  title:
    fontFamily: "Barlow Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  data:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  label:
    fontFamily: "Barlow Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "0.025em"
rounded:
  tag: "3px"
  control: "6px"
  plate: "8px"
spacing:
  gap-tight: "6px"
  gutter: "12px"
  section: "24px"
  panel-gap: "32px"
components:
  plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.plate}"
    padding: "12px 16px"
  lock-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "44px"
  lock-button-selected:
    backgroundColor: "{colors.sel}"
    textColor: "{colors.on-sel}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "44px"
  zone-tab-selected-cl:
    backgroundColor: "{colors.cl}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "36px"
  scenario-band:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  shift-plate-up:
    backgroundColor: "{colors.up}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.tag}"
    padding: "2px 4px"
  shift-plate-down:
    backgroundColor: "{colors.down}"
    textColor: "{colors.on-plate}"
    rounded: "{rounded.tag}"
    padding: "2px 4px"
  column-heading:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.on-plate}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 6px"
---

# Design System: If We Win

## Overview

**Creative North Star: "Stand Signage"**

The table is signed like a British football ground. Signs are enamel plates: slate, rounded, with a thin white keyline set just inside the edge. Everything that names or marks something (the header, section headings, column headings, badges, Shifts, My team) is a plate; everything that is data (positions, points, Chances) sits on a cool white enamel ground in full ink. Zones are coloured the way a ground colours its stands: gold for the Title, enamel blue for Champions League places, signal red for Relegation.

Density is high on purpose. On a 390px phone the whole 20-row table (# · Team · GD · Pts · Title · CL · Rel) fits beneath the header, with Zone tabs on its left edge. Wide screens add P/W/D/L columns and put My team and the Matchweek in a sticky side panel, so a Lock and the Shifts it causes are seen together. The one authored motion is the signature: a Lock lights the rows that moved and drops their Shift plates in.

The system refuses the score-app default of a grey table with green and red text: colour lives on plates and Zone tabs, never on the numerals themselves.

**Key Characteristics:**
- Slate enamel plates with an inset white keyline for every sign; data stays off plates.
- Zone colours as sign colours: gold, enamel blue, signal red.
- Condensed block-letter capitals (Barlow Condensed) for signs; system sans with tabular numerals for data.
- Numerals always full ink.
- Moved rows sit on a pale lit band; My team is a selected plate row.
- Light and dark themes from the same tokens; in the dark the selected plate inverts to white enamel. The theme follows the system until the header toggle picks one, which this browser then remembers.

## Colors

A cool, nearly neutral enamel palette carrying three saturated Zone colours and two Shift colours.

### Primary
- **Slate Enamel** (plate): the sign plate. Header, section headings, column headings, badges. Dark theme lifts it to #24384c so it reads against the darker ground.
- **Enamel White** (on-plate): plate lettering and the keyline.

### Secondary
- **Stand Gold** (gold): the Title Zone tab, the Scenario band, and text selection. Always takes dark ink (#15202b), in both themes.
- **Enamel Blue** (cl): Champions League places, the focus ring, and native control accent. Dark theme: #5b8fe0, with dark ink on fills.
- **Signal Red** (rel): Relegation. Dark theme: #e0574b, with dark ink on fills.

### Tertiary
- **Good-News Green** (up) and **Bad-News Red** (down): Shift plates only. Colour follows the news for the team, not the arrow direction: a rising Relegation Chance is red. Both keep white numerals in both themes; down does not follow rel into the dark shade.

### Neutral
- **Enamel Ground** (ground): page background. Dark: #0f161d. Also the `theme-color` meta.
- **Enamel Surface** (surface): Lock buttons, select, unselected tabs, the How this works sheet. Dark: #17212b.
- **Ink** (ink): all text and every numeral. Dark: #f1f4f3.
- **Second Ink** (ink-2): legends, helper lines, footer. Dark: #b9c5ca. Never on numerals.
- **Rule** (rule): row dividers, control borders, scrollbar. Dark: #2a3742.
- **Lit Band** (lit): background of rows a Lock moved. Dark: #1c3352.
- **Selected Plate** (sel / on-sel): My team row, selected Lock buttons and the current League tab. Slate with white in light; inverts to #eef2f1 with #15202b in dark.

### Named Rules
**The Full Ink Rule.** Numerals are always ink (or on-sel in the My team row). Good and bad news is carried by a Shift plate beside the number, never by colouring the number.

**The Sign Colour Rule.** Gold, blue and red mean Title, Champions League places and Relegation, everywhere: Zone tabs, the table's left-edge Zone marks, the legend, the Key fixtures tabs. Gold also marks a Scenario. No other meaning may borrow them. The one neighbour allowed is the Relegation play-off place, in Leagues that have one: a hollow red bar, next to Relegation but not part of it, in the table and the legend only.

**The Good News Rule.** A Shift plate is green when the change is good for the team and red when it is bad; Relegation inverts the arrow's meaning.

## Typography

**Display Font:** Barlow Condensed 600/700, self-hosted, latin subset (with ui-sans-serif, system-ui)
**Body Font:** the platform sans (ui-sans-serif, system-ui)

**Character:** Barlow Condensed is the sign-letter voice: uppercase, bold, slightly tracked, as painted on a stand. The platform sans is the workhorse for data and prose, set with tabular numerals so columns align.

### Hierarchy
- **Display** (700, 1.75rem, line-height 1, 0.04em, uppercase): the app name on the header plate only.
- **Headline** (700, 1.125rem, 0.025em, uppercase): plate headings: My team, Matchweek N, How this works.
- **Title** (700, 1rem, 0.025em, uppercase): off-plate subheadings (Key fixtures) and the Scenario band's title line.
- **Body** (400, 0.875rem, line-height 1.625): explanatory prose, capped at `max-w-prose`.
- **Data** (400, 13px phone / 14px from 640px, tabular-nums): the table. Team names 600, points 700.
- **Label** (700, 0.75rem, 0.025em, uppercase): column headings; zone badges use 11px.

### Named Rules
**The Sign Letter Rule.** Barlow Condensed appears only in uppercase on signs and headings. It is never used for numerals in data or for running text.

**The Tabular Rule.** Every number that can sit in a column uses tabular figures.

## Layout

One column on phones inside a 42rem max width with 12px gutters; from 1024px a two-column grid (fluid table, 22rem panel, 32px gap) inside 64rem, 24px gutters. There the table's column headings sit on a plate the height of the panel's My team plate, so both columns open on the same sign, and the panel is exactly as tall as the table and scrolls on its own, so both columns start and end together. Its foot fades out while there's more to scroll. How this works is a sheet over the page (see Components). The Scenario band is sticky at the top while Locks are on. Vertical rhythm: 8–12px between a plate and its content, 24px between sections, 6px between Lock rows. Breakpoints in use: 640px (adds P/W/D/L, larger crests and Shift plates) and 1024px (side panel).

Lock buttons sit in a three-column grid (1fr · 4.5rem · 1fr), mirrored about Draw: home left-aligned, Draw centred, away right-aligned. Above each row, the Fixture's Kick-off in 12px ink, in the viewer's own locale and time zone: the date with "TBC" when the time is unconfirmed, "Postponed" (sorted last in its Matchweek) when the date no longer holds.

**Known trade-off.** On a phone during a Scenario, Chance cells carrying Shift plates widen and long team names truncate with an ellipsis. Accepted by the user as shipped; do not treat it as a rule or as something future surfaces must reproduce.

## Elevation & Depth

Flat. Depth comes from the plate's inset keyline and from tonal contrast between ground, surface and plate, not from shadows. The single exception is the sticky Scenario band, which carries a soft ambient shadow so it reads as floating over the table while scrolling.

### Shadow Vocabulary
- **Plate keyline** (`box-shadow: inset 0 0 0 2px var(--plate), inset 0 0 0 3.5px var(--on-plate)`): the enamel sign's white keyline. Selected plates use the same shape with sel / on-sel.
- **Sticky lift** (`box-shadow: 0 2px 8px rgb(0 0 0 / 0.18)`): the Scenario band only.

### Named Rules
**The Keyline Rule.** Large plates (header, section headings, the How this works sheet's heading) carry the inset keyline. Small tags (column headings, badges, Shift plates) are plain fills; the keyline would not read at that size.

## Shapes

Three radii. Plates 8px. Controls (Lock buttons, tabs, select, Scenario band) 6px. Tags (column headings, badges, Shift plates) 3px. Zone marks are 6px-wide rounded bars (2px radius), 24px tall in the table, 12px in legends and tabs. The Relegation play-off place's mark is the same bar, hollow, with a 1.5px rel border. Borders are 1px rule; hover darkens a control's border to ink-2. Icons are inline SVG: solid triangles in Shift plates, 2.5px-stroke chevrons for Matchweek and disclosure.

## Components

### Plate
The sign. Slate fill, white lettering, 8px corners, inset white keyline. Used for the header (name, league and season, Updated X ago, How this works), section headings, and the How this works sheet's heading.

### Lock buttons
Tactile and plain until chosen. Surface fill, 1px rule border, 6px corners, min-height 44px, 14px semibold. Hover: border to ink-2, 150ms colour transition. Pressed (`aria-pressed`): becomes a selected plate (sel fill, on-sel text, keyline). Under Key fixtures each button adds My team's Chance for that Outcome on a second bold tabular line.

### League tabs
A row under the header, one per League in config order. Each is a small sign: Barlow uppercase 16px, 6px corners, min-height 44px, 6px apart. Unselected: surface fill, rule border, hover border to ink-2. The current League is a selected plate (`aria-current`). On a narrow phone the row scrolls sideways in its own edge-to-edge strip; the page never does.

### Zone tabs
Key fixtures tabs. Unselected: surface fill, rule border, a Zone-colour bar. Selected: filled with the Zone colour, border transparent, the bar turns current colour. Min-height 36px, 12px semibold.

### Shift plate
The signature. A small arrow plate after a Chance: green or red by the Good News Rule, solid triangle plus whole points, 10px bold on phones and 11px from 640px, 3px corners. Drops in on appearance (`translateY(-5px)` and 0.3 opacity to rest, 260ms, `cubic-bezier(0.16, 1, 0.3, 1)`); no animation under reduced motion.

### Table rows
Rule dividers, Zone bar on the left edge. Moved rows take the lit band; My team takes the selected plate fill with semibold text. Row background transitions over 300ms. Clinched or eliminated Chances add a small plate badge (Title won, Qualified, Relegated, Safe, Eliminated).

### Scenario band
Gold, sticky, dark ink. Title line in sign letters ("Scenario · N Locks"), My team's Chance and Shift below, and a dark-ink "Clear all Locks" button.

### How this works sheet
A native modal `<dialog>`, opened from the header link or the footer link, so it opens over the table and closes back to the same spot. Phones: a sheet from the foot of the screen, at most 85% of the screen tall, 8px top corners, scrolls inside. From 1024px: centred, max 36rem. Surface fill, rule border, 50% black backdrop; Esc, the 44px close button or a tap on the backdrop closes it. A sticky slate plate heading, then five questions as Title-style terms (Barlow, uppercase, 20px above each) with plain body answers below. The copy avoids capitalised model terms except "Lock", which it introduces.

### Select (My team)
Surface fill, rule border, 6px corners, 40px tall, set inside the My team heading plate.

## Do's and Don'ts

### Do:
- **Do** sign with plates: slate, 8px, inset white keyline (2px plate, 3.5px on-plate).
- **Do** keep every numeral in full ink with tabular figures.
- **Do** use gold, blue and red only for Title, Champions League places and Relegation (and gold for a Scenario).
- **Do** colour a Shift by good or bad news for the team, not by arrow direction.
- **Do** put dark ink (#15202b) on gold in both themes.
- **Do** let a Lock light the moved rows and drop in their Shift plates; keep it the one authored motion and honour reduced motion.

### Don't:
- **Don't** colour numerals green or red; that is the score-app default this system refuses.
- **Don't** put data on plates, apart from selected things (the My team row, a chosen Lock).
- **Don't** set running text or data numerals in Barlow Condensed.
- **Don't** add shadows beyond the plate keyline and the sticky Scenario band.
- **Don't** give Zone colours any second meaning.
