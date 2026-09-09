# The journey score

A single number for how far a category, a manager, a district or the whole of
Networks has got. Designed to be explained in one sentence and to survive
someone arguing with it.

Every number below is computed from Tomas's 9 September extract joined to the
category manager column in the original workbook.

---

## The one sentence

> Every category is on a five-step journey from nothing to in use. Your score
> is how far along that journey your categories are, counting the ones with
> more money on them for more.

That is the whole thing. If somebody cannot repeat it back after hearing it
once, it is the wrong score.

---

## Step 1: the five stages

Each category sits at exactly one stage. Nothing is a judgement call, every
one comes straight from a column.

| Stage | Means | From | Categories | Spend |
| --- | --- | --- | --- | --- |
| **0. Nothing** | No blueprint at all | Total CBP = 0 | 89 | €175.6m |
| **1. Written** | Drafted, not live | Draft CBP > 0, Active = 0 | 12 | €72.9m |
| **2. Live** | Active in one market | Active > 0, Total = 1 | 20 | €178.2m |
| **3. Connected** | Active in several markets | Active > 0, Total ≥ 2 | 15 | €202.4m |
| **4. In use** | Used, or an AI RFP started | CBP used > 0 or AI RFPs > 0 | 9 | €131.4m |

The stages score 0, 25, 50, 75, 100.

**This is not a new invention.** It is Hilmi's Traditional to Connected to
Smart to Autonomous arc, written down precisely enough to compute. Stage 2 is
traditional: it exists and it works in one place. Stage 3 is connected. Stage 4
is smart. Autonomous is the stage above 4 that nobody has reached yet, which
is honest and worth saying out loud.

One definition now serves three things: the narrative on stage, the visuals in
the city, and the leaderboard. That is worth more than any of them separately.

---

## Step 2: the weighting, and why it is a square root

The obvious choices both fail, and it is worth showing why because someone
will ask.

**Count every category equally?** Then the score punishes anyone with a big
portfolio. Measured: correlation of **−0.46** with portfolio size. The manager
holding 14 categories cannot beat the one holding 3, however well they do.

**Weight by spend directly?** Then one large category drowns everything else.
Concretely, from the real data:

> **Fixed** has 12 categories. **Eleven of them are at stage 0.** One category,
> D408 Self-Build Fibre at €62.5m, is at stage 4. Weighted by raw spend, Fixed
> scores **69% and comes top of all eight districts.**

A district that has done nothing on 92% of its categories should not win. That
is not a rounding error, it is the measure being wrong.

**So: weight by the square root of spend.** A €75m category counts more than a
€1m one, but about 9 times more rather than 75 times more. Every category also
carries a floor of €1m of weight, so the 89 with no recorded spend still
count.

The evidence that this is the right call:

| District | At stage 0 | Equal | **Square root** | Raw spend |
| --- | --- | --- | --- | --- |
| Transmission Infrastructure | 4 of 10 | 40% | **46%** | 48% |
| Access Radio/Fixed | 20 of 37 | 29% | **44%** | 66% |
| Energy | 11 of 18 | 26% | **42%** | 64% |
| Managed Services and Outsourcing | 4 of 10 | 32% | **36%** | 38% |
| Fixed | **11 of 12** | 8% | **32%** | **69%** |
| Leased Lines | 12 of 16 | 14% | **24%** | 36% |
| Software and Core | 18 of 25 | 18% | **24%** | 32% |
| Network Revenue Platforms | 9 of 17 | 16% | **19%** | 23% |

Square root puts Fixed fifth, where 11 of 12 at nothing belongs. Raw spend puts
it first. Equal weighting puts it last and ignores that it did land the €62m
one.

| | Equal | **Square root** | Raw spend |
| --- | --- | --- | --- |
| Correlation with portfolio size | −0.46 | **−0.36** | −0.25 |
| Correlation with portfolio spend | +0.04 | **+0.17** | +0.22 |

Nothing is perfect here. Square root is the one where neither size nor spend
decides the answer.

---

## Step 3: what it produces

**Networks overall scores 35%.** Or in plain terms, roughly a third of the way
from nothing to a working, reused, AI-assisted category estate. That is a good
headline number for the all-hands: it is honest, it is not zero, and it leaves
obvious room.

**By district** it needs no caveats at all. No minimum, nobody named, and the
ranking passes the smell test: Transmission Infrastructure top with only 4 of
10 at nothing, Network Revenue Platforms bottom where 7 of its 17 are drafts
that never went live.

**By manager**, with a minimum of 3 categories, 23 of the 35 qualify:

| | Categories | Score | Stage mix 0/1/2/3/4 | Spend |
| --- | --- | --- | --- | --- |
| Top | 3 | 94% | 0/0/1/0/2 | €31.2m |
| 2nd | 3 | 69% | 0/1/1/0/1 | €38.3m |
| 3rd | 4 | 69% | 0/0/1/3/0 | €0.0m |
| ... | | | | |
| 7th | 7 | 56% | 2/1/2/1/1 | €153.3m |

Median 31%, top 94%, six managers at zero.

---

## Where to use it, and where not

**Use it publicly by district.** It names nobody, needs no minimum, and the
result is defensible. This is the version for the all-hands.

**Use it privately by manager.** It is a good conversation with a team and a
good way to spot who to learn from. It is not a slide.

**If it must be public by manager**, three conditions:

1. **Minimum three categories.** One category and one blueprint is not a track
   record, it is a coin toss.
2. **Show the stage mix beside the score**, so 0/0/1/0/2 is visible next to
   94%. A score without its workings invites an argument that the score cannot
   answer.
3. **Call it journey progress, not performance.** The difference is not
   cosmetic: nobody chose their own portfolio.

## What the score still cannot fix

Being straight about this is what makes the rest credible.

**It still tilts against large portfolios**, at −0.36. Better than −0.46, not
zero. Somebody holding 14 categories is playing a harder game.

**Nobody picked their categories.** A manager handed twelve categories with no
spend and no history is starting at nothing through no decision of their own.

**Six managers score zero**, and would appear at zero on any public ranking.

**It measures the record, not the effort.** A blueprint that took six months of
negotiation and one that took an afternoon score identically.

**It has no time in it.** There are no dates in any source we have, so the
score cannot tell progress from a standing start. That is the same missing
column that blocks the sleeping builders, and it is the single most valuable
thing anyone could send us.

---

## The recommended shape

Report **one number and one picture**: the journey score, and the stage mix
that produced it. By district on stage. By manager in private. And name the
nine categories at stage 4 as pioneers rather than ranking the 145.
