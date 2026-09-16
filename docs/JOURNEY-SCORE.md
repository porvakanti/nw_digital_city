# The journey score

A single 0 to 100 figure for a category, a district, a category manager or
the whole organisation. Designed to be explainable in one sentence and to
withstand challenge.

Computed by `data/build_city.py` from the current per-category extract joined
to the category manager column in the taxonomy workbook. Every threshold and
weight is declared in `config/metrics.yaml`.

---

## Why usage and AI are separate components

An earlier design folded "blueprint has been used" and "AI RFP started" into a
single top rung of one ladder. Two problems with that.

**They are not sequential.** From the data:

| | Categories |
| --- | --- |
| Blueprint used | A213, A251, D408, D506 |
| AI RFP started | A212, A213, A251, A314, D303, D333, D506, D513 |
| Both | A213, A251, D506 |
| Used but no AI | D408 |
| AI but never used | A212, A314, D303, D333, D513 |

Five categories have started an AI RFP without ever using their blueprint. A
single ladder cannot represent that, because it assumes one comes after the
other.

**And it threw away the magnitude.** `CBP used` runs 0 to 3. A blueprint used
three times scored exactly the same as one used once. Since getting blueprints
used is the entire point of writing them, that was the wrong thing to discard.

---

## Stage 1: the score for one category

> **40 points for how far the blueprint itself has got, 35 for anyone
> actually using it, 25 for doing it with AI.**

Three components, scored independently and added. Each is a fixed rung: there
is no partial credit between rungs and no interpolation.

```
category total = blueprint + usage + AI

                 where each term is the points of the rung the
                 category's own measure falls on
```

### Step 1: blueprint, 40 points

Read from the blueprint records held for the category.

| Rung | Condition | Points | Categories |
| --- | --- | --- | --- |
| Nothing | no record of any kind | 0 | 89 |
| Drafted | a draft exists, none active | 10 | 12 |
| Live | one active record | 25 | 23 |
| Connected | active, and two or more records | 40 | 21 |

The condition on the top rung counts blueprint *records*, not markets.
Adoption is defined as one blueprint per category per market, so the two
figures agree for 143 of the 145 categories; D403 holds 3 records across 2
markets and D212 holds 2 records across 3.

Drafting is the cheap step and is priced as one. Going live is worth more than
writing it, and going live more than once is worth more again, because a
blueprint that has only ever been applied in one place has not been proved.

### Step 2: usage, 35 points

Read from `cbp_used`, the count of sourcing events run through the blueprint.

| Rung | `cbp_used` | Points | Categories |
| --- | --- | --- | --- |
| Never used | 0 | 0 | 141 |
| Used once | 1 | 20 | 2 |
| Used repeatedly | 2 or more | 35 | 2 |

More than a third of the total, deliberately. A blueprint nobody uses is
paperwork. This is the behaviour the exercise exists to produce, and weighting
it at 35 states that rather than implying it.

### Step 3: AI, 25 points

Read from `ai_rfps`, the count of requests for proposal generated from the
category's own rules.

| Rung | `ai_rfps` | Points | Categories |
| --- | --- | --- | --- |
| None | 0 | 0 | 137 |
| Started | 1 | 15 | 4 |
| Several | 2 or more | 25 | 4 |

### Step 4: add the three

| Category | Blueprint | Usage | AI | Total |
| --- | --- | --- | --- | --- |
| A251 Network Professional Services | 40 | 35 | 25 | **100** |
| A213 Global Testing | 40 | 20 | 25 | **85** |
| D506 Construction Services/Civil Works | 40 | 20 | 15 | **75** |
| A314 Access Transmission Services | 25 | 0 | 25 | **50** |
| D504 Batteries | 40 | 0 | 0 | **40** |
| A311 Field Maintenance | 0 | 0 | 0 | **0** |

**A251 is the only category at 100.** Active in 8 markets, used twice, two
generated RFPs. It is the only category in Networks that has completed every
stage the data can record.

### Why the components are independent rather than sequential

A single ladder would require each stage to precede the next. The data refutes
that ordering: **five categories have started a generated RFP without ever
using their blueprint**, and one has used its blueprint with no AI activity at
all. A251 above is the only category where all three happen together.

Scoring them independently means a category is credited for what it has
actually done, in whatever order it did it.

### Where a category total can land

Four blueprint rungs by three usage rungs by three AI rungs gives 36
combinations and **18 distinct totals**. Eleven occur in the current extract:

| Total | 0 | 10 | 25 | 40 | 50 | 55 | 60 | 65 | 75 | 85 | 100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Categories | 89 | 12 | 20 | 16 | 1 | 2 | 1 | 1 | 1 | 1 | 1 |

This matters for reading the interface: **a category total is always one of
those eighteen values.** A figure such as 23 or 28 cannot be a category.

---

## Stage 2: the score for a district, a manager or the organisation

A group holds no blueprint of its own, so its score is a weighted average of
the scores of the categories in it. The weight is the square root of spend,
floored at €1m.

```
                  Σ ( category total  ×  √( max(spend, €1m) ) )
group score  =   ───────────────────────────────────────────────
                        Σ √( max(spend, €1m) )
```

