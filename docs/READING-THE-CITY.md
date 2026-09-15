# Reading the city

What every part of the picture means, and what the picture is actually saying.
Every figure quoted here is generated from the dataset. All of
them come from `data/city.json` and change when the extract does.

## The idea

Every category in the Networks estate owns one square of land. What stands on
that square is how that category is doing.

## The map is the category tree

| On screen | In the data | How many |
| --- | --- | --- |
| District, inside a coloured kerb | L2 category area | 8 |
| Plot, the paler slab inside a district | L3 group | 31 |
| Lot, one square of land | L4 category | 145 |

**Land is worth what is spent on it.** A lot is larger where the money is, so
a plot grows both with how many categories it holds and with how much sits on
them. Lots stay the same size inside any one plot, so an empty lot is still
countable as an empty lot.

Strict proportionality was not possible: 14 of the 31 plots have no recorded
spend at all and hold 58 categories between them, and the largest plot is 400
times the smallest non-zero one. So the scale is compressed with a square root
and clamped, the same treatment and the same reason as the journey score. The
order survives, nothing disappears, and FLM & Field Operations at €283m is
unmistakably the largest place in the city.

The ground between districts is undeveloped land and means nothing. It used to
be green, which made it look like something worth reading.

A big district is not the same as an important one. Managed Services and
Outsourcing has 10 lots and carries €286m, more than a third of the €760m in
Networks. That mismatch is worth pointing at.

| District | Lots | Built | Spend |
| --- | --- | --- | --- |
| Access Radio/Fixed | 37 | 17 | €86m |
| Software and Core | 25 | 7 | €19m |
| Energy | 18 | 7 | €47m |
| Network Revenue Platforms | 17 | 8 | €13m |
| Leased Lines | 16 | 4 | €117m |
| Fixed | 12 | 1 | €88m |
| Managed Services and Outsourcing | 10 | 6 | €286m |
| Transmission Infrastructure | 10 | 6 | €105m |

## The four measures

### 1. The ground: does a blueprint exist

| What you see | Status | Count |
| --- | --- | --- |
| Bare grey ground | No blueprint | 89 |
| Yellow outline, no foundation | Drafted | 12 |
| Green foundation | Active | 44 |

61% of Networks is bare ground.

**The furniture on the lot says the same thing a second way.** The colour of
the ground carries the state, and a colour has to be learned; a crane does
not. Each prop is bound to the state rather than to a district's score,
which matters: Network Revenue Platforms scores lowest of the eight districts
and holds seven of the twelve drafts, more than the other seven districts
together. Anything keyed to how a district scores would have shown the
district doing the most drafting as the quietest on the map.

| Prop | On | Count |
| --- | --- | --- |
| A crane over the outline | A drafted lot | 12 |
| A to let board | An active blueprint nobody has used | 40 |
| A sleeper, with two Z | A plot with nothing built and nothing drafted | 12 |

The sleeper is per plot rather than per lot. 89 lots are bare, and a figure
on each would outnumber the people walking and leave a city that reads as
uniformly asleep. A whole plot with no blueprint activity of any kind is the
rarer claim: twelve of the thirty-one, one of them holding €22m across seven
categories.

The boards count 40 rather than the 52 drained facades. Those 52 are every
lot with a building standing and nobody in it, which includes the drafts, and
a draft has no building to let.

### 2. The height: how far the category has got

The composite score, 0 to 100. 40 points for the blueprint itself, 35 for
anyone actually using it, 25 for doing it with AI. The full workings are in
[JOURNEY-SCORE.md](JOURNEY-SCORE.md).

| Score | What stands there | Categories |
| --- | --- | --- |
| 0 | bare or outlined ground | 101 |
| up to 25 | small building, 3 floors | 20 |
| up to 40 | office block, 5 floors | 16 |
| up to 64 | tower, 8 floors | 4 |
| up to 84 | high tower, 12 floors | 2 |
| over 84 | skyscraper, 16 floors | 2 |

**Height used to be blueprint reach, and that was the weaker choice twice
over.**

It was a count with no denominator. A category live in both of the two markets
where it applies scored worse than one live in five of twenty, and no source
we hold says which markets a category applies to. A count like that cannot be
defended as performance.

And it barely varied. 48 of the 56 buildings sat at reach 1 or 2, so the
skyline was 48 near-identical low blocks and four outliers. The score spreads
the same 56 buildings over five bands.

Reach is still on the card, and it is still what a monument is drawn from. It
just stopped standing in for progress. A221 is live in 16 markets, more than
twice the next, and has never been used: on the old encoding it was the tallest
thing in the city, and it is now a five-floor block.

### 3. The houses and hotels: spend

