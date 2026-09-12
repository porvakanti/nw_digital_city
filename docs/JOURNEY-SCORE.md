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

## The score

> **40% for how far the blueprint itself has got, 35% for anyone actually
> using it, 25% for doing it with AI.**

### Blueprint, 40 points

| | Points | Categories |
| --- | --- | --- |
| Nothing | 0 | 89 |
| Drafted, not live | 10 | 12 |
| Active in one market | 25 | 20 |
| Active in two or more markets | 40 | 24 |

Drafting is the cheap step and is priced that way. Going live is worth more
than writing it, and going live in more than one market is worth more again,
because a blueprint that only works in one place has not been proved.

### Usage, 35 points

| `CBP used` | Points | Categories |
| --- | --- | --- |
| 0 | 0 | 141 |
| 1 | 20 | 2 |
| 2 or more | 35 | 2 |

More than a third of the total, and deliberately so. A blueprint nobody uses
is paperwork. This is the behaviour the whole exercise exists to produce, and
weighting it at 35 says so out loud.

### AI, 25 points

| AI RFPs | Points | Categories |
| --- | --- | --- |
| 0 | 0 | 137 |
| 1 | 15 | 4 |
| 2 or more | 25 | 4 |

**One category reaches 100:** A251 Network Professional Services. Active in
eight markets, used twice, two AI-generated RFPs. It is the only category in
Networks that has done the whole journey.

### The arc, made countable

Blueprint 10 to 25 is **Traditional**: the blueprint exists and works in one
place. Blueprint 40 is **Connected**: one blueprint, several markets. The AI
component is **Smart**. **Autonomous** is above 100 and nobody is there, which
is stated rather than implied.

One definition now drives the narrative, the visuals and the leaderboard.

## Rolling it up: weight by the square root of spend

Two obvious choices both fail, and the failures are worth keeping because
somebody will ask.

**Count every category equally?** Correlation of **−0.46** with portfolio size.
It punishes whoever holds fourteen categories.

**Weight by spend directly?** One big category drowns the rest. Concretely:

> **Fixed** has 12 categories. **Eleven are at zero.** One, D408 at €62.5m, has
> a used blueprint. Weighted by raw spend, Fixed comes **top of all eight
> districts**.

A district that has done nothing on 92% of its estate cannot be the winner.

**So: the square root of spend**, with a floor of €1m so the 89 zero-spend
categories still count. A €75m category weighs about nine times a €1m one, not
seventy-five times. Fixed lands fifth, where eleven of twelve at zero belongs.

| | Equal | **Square root** | Raw spend |
| --- | --- | --- | --- |
| Correlation with portfolio size | −0.46 | **−0.35** | −0.25 |
| Correlation with portfolio spend | +0.04 | **+0.16** | +0.22 |

Neither size nor spend decides the answer. That is the whole requirement.

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