The same expression is applied separately to each component, so a group carries
a blueprint, usage and AI figure as well as a total.

Note the order of operations in the denominator: **the square root is taken per
category and the results are summed.** Rooting the sum instead would rescale
the total and leave every category's relative weight exactly as raw spend,
which is the behaviour the transform exists to avoid.

### Step 1: convert each category's spend into a weight

Floor the spend at €1m, then take the square root.

### Step 2: multiply each category's score by its weight, and sum

### Step 3: divide by the sum of the weights

### Worked example: Transmission Infrastructure

Ten categories, €105.2m.

| Code | Spend | Floored | Weight = √ | Weight share | Total | Score × weight |
| --- | --- | --- | --- | --- | --- | --- |
| D409 | 44,045,408 | 44,045,408 | 6,636.67 | 24.8% | 25 | 165,916.79 |
| D208 | 29,600,000 | 29,600,000 | 5,440.59 | 20.3% | 25 | 136,014.71 |
| A259 | 12,157,340 | 12,157,340 | 3,486.74 | 13.0% | 40 | 139,469.51 |
| A313 | 12,157,340 | 12,157,340 | 3,486.74 | 13.0% | 0 | 0.00 |
| D414 | 7,230,657 | 7,230,657 | 2,688.99 | 10.1% | 40 | 107,559.52 |
| A314 | 19,643 | **1,000,000** | 1,000.00 | 3.7% | 50 | 50,000.00 |
| A260 | 0 | **1,000,000** | 1,000.00 | 3.7% | 0 | 0.00 |
| D206 | 0 | **1,000,000** | 1,000.00 | 3.7% | 0 | 0.00 |
| D422 | 0 | **1,000,000** | 1,000.00 | 3.7% | 25 | 25,000.00 |
| D423 | 0 | **1,000,000** | 1,000.00 | 3.7% | 0 | 0.00 |
| | | | **26,739.72** | 100% | | **623,960.52** |

```
623,960.52 / 26,739.72 = 23.335   ->   23.3
```

A313 is the row that shows what the weighting does. It has the same spend as
A259 and therefore the same weight, and contributes nothing, because it has no
blueprint. Weight decides how loudly a category speaks; the score decides what
it says.

Weighting every category equally would give this district 20.5, the plain mean
of its ten totals. It reaches 23.3 because the four categories with real spend
behind them are also the ones holding blueprints.

### Why the square root

Two simpler choices both fail, and the failures are recorded because they will
be asked about.

**Count every category equally.** Correlation of **−0.42** with portfolio size
across the 30 qualifying managers: it penalises whoever holds the most
categories.

**Weight by spend directly.** One large category carries a group that has done
nothing on the rest of it:

> **Fixed** holds 12 categories. **Eleven score zero.** The twelfth, D408 at
> €62.5m, is 71% of the district's spend and scores 60. Weighted by raw spend,
> Fixed rises to **2nd of the eight districts**.

A district that has done nothing on eleven of twelve cannot rank second.

**The square root sits between them.** A €75m category weighs about nine times
a €1m one rather than seventy-five times. Fixed lands **4th**, which is where
eleven of twelve at zero belongs.

| | Equal | **Square root** | Raw spend |
| --- | --- | --- | --- |
| Correlation with portfolio size | −0.42 | **−0.37** | −0.31 |
| Correlation with portfolio spend | +0.05 | **+0.15** | +0.20 |

Neither the size of a portfolio nor its spend decides the answer. That is the
requirement.

### Why the floor

A weight of zero is not a small weight. It removes the category from both the
numerator and the denominator, so the group score describes only the categories
that happen to have a spend figure recorded.

**89 of the 145 categories have no recorded spend, and 20 of those hold a
blueprint**, scoring 10, 25, 40 and in one case 85. Without the floor all 89
would be discarded. Transmission Infrastructure would read 25.4 instead of
23.3, computed from six categories while describing ten.

The floor does a second job that is less obvious. It compresses the bottom of
the distribution:

| | Weight without floor | Weight with floor |
| --- | --- | --- |
| D409, €44.0m | 6,636.67 | 6,636.67 |
| A314, €19,643 | 140.15 | **1,000.00** |

Unfloored, D409 outweighs A314 by 47 times; floored, by 6.6. The floor asserts
that below €1m spend is no longer a meaningful measure of how much a category
matters, and that €19,643 and €0 are the same fact. Without it A314 would count
for almost nothing, and A314 carries the entire AI component of its district:
0.9 of its 23.3.

### Consequence: a group score is not a rung

Stage 1 produces one of eighteen values. Stage 2 produces a weighted average of
them, which lands anywhere.

**This is why Access Radio/Fixed scores 28.0 and no category within it scores
28.** The same applies to every district, every manager and the organisation's
19.4. A score that is not a round figure is a group; a score that is one of the
eighteen is a category.

### Where each value is declared

