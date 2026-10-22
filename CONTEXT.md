# If We Win

A "what if" explorer for league football. Fans see the current table and each team's Chance of finishing in each Zone, lock the Outcomes of remaining Fixtures, and watch those Chances shift.

## Language

### Matches

**Fixture**:
A league match that has not finished yet, including one in progress or postponed.
_Avoid_: game, upcoming match

**Result**:
A finished league match with its final Scoreline.
_Avoid_: score, final

**Outcome**:
Home win, draw or away win, with no goals attached.
_Avoid_: result (when meaning W/D/L)

**Scoreline**:
The exact goals of a match, e.g. 2-1.
_Avoid_: score, result

**Matchweek**:
One numbered round of a season's Fixtures (1–38 in the Premier League). A rearranged Fixture keeps its Matchweek number.
_Avoid_: gameweek, matchday, round

**Kick-off**:
The scheduled start of a Fixture, which may be TBC; a postponed Fixture has none.
_Avoid_: start time, date

### Table

**Deduction**:
Points taken away from a team by the league.
_Avoid_: penalty, sanction

**Zone**:
A band of final league positions that fans care about: Title, Champions League places or Relegation.
_Avoid_: top 4, bracket

**Title**:
Finishing first.
_Avoid_: winning the league, champions

**Champions League places**:
The final positions that qualify for next season's Champions League. The number is set per season because it changes.
_Avoid_: top 4, top 5, European places

**Relegation**:
Finishing in the bottom three.
_Avoid_: drop zone, going down

**Clinched**:
Certain to finish in a Zone whatever the remaining Outcomes. Being Clinched for Relegation means relegated.
_Avoid_: safe, mathematically certain

**Eliminated**:
Unable to finish in a Zone whatever the remaining Outcomes. Being Eliminated from Relegation means safe.
_Avoid_: out, mathematically impossible

### Scenarios

**Lock**:
A user's chosen Outcome for one Fixture. Its Scoreline is still left to chance.
_Avoid_: pick, prediction, bet

**Scenario**:
The set of Locks a user has made. It can be shared as a link.
_Avoid_: what-if, simulation, save

**Baseline**:
The Scenario with no Locks, i.e. the season as it actually stands.
_Avoid_: reality, default, current odds

**Shift**:
How much a team's Chance of a Zone in the Scenario differs from its Chance in the Baseline. It is shown as an arrow.
_Avoid_: movement, delta, change

**My team**:
The one team a user follows. It is highlighted, and Key fixtures are calculated for it.
_Avoid_: favourite, selected team

**Key fixture**:
A Fixture with a large Swing for My team.
_Avoid_: big game, decisive match

**Swing**:
The gap between My team's Chance of a Zone under a Fixture's best Outcome and under its worst.
_Avoid_: impact, leverage, importance

### Forecasting

**Chance**:
The probability that a team finishes in a Zone, estimated by simulating the rest of the season many times.
_Avoid_: odds, probability, likelihood

**Bookmaker odds**:
A bookmaker's prices for the Outcomes of one match.
_Avoid_: odds (on its own), lines, prices

**Conditional Chance**:
A team's Chance of a Zone counting only the simulations where one Fixture had a given Outcome. Swing is worked out from these.
_Avoid_: what-if odds

**Rating**:
A single number for a team's strength, worked backwards from Bookmaker odds.
_Avoid_: Elo, power ranking, strength

**Snapshot**:
The Baseline Chances, and the Benchmark's, recorded once a week, so they can be scored later.

**Benchmark**:
The forecast the model must beat: the same simulation with every team given the same Rating, so only the current points and the remaining Fixtures matter.
_Avoid_: baseline (that is the Scenario with no Locks)

**Scorecard**:
A season's Snapshots scored against the final table, side by side with the Benchmark's score.
_Avoid_: report, accuracy page
