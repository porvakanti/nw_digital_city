# The journey score

One number per category, manager, district or the whole of Networks. Built to
be explained in a sentence and to survive being argued with.

Computed from Tomas's 9 September extract joined to the category manager
column in the original workbook.

---

## Why the first version was wrong

The first draft folded "blueprint has been used" and "AI RFP started" into a
single top rung. Two things were wrong with that.

**They are not sequential.** Checked against the data:

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

> **A base score for how far the blueprint itself has got, plus a bonus for
> actually using it, plus a smaller bonus for doing it with AI.**

### Base: has the blueprint been written and made live (0 to 60)

| | Points | Categories |
| --- | --- | --- |
| Nothing | 0 | 89 |
| Drafted, not live | 20 | 12 |
| Active in one market | 40 | 20 |
| Active in two or more markets | 60 | 24 |

### Usage bonus: has anybody actually used it (0 to 25)

| `CBP used` | Points | Categories |
| --- | --- | --- |
| 0 | 0 | 141 |
| 1 | 15 | 2 |
| 2 or more | 25 | 2 |

Worth a quarter of the total on its own, because a blueprint nobody uses is
paperwork. This is the behaviour the whole exercise exists to produce.

### AI bonus: has it been done with AI help (0 to 15)

| AI RFPs | Points | Categories |
| --- | --- | --- |
| 0 | 0 | 137 |
| 1 | 8 | 4 |
| 2 or more | 15 | 4 |

Smaller than usage, deliberately. Starting an AI RFP is promising. Getting a
blueprint reused is the result.

**Maximum 100.** One category reaches it: A251 Network Professional Services,
active in eight markets, used twice, two AI RFPs.

### The arc, made countable

Base 20 to 40 is Hilmi's **Traditional**: it exists, it works in one place.
Base 60 is **Connected**: one blueprint, several markets. The AI bonus is
**Smart**. **Autonomous** is above 100 and nobody is there, which is honest and
worth saying out loud.

One definition now drives the narrative, the visuals and the leaderboard.

---

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
| Correlation with portfolio size | −0.46 | **−0.36** | −0.25 |
| Correlation with portfolio spend | +0.04 | **+0.18** | +0.22 |

Neither size nor spend decides the answer. That is the whole requirement.

---

## What it says

**Networks scores 27 out of 100.** The decomposition is the story:

| | Score | Out of |
| --- | --- | --- |
| Base, writing and activating blueprints | **25** | 60 |
| Usage, anyone actually using them | **1** | 25 |
| AI | **1** | 15 |

> We are 42% of the way through writing the blueprints and 4% of the way
> through using them.

That single line is worth more than any picture in this project.

### By district

| District | Score | At zero |
| --- | --- | --- |
| Transmission Infrastructure | 35 | 4 of 10 |
| Access Radio/Fixed | 35 | 20 of 37 |
| Energy | 32 | 11 of 18 |
| Managed Services and Outsourcing | 29 | 4 of 10 |
| Fixed | 24 | 11 of 12 |
| Leased Lines | 19 | 12 of 16 |
| Software and Core | 19 | 18 of 25 |
| Network Revenue Platforms | 15 | 9 of 17 |

No minimum needed, nobody named, defensible in public.

### By manager

23 of 35 qualify at a three-category minimum. Median 25, top 66.

| | Categories | Score | Base | Usage | AI |
| --- | --- | --- | --- | --- | --- |
| 1st | 3 | 66 | 44 | 14 | 8 |
| 2nd | 3 | 60 | 49 | 0 | 10 |
| 3rd | 4 | 55 | 55 | 0 | 0 |
| 7th | 7 | 45 | 43 | 1 | 1 |
| 10th | 14 | 32 | 31 | 0 | 1 |

**Always show the three components, never just the total.** The top scorer is
top because they are the only one with real usage. That is visible in the
breakdown and invisible in the number.

---

## How to use it

**Public, by district.** No minimum, no names, defensible. This is the
all-hands version.

**Private, by manager.** A good conversation with a team and a good way to find
who to learn from. Not a slide.

**If it goes public by manager**, three conditions:

1. **Minimum three categories.** One category and one blueprint is a coin toss,
   not a track record.
2. **Show base, usage and AI separately.** A total with no workings invites an
   argument the total cannot answer.
3. **Call it journey progress, not performance.** Nobody chose their portfolio.

## What it still cannot do

**It tilts against big portfolios at −0.36.** Better than −0.46, not zero.

**Nobody picked their own categories.** Twelve inherited categories with no
history is not a decision anyone made.

**Six of the 23 qualifying managers score zero** and would appear at zero on
any public board.

**It measures the record, not the effort.** A blueprint that took six months of
negotiation scores the same as one that took an afternoon.

**It has no time in it.** No source we hold has a date, so it cannot tell a
standing start from a slow decline. That is the same missing column that blocks
the sleeping builders, and it is the most valuable thing anyone could send us.