| Value | Declared in | Current |
| --- | --- | --- |
| Component weights | `score.weights` | 40 / 35 / 25 |
| Blueprint rungs | `score.blueprint` | 0 / 10 / 25 / 40 |
| Usage rungs | `score.usage` | 0 / 20 / 35 |
| AI rungs | `score.ai` | 0 / 15 / 25 |
| Measure the weight is taken from | `score.rollup.weight_by` | `spend_eur` |
| Transform applied to it | `score.rollup.transform` | `sqrt` |
| Floor applied before the transform | `score.rollup.floor_eur` | 1,000,000 |
| Minimum portfolio to appear on the manager board | `score.minimum_categories` | 3 |

All of it is in `config/metrics.yaml`. Changing any line changes the
scoreboard, the building heights, the arc and the monuments at the next build,
with no code change.

### The arc

The four stages on the rail are bands of the total, declared in
`score.stages`:

| Stage | From | Meaning |
| --- | --- | --- |
| Traditional | 0 | Short of a blueprint live in more than one place. Nothing in this band has ever been used: one use is worth 20 and would carry all but the emptiest category out of it. |
| Connected | 40 | The rules are written and live in several places, and nothing more. Every mark available for writing things down, none for acting on it. |
| Smart | 54 | The blueprint plus something real on top: a sourcing event run through it, worth 20, or a generated brief, worth 15. |
| Autonomous | 75 | Written, in repeated use, and generating its own briefs, on the same category. |

A251 at 100 is in Autonomous. The organisation at 19.4 is in Traditional, near
the start of it.

---

## What it says

**Networks scores 19 out of 100.** The split is the story:

| | Score | Out of | In plain terms |
| --- | --- | --- | --- |
| Blueprint | **16** | 40 | 40% of the way through writing them |
| Usage | **2** | 35 | **5% of the way through using them** |
| AI | **2** | 25 | 7% |

> We are 40% of the way through writing the blueprints and 5% of the way
> through using them.

That single line is worth more than any picture in this project.

### By district

| District | Score | Blueprint | Usage | AI | At zero |
| --- | --- | --- | --- | --- | --- |
| Access Radio/Fixed | 28 | 18 | 4 | 6 | 20 of 37 |
| Transmission Infrastructure | 23 | 22 | 0 | 1 | 4 of 10 |
| Energy | 22 | 21 | 0 | 2 | 11 of 18 |
| Fixed | 20 | 13 | 7 | 0 | 11 of 12 |
| Managed Services and Outsourcing | 19 | 18 | 1 | 1 | 4 of 10 |
| Leased Lines | 13 | 13 | 0 | 0 | 12 of 16 |
| Software and Core | 12 | 12 | 0 | 0 | 18 of 25 |
| Network Revenue Platforms | 9 | 8 | 0 | 1 | 9 of 17 |

No minimum needed, nobody named, defensible in public. Note that five of the
eight districts have **zero** on usage, which is the finding.

### By manager

30 of 38 qualify at a three-category minimum. Median 19, top 61.

| | Categories | Total | Blueprint | Usage | AI |
| --- | --- | --- | --- | --- | --- |
| 1st | 3 | 61 | 28 | 19 | 14 |
| 2nd | 3 | 50 | 32 | 0 | 18 |
| 3rd | 4 | 36 | 36 | 0 | 0 |
| 6th | 4 | 33 | 33 | 0 | 0 |
| 9th | 15 | 23 | 22 | 0 | 2 |
| 30th | 11 | 0 | 0 | 0 | 0 |

**Always show the three components, never just the total.** The leader is
first because they are the only one with real usage, and that is visible in
the split and invisible in the total.

Four surfaces carry a score, and all four carry the split: the arc across the
top of the screen, the scoreboard, the agent's answers, and the title deed for
one category. The deed was the last to get it. It printed the total in
brackets after the building name, which cannot distinguish a category that has
written its blueprint and never used it from one that has done the reverse,
and those two sit at the same number. The deed and the scoreboard draw the bar
and name the components from the same two functions, so they cannot disagree
about one category.

## How to use it

Asked for from the question box: "who is doing best" opens the People board,
"which district is doing best" opens Districts, and both name the leader with
the three components rather than the total alone.

**Public, by district.** No minimum, no names, defensible. This is the
version suitable for wider circulation.

**Private, by manager.** A good conversation with a team and a good way to find
who to learn from. Not a slide.

**If it goes public by manager**, three conditions:

1. **Minimum three categories.** One category and one blueprint is a coin toss,
   not a track record.
2. **Show blueprint, usage and AI separately.** A total with no workings invites an
   argument the total cannot answer.
3. **Call it journey progress, not performance.** Nobody chose their portfolio.

## What it still cannot do

**It tilts against big portfolios at −0.35.** Better than −0.46, not zero.

**Nobody picked their own categories.** Twelve inherited categories with no
history is not a decision anyone made.

**Seven of the 30 qualifying managers score zero** and would appear at zero on
any public board. One of them holds eleven categories.

**It measures the record, not the effort.** A blueprint that took six months of
negotiation scores the same as one that took an afternoon.

**It has no time in it.** No source we hold has a date, so it cannot tell a
standing start from a slow decline. That is the same missing column that blocks
the sleeping builders, and it is the most valuable thing anyone could send us.
