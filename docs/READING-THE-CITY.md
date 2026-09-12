# Reading the city

What every part of the picture means, and what the picture is actually saying.
Written for the presenter, so the numbers here are the ones to quote. All of
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

### 2. The height: how many markets have taken it up

One band per market: 0 is flat, 1 a small building, 2 an office block, 3 to 4
a tower, 5 or more a skyscraper.

The spread is severe. 89 categories are in no market at all, 34 are in exactly
one, and only five categories anywhere reach five or more. One reaches 16. The
skyline is mostly low-rise, and that is accurate rather than a rendering
choice.

**This measure is a substitute.** The proper column is AVA Sourcing adoption,
which reads a flat 100% for all 145 categories in the current extract. Using
it would make every building an identical maximum-height tower and the skyline
would carry no information at all. Market count is real and varies, so it
stands in. It is badged provisional on screen and swaps back in one line in
`config/metrics.yaml` if real adoption figures arrive.

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

Dark, flicker, steady glow, full reactor, from the count of AI-generated RFPs.
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
frame is the argument.

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
to grey when nobody uses them. It moves the argument from a coverage gap,
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

## Where the data is soft

Say these before someone finds them.

**Height still stands in for adoption.** The AVA column reads a flat 100% for
all 145 categories in the September extract as well, so building height is
market reach and is badged provisional on screen. This is the last placeholder
left: the rooftop lights became real data in the same refresh.

**20 categories have a blueprint and no recorded spend**, 14 of them live and
6 drafted. So the map
holds empty lots with money on them and built lots with none. Whether that is
a data gap or genuinely nothing is an open question with the data owners, and
anyone in the room who owns one of those categories will notice.

**Blueprint reach counts markets, not depth.** A category live in one market
looks the same whether that market is Germany or Albania.

## Changing any of this

`config/metrics.yaml` binds each visual layer to a metric. Swapping height
from market reach to real adoption, or moving the spend thresholds, is an edit
to that file. No rebuild, no code change, and the on-screen legend follows,
so the explanation cannot drift from what is drawn.
