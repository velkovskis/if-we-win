# A Lock updates the Ratings of the teams in it

_Proposed in #15. Accepted when its follow-up lands._

A Lock means "suppose this happens", so the Forecast learns from it. Before the run, the update moves the Ratings of the teams in Locked Fixtures to their most likely values given those Outcomes: each team's Rating is the centre of a normal prior whose spread is the strength noise, and each Locked Outcome counts through the match model's Outcome probabilities. The run then forces the Locked Outcomes as before. The model already says a Rating is uncertain (that is what the strength noise is), so ignoring a Lock's evidence ignores the model's own doubt. It also makes a Lock agree with the Conditional Chance shown on its Key fixture button. Today they differ by up to 2.4 percentage points on the Premier League, and by up to 0.65 with the update, which is about the level of sampling noise. Teams in no Locked Fixture keep their Ratings, so the same seed still keeps their Shifts clean.

## Considered Options

- **Weighting each simulation** by the probability of the Locked Outcomes given its sampled Ratings. This is exact conditioning within the model, and it agrees with the update to within 1 point while it works. But the effective sample size collapses as Locks pile up: about 2,400 of 20,000 at 50 Locks, 44 at 100 and 1 at 300, where the Chances become noise (Man City's Title Chance came out at 97%). With many long-shot Locks every weight underflows and the Chances are NaN. It also more than doubles the Shift noise on uninvolved teams, needs floating-point tallies summed in a fixed order, and costs up to 60% more run time.
- **Leaving it as it is** and explaining it in the page's wording. This is cheapest, but a Lock then disagrees with the Key fixture button the fan just pressed, and a run of Locks understates what they imply (Liverpool winning their next 10: 22% today against 39% with the update).

## Consequences

- The update keeps each team's prior spread rather than narrowing it, so it understates the certainty that many Locks bring. At 100 Locks it still matched a 400,000-simulation weighted run within that run's noise. Past that there is no ground truth to check it against.
- The update runs a fixed number of steps rather than stopping at a tolerance, so every browser takes the same steps. Nudging the updated Ratings by up to 1e-10 changed no Chance, which suggests last-bit differences between browser engines won't reach the Chances. It took about 20 ms with every Fixture Locked.
- This refines ADR 0001: a Rating is still worked backwards from Bookmaker odds, and Ratings published in a Season are unchanged. The update applies only inside a Scenario's run, and the Baseline and Snapshots never see it.