| Spend | What is built |
| --- | --- |
| Nothing recorded | Bare |
| Up to €1m | One house |
| Up to €5m | Two houses |
| Up to €20m | Three houses |
| Up to €50m | Four houses |
| Over €50m | One red hotel |

Six categories have a hotel: A206 Site Infrastructure Support, A310 NOC
Support Services and A311 Field Maintenance at €75m each, D408 Self-Build
Fibre at €62m, D403 Unregulated Fixed Access at €59m, A308 Planning at €55m.

**These bands are not the deck's.** On the original ones, €5m through €100m,
Networks would have no hotels at all and 84% of categories would sit on the
bottom rung. The narrative says the thresholds are still to be decided, so
these hold until they are.

### 4. The rooftop light: AI readiness

Dark, flicker, full reactor, from the count of AI-generated RFPs. Three rungs,
because the measured column runs 0 to 2: one RFP flickers, two or more carries
a beam. The ladder had four rungs while the column was a placeholder reaching
double figures, which left every real value on the lowest lit rung.
**8 of 145 rooftops are lit**: A212, A213, A251 and A314 with two each, and
D303, D333, D506 and D513 with one.

**This became real on 9 September.** The column used to be empty, so the
rooftops ran on placeholder data that showed 28. Eight is a weaker picture and
a much better position to argue from, because it is true.

### 5. The windows: is anybody using it

| What you see | What it means | Count |
| --- | --- | --- |
| Full district colour, lit windows | The blueprint has been used | **4** |
| Drained towards grey, dark windows | Built, and nobody has used it | 52 |

The newest column in the extract and the most important one. Turn the lights
off with **N** and the whole city goes dark except four buildings. That single
state is the clearest expression of the coverage gap.

## Reading one lot in three seconds

Look at the ground, then look up. Foundation or bare? How tall? Houses or a
hotel? Light on top?

A green foundation under a five-storey tower with four houses and a lit roof
is a category under control. Bare ground beside a hotel in the same plot is a
category nobody has written down that spends real money.

## What the city is actually saying

Sharper than "89 lots are empty":

**We have written 44 blueprints. Four of them have ever been used.**

That is the sharpest thing in the data and the reason the buildings now drain
to grey when unused. It reframes the finding from a coverage gap,
which sounds like paperwork, to an adoption gap, which is about behaviour.

Underneath it, the coverage story still holds. Of the 89 categories with no
blueprint, **69 have no recorded spend either**, so they are arguably not
urgent. The other **20 carry €176m between them**, and the largest is A311
Field Maintenance at €75m, which is tied for the biggest single category in
Networks and has no blueprint at all.

And Networks scores **19 out of 100** on the journey: 40% of the way through
writing the blueprints, 5% of the way through using them.

The second thing to know: **Fixed has 12 categories, €88m of spend, and one
built.** It is the most exposed district on the map.

## The asks, and what each is worth

The closing screen behind `K` carries four asks and, beside each, the score
the organisation would reach if that step alone were taken. Every figure is
computed from the extract, so a refreshed one moves them without anybody
editing the screen.

| Ask | Lots | Networks would reach |
| --- | --- | --- |
| Write a blueprint for every lot without one | 89 | 23.9 |
| Take every written draft live in a market | 12 | 20.7 |
| **Run one sourcing event through every live blueprint** | **40** | **27.3** |
| Generate one brief for every live blueprint | 36 | 25.0 |

**The largest single step is using what already exists.** Forty live
blueprints have never been used, and one event through each is worth more
than drafting all 89 missing blueprints. That is the finding the estate does
not expect: the fastest route is not writing more, it is using what is
written.

The four do not add up. Drafting a bare lot and then taking that draft live
are two of the asks landing on the same category, so acting on all four
compounds rather than sums.

## Where the data is soft

Say these before someone finds them.

**Nothing measures adoption depth.** The AVA column reads a flat 100% for all
145 categories, so it cannot differentiate, and blueprint reach counts markets
without knowing how many a category could serve. Height is the composite score
instead, which scores stages rather than counting markets. The gap is real:
nothing in any source says how deeply a blueprint is used within a market.

**20 categories have a blueprint and no recorded spend**, 14 of them live and
6 drafted. So the map
holds empty lots with money on them and built lots with none. Whether that is
a data gap or genuinely nothing is an open question with the data owners, and
any category owner reviewing this will notice it.

**Blueprint reach counts markets, not depth.** A category live in one market
looks the same whether that market is Germany or Albania.

## Changing any of this

`config/metrics.yaml` binds each visual layer to a metric. Swapping height
from the composite score back to blueprint reach, or moving the spend
thresholds, is an edit to that file. No rebuild, no code change, and the on-screen legend follows,
so the explanation cannot drift from what is drawn.
