/* NW Digital City, the renderer.
 *
 * Reads window.NW_CITY (data) and window.NW_CONFIG (which metric drives which
 * visual layer) and builds an isometric brick city. It never fetches anything,
 * so it runs from file:// with no server and no network. That is the on-stage
 * safety net, and it is why the data arrives as a global rather than an import.
 *
 * Geography follows the category tree: L2 is a district, L3 is a plot, L4 is a
 * building. The four measures of the blueprint story are the four things you
 * can see: foundation, height, houses, reactor.
 *
 * Public API (the agent drives the city through this):
 *   NWCity.focus(code)              fly to one category
 *   NWCity.reset()                  back to the whole city
 *   NWCity.setLayerMetric(l, m)     repoint a visual layer at another metric
 */
(function () {
  "use strict";

  const CITY = window.NW_CITY;
  const CONFIG = window.NW_CONFIG;

  // ---------------------------------------------------------------- palette
  // Colour carries meaning in exactly one place: blueprint state, using the
  // reserved status roles. District identity is carried by position and a name
  // plate, never by hue, so nothing depends on distinguishing eight colours
  // under poor colour reproduction.
  const C = {
    sky: 0x080b12,
    /* Undeveloped ground, in the same family as the district plates.
     *
     * This was a green baseplate, which encoded nothing and read as parkland
     * worth looking at. Neutral ground keeps the eye on the built area, which
     * is where the data is. */
    ground: 0x2f343d,
    districtPlate: 0x232a34,
    plotPlate: 0x2f3742,
    bare: 0x7c8794, // muted: absence rather than a status
    draft: 0xfab219, // status: warning
    active: 0x0ca30c, // status: good
    brick: 0xd9d3c6,
    brickAlt: 0xc2bcae,
    stud: 0xe4dfd3,
    house: 0x2e9e4f, // Monopoly green
    hotel: 0xe60000, // Vodafone red
    reactor: 0x7fdcff,
    label: "#e8eaf0",
  };

  // Monopoly property-group colours. Reinforcement only: every district also
  // carries a printed name plate and its own patch of ground, so identity never
  // rests on telling eight hues apart. The measures that must be read exactly
  // status, height, houses and reactor, stay on shape, height and count.
  const DISTRICT_BANDS = [
    "#3987e5", "#d95926", "#199e70", "#c98500",
    "#d55181", "#008300", "#9085e9", "#e66767",
  ];

  // A Lego brick reads as a light face over a saturated body, so each district
  // hue is mixed toward white for the wall and left darker for the banding.
  /* Bricks in the district's colour.
   *
   * `occupied` is whether anybody has actually run a sourcing event through
   * this category's blueprint. An unoccupied building keeps its shape and
   * loses its colour: the estate is built, and nobody is in it. Forty of the
   * forty-four built lots are in this state, which is the single most
   * important thing on the map and had no way of being seen before. */
  /* How far an empty building drifts towards grey.
   *
   * Tuned down from 0.72, which drained the whole skyline: with 40 of the 44
   * built lots empty, a strong wash turns the city into one grey mass and the
   * district colours stop telling you where you are. At 0.45 a building still
   * belongs to its district and still reads as drained, and the four that are
   * occupied keep their full colour and stand out against the rest. */
  const VACANT_WASH = 0.45;

  function brickSet(index, occupied = true) {
    const base = new THREE.Color(DISTRICT_BANDS[index % DISTRICT_BANDS.length]);
    let wall = base.clone().lerp(new THREE.Color(0xffffff), 0.1);
    if (!occupied) {
      // Towards a cold neutral rather than plain white, so it reads as
      // abandoned rather than as a lighter shade of the same colour.
      wall = wall.lerp(new THREE.Color(0x9aa0aa), VACANT_WASH);
    }
    return {
      main: wall.getHex(),
      alt: wall.clone().lerp(new THREE.Color(0x000000), 0.16).getHex(),
      stud: wall.clone().lerp(new THREE.Color(0xffffff), 0.22).getHex(),
      band: base.getHex(),
      occupied,
    };
  }

  // ------------------------------------------------------------ dimensions
  const CELL = 4.0;        // one building lot
  const FOOT = 2.4;        // building footprint on a standard lot
  const FLOOR_H = 1.15;
  const PER_ROW = 4;       // buildings per row within a plot
  const PLOT_PAD = 1.8;
  /* Clearance between a district's kerb and its first plot.
   *
   * At 3.2 against a kerb 0.9 wide, every district carried roughly 2.3 units
   * of empty base plate on all four sides, and between 51% and 62% of the area
   * inside a district encoded nothing. The largest visual element on the map
   * was the one carrying no information, which is the opposite of the rule the
   * rest of the encoding follows. */
  const DISTRICT_PAD = 1.6;
  // Depth of the strip the district name plate sits on, at the front edge.
  const PLATE_STRIP = 2.0;
  /* The tram viaducts, which ring the city in the outermost streets.
   *
   * Declared here because the ground margin has to know about them: they
   * stand at the edge of the world with nothing behind them, which is the
   * one place the margin exists for, and the overhead wire is the highest
   * thing on them at DECK_Y + 2.7. */
  const DECK_Y = 4.6;
  const FLYOVER_TOP = DECK_Y + 2.8;
  /* The ring road the viaducts run on, and how far outside the districts it
   * lies. The margin needs both: the viaduct is not only tall, it stands
   * beyond the block, so its own distance from the edge counts against it
   * rather than for it. Sized without this, the overhead wire came out
   * against the void with the plate four units short. */
  const RING_ROAD = 4.8;
  const RING_PAD = 2.4;
  const FLYOVER_OUT = RING_PAD + RING_ROAD / 2;
  // The coloured kerb round a district, which the name strip has to clear.
  const KERB = 0.9;
  const DISTRICT_MAX_W = 32;
  const WORLD_MAX_W = 132;
  // Floors per height tier. Six entries so any registered metric can drive it.
  /* Floors per rung of the height ladder.
   *
   * Rescaled when height moved from blueprint reach to the composite score.
   * Reach put 48 of the 56 buildings on one or two floors, because 48 of them
   * are live in one or two markets; the score spreads them over five rungs.
   * The lowest is three rather than one deliberately: a live blueprint should
   * read as a building rather than as a stub. */
  const FLOORS = [0, 3, 5, 8, 12, 16];

  /* A monument replaces its building and stands on the ground.
   *
   * It sat on top of the building for one revision. That read badly: a
   * classical colonnade perched on sixteen floors of office block is an
   * ornament on a roof, not a landmark, and every one of them looked
   * top-heavy because a monument is wider than a one-lot tower.
   *
   * So the monument is the whole lot again, and the lot is widened to suit
   * it. Recognising the shape is the signal: a monument means this category
   * scores at or above the landmark threshold. The score itself is on the
   * title deed, on the arc and on the scoreboard, so it is not encoded twice
   * and the monument does not have to be the tallest thing in the city to
   * carry its meaning.
   *
   * They are sized to a common silhouette area rather than a common height.
   *
   * One height was the first rule, on the reasoning that it made the set read
   * as one class of object. It does not, because the shapes are not close to
   * a common proportion: Big Ben is a needle at 0.94 wide by 6.05 tall and
   * the Parthenon a colonnade at 2.5 by 2.37, so at one height the needle
   * occupies a seventh of the screen the colonnade does. The two towers came
   * out as splinters that had to be looked for.
   *
   * Equal area alone is no good either: the clocktower would need to stand
   * fifteen units to match a colonnade's mass, which is more than twice the
   * tallest thing in the city. So area, bounded by a height band. A tower is
   * allowed to be tall, because being tall is what a tower is, and a wide
   * shape is not allowed to be squat enough to lose the plot. What makes the
   * set read as one class is the stone and the terrace, which every one of
   * them has, not a measurement they were never going to share. */
  const MONUMENT_AREA = 38;
  const MONUMENT_H_MIN = 6.55;
  const MONUMENT_H_MAX = 11.5;
  // A monument's lot is widened, in half-cell steps, to the ground its shape
  // wants at that size. Capped: the pyramids would want three and a half
  // cells out of a plot that only holds six lots.
  const MONUMENT_LOT_MAX = 2.5;
  const MONUMENT_LOT_STEP = 0.5;
  // The monument stops short of its lot edge, so it never touches a neighbour.
  const MONUMENT_INSET = 0.92;
  // A low stone terrace under every monument, the size of its own footprint.
  const TERRACE_MIN = 0.4;
  // How far a monument has to finish above the tallest plain tower.
  const MONUMENT_CLEAR = 0.8;

  /* The authored bounding box of a monument shape, measured once.
   *
   * The proportions are wildly different and they are the real ones: Big Ben
   * is a needle at 0.94 by 6.05, the pyramids are a range at 4.15 by 2.7.
   * Measuring the geometry rather than tabling the figures means the table
   * cannot drift away from the models. */
  const shapeBoxes = new Map();
  function shapeBox(shape) {
    if (shapeBoxes.has(shape)) return shapeBoxes.get(shape);
    const group = landmarkGroup(shape);
    let out = null;
    if (group) {
      const b = new THREE.Box3().setFromObject(group);
      out = {
        w: Math.max(b.max.x - b.min.x, 0.01),
        d: Math.max(b.max.z - b.min.z, 0.01),
        h: Math.max(b.max.y, 0.01),
      };
      out.ground = Math.max(out.w, out.d);
    }
    shapeBoxes.set(shape, out);
    return out;
  }

  /* Whether a category gets a monument, and which shape.
   *
   * The build assigns the shape; the height tier decides whether there is
   * anything standing on the lot to replace. Both the layout and the render
   * ask this, and they have to agree or the layout reserves ground for a
   * monument that never appears. */
  function monumentShape(category) {
    if (!category || !category.landmark) return null;
    if (category.blueprint_state !== "active") return null;
    const tier = tierIndex(layerMetric("height"), valueFor(category, "height"));
    return FLOORS[Math.min(tier, FLOORS.length - 1)] > 0 ? category.landmark.shape : null;
  }

  /* How many cells wide a monument's lot has to be.
   *
   * Every monument is drawn at the same height, so the ground it needs comes
   * straight out of its shape's aspect ratio. Rounded up to a half cell so
   * the grid stays a grid a viewer can count. */
  /* How tall a plain tower on this category would stand. */
  function towerTop(category) {
    if (!category || category.blueprint_state !== "active") return 0.62;
    const tier = tierIndex(layerMetric("height"), valueFor(category, "height"));
    return 0.62 + FLOORS[Math.min(tier, FLOORS.length - 1)] * FLOOR_H;
  }

  /* The size a shape wants, before its lot is allowed an opinion.
   *
   * Equal silhouette area, clamped into the height band. Both the layout and
   * the render ask this: the layout to know how much ground to reserve, the
   * render to know what to draw. Two derivations of one number drift, and a
   * lot reserved for a size the monument is not drawn at is a gap in the
   * grid nobody can account for. */
  function freeScale(box) {
    const byArea = Math.sqrt(MONUMENT_AREA / (box.ground * box.h));
    const wants = box.h * byArea;
    if (wants < MONUMENT_H_MIN) return MONUMENT_H_MIN / box.h;
    if (wants > MONUMENT_H_MAX) return MONUMENT_H_MAX / box.h;
    return byArea;
  }

  function monumentSpan(category, cell) {
    const shape = monumentShape(category);
    const proportions = shape ? shapeBox(shape) : null;
    if (!proportions) return 1;
    const need = proportions.ground * freeScale(proportions) / MONUMENT_INSET;
    const steps = Math.ceil(need / cell / MONUMENT_LOT_STEP) * MONUMENT_LOT_STEP;
    return Math.min(MONUMENT_LOT_MAX, Math.max(1, steps));
  }

  // ------------------------------------------------------------------ tiers
  function metricDef(name) {
    return CONFIG.metrics[name];
  }

  function tierIndex(metricName, value) {
    const def = metricDef(metricName);
    if (!def) return 0;
    if (def.kind === "categorical") {
      const i = def.tiers.findIndex((t) => t.value === value);
      return i < 0 ? 0 : i;
    }
    const v = typeof value === "number" ? value : 0;
    for (let i = 0; i < def.tiers.length; i++) {
      const max = def.tiers[i].max;
      if (max === null || max === undefined || v <= max) return i;
    }
    return def.tiers.length - 1;
  }

  function tierOf(metricName, value) {
    return metricDef(metricName).tiers[tierIndex(metricName, value)];
  }

  function layerMetric(layer) {
    return CONFIG.layers[layer].metric;
  }

  function valueFor(category, layer) {
    return category.metrics[layerMetric(layer)];
  }

  // ----------------------------------------------------------------- layout
  // Shelf packing: place boxes left to right, wrap to a new row when the shelf
  // is full. Deterministic, so the city looks identical every run.
  function shelfPack(items, maxWidth, gap) {
    let x = 0, z = 0, rowDepth = 0, width = 0;
    const rows = [];
    let row = [];
    for (const item of items) {
      if (x > 0 && x + item.w > maxWidth) {
        rows.push({ items: row, w: x - gap });
        row = [];
        x = 0;
        z += rowDepth + gap;
        rowDepth = 0;
      }
      item.x = x;
      item.z = z;
      row.push(item);
      x += item.w + gap;
      width = Math.max(width, x - gap);
      rowDepth = Math.max(rowDepth, item.d);
    }
    rows.push({ items: row, w: x - gap });
    /* Centre each row.
     *
     * Shelf packing a handful of items of very different widths leaves the
     * last row short, and left-aligned that reads as one large void on one
     * side rather than as a margin. Centred, the same slack sits on both
     * sides of every row and the block looks laid out instead of ragged. */
    for (const shelf of rows) {
      const shift = (width - shelf.w) / 2;
      for (const item of shelf.items) item.x += shift;
    }
    return { w: width, d: z + rowDepth };
  }

  /* Land is worth what is spent on it.
   *
   * Plot area proportional to spend cannot be drawn literally from this
   * data. Fourteen of the thirty-one plots
   * have no recorded spend at all and hold 58 categories between them, so
   * strict proportionality erases 40% of the estate. The largest plot is 400
   * times the smallest non-zero one, so the small end would be a pixel.
   *
   * So the same compression the journey score uses, for the same reason: the
   * square root, clamped, with a floor. A lot's size follows the average
   * spend per category in its plot, which means a plot grows both with how
   * many categories it holds and with how much money is on them. Both are
   * real facts about it, and the order is preserved: FLM & Field Operations
   * at €283m is unmistakably the biggest place in the city, and the plots
   * with nothing recorded are visibly small without disappearing.
   *
   * Lots stay uniform inside a plot, so they are still countable and the 89
   * empty ones still read as 89 empty ones. */
  const LOT_MIN = 0.78, LOT_MAX = 1.75;

  function lotScale(codes, byCode) {
    if (!codes.length) return 1;
    const spend = codes.reduce(
      (sum, code) => sum + ((byCode.get(code) || { metrics: {} }).metrics.spend_eur || 0), 0);
    const perLot = spend / codes.length;
    // €5m per category is about the point where a plot looks average, so it
    // anchors the middle of the range rather than the mean, which one €283m
    // plot would otherwise drag upwards.
    const scale = Math.sqrt(perLot / 5e6);
    return Math.max(LOT_MIN, Math.min(LOT_MAX, scale || LOT_MIN));
  }

  function buildLayout() {
    const byCode = new Map(CITY.categories.map((c) => [c.code, c]));

    const districts = CITY.districts.map((district, index) => {
      const plots = district.plots.map((plot) => {
        const cols = Math.min(plot.codes.length, PER_ROW);
        const rows = Math.ceil(plot.codes.length / PER_ROW);
        const scale = lotScale(plot.codes, byCode);
        const cell = CELL * scale;
        /* A monument's lot is wider and deeper than a building's.
         *
         * Lots are uniform inside a plot, because the count of them is part
         * of what the plot says. The exception is a monument: its shape has
         * to be recognisable and the shapes are not square, so the column
         * and the row it stands in are widened to the ground that shape
         * needs. Widening the whole line rather than the single cell is what
         * keeps the rest of the plot on a grid. */
        const colW = new Array(cols).fill(cell);
        const rowD = new Array(rows).fill(cell);
        plot.codes.forEach((code, i) => {
          const span = monumentSpan(byCode.get(code), cell);
          if (span <= 1) return;
          const col = i % PER_ROW;
          const row = Math.floor(i / PER_ROW);
          colW[col] = Math.max(colW[col], span * cell);
          rowD[row] = Math.max(rowD[row], span * cell);
        });
        const colX = [];
        const rowZ = [];
        let acrossX = 0;
        for (const w of colW) { colX.push(acrossX); acrossX += w; }
        let acrossZ = 0;
        for (const d of rowD) { rowZ.push(acrossZ); acrossZ += d; }
        return {
          name: plot.name,
          codes: plot.codes,
          cols,
          rows,
          scale,
          cell,
          colW,
          rowD,
          colX,
          rowZ,
          w: acrossX + PLOT_PAD,
          d: acrossZ + PLOT_PAD,
        };
      });
      /* Data order, deliberately.
       *
       * Packing the widest plot first was tried to reduce the ragged last row
       * and made it worse: taller rows cost more than the ragged edge saved,
       * and the total kerb area went up. The remaining gap is inherent to
       * shelf packing a handful of plots of very different sizes, and closing
       * it would need a real two-dimensional packer for a few per cent. */
      const inner = shelfPack(plots, DISTRICT_MAX_W, 1.6);
      /* The name strip is reserved to fit this district's own name.
       *
       * It was one constant depth for all eight, which meant every district
       * paid for the longest name and the longest name still did not fit.
       * "Fixed" needs a fraction of the ground "Managed Services and
       * Outsourcing" does, so each gets what it needs and the letters come
       * out the same height in all eight, which is the only way the set
       * reads as one piece of lettering. */
      const w = inner.w + DISTRICT_PAD * 2;
      const nameFit = fitName(district.name, w - KERB * 2 - 1.0);
      const strip = Math.max(PLATE_STRIP, nameFit.depth + KERB + 0.6);
      return {
        index,
        name: district.name,
        plots,
        totals: district.totals,
        nameFit,
        strip,
        w,
        d: inner.d + DISTRICT_PAD * 2 + strip,
      };
    });

    /* Deepest district first.
     *
     * A shelf row is as deep as its deepest member, so grouping districts of
     * similar depth is what stops a shallow one paying for a deep neighbour.
     * Widest first was the first attempt and left the city filling 57% of its
     * own bounding box against 65% for this, on a world that is also closer
     * to square, which matters because the camera looks down the diagonal. */
    const ordered = districts.slice().sort((a, b) => b.d - a.d || a.name.localeCompare(b.name));
    const world = shelfPack(ordered, WORLD_MAX_W, 5.0);

    const buildings = [];
    for (const district of districts) {
      district.cx = district.x - world.w / 2;
      district.cz = district.z - world.d / 2;
      for (const plot of district.plots) {
        plot.cx = district.cx + DISTRICT_PAD + plot.x;
        /* The reserved strip is at the near edge, not the far one.
         *
         * It holds the district name, and an isometric camera projects a tall
         * building upward and backward: at the far edge the name ran behind
         * whatever stood in the rows in front of it and came out in
         * fragments. At the near edge nothing in the district can be between
         * it and the camera. */
        plot.cz = district.cz + DISTRICT_PAD + plot.z;
        plot.codes.forEach((code, i) => {
          const col = i % PER_ROW;
          const row = Math.floor(i / PER_ROW);
          buildings.push({
            scale: plot.scale,
            cell: plot.cell,
            span: monumentSpan(byCode.get(code), plot.cell),
            category: byCode.get(code),
            district,
            plot,
            // Centred in its column and row, so a plain lot next to a
            // monument sits in the middle of the wider line rather than
            // shunted to one side of it.
            x: plot.cx + PLOT_PAD / 2 + plot.colX[col] + plot.colW[col] / 2,
            z: plot.cz + PLOT_PAD / 2 + plot.rowZ[row] + plot.rowD[row] / 2,
          });
        });
      }
    }
    return { districts, buildings, size: world };
  }

  // ------------------------------------------------------------- instancing
  // Thousands of bricks would be thousands of draw calls. Everything of one
  // shape is collected here and drawn as a single InstancedMesh.
  function Bucket() {
    this.items = [];
  }
  Bucket.prototype.add = function (x, y, z, sx, sy, sz, color) {
    this.items.push({ x, y, z, sx, sy, sz, color });
    return this.items.length - 1;
  };
  Bucket.prototype.mesh = function (geometry, material, castShadow, receiveShadow) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, this.items.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    this.items.forEach((item, i) => {
      matrix.makeScale(item.sx, item.sy, item.sz);
      matrix.setPosition(item.x, item.y, item.z);
      mesh.setMatrixAt(i, matrix);
      if (item.color !== undefined && mesh.setColorAt) {
        mesh.setColorAt(i, color.setHex(item.color));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = !!receiveShadow;
    return mesh;
  };

  // ------------------------------------------------------------------ scene
  const scene = new THREE.Scene();
  /* The sky is the renderer's clear colour rather than scene.background.
   * A Color background forces three.js to clear the frame at the start of
   * every render call, which would wipe the city out from under the second
   * pass that draws the builder on top of it. */
  let sky = C.sky;
  function setSky(hex) {
    sky = hex;
  }

  /* Geometries.
   *
   * Declared before the layout because the layout has to measure the
   * monument shapes to know how much ground each one needs. */
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const cone = new THREE.ConeGeometry(0.5, 1, 7);
  const disc = new THREE.CircleGeometry(0.5, 18).rotateX(-Math.PI / 2);
  const pyramid = new THREE.ConeGeometry(0.72, 1, 4).rotateY(Math.PI / 4);
  // Low segment counts: these appear on at most a handful of monuments, and a
  // sphere is the one shape the brick vocabulary cannot fake.
  const sphere = new THREE.SphereGeometry(0.5, 14, 10);
  /* The reactor beam, tapered.
   *
   * A straight cylinder is the same width at the roof as it is thirteen units
   * up, which reads as a bar rather than as light leaving something. Narrow at
   * the bottom and full at the top is what a beam does, and it puts the widest
   * part where there is nothing behind it to compete with. Not too narrow at
   * the base: at a fifth of the top the two thin beams came to a point and
   * looked broken. */
  const flare = new THREE.CylinderGeometry(0.5, 0.27, 1, 12);

  /* Warm sandstone against a city of cool blues and greys. The first pass
   * used a pale stone that vanished into the pale district buildings behind
   * it, which is the opposite of what a landmark is for. */
  const STONE = 0xe0cfa4, STONE_DARK = 0xb9a274, GOLD = 0xf0c74e, LEAD = 0x6f7a86;

  /* Pixels per world unit in a ground engraving. High enough that the letters
   * survive being zoomed into, low enough that eight textures are not a
   * budget. */
  const NAME_PPU = 44;
  /* Cap height of a district name, in world units.
   *
   * The binding constraint is width, not the strip: "MANAGED SERVICES AND
   * OUTSOURCING" is 32 characters across a district 33 units wide, so on one
   * line it cannot exceed about 1.5 units whatever depth it is given. A
   * bigger letter therefore means wrapping the long names, and the strip is
   * then reserved per district to whatever its own name needs rather than
   * globally to the worst case. */
  const NAME_CAP = 2.05;
  const NAME_LEADING = 1.12;
  const NAME_FONT = (px) =>
    `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  const measurer = document.createElement("canvas").getContext("2d");

  function nameWidth(line, size) {
    measurer.letterSpacing = `${Math.round(size * 0.08)}px`;
    measurer.font = NAME_FONT(size);
    return measurer.measureText(line).width;
  }

  /** Ground needed for n lines at this pixel size, in world units. */
  function lineDepth(count, size) {
    // The rule under the text and a margin round the block, in cap heights.
    return ((count - 1) * NAME_LEADING + 1.62) * size / NAME_PPU;
  }

  /* How to set a district name in the width available.
   *
   * One line at the full cap height if it fits. Otherwise split at a word
   * boundary into the balanced pair that minimises the longer half, and if
   * even that is too wide, shrink until it fits. Returns the lines, the size
   * they are set at and the ground they need, so the layout can reserve
   * exactly that and no more.
   */
  function fitName(text, width) {
    const label = text.toUpperCase();
    const room = width * NAME_PPU * 0.96;
    const full = Math.round(NAME_CAP * NAME_PPU);

    if (nameWidth(label, full) <= room) {
      return { lines: [label], size: full, depth: lineDepth(1, full) };
    }

    const words = label.split(/\s+/);
    let best = null;
    for (let cut = 1; cut < words.length; cut++) {
      const pair = [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
      const longest = Math.max(nameWidth(pair[0], full), nameWidth(pair[1], full));
      if (!best || longest < best.longest) best = { pair, longest };
    }
    if (best && best.longest <= room) {
      return { lines: best.pair, size: full, depth: lineDepth(2, full) };
    }

    // Nothing fits at full height: one word too long to break, or a district
    // narrow enough that two lines are still over. Shrink to fit.
    const lines = best ? best.pair : [label];
    const widest = lines.reduce((most, line) => Math.max(most, nameWidth(line, full)), 1);
    const size = Math.max(12, Math.floor(full * room / widest));
    return { lines, size, depth: lineDepth(lines.length, size) };
  }

  // The engraved district names, so the night switch can light them.
  const districtNames = [];

  /* Text cut into the ground, in two passes.
   *
   * A canvas texture on a flat plane, and nothing here is shaded by the scene
   * light, so the name reads the same at any hour. Both axes of the ground
   * foreshorten by the same factor under this camera, so the letters shear
   * without stretching and no correction is needed.
   */
  function engraveOnGround(fitted, accent, width, depth) {
    const { lines, size } = fitted;
    const w = Math.max(64, Math.round(width * NAME_PPU));
    const h = Math.max(24, Math.round(depth * NAME_PPU));

    // Geometry of the block, shared by both passes so the lit lettering lands
    // exactly where the cut lettering was.
    const cx = w / 2;
    const leading = size * NAME_LEADING;
    const stack = (lines.length - 1) * leading;
    const top = h / 2 - stack / 2 - size * 0.16;
    const rule = Math.max(2, Math.round(size * 0.09));

    const sheet = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.letterSpacing = `${Math.round(size * 0.08)}px`;
      ctx.font = NAME_FONT(size);
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      return ctx;
    };
    const eachLine = (ctx, draw) => {
      let widest = 1;
      lines.forEach((line, i) => {
        draw(ctx, line, top + i * leading);
        widest = Math.max(widest, ctx.measureText(line).width);
      });
      return Math.min(w * 0.96, widest);
    };
    const asPlane = (ctx, additive) => {
      const texture = new THREE.CanvasTexture(ctx.canvas);
      texture.anisotropy = 8;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      return mesh;
    };

    /* Daylight: cut into stone.
     *
     * A dark pass offset away from the sun to read as the groove, the face in
     * near-white, the district's colour as a rule underneath.
     *
     * Pale letters rather than the district band. The first pass cut them in
     * the band, which is also what the ground under them is tinted towards,
     * so seven of the eight names were invisible and the eighth was legible
     * only because its band happens to be the brightest. The band comes back
     * as the rule, which keeps the name tied to its district without the
     * reading depending on that tie. */
    const day = sheet();
    const cut = Math.max(1, Math.round(size * 0.07));
    const run = eachLine(day, (ctx, line, y) => {
      ctx.fillStyle = "rgba(6,8,12,0.62)";
      ctx.fillText(line, cx, y + cut);
      ctx.fillStyle = "rgba(242,245,250,0.94)";
      ctx.fillText(line, cx, y);
    });
    const under = top + stack + size * 0.78;
    day.fillStyle = "rgba(6,8,12,0.5)";
    day.fillRect(cx - run / 2, under + rule, run, rule);
    day.fillStyle = accent;
    day.fillRect(cx - run / 2, under, run, rule);

    /* After dark: the same lettering, lit.
     *
     * Additively blended, so the groove contributes nothing and only the
     * light does, which is what makes it read as illuminated rather than as
     * a pale shape lying on a dark surface. Drawn in the district's own
     * colour with a halo round it and a white core inside: at night the kerb
     * is the only other thing carrying that colour, so the name and the
     * boundary it names come up together. */
    const night = sheet();
    night.shadowColor = accent;
    eachLine(night, (ctx, line, y) => {
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = accent;
      ctx.fillText(line, cx, y);
      ctx.fillText(line, cx, y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(line, cx, y);
    });
    night.shadowBlur = size * 0.35;
    night.fillStyle = accent;
    night.fillRect(cx - run / 2, under, run, rule);

    const stone = asPlane(day, false);
    const lit = asPlane(night, true);
    lit.visible = false;
    const group = new THREE.Group();
    group.add(stone);
    group.add(lit);
    group.userData.stone = stone;
    group.userData.lit = lit;
    return group;
  }

  const layout = buildLayout();
  const span = Math.max(layout.size.w, layout.size.d);

  /* The tallest tower standing with no monument on it.
   *
   * A monument means a journey score at or above the landmark threshold. If a
   * plain tower out-topped a monument the height encoding would read
   * backwards, so the terrace under a monument is raised until the assembly
   * clears this figure, which makes the ordering true by construction rather
   * than true by luck of the data.
   *
   * Measured rather than bounded from the config. The landmark threshold
   * falls inside a height tier rather than on its boundary, so the config
   * alone would only promise a ceiling four floors above anything actually
   * built, and clearing that would put every monument back on a plinth. */
  const PLAIN_CEILING = layout.buildings.reduce(
    (tallest, b) => monumentShape(b.category)
      ? tallest : Math.max(tallest, towerTop(b.category)),
    0
  );

  /* How a monument is sized on its lot, worked out once.
   *
   * The lot was already widened for this shape, so the width almost always
   * allows the size the shape wants; the exception is a shape wider than the
   * cap, which comes out shorter and is lifted by its terrace instead.
   *
   * Asked before anything is drawn, to size the ground margin, and again by
   * the build loop to draw it. One derivation, because a margin computed from
   * a different height than the monument is drawn at is a margin that is
   * wrong in exactly the case it exists for. */
  function monumentFit(building) {
    const shape = monumentShape(building.category);
    if (!shape) return null;
    const box = shapeBox(shape);
    if (!box) return null;
    const lot = building.cell || CELL;
    const allowance = (building.span || 1) * lot * MONUMENT_INSET;
    const scale = Math.min(allowance / box.ground, freeScale(box));
    const standing = box.h * scale;
    const terrace = Math.max(
      TERRACE_MIN,
      PLAIN_CEILING + MONUMENT_CLEAR - 0.62 - standing
    );
    return { shape, box, allowance, scale, standing, terrace, top: 0.62 + terrace + standing };
  }

  /** What stands on this lot, whichever kind of thing it is. */
  function assemblyTop(building) {
    const fit = monumentFit(building);
    return fit ? fit.top : towerTop(building.category);
  }

  // The tallest thing that actually stands in this city. Reported, and used
  // to frame the opening view.
  const TALLEST = layout.buildings.reduce(
    (most, b) => Math.max(most, assemblyTop(b)), 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const view = { size: span * 0.62, target: new THREE.Vector3(0, 0, 0) };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  const CAM_DIR = new THREE.Vector3(1, 0.86, 1).normalize();

  function applyCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -view.size * aspect;
    camera.right = view.size * aspect;
    camera.top = view.size;
    camera.bottom = -view.size;
    camera.position.copy(view.target).addScaledVector(CAM_DIR, 400);
    camera.lookAt(view.target);
    camera.updateProjectionMatrix();
  }

  // Frame content by projecting its bounding box onto the camera basis, so the
  // fit is correct at any aspect ratio instead of guessed from a magic number.
  function fitTo(box, margin) {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(CAM_DIR, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, CAM_DIR).normalize();
    const centre = box.getCenter(new THREE.Vector3());
    let h = 0, v = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).sub(centre);
          h = Math.max(h, Math.abs(p.dot(right)));
          v = Math.max(v, Math.abs(p.dot(camUp)));
        }
      }
    }
    const aspect = window.innerWidth / window.innerHeight;
    return { size: Math.max(v, h / aspect) * margin, target: centre.setY(0) };
  }

  const hemi = new THREE.HemisphereLight(0xa8c0e8, 0x232830, 0.46);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.14);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.92);
  sun.position.set(span * 0.55, span * 0.9, span * 0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shade = span * 0.75;
  Object.assign(sun.shadow.camera, {
    left: -shade, right: shade, top: shade, bottom: -shade, near: 1, far: span * 3,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);

  const matSolid = new THREE.MeshLambertMaterial();
  const matPlate = new THREE.MeshLambertMaterial();
  /* The outline of the building an empty lot could carry.
   *
   * Unlit, so its opacity is its brightness whatever the hour, and after dark
   * everything around it drops by an order of magnitude: at 0.3 the eighty-nine
   * empty lots turned into a wireframe mesh over the whole city and the four
   * that matter were lost inside it. It dims with the light. */
  const GHOST_DAY = 0.3;
  const GHOST_NIGHT = 0.075;
  const matGhost = new THREE.MeshBasicMaterial({
    color: C.bare, wireframe: true, transparent: true, opacity: GHOST_DAY,
  });
  const matGhostSolid = new THREE.MeshLambertMaterial({
    color: C.bare, transparent: true, opacity: 0.07,
  });
  const matReactor = new THREE.MeshBasicMaterial({ color: C.reactor });
  const matWindow = new THREE.MeshBasicMaterial({ vertexColors: false });
  const matRiseCap = new THREE.MeshBasicMaterial({ color: 0x9fe9ff });
  const matRiseBeam = new THREE.MeshBasicMaterial({
    color: 0x7fdcff, transparent: true, opacity: 0.2, depthWrite: false,
  });
  const matPotential = new THREE.MeshLambertMaterial({
    transparent: true, opacity: 0.82, emissive: 0x1d5f7d,
  });
  const matBeam = new THREE.MeshBasicMaterial({
    color: 0x8fe8ff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const matPool = new THREE.MeshBasicMaterial({
    color: 0xffe6a6, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  const plates = new Bucket();
  const bricks = new Bucket();
  const studs = new Bucket();
  const houses = new Bucket();
  const ghostBricks = new Bucket();
  const ghostSolid = new Bucket();
  const roofs = new Bucket();
  const ghostRoofs = new Bucket();
  const potential = new Bucket();
  const potentialCaps = new Bucket();
  const riseBeams = new Bucket();
  const windows = new Bucket();
  const lightPools = new Bucket();
  const beams = new Bucket();
  const ghostHouses = new Bucket();
  const reactors = new Bucket();

  // A Lego baseplate is a grid of studs. Cheaper as a repeating texture than as
  // thousands of cylinders, and the plates are few enough to each own one.
  const STUD_TILE = 2.0;
  function studTexture(hex, studHex) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    ctx.fillRect(0, 0, size, size);
    const r = size * 0.27;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2 + size * 0.03, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = "#" + studHex.toString(16).padStart(6, "0");
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  function studdedPlate(x, y, z, w, h, d, hex, studHex) {
    const tex = studTexture(hex, studHex);
    tex.repeat.set(Math.max(1, Math.round(w / STUD_TILE)), Math.max(1, Math.round(d / STUD_TILE)));
    const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // world baseplate
  /* Ground margin around the districts.
   *
   * At a flat +10 a monument standing near the western edge rose past the
   * plate's horizon with nothing behind it, so it read as floating rather
   * than as standing on a lot.
   *
   * The margin is derived from the camera rather than chosen. Under this
   * orthographic projection a point at height h lands where the ground point
   * h * hypot(dx,dz) / dy behind it would, so that much ground has to exist
   * behind it for the thing to have something to stand against. Split evenly
   * between the two ground axes.
   *
   * Asked of every lot rather than of the tallest one anywhere, and answered
   * by what each lot has left over: a monument standing well inside the city
   * already has most of the ground it needs behind it, and only the shortfall
   * has to come out of the margin. Sizing it for the tallest object as though
   * it stood on the boundary cost twelve units on each axis for two towers
   * that are nowhere near one.
   */
  const BEHIND = Math.hypot(CAM_DIR.x, CAM_DIR.z) / CAM_DIR.y / Math.SQRT2;
  const CLEARANCE = Math.ceil(layout.buildings.reduce(
    (most, b) => {
      const reach = assemblyTop(b) * BEHIND;
      return Math.max(most,
        reach - (b.x + layout.size.w / 2),
        reach - (b.z + layout.size.d / 2));
    },
    // The viaducts start in deficit: they run along the ring road outside
    // the districts, so their distance from the block counts against them
    // rather than for them. Left out of the first version of this, their
    // overhead wire came out against the void, which is the one fault the
    // margin exists to prevent.
    FLYOVER_TOP * BEHIND + FLYOVER_OUT
  ));
  const baseW = layout.size.w + 10 + CLEARANCE * 2;
  const baseD = layout.size.d + 10 + CLEARANCE * 2;
  studdedPlate(0, -0.6, 0, baseW, 1.2, baseD, C.ground, 0x373d47);



  // ---------------------------------------------------------------- build it
  layout.districts.forEach((district, i) => {
    const palette = brickSet(i);
    // Ground tinted a few percent toward the district hue. Not enough to carry
    // meaning on its own, which is the rule, but enough that the eye groups
    // the block together.
    const ground = new THREE.Color(C.districtPlate)
      .lerp(new THREE.Color(palette.band), 0.14).getHex();
    studdedPlate(
      district.cx + district.w / 2, -0.05, district.cz + district.d / 2,
      district.w, 0.5, district.d, ground, 0x39434f
    );
    // A kerb right round the district, in its own colour. Without it there is
    // no line where one district stops and the parkland starts, so a small
    // district next to a big lawn looks enormous and a big one looks small.
    // This is slide 11's coloured L2 rectangle, built in bricks.
    for (const side of [-1, 1]) {
      plates.add(
        district.cx + district.w / 2, 0.3,
        district.cz + district.d / 2 + side * (district.d / 2 - KERB / 2),
        district.w, 0.42, KERB, palette.band
      );
      plates.add(
        district.cx + district.w / 2 + side * (district.w / 2 - KERB / 2), 0.3,
        district.cz + district.d / 2,
        KERB, 0.42, district.d, palette.band
      );
    }
    // Studs along the top of it. A coloured strip is a painted line; a
    // coloured strip with studs on it is a Lego brick, and the difference is
    // the whole aesthetic.
    const STUD_STEP = 1.6;
    const inset = KERB / 2;
    for (const side of [-1, 1]) {
      const z = district.cz + district.d / 2 + side * (district.d / 2 - inset);
      const acrossX = Math.floor(district.w / STUD_STEP);
      for (let i = 0; i < acrossX; i++) {
        const x = district.cx + inset + (i + 0.5) * (district.w - KERB) / acrossX;
        studs.add(x, 0.56, z, 0.46, 0.18, 0.46, palette.stud);
      }
      const x = district.cx + district.w / 2 + side * (district.w / 2 - inset);
      const acrossZ = Math.floor(district.d / STUD_STEP);
      for (let i = 0; i < acrossZ; i++) {
        const z2 = district.cz + inset + (i + 0.5) * (district.d - KERB) / acrossZ;
        studs.add(x, 0.56, z2, 0.46, 0.18, 0.46, palette.stud);
      }
    }
    for (const plot of district.plots) {
      studdedPlate(
        plot.cx + plot.w / 2, 0.22, plot.cz + plot.d / 2,
        plot.w, 0.34, plot.d, C.plotPlate, 0x4a5563
      );
    }
    /* The district name, cut into the district's own ground.
     *
     * It was a sprite hanging over the plate. At y=6.5 it sat between the
     * three-storey and five-storey rooflines and covered whatever stood
     * behind it, which is how a monument ended up hidden by the words
     * "Managed Services and Outsourcing"; dropped to just above the kerb it
     * stopped hiding buildings but was still a caption floating in the air,
     * the one thing in the city that is not a physical object.
     *
     * So it goes on the ground, in the strip already reserved and left empty
     * along the near edge of every district plate, engraved the way a board
     * game prints the name of a square. It scales with the world because it
     * is part of the world, which is what makes it read as cut in rather
     * than laid over. Both ground axes foreshorten by the same factor under
     * this camera, so the letters shear without stretching and no correction
     * is needed. */
    const stripD = district.strip - KERB - 0.6;
    const plate = engraveOnGround(
      district.nameFit,
      DISTRICT_BANDS[i % DISTRICT_BANDS.length],
      district.w - KERB * 2 - 1.0,
      stripD
    );
    plate.position.set(
      district.cx + district.w / 2,
      // Clear of the plate it sits on. At 0.01 above it the two surfaces
      // fought for the same depth and the name came out in fragments.
      0.31,
      district.cz + district.d - KERB - 0.3 - stripD / 2
    );
    scene.add(plate);
    districtNames.push(plate);
  });

  // ---------------------------------------------------------- streetscape
  // The gaps between district blocks were dead grey space. They are streets:
  // asphalt with lane markings, lamp posts along the kerbs, parkland on the
  // leftover ground, and people walking about in it. None of it encodes data.
  // it is there so the city reads as a place rather than as a bar chart with
  // studs, which is what makes an empty lot feel like an empty lot.
  const PAVEMENT_TOP = 0.25;
  let lampMesh = null;
  let streetMaterial = null;
  const lampHeads = [];
  const walkers = [];
  const vehicles = [];
  const headlights = [];

  function buildStreetscape() {
    const roadBucket = new Bucket();
    const pavementBucket = new Bucket();
    const dashBucket = new Bucket();
    const trunkBucket = new Bucket();
    const canopyBucket = new Bucket();
    const postBucket = new Bucket();
    const headBucket = new Bucket();
    const paintBucket = new Bucket();
    const shelterBucket = new Bucket();
    const signBucket = new Bucket();
    const signalBucket = new Bucket();

    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const d of layout.districts) {
      bounds.minX = Math.min(bounds.minX, d.cx);
      bounds.maxX = Math.max(bounds.maxX, d.cx + d.w);
      bounds.minZ = Math.min(bounds.minZ, d.cz);
      bounds.maxZ = Math.max(bounds.maxZ, d.cz + d.d);
    }

    // Districts were shelf-packed, so their rows and the gaps between them are
    // already a street grid, so it only has to be drawn.
    const rows = new Map();
    for (const d of layout.districts) {
      const key = Math.round(d.z);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(d);
    }
    const rowKeys = [...rows.keys()].sort((a, b) => a - b);

    const ROAD = RING_ROAD;
    const PAVEMENT = 1.15;
    const KERB_H = 0.26;
    const roads = [];
    const road = (x, z, w, d) => roads.push({ x, z, w, d, vertical: d > w });

    const pad = RING_PAD;
    const minX = bounds.minX - pad, maxX = bounds.maxX + pad;
    const minZ = bounds.minZ - pad, maxZ = bounds.maxZ + pad;
    const spanX = maxX - minX, spanZ = maxZ - minZ;
    road((minX + maxX) / 2, minZ, spanX + ROAD * 2, ROAD);
    road((minX + maxX) / 2, maxZ, spanX + ROAD * 2, ROAD);
    road(minX, (minZ + maxZ) / 2, ROAD, spanZ);
    road(maxX, (minZ + maxZ) / 2, ROAD, spanZ);

    for (let i = 0; i < rowKeys.length - 1; i++) {
      const above = rows.get(rowKeys[i]);
      const below = rows.get(rowKeys[i + 1]);
      const z0 = Math.max(...above.map((d) => d.cz + d.d));
      const z1 = Math.min(...below.map((d) => d.cz));
      road((minX + maxX) / 2, (z0 + z1) / 2, spanX, Math.max(ROAD, z1 - z0));
    }

    for (const key of rowKeys) {
      const row = rows.get(key).slice().sort((a, b) => a.cx - b.cx);
      const z0 = Math.min(...row.map((d) => d.cz)) - 1.2;
      const z1 = Math.max(...row.map((d) => d.cz + d.d)) + 1.2;
      for (let i = 0; i < row.length - 1; i++) {
        const x0 = row[i].cx + row[i].w;
        const x1 = row[i + 1].cx;
        road((x0 + x1) / 2, (z0 + z1) / 2, Math.max(ROAD, x1 - x0), z1 - z0);
      }
    }

    for (const r of roads) {
      roadBucket.add(r.x, 0.02, r.z, r.w, 0.16, r.d, 0x3b414b);

      // Pavements down both sides. People belong on these, not in the road.
      const short = r.vertical ? r.w : r.d;
      const walkway = short / 2 - PAVEMENT / 2;
      for (const side of [-1, 1]) {
        pavementBucket.add(
          r.x + (r.vertical ? side * walkway : 0), 0.12, r.z + (r.vertical ? 0 : side * walkway),
          r.vertical ? PAVEMENT : r.w, KERB_H, r.vertical ? r.d : PAVEMENT,
          0x878e99
        );
      }

      // centre line
      const length = r.vertical ? r.d : r.w;
      const steps = Math.max(1, Math.floor(length / 3.2));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps - 0.5;
        const dx = r.vertical ? 0 : t * r.w;
        const dz = r.vertical ? t * r.d : 0;
        dashBucket.add(
          r.x + dx, 0.11, r.z + dz,
          r.vertical ? 0.16 : 1.1, 0.04, r.vertical ? 1.1 : 0.16,
          0xd6d2c4
        );
      }

      // Lamp posts, alternating kerbs rather than facing each other. Lamps on
      // both sides threw overlapping pools that filled the street with light
      // and left nothing to look at; staggering them lights the whole road
      // with half the fittings and keeps the dark between them.
      const half = (r.vertical ? r.w : r.d) / 2 - PAVEMENT / 2;
      const lampSteps = Math.max(1, Math.floor(length / 9));
      for (let i = 0; i < lampSteps; i++) {
        const t = (i + 0.5) / lampSteps - 0.5;
        const side = i % 2 ? 1 : -1;
        const x = r.x + (r.vertical ? side * half : t * r.w);
        const z = r.z + (r.vertical ? t * r.d : side * half);
        postBucket.add(x, 1.15, z, 0.16, 2.3, 0.16, 0x2b3038);
        // A short arm reaching over the road, so the light is thrown where
        // the traffic is rather than straight down onto the pavement.
        postBucket.add(
          x - (r.vertical ? side * 0.4 : 0), 2.3, z - (r.vertical ? 0 : side * 0.4),
          r.vertical ? 0.9 : 0.14, 0.14, r.vertical ? 0.14 : 0.9, 0x2b3038
        );
        const hx = x - (r.vertical ? side * 0.8 : 0);
        const hz = z - (r.vertical ? 0 : side * 0.8);
        headBucket.add(hx, 2.22, hz, 0.5, 0.22, 0.5, 0xffe6a6);
        lampHeads.push({ x: hx, y: 2.22, z: hz });
        lightPools.add(hx, 0.3, hz, 4.8, 1, 4.8, 0xffe6a6);
      }

      // A painted cycle lane inside each kerb. The cyclists were already
      // riding there; the paint distinguishes a lane from a rider in the
      // gutter.
      const laneOffset = short / 2 - 1.55;
      for (const side of [-1, 1]) {
        paintBucket.add(
          r.x + (r.vertical ? side * laneOffset : 0), 0.105,
          r.z + (r.vertical ? 0 : side * laneOffset),
          r.vertical ? 0.95 : r.w, 0.03, r.vertical ? r.d : 0.95,
          0x7d4a3c
        );
      }

      // Zebra crossings near each end, where people cross in a real street.
      for (const end of [-1, 1]) {
        const cx = r.x + (r.vertical ? 0 : end * (r.w / 2 - 3.6));
        const cz = r.z + (r.vertical ? end * (r.d / 2 - 3.6) : 0);
        const bars = 5;
        for (let b = 0; b < bars; b++) {
          const o = (b / (bars - 1) - 0.5) * (short - PAVEMENT * 2 - 0.6);
          dashBucket.add(
            cx + (r.vertical ? o : 0), 0.115, cz + (r.vertical ? 0 : o),
            r.vertical ? 0.42 : 2.2, 0.04, r.vertical ? 2.2 : 0.42,
            0xf1eee4
          );
        }
      }

      // A bus stop or two on the longer streets: a shelter on the pavement and
      // a flag on a post. Small, but it is the kind of detail that says place.
      if (length > 26) {
        for (const end of [-1, 1]) {
          const side = end;
          const sx = r.x + (r.vertical ? side * walkway : end * r.w * 0.22);
          const sz = r.z + (r.vertical ? end * r.d * 0.22 : side * walkway);
          shelterBucket.add(sx, PAVEMENT_TOP + 0.62, sz,
            r.vertical ? 0.16 : 2.4, 1.2, r.vertical ? 2.4 : 0.16, 0x3d4550);
          shelterBucket.add(sx, PAVEMENT_TOP + 1.28, sz,
            r.vertical ? 1.0 : 2.6, 0.12, r.vertical ? 2.6 : 1.0, 0xc9ccd2);
          postBucket.add(sx + (r.vertical ? -side * 0.7 : 1.6), PAVEMENT_TOP + 0.8,
            sz + (r.vertical ? 1.6 : -side * 0.7), 0.1, 1.6, 0.1, 0x2b3038);
          signBucket.add(sx + (r.vertical ? -side * 0.7 : 1.6), PAVEMENT_TOP + 1.66,
            sz + (r.vertical ? 1.6 : -side * 0.7), 0.5, 0.34, 0.5, 0xe60000);
        }
      }
    }

    // Traffic lights where two streets meet. Nothing reads as a city faster
    // than a signal head on a corner.
    const verticals = roads.filter((r) => r.vertical);
    const horizontals = roads.filter((r) => !r.vertical);
    for (const v of verticals) {
      for (const h of horizontals) {
        const meets = Math.abs(v.x - h.x) < h.w / 2 && Math.abs(h.z - v.z) < v.d / 2;
        if (!meets) continue;
        for (const [ox, oz] of [[-1, -1], [1, 1]]) {
          const x = v.x + ox * (v.w / 2 + 0.4);
          const z = h.z + oz * (h.d / 2 + 0.4);
          postBucket.add(x, 1.35, z, 0.14, 2.7, 0.14, 0x2b3038);
          shelterBucket.add(x, 2.86, z, 0.34, 0.86, 0.34, 0x21252c);
          signalBucket.add(x, 3.14, z + 0.19, 0.16, 0.16, 0.04, 0xe23b3b);
          signalBucket.add(x, 2.88, z + 0.19, 0.16, 0.16, 0.04, 0xf0b429);
          signalBucket.add(x, 2.62, z + 0.19, 0.16, 0.16, 0.04, 0x3fbf6a);
        }
      }
    }

    // Parkland on whatever ground the blocks and streets do not use.
    const blocked = (x, z) => {
      for (const d of layout.districts) {
        if (x > d.cx - 1.4 && x < d.cx + d.w + 1.4 && z > d.cz - 1.4 && z < d.cz + d.d + 1.4) return true;
      }
      for (const r of roads) {
        if (Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < r.d / 2 + 1) return true;
      }
      return false;
    };

    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let x = -baseW / 2 + 3; x < baseW / 2 - 3; x += 4.6) {
      for (let z = -baseD / 2 + 3; z < baseD / 2 - 3; z += 4.6) {
        const jx = x + (rnd() - 0.5) * 2;
        const jz = z + (rnd() - 0.5) * 2;
        /* Street trees, not parkland.
         *
         * At 0.34 these filled every gap between districts with woodland,
         * which reads as parkland worth inspecting. At 0.06 they line the
         * streets and soften the edges without competing with the data. */
        if (blocked(jx, jz) || rnd() > 0.06) continue;
        const scale = 0.8 + rnd() * 0.6;
        trunkBucket.add(jx, 0.45 * scale, jz, 0.22, 0.9 * scale, 0.22, 0x5b4632);
        canopyBucket.add(jx, (0.9 + 0.6) * scale, jz, 1.5 * scale, 1.7 * scale, 1.5 * scale, 0x2f7d46);
        canopyBucket.add(jx, (0.9 + 1.35) * scale, jz, 1.1 * scale, 1.3 * scale, 1.1 * scale, 0x39916f);
      }
    }

    const solid = (streetMaterial = new THREE.MeshLambertMaterial());
    [
      roadBucket.mesh(box, solid, false, true),
      pavementBucket.mesh(box, solid, false, true),
      dashBucket.mesh(box, solid, false, false),
      trunkBucket.mesh(box, solid, true, false),
      canopyBucket.mesh(cone, solid, true, false),
      postBucket.mesh(box, solid, true, false),
      paintBucket.mesh(box, solid, false, true),
      shelterBucket.mesh(box, solid, true, false),
      signBucket.mesh(box, solid, true, false),
      signalBucket.mesh(box, new THREE.MeshBasicMaterial(), false, false),
      (lampMesh = headBucket.mesh(box, new THREE.MeshBasicMaterial({ color: 0xffe6a6 }), false, false)),
    ].forEach((mesh) => mesh && scene.add(mesh));

    buildPedestrians(roads, rnd);
    buildTraffic(roads, rnd, buildFlyovers(roads));
  }

  /* Flyovers.
   *
   * Two of them, and only on the two outer roads at the back of the map. A
   * raised deck anywhere else would cut across the skyline from this camera
   * and hide the buildings, which are the entire point. At the back it reads
   * as the ring road every city has, and blocks nothing.
   */
  function buildFlyovers(roads) {
    const decks = [];
    const parts = new Bucket();
    const kerbs = new Bucket();
    const ramps = new THREE.Group();
    const rampMaterial = new THREE.MeshLambertMaterial({ color: 0x424953 });

    for (const r of [roads[0], roads[2]]) {
      if (!r) continue;
      const length = r.vertical ? r.d : r.w;
      const span = length * 0.58;
      const width = 3.4;
      const rampRun = 9;

      parts.add(r.x, DECK_Y, r.z,
        r.vertical ? width : span, 0.34, r.vertical ? span : width, 0x4a515c);
      for (const side of [-1, 1]) {
        kerbs.add(
          r.x + (r.vertical ? side * (width / 2 - 0.14) : 0), DECK_Y + 0.36,
          r.z + (r.vertical ? 0 : side * (width / 2 - 0.14)),
          r.vertical ? 0.24 : span, 0.42, r.vertical ? span : 0.24, 0xb9bfc8
        );
      }

      // Catenary: a mast every so often along one edge and a wire above the
      // track. Nothing else says tram quite as quickly as an overhead line.
      const masts = Math.max(2, Math.round(span / 8));
      for (let i = 0; i <= masts; i++) {
        const t = i / masts - 0.5;
        kerbs.add(
          r.x + (r.vertical ? width / 2 - 0.2 : t * span), DECK_Y + 1.9,
          r.z + (r.vertical ? t * span : width / 2 - 0.2),
          0.16, 2.4, 0.16, 0x6b727c
        );
      }
      kerbs.add(r.x, DECK_Y + 2.7, r.z,
        r.vertical ? 0.09 : span, 0.09, r.vertical ? span : 0.09, 0x8a919b);

      const piers = Math.max(2, Math.round(span / 9));
      for (let i = 0; i <= piers; i++) {
        const t = i / piers - 0.5;
        parts.add(
          r.x + (r.vertical ? 0 : t * span), DECK_Y / 2, r.z + (r.vertical ? t * span : 0),
          0.8, DECK_Y, 0.8, 0x555c67
        );
      }

      // The ramps down at each end. A deck that simply stops in mid-air looks
      // like a mistake; the slope is what makes it read as a road.
      for (const end of [-1, 1]) {
        const slope = new THREE.Mesh(box, rampMaterial);
        const rise = Math.atan2(DECK_Y, rampRun);
        const run = Math.sqrt(DECK_Y * DECK_Y + rampRun * rampRun);
        const centre = end * (span / 2 + rampRun / 2);
        slope.position.set(
          r.x + (r.vertical ? 0 : centre), DECK_Y / 2, r.z + (r.vertical ? centre : 0)
        );
        slope.scale.set(r.vertical ? width : run, 0.34, r.vertical ? run : width);
        if (r.vertical) slope.rotation.x = end * rise;
        else slope.rotation.z = -end * rise;
        slope.castShadow = true;
        ramps.add(slope);
      }

      decks.push({
        x: r.x, z: r.z, vertical: r.vertical,
        w: r.vertical ? width : span, d: r.vertical ? span : width,
        y: DECK_Y + 0.17,
      });
    }

    const solid = new THREE.MeshLambertMaterial();
    [parts.mesh(box, solid, true, true), kerbs.mesh(box, solid, true, false)]
      .forEach((mesh) => mesh && scene.add(mesh));
    scene.add(ramps);
    return decks;
  }

  // People, and a few dogs. Small, slow and never in the way. They keep the
  // streets from reading as deserted.
  function buildPedestrians(roads, rnd) {
    const COATS = [0xd94f4f, 0x3f7fd0, 0xe0b53c, 0x46a06a, 0xb35fb0, 0xdd8a3a];
    const group = new THREE.Group();
    const longRoads = roads.filter((r) => Math.max(r.w, r.d) > 14);

    for (let i = 0; i < 52; i++) {
      const r = longRoads[Math.floor(rnd() * longRoads.length)] || roads[0];
      const coat = COATS[Math.floor(rnd() * COATS.length)];
      const person = new THREE.Group();
      const body = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: coat }));
      body.scale.set(0.42, 0.8, 0.36);
      body.position.y = 0.4;
      body.castShadow = true;
      person.add(body);
      const head = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xf3c85c }));
      head.scale.set(0.34, 0.32, 0.32);
      head.position.y = 0.96;
      person.add(head);
      group.add(person);

      let dog = null;
      if (rnd() < 0.28) {
        dog = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
        dog.scale.set(0.42, 0.28, 0.24);
        dog.position.y = 0.15;
        group.add(dog);
      }

      // On the pavement, on one side or the other, not down the middle of the road.
      const short = r.vertical ? r.w : r.d;
      const side = rnd() < 0.5 ? -1 : 1;
      const lane = side * (short / 2 - 0.6 + (rnd() - 0.5) * 0.5);
      walkers.push({
        person,
        dog,
        road: r,
        lane,
        t: rnd(),
        speed: (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1),
      });
    }
    scene.add(group);
  }

  // Traffic. Vehicles keep to a lane on their side of the centre line and run
  // the length of a street, which is enough to read as a working city from the
  // isometric camera. The tram is the exception: it gets its own avenue, rails
  // and a fixed route, because a tram is the thing that makes a model city look
  // like somebody planned it.
  function vehicleBody(kind, colour) {
    const group = new THREE.Group();
    const panel = (hex, x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: hex }));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const glass = 0x2b3644;

    if (kind === "bus") {
      panel(colour, 0, 0.62, 0, 3.4, 0.95, 1.15);
      panel(glass, 0, 0.95, 0, 3.2, 0.28, 1.2);
      panel(0x1b1e24, -1.1, 0.16, 0, 0.5, 0.32, 1.25);
      panel(0x1b1e24, 1.1, 0.16, 0, 0.5, 0.32, 1.25);
    } else if (kind === "truck") {
      panel(colour, -1.15, 0.62, 0, 1.2, 0.9, 1.1);
      panel(glass, -1.15, 0.92, 0, 1.0, 0.26, 1.15);
      panel(0xd8d4c8, 0.55, 0.78, 0, 2.2, 1.2, 1.15);
      panel(0x1b1e24, -1.1, 0.16, 0, 0.45, 0.32, 1.2);
      panel(0x1b1e24, 0.9, 0.16, 0, 0.45, 0.32, 1.2);
    } else {
      panel(colour, 0, 0.42, 0, 2.0, 0.5, 0.95);
      panel(glass, 0.05, 0.76, 0, 1.05, 0.34, 0.88);
      panel(0x1b1e24, -0.65, 0.14, 0, 0.4, 0.28, 1.0);
      panel(0x1b1e24, 0.65, 0.14, 0, 0.4, 0.28, 1.0);
    }

    const lamp = panel(0xfff0c0, kind === "bus" ? 1.72 : 1.03, 0.45, 0, 0.12, 0.16, 0.75);
    headlights.push(lamp);
    return group;
  }

  function cycle(colour) {
    const group = new THREE.Group();
    const add = (geo, hex, x, y, z, sx, sy, sz, rot) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hex }));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      if (rot) mesh.rotation.z = Math.PI / 2;
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    // Wheels are discs standing on edge, not blocks: it is the round wheel
    // that makes the silhouette read as a bicycle at this distance.
    add(cyl, 0x24282f, -0.44, 0.3, 0, 0.6, 0.09, 0.6, true);
    add(cyl, 0x24282f, 0.44, 0.3, 0, 0.6, 0.09, 0.6, true);
    add(box, 0xb9c0c9, 0, 0.42, 0, 0.95, 0.07, 0.07);   // crossbar
    add(box, 0xb9c0c9, -0.2, 0.34, 0, 0.07, 0.3, 0.07); // seat post
    add(box, 0xb9c0c9, 0.34, 0.52, 0, 0.07, 0.36, 0.07); // head tube
    add(box, 0x24282f, 0.34, 0.68, 0, 0.09, 0.07, 0.46); // handlebars
    add(box, colour, -0.12, 0.78, 0, 0.3, 0.5, 0.28);    // torso
    add(box, colour, 0.08, 0.72, 0, 0.34, 0.09, 0.1);    // arms reaching forward
    add(box, 0x2b3140, -0.16, 0.5, 0, 0.16, 0.3, 0.22);  // legs
    add(box, 0xf3c85c, -0.12, 1.13, 0, 0.28, 0.26, 0.26); // head
    add(box, 0xd94f4f, -0.12, 1.28, 0, 0.32, 0.1, 0.3);   // helmet
    add(box, 0xff3b30, -0.62, 0.5, 0, 0.09, 0.12, 0.12);  // rear light
    add(box, 0xf1eee4, 0.56, 0.56, 0, 0.09, 0.12, 0.12);  // and a front one
    group.scale.setScalar(1.7);
    return group;
  }

  function buildTraffic(roads, rnd, decks) {
    const PAINT = [0xd94f4f, 0x3f7fd0, 0xe8e4d8, 0x46a06a, 0x2b3038, 0xdd8a3a];
    const group = new THREE.Group();
    const usable = roads.filter((r) => Math.max(r.w, r.d) > 14);

    /* Traffic follows money.
     *
     * "Anything that moves has to mean something" is the right rule, and
     * until now these were ambience: weighted by road length, which is a fact
     * about the drawing rather than about Networks. Each road is now assigned
     * to the district it runs closest to, and a district's share of the €760m
     * decides how busy its streets are. Managed Services and Outsourcing
     * carries 37.7% of the spend from ten categories, so its roads are the
     * busiest on the map, and Network Revenue Platforms at 1.7% is quiet.
     *
     * Length still counts for something, so a long avenue does not end up
     * emptier than the short link beside it. */
    const spendShare = new Map();
    let citySpend = 0;
    for (const district of layout.districts) {
      const spend = district.totals ? district.totals.spend_eur : 0;
      spendShare.set(district, spend);
      citySpend += spend;
    }
    const nearestDistrict = (road) => {
      let best = null, bestDistance = Infinity;
      for (const district of layout.districts) {
        const dx = road.x - (district.cx + district.w / 2);
        const dz = road.z - (district.cz + district.d / 2);
        const distance = dx * dx + dz * dz;
        if (distance < bestDistance) { bestDistance = distance; best = district; }
      }
      return best;
    };

    const weighted = [];
    for (const r of usable) {
      const length = Math.max(1, Math.round(Math.max(r.w, r.d) / 12));
      const district = nearestDistrict(r);
      const share = citySpend && district
        ? (spendShare.get(district) || 0) / citySpend : 0;
      // A floor of one keeps every street alive: an empty district should
      // look quiet, not abandoned, and zooming anywhere should find movement.
      const busy = Math.max(1, Math.round(length * (0.35 + share * 5.2)));
      for (let n = 0; n < busy; n++) weighted.push(r);
    }
    const pickRoad = () => weighted[Math.floor(rnd() * weighted.length)] || roads[0];

    for (let i = 0; i < 58; i++) {
      const road = pickRoad();
      const roll = rnd();
      const kind = roll < 0.62 ? "car" : roll < 0.84 ? "truck" : "bus";
      const forward = rnd() < 0.5;
      const vehicle = vehicleBody(kind, PAINT[Math.floor(rnd() * PAINT.length)]);
      group.add(vehicle);
      vehicles.push({
        object: vehicle,
        road,
        // keep right, so the lane offset follows the direction of travel
        lane: (forward ? 1 : -1) * 0.85,
        t: rnd(),
        speed: (forward ? 1 : -1) * (kind === "bus" ? 0.05 : 0.07 + rnd() * 0.05),
      });
    }

    // A few cyclists, keeping in close to the kerb where a cycle lane would be.
    for (let i = 0; i < 20; i++) {
      const road = pickRoad();
      const forward = rnd() < 0.5;
      const short = road.vertical ? road.w : road.d;
      const bike = cycle([0x46a06a, 0xd94f4f, 0x3f7fd0, 0xe0b53c][Math.floor(rnd() * 4)]);
      group.add(bike);
      vehicles.push({
        object: bike,
        road,
        lane: (forward ? 1 : -1) * (short / 2 - 1.55),
        t: rnd(),
        speed: (forward ? 1 : -1) * (0.035 + rnd() * 0.02),
      });
    }

    // The trams own the flyovers. Cars up there were just more cars; a
    // viaduct that exists to carry the tram line explains itself, and the
    // roadway underneath stays clear for the traffic that belongs on it.
    const rails = new Bucket();
    for (const deck of decks || []) {
      const length = deck.vertical ? deck.d : deck.w;
      for (const side of [-0.62, 0.62]) {
        rails.add(
          deck.x + (deck.vertical ? side : 0), deck.y + 0.05,
          deck.z + (deck.vertical ? 0 : side),
          deck.vertical ? 0.14 : length, 0.06, deck.vertical ? length : 0.14,
          0x6d737d
        );
      }

      const tram = new THREE.Group();
      for (let car = 0; car < 3; car++) {
        const unit = new THREE.Group();
        const body = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xe60000 }));
        body.scale.set(3.5, 1.26, 1.5);
        body.position.y = 0.86;
        body.castShadow = true;
        unit.add(body);
        const windows = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xf3f1e8 }));
        windows.scale.set(3.1, 0.4, 1.56);
        windows.position.y = 1.2;
        unit.add(windows);
        unit.userData.offset = (car - 1) * 3.8;
        tram.add(unit);
      }
      group.add(tram);
      // It runs to the end of the viaduct and comes back, the way a tram works
      // a terminus. Wrapping it round would pop the whole thing from one end
      // of the deck to the other in a single frame.
      vehicles.push({
        object: tram, road: deck, y: deck.y, lane: 0,
        t: 0.15 + rnd() * 0.5, speed: 0.05, tram: true, bounce: true,
      });
    }
    const railMesh = rails.mesh(box, new THREE.MeshLambertMaterial(), false, false);
    if (railMesh) scene.add(railMesh);

    scene.add(group);
  }

  function updateTraffic(delta) {
    for (const v of vehicles) {
      v.t += v.speed * delta;
      if (v.bounce) {
        // Reverse at each end rather than wrapping round.
        if (v.t > 1) { v.t = 2 - v.t; v.speed = -v.speed; }
        if (v.t < 0) { v.t = -v.t; v.speed = -v.speed; }
      } else {
        if (v.t > 1) v.t -= 1;
        if (v.t < 0) v.t += 1;
      }
      const r = v.road;
      const length = r.vertical ? r.d : r.w;
      const along = (v.t - 0.5) * length;
      const facing = v.speed > 0 ? 1 : -1;

      if (v.tram) {
        // A tram that turns back has to keep all three carriages on the deck,
        // so it runs the length less its own, and the carriages trail rather
        // than wrapping round.
        const TRAIN = 11.5;
        const usable = v.bounce ? Math.max(6, length - TRAIN) : length;
        const lead = (v.t - 0.5) * usable;
        for (const unit of v.object.children) {
          let at = lead + unit.userData.offset * facing;
          const half = length / 2;
          if (!v.bounce) {
            if (at > half) at -= length;
            if (at < -half) at += length;
          }
          unit.position.set(
            r.x + (r.vertical ? 0 : at),
            v.y || 0,
            r.z + (r.vertical ? at : 0)
          );
          unit.rotation.y = r.vertical ? Math.PI / 2 : 0;
        }
        continue;
      }

      v.object.position.set(
        r.x + (r.vertical ? v.lane : along),
        v.y || 0,
        r.z + (r.vertical ? along : v.lane)
      );
      v.object.rotation.y = (r.vertical ? Math.PI / 2 : 0) + (facing > 0 ? 0 : Math.PI);
    }
  }

  function updateWalkers(now, delta) {
    for (const w of walkers) {
      w.t += w.speed * delta;
      if (w.t > 1) w.t -= 1;
      if (w.t < 0) w.t += 1;
      const r = w.road;
      const along = (w.t - 0.5) * (r.vertical ? r.d : r.w);
      const x = r.x + (r.vertical ? w.lane : along);
      const z = r.z + (r.vertical ? along : w.lane);
      const bob = Math.abs(Math.sin(now * 8 + w.lane)) * 0.06;
      w.person.position.set(x, PAVEMENT_TOP + bob, z);
      w.person.rotation.y = r.vertical ? (w.speed > 0 ? 0 : Math.PI) : (w.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (w.dog) {
        const trail = 0.9 * (w.speed > 0 ? -1 : 1);
        w.dog.position.set(
          x + (r.vertical ? 0.45 : trail),
          PAVEMENT_TOP,
          z + (r.vertical ? trail : 0.45)
        );
        w.dog.rotation.y = w.person.rotation.y;
      }
    }
  }

  buildStreetscape();

  const pickTargets = [];
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false,
  });

  /* ------------------------------------------------------------- landmarks
   *
   * Five categories are live in five or more markets, and each gets a world
   * landmark drawn from a market that actually adopted that blueprint. The
   * rule is the point: a landmark that came from nowhere would be decoration,
   * one from an adopting market says this blueprint travelled. The pairing is
   * decided in the build, in config/metrics.yaml; this only draws it.
   *
   * Ordinary lots are instanced, one draw call per shape. There are only five
   * of these, so each is a plain group. Five extra draw calls buys geometry
   * that no instancing scheme would have given us.
   */
  function landmarkGroup(shape) {
    const group = new THREE.Group();
    const put = (hex, x, y, z, sx, sy, sz, geometry) => {
      const mesh = new THREE.Mesh(geometry || box, new THREE.MeshLambertMaterial({ color: hex }));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const ring = (hex, count, radius, y, sx, sy, sz, geometry) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        put(hex, Math.cos(a) * radius, y, Math.sin(a) * radius, sx, sy, sz, geometry);
      }
    };

    if (shape === "clocktower") {
      // Big Ben: a square shaft, four clock faces, a spire.
      put(STONE, 0, 2.1, 0, 0.78, 4.2, 0.78);
      put(STONE_DARK, 0, 4.35, 0, 0.94, 0.28, 0.94);
      for (const [dx, dz] of [[0.42, 0], [-0.42, 0], [0, 0.42], [0, -0.42]]) {
        put(GOLD, dx, 3.75, dz, dx ? 0.06 : 0.44, 0.44, dz ? 0.06 : 0.44);
      }
      put(STONE, 0, 5.1, 0, 0.66, 1.2, 0.66, pyramid);
      put(GOLD, 0, 5.85, 0, 0.14, 0.4, 0.14);
    } else if (shape === "colosseum") {
      // Two tiers of arches, and the missing third that everyone pictures.
      ring(STONE, 16, 1.15, 0.55, 0.3, 1.1, 0.3);
      ring(STONE_DARK, 16, 1.15, 1.2, 0.34, 0.2, 0.34);
      ring(STONE, 14, 1.12, 1.75, 0.28, 0.9, 0.28);
      for (let i = 0; i < 9; i++) {
        const a = (i / 16) * Math.PI * 2;
        put(STONE_DARK, Math.cos(a) * 1.1, 2.35, Math.sin(a) * 1.1, 0.3, 0.7, 0.3);
      }
      put(STONE_DARK, 0, 0.16, 0, 2.7, 0.3, 2.7, cyl);
    } else if (shape === "parthenon") {
      // A stepped base, a colonnade, a pediment.
      put(STONE_DARK, 0, 0.16, 0, 2.5, 0.32, 1.7);
      put(STONE_DARK, 0, 0.42, 0, 2.2, 0.24, 1.45);
      for (let i = 0; i < 6; i++) {
        const x = -0.9 + i * 0.36;
        put(STONE, x, 1.15, 0.6, 0.13, 1.4, 0.13, cyl);
        put(STONE, x, 1.15, -0.6, 0.13, 1.4, 0.13, cyl);
      }
      put(STONE, 0, 1.95, 0, 2.1, 0.22, 1.4);
      put(STONE, 0, 2.2, 0, 1.9, 0.34, 1.2, pyramid);
    } else if (shape === "pyramid") {
      // Three of them, largest at the back, as the postcard has it.
      put(STONE, 0, 1.35, 0, 2.5, 2.7, 2.5, pyramid);
      put(STONE_DARK, 1.5, 0.75, 0.9, 1.4, 1.5, 1.4, pyramid);
      put(STONE_DARK, -1.4, 0.55, 1.1, 1.05, 1.1, 1.05, pyramid);
    } else if (shape === "gate") {
      // Brandenburg Gate: twelve columns, an entablature, a quadriga.
      for (let i = 0; i < 6; i++) {
        const x = -1.05 + (i % 3) * 1.05;
        const z = i < 3 ? 0.4 : -0.4;
        put(STONE, x, 0.95, z, 0.19, 1.9, 0.19, cyl);
      }
      put(STONE, 0, 2.05, 0, 2.6, 0.34, 1.15);
      put(STONE_DARK, 0, 2.32, 0, 2.2, 0.22, 0.95);
      put(LEAD, 0, 2.62, 0, 0.7, 0.36, 0.3);
      put(LEAD, -0.3, 2.55, 0, 0.22, 0.3, 0.22);
      put(LEAD, 0.3, 2.55, 0, 0.22, 0.3, 0.22);
    } else if (shape === "dome") {
      // Hagia Sophia: a broad central dome, half domes either side, minarets.
      put(STONE, 0, 0.55, 0, 2.3, 1.1, 1.9);
      put(STONE_DARK, 0, 1.28, 0, 1.5, 0.42, 1.4, cyl);
      put(LEAD, 0, 1.85, 0, 1.55, 1.0, 1.55, sphere);
      put(GOLD, 0, 2.45, 0, 0.1, 0.34, 0.1);
      for (const dx of [-0.86, 0.86]) {
        put(LEAD, dx, 1.34, 0, 0.82, 0.5, 0.82, sphere);
      }
      for (const [dx, dz] of [[-1.3, 0.85], [1.3, 0.85], [-1.3, -0.85], [1.3, -0.85]]) {
        put(STONE, dx, 1.5, dz, 0.17, 3.0, 0.17, cyl);
        put(STONE_DARK, dx, 3.12, dz, 0.22, 0.5, 0.22, pyramid);
      }
    } else if (shape === "castle") {
      // Rozafa Castle: a walled keep on a rise, one round tower, battlements.
      put(STONE_DARK, 0, 0.3, 0, 2.7, 0.6, 2.1);
      put(STONE, 0, 1.05, 0, 2.2, 0.9, 1.7);
      ring(STONE_DARK, 10, 1.05, 1.62, 0.24, 0.34, 0.24);
      put(STONE, -0.72, 1.75, 0, 0.72, 2.3, 0.72, cyl);
      ring(STONE_DARK, 7, 0.42, 3.0, 0.2, 0.3, 0.2);
      put(STONE, 0.62, 1.5, 0, 0.86, 1.8, 0.86);
      put(LEAD, 0.62, 2.55, 0, 0.28, 0.4, 0.06);
    } else if (shape === "palace") {
      // Palace of the Parliament: a wide tiered block behind a colonnade.
      put(STONE_DARK, 0, 0.18, 0, 3.0, 0.36, 2.0);
      put(STONE, 0, 0.85, 0, 2.6, 1.0, 1.7);
      for (let i = 0; i < 8; i++) {
        put(STONE_DARK, -1.05 + i * 0.3, 0.95, 0.88, 0.12, 1.2, 0.12, cyl);
      }
      put(STONE, 0, 1.52, 0, 2.7, 0.26, 1.8);
      put(STONE, 0, 1.95, 0, 1.9, 0.7, 1.3);
      put(STONE_DARK, 0, 2.4, 0, 2.0, 0.2, 1.4);
      put(STONE, 0, 2.72, 0, 1.1, 0.5, 0.9);
      put(STONE_DARK, 0, 3.05, 0, 1.2, 0.16, 1.0);
    } else if (shape === "spire_sphere") {
      // Berlin TV Tower: a tapered shaft, a sphere, an antenna.
      put(STONE_DARK, 0, 0.2, 0, 1.5, 0.4, 1.5, cyl);
      put(STONE, 0, 1.9, 0, 0.5, 3.4, 0.5, cyl);
      put(LEAD, 0, 3.9, 0, 1.25, 1.25, 1.25, sphere);
      put(GOLD, 0, 4.02, 0, 1.3, 0.16, 1.3, cyl);
      put(STONE, 0, 5.1, 0, 0.2, 1.2, 0.2, cyl);
      put(STONE_DARK, 0, 5.9, 0, 0.08, 0.7, 0.08, cyl);
    } else {
      return null;
    }
    return group;
  }

  const landmarks = [];

  for (const building of layout.buildings) {
    const category = building.category;
    const state = category.blueprint_state;
    const heightTier = tierIndex(layerMetric("height"), valueFor(category, "height"));
    const valueTier = tierOf(layerMetric("value"), valueFor(category, "value"));
    const pieceCount = valueTier.pieces !== undefined
      ? valueTier.pieces
      : tierIndex(layerMetric("value"), valueFor(category, "value"));
    const reactorTier = tierIndex(layerMetric("reactor"), valueFor(category, "reactor"));

    // Built is not the same as used. 44 categories have an active blueprint;
    // four have one anybody has ever run a sourcing event through.
    const occupied = (category.metrics.cbp_used || 0) > 0;
    const palette = brickSet(building.district.index, occupied);
    // Footprint follows the lot it stands on, or a building overflows a small
    // plot and rattles around inside an expensive one.
    const LOT = building.cell || CELL;
    const FOOT = (LOT / CELL) * 2.4;
    const pieces = { foundation: null, floors: [], studs: [], houses: [], ghosts: [], reactor: null };
    building.pieces = pieces;
    const x = building.x, z = building.z;
    const active = state === "active";
    const floors = active ? FLOORS[Math.min(heightTier, FLOORS.length - 1)] : 0;

    const shape = monumentShape(category);
    const span = building.span || 1;

    /* Foundation. A draft blueprint claims the plot; an active one lays
     * foundations that can be built on. A monument's foundation covers its
     * whole widened lot, so the extra ground is visible from any distance
     * even when the monument itself is not yet readable. */
    const foundationColor = state === "active" ? C.active : state === "draft" ? C.draft : C.bare;
    const pad = shape ? span * LOT * MONUMENT_INSET : FOOT + 0.5;
    pieces.foundation = { bucket: "plates", i: plates.add(x, 0.5, z, pad, 0.24, pad, foundationColor) };

    let top = 0.62;
    const monument = shape ? landmarkGroup(shape) : null;

    if (monument) {
      /* One height for every monument, and the ground to suit the shape.
       *
       * The lot was already widened for this shape, so the width almost
       * always allows the full height; the exception is a shape wider than
       * the cap, which comes out shorter. */
      const fit = monumentFit(building);
      const proportions = fit.box;
      const allowance = fit.allowance;
      const scale = fit.scale;
      const standing = fit.standing;

      /* The terrace.
       *
       * Two low stone courses the size of the monument's own footprint, which
       * reads as a plaza rather than a plinth. It grows only for a shape too
       * wide to reach full height in the lot it was given: the pyramids are
       * half as tall as they are wide, so they stand on a plateau, and every
       * monument still finishes clear of every plain tower. */
      const terrace = fit.terrace;
      const foot = Math.min(proportions.ground * scale + 0.6, allowance);
      const step = Math.min(0.26, terrace / 2);
      plates.add(x, 0.62 + step / 2, z, foot + 0.5, step, foot + 0.5, STONE);
      plates.add(x, 0.62 + step + (terrace - step) / 2, z, foot, terrace - step, foot, STONE_DARK);

      monument.position.set(x, 0.62 + terrace, z);
      monument.scale.setScalar(scale);

      /* A monument is subject to occupancy like any other lot.
       *
       * All four categories anybody has run a sourcing event through earned a
       * monument, so when the monument replaced the building the lit-window
       * layer stopped encoding anything at all: the only four lots that had
       * the signal were the only four with no windows to put it in. Four of
       * the eight monuments are in use and four are not, and nothing on
       * screen said which.
       *
       * So the same two rules the buildings follow. By day an unused
       * monument's stone is washed towards the same cold neutral as an
       * unused facade. By night a used one is floodlit, which is what
       * happens to a monument somebody cares about. */
      if (!occupied) {
        // landmarkGroup builds one material per mesh, so this touches only
        // this monument.
        const wash = new THREE.Color(0x9aa0aa);
        monument.traverse((node) => {
          if (node.material && node.material.color) node.material.color.lerp(wash, VACANT_WASH);
        });
      } else {
        const lit = Math.max(foot, standing * 0.6);
        lightPools.add(x, 0.62 + terrace + 0.02, z, lit * 1.5, 1, lit * 1.5, 0xffdc9a);
      }

      scene.add(monument);
      landmarks.push({ group: monument, code: category.code, occupied });
      top = 0.62 + terrace + standing;
    } else if (floors > 0) {
      for (let f = 0; f < floors; f++) {
        const y = 0.62 + f * FLOOR_H + FLOOR_H / 2;
        pieces.floors.push({ bucket: "bricks", i: bricks.add(x, y, z, FOOT, FLOOR_H - 0.2, FOOT, f % 2 ? palette.alt : palette.main) });
        /* Window strips on the two faces the isometric camera can see.
         *
         * Lights only come on in a building somebody uses. At night that
         * makes the point without a word of commentary: four lit buildings
         * in the whole of Networks. Within an occupied building a few panes
         * are still left dark, so it reads as a building rather than a slab. */
        const lit = occupied && (f * 7 + x * 3 + z) % 10 < 7;
        const glass = lit ? 0xffd98a : 0x2a2f38;
        windows.add(x + FOOT / 2, y, z, 0.06, 0.42, FOOT * 0.62, glass);
        windows.add(x, y, z + FOOT / 2, FOOT * 0.62, 0.42, 0.06, glass);
      }
      top = 0.62 + floors * FLOOR_H;
      // studs only on the roof: enough to read as brick, cheap to draw. Not
      // under a monument, which needs the roof clear to sit on.
      if (!monument) {
        for (const dx of [-0.58, 0.58]) {
          for (const dz of [-0.58, 0.58]) {
            pieces.studs.push({ bucket: "studs", i: studs.add(x + dx, top + 0.11, z + dz, 0.62, 0.22, 0.62, palette.stud) });
          }
        }
      }
    }


    if (floors > 0) {
      if (reactorTier > 0) {
        /* Sized so the lowest lit tier is still visible from the default
         * camera. The previous constants were tuned when the ladder had four
         * rungs and values reached double figures; on a three-rung ladder they
         * produced a disc under half a unit across. */
        const glow = 0.62 + reactorTier * 0.26;
        pieces.reactor = { bucket: "reactors", i: reactors.add(x, top + 0.3, z, glow * 1.15, 0.26, glow * 1.15) };
        /* Every lit rooftop gets a beam, and the top rung gets a tall one.
         *
         * The beam used to be the top rung alone, which meant four of the
         * eight lit rooftops had nothing to read at a distance: the disc on
         * its own is under a unit across and disappears at the default
         * camera, so the city looked as though four categories had AI
         * activity when eight do. A short beam for a first attempt and a
         * tall one for repeated use keeps both facts, and keeps them in
         * order. */
        if (reactorTier > 0) {
          const reach = reactorTier >= 2 ? 7 + reactorTier * 3.4 : 4.2;
          beams.add(x, top + 0.35 + reach / 2, z, glow * 2.2, reach, glow * 2.2);
        }
      }
    } else {
      // What this lot could carry, shown only in the "could be" view. A drafted
      // lot is sized by the reach its blueprint already has; an empty one by the
      // spend sitting on it. A lot with neither stays an outline, because there
      // is nothing on record to justify a building.
      const spendTier = tierIndex(layerMetric("value"), valueFor(category, "value"));
      const couldBe = state === "draft" ? heightTier : spendTier;
      const couldFloors = couldBe > 0 ? FLOORS[Math.min(couldBe, FLOORS.length - 1)] : 0;
      pieces.potential = [];
      for (let f = 0; f < couldFloors; f++) {
        const y = 0.62 + f * FLOOR_H + FLOOR_H / 2;
        pieces.potential.push({
          bucket: "potential",
          i: potential.add(x, y, z, FOOT, FLOOR_H - 0.2, FOOT, f % 2 ? palette.alt : palette.main),
        });
      }
      if (couldFloors > 0) {
        // A lit cap and a column of light. Thirty-two translucent towers in a
        // city of a hundred and forty-five were too quiet to notice from the
        // back of a room; the light is what makes the view land in one look.
        const crown = 0.62 + couldFloors * FLOOR_H;
        pieces.potential.push({
          bucket: "potentialCaps",
          i: potentialCaps.add(x, crown + 0.14, z, FOOT + 0.34, 0.28, FOOT + 0.34),
        });
        const reach = 9 + couldFloors * 0.9;
        pieces.potential.push({
          bucket: "riseBeams",
          i: riseBeams.add(x, crown + 0.3 + reach / 2, z, 1.5, reach, 1.5),
        });
      }

      // Nothing built: show the outline of what could stand here.
      const ghostFloors = FLOORS[Math.min(Math.max(heightTier, 1), FLOORS.length - 1)];
      const h = ghostFloors * FLOOR_H;
      pieces.ghosts.push({ bucket: "ghostBricks", i: ghostBricks.add(x, 0.62 + h / 2, z, FOOT, h, FOOT) });
      pieces.ghosts.push({ bucket: "ghostSolid", i: ghostSolid.add(x, 0.62 + h / 2, z, FOOT, h, FOOT) });
    }

    // Houses and hotel along the front of the lot. On an undeveloped plot they
    // are ghosted, because the value is real but the development is not.
    if (pieceCount > 0) {
      // Houses and a hotel have to be told apart at a glance, so they differ in
      // silhouette rather than only in colour: a house is a small cube under a
      // pitched roof, a hotel is a long two-storey block. Colour alone was not
      // enough at typical viewing distance.
      const hotel = valueTier.id === "hotel";
      // Kept inside the lot. Pushed further forward the hotel overhung the
      // kerb and clipped whatever stood on the next lot along.
      const front = z + FOOT / 2 + 0.42;
      /* Solid whatever the blueprint state is.
       *
       * The property encodes spend, which is recorded fact and does not depend
       * on anybody having written a blueprint. Ghosting it at 7% opacity put
       * the strongest juxtaposition in the estate out of sight: A311 carries
       * €75m on ground nobody has claimed, and its hotel was invisible. The
       * building outline stays ghosted, because that building genuinely does
       * not exist; the money does. */
      const bodies = houses;
      const bodyName = "houses";
      const caps = roofs;
      const capName = "roofs";
      const push = (bucket, name, ...args) =>
        pieces.houses.push({ bucket: name, i: bucket.add(...args) });

      if (hotel) {
        // The Monopoly hotel: one long red block exactly as wide as the four
        // houses it replaces, two storeys where a house has one, a white band
        // of windows across it and a sign on the roof. Told at a glance by
        // being longer, taller and lighter, not only by being red: at low
        // colour fidelity red and green resolve to the same shape.
        const width = 2.72;
        push(bodies, bodyName, x, 0.62 + 0.34, front, width, 0.68, 0.88, C.hotel);
        push(bodies, bodyName, x, 0.62 + 0.74, front, width - 0.22, 0.2, 0.92, 0xf1eee4);
        push(bodies, bodyName, x, 0.62 + 1.06, front, width - 0.1, 0.44, 0.88, C.hotel);
        push(caps, capName, x, 0.62 + 1.5, front, width, 0.46, 1.0, 0xb00000);
        push(bodies, bodyName, x, 0.62 + 1.88, front, 0.9, 0.3, 0.16, 0xf1eee4);
      } else {
        // A house: one small cube under a pitched roof. Four of them fill the
        // same frontage the hotel occupies, which is what makes the upgrade
        // read as an upgrade rather than as a different colour.
        const step = 0.72;
        const startX = x - ((pieceCount - 1) * step) / 2;
        for (let p = 0; p < pieceCount; p++) {
          const hx = startX + p * step;
          push(bodies, bodyName, hx, 0.62 + 0.26, front, 0.52, 0.52, 0.52, C.house);
          push(caps, capName, hx, 0.62 + 0.68, front, 0.62, 0.34, 0.62, 0x1f7a3c);
        }
      }
    }

    // What the camera needs to frame this lot. A monument category reaches
    // roughly twice the height of the tallest plain tower, and a fixed frame
    // size cut the monument off the top the moment you focused on one.
    building.top = top;

    /* The pointer target covers the lot, whatever size the lot is.
     *
     * It was a fixed 3.4 square, which is wider than a lot in the cheapest
     * plots and a third of the ground under a monument. Hovering the edge of
     * a small lot picked its neighbour, and hovering the pyramids picked
     * nothing at all. */
    const reach = shape ? span * LOT * MONUMENT_INSET : Math.max(LOT - 0.6, 1.6);
    const pick = new THREE.Mesh(box, pickMaterial);
    pick.scale.set(reach, Math.max(top + 1.5, 3), reach);
    pick.position.set(x, Math.max(top + 1.5, 3) / 2, z);
    pick.userData.category = category;
    scene.add(pick);
    pickTargets.push(pick);
  }

  // Every category by code, and every lot by the code standing on it, for
  // anything that needs to look one up rather than scan the list.
  const byCode = new Map(CITY.categories.map((c) => [c.code, c]));
  const positionOf = new Map(layout.buildings.map((b) => [b.category.code, b]));

  // Which codes have a monument actually standing on them, as opposed to one
  // assigned in the data. The two agree today and the interface should not
  // depend on their agreeing.
  const standing = new Set(landmarks.map((l) => l.code));

  const BUCKETS = {
    plates: { bucket: plates, mesh: plates.mesh(box, matPlate, false, true) },
    bricks: { bucket: bricks, mesh: bricks.mesh(box, matSolid, true, true) },
    studs: { bucket: studs, mesh: studs.mesh(cyl, matSolid, true, false) },
    houses: { bucket: houses, mesh: houses.mesh(box, matSolid, true, true) },
    ghostSolid: { bucket: ghostSolid, mesh: ghostSolid.mesh(box, matGhostSolid, false, false) },
    ghostBricks: { bucket: ghostBricks, mesh: ghostBricks.mesh(box, matGhost, false, false) },
    ghostHouses: { bucket: ghostHouses, mesh: ghostHouses.mesh(box, matGhostSolid, false, false) },
    reactors: { bucket: reactors, mesh: reactors.mesh(cyl, matReactor, false, false) },
    windows: { bucket: windows, mesh: windows.mesh(box, matWindow, false, false) },
    potential: { bucket: potential, mesh: potential.mesh(box, matPotential, false, false) },
    potentialCaps: { bucket: potentialCaps, mesh: potentialCaps.mesh(box, matRiseCap, false, false) },
    riseBeams: { bucket: riseBeams, mesh: riseBeams.mesh(cyl, matRiseBeam, false, false) },
    roofs: { bucket: roofs, mesh: roofs.mesh(pyramid, matSolid, true, false) },
    ghostRoofs: { bucket: ghostRoofs, mesh: ghostRoofs.mesh(pyramid, matGhostSolid, false, false) },
  };
  const poolMesh = lightPools.mesh(disc, matPool, false, false);
  if (poolMesh) scene.add(poolMesh);
  const beamMesh = beams.mesh(flare, matBeam, false, false);
  if (beamMesh) scene.add(beamMesh);
  Object.values(BUCKETS).forEach((entry) => entry.mesh && scene.add(entry.mesh));

  // --------------------------------------------------------------- the build
  // Pieces are instances inside shared meshes, so "building" a category means
  // rewriting a handful of instance matrices over time. One building can be
  // torn down and reassembled without its neighbours so much as flickering.
  const BUILD_SPEED = Number(new URLSearchParams(location.search).get("speed")) || 1;
  const MATRIX = new THREE.Matrix4();
  const dirty = new Set();
  let scheduled = [];

  function setPiece(ref, progress) {
    const entry = BUCKETS[ref.bucket];
    if (!entry || !entry.mesh) return;
    const item = entry.bucket.items[ref.i];
    if (progress <= 0) {
      MATRIX.makeScale(0, 0, 0);
      MATRIX.setPosition(item.x, item.y, item.z);
    } else {
      const e = 1 - Math.pow(1 - progress, 3);
      const squash = 0.7 + 0.3 * e;
      MATRIX.makeScale(item.sx, item.sy * squash, item.sz);
      MATRIX.setPosition(item.x, item.y + (1 - e) * 6, item.z);
    }
    entry.mesh.setMatrixAt(ref.i, MATRIX);
    dirty.add(entry.mesh);
  }

  function schedule(ref, at, duration) {
    if (!ref) return;
    setPiece(ref, 0);
    scheduled.push({ ref, at, duration });
  }

  // The order is the point: foundation, then height, then value, then reactor.
  // Every build re-teaches the four measures without anyone narrating them.
  function buildSequence(building, t0, rate) {
    const k = 1 / (BUILD_SPEED * rate);
    const p = building.pieces;
    let t = t0;
    schedule(p.foundation, t, 0.34 * k);
    t += 0.3 * k;
    p.ghosts.forEach((g) => schedule(g, t, 0.45 * k));
    p.floors.forEach((f, i) => schedule(f, t + i * 0.1 * k, 0.32 * k));
    t += p.floors.length * 0.1 * k;
    p.studs.forEach((st) => schedule(st, t, 0.24 * k));
    t += 0.18 * k;
    p.houses.forEach((h, i) => schedule(h, t + i * 0.07 * k, 0.28 * k));
    t += (p.houses.length * 0.07 + 0.2) * k;
    if (p.reactor) {
      schedule(p.reactor, t, 0.45 * k);
      t += 0.45 * k;
    }
    return t;
  }

  function clockNow() {
    return performance.now() / 1000;
  }

  // The opening shot: the whole city assembles itself, district by district.
  function cityRise() {
    const t0 = clockNow() + 0.35;
    layout.buildings.forEach((building, i) => {
      buildSequence(building, t0 + building.district.index * 0.16 + i * 0.006, 3.2);
    });
  }

  function rebuild(building) {
    const from = clockNow();
    scheduled = scheduled.filter((s) => !ownsPiece(building, s.ref));
    return buildSequence(building, from, 1);
  }

  function ownsPiece(building, ref) {
    const p = building.pieces;
    if (p.foundation === ref || p.reactor === ref) return true;
    return p.floors.includes(ref) || p.studs.includes(ref)
      || p.houses.includes(ref) || p.ghosts.includes(ref);
  }

  function stepBuild() {
    if (!scheduled.length) return;
    const now = clockNow();
    const still = [];
    for (const entry of scheduled) {
      const progress = (now - entry.at) / entry.duration;
      if (progress < 0) {
        still.push(entry);
        continue;
      }
      setPiece(entry.ref, Math.min(1, progress));
      if (progress < 1) still.push(entry);
    }
    scheduled = still;
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    dirty.clear();
  }

  // ------------------------------------------------------- the city we could be
  // Raise every undeveloped lot to the height its own record justifies, hold
  // it, then let it fall away again. It is a projection, not a forecast, and
  // it is drawn in a different material so it can never be mistaken for what
  // has actually been built.
  let showingPotential = false;

  function potentialLots() {
    return layout.buildings.filter((b) => b.pieces.potential && b.pieces.potential.length);
  }

  /* The built city has to get out of the way for this to land.
   *
   * The first version raised the towers and changed nothing else, and from the
   * back of a room it read as almost the same picture. So the whole scene
   * changes mood: the light drops, everything that has actually been built
   * desaturates to grey, and what could be built is the only thing with colour
   * and light in it. The change is in the presentation, never in the figures. */
  const BLUEPRINT = {
    sky: 0x061019, hemi: 0.2, ambient: 0.1, sun: 0.3, sunColour: 0x9fb8e0,
    built: 0x6f757d, street: 0x585e66,
  };

  function setBlueprintMood(on) {
    setSky(on ? BLUEPRINT.sky : DAY.sky);
    hemi.intensity = on ? BLUEPRINT.hemi : DAY.hemi;
    ambient.intensity = on ? BLUEPRINT.ambient : DAY.ambient;
    sun.intensity = on ? BLUEPRINT.sun : DAY.sun;
    sun.color.setHex(on ? BLUEPRINT.sunColour : DAY.sunColour);
    // Instance colours multiply the material colour, so one value here greys
    // every brick, house and roof in the city at once.
    matSolid.color.setHex(on ? BLUEPRINT.built : 0xffffff);
    matPlate.color.setHex(on ? BLUEPRINT.built : 0xffffff);
    if (streetMaterial) streetMaterial.color.setHex(on ? BLUEPRINT.street : 0xffffff);
    // The faint outlines would sit inside the towers and muddy them.
    if (BUCKETS.ghostSolid.mesh) BUCKETS.ghostSolid.mesh.visible = !on;
    document.body.classList.toggle("blueprint", on);
  }

  function setPotential(on) {
    showingPotential = !!on;
    const lots = potentialLots();
    if (!showingPotential) {
      for (const b of lots) {
        scheduled = scheduled.filter((s) => !b.pieces.potential.includes(s.ref));
        for (const ref of b.pieces.potential) setPiece(ref, 0);
      }
      for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
      dirty.clear();
      setBlueprintMood(false);
      if (isNight) setNight(true);
      return { lots: 0, spend: 0 };
    }

    if (isNight) setNight(false);
    setBlueprintMood(true);

    // Raise them as a wave across the map rather than all at once, so the eye
    // has something to follow and the extent is legible.
    const t0 = clockNow();
    const reach = Math.max(1, layout.size.w + layout.size.d);
    let spend = 0;
    for (const b of lots) {
      if (b.category.blueprint_state === "none") spend += b.category.metrics.spend_eur;
      const sweep = ((b.x + layout.size.w / 2) + (b.z + layout.size.d / 2)) / reach;
      b.pieces.potential.forEach((ref, f) => {
        schedule(ref, t0 + sweep * 1.5 + f * 0.07, 0.36);
      });
    }
    return { lots: lots.length, spend };
  }

  // -------------------------------------------------------------- nightfall
  // Measure four is the weakest thing to look at by daylight: a small disc on
  // a roof. With the city dark, the reactors are the only bright thing left,
  // and the skyline becomes a map of where Networks is AI-ready.
  const DAY = {
    sky: C.sky,
    hemi: 0.46,
    ambient: 0.14,
    sun: 0.92,
    sunColour: 0xfff4e6,
  };
  let isNight = false;

  function setNight(on) {
    isNight = !!on;
    setSky(isNight ? 0x04060d : DAY.sky);
    hemi.intensity = isNight ? 0.13 : DAY.hemi;
    ambient.intensity = isNight ? 0.05 : DAY.ambient;
    sun.intensity = isNight ? 0.16 : DAY.sun;
    sun.color.setHex(isNight ? 0x8fa8d8 : DAY.sunColour);

    /* Windows stay on in daylight too.
     *
     * They used to appear only at night, which meant the four occupied
     * buildings were invisible in the view people spend all their time in.
     * Lit panes are warm enough to read against a drained facade by day, and
     * the unlit ones are dark recesses rather than an absence. */
    if (BUCKETS.windows.mesh) BUCKETS.windows.mesh.visible = true;
    if (poolMesh) poolMesh.visible = isNight;
    if (beamMesh) beamMesh.visible = isNight;

    // The outlines on empty lots dim with the light. See GHOST_DAY.
    matGhost.opacity = isNight ? GHOST_NIGHT : GHOST_DAY;

    /* The district names light up after dark.
     *
     * Cut into stone they depend on the sun to read at all, and after dark
     * the ground they sit in is nearly black. The lit pass is the same
     * lettering in the district's own colour, additively blended, so the
     * groove contributes nothing and only the light does. */
    for (const plate of districtNames) {
      plate.userData.lit.visible = isNight;
      plate.userData.stone.visible = !isNight;
    }

    /* The used monuments are floodlit after dark.
     *
     * The pool on the terrace says a light is on; this is the light landing
     * on the stone. Without it a monument at night is the same dark grey
     * whether anybody has used the category or not, and the four that have
     * been used are the whole point of the night view. */
    for (const mark of landmarks) {
      if (!mark.occupied) continue;
      mark.group.traverse((node) => {
        if (node.material && node.material.emissive) {
          node.material.emissive.setHex(isNight ? 0x4a3416 : 0x000000);
        }
      });
    }

    // Lamp heads and headlights are lit fittings; they only read as lights
    // once there is darkness for them to sit in.
    if (BUCKETS.reactors.mesh) {
      BUCKETS.reactors.mesh.material.color.setHex(isNight ? 0xbdf1ff : C.reactor);
    }
    for (const lamp of headlights) {
      lamp.material.color.setHex(isNight ? 0xfff6d8 : 0xfff0c0);
    }
    if (lampMesh) lampMesh.material.color.setHex(isNight ? 0xfff3c4 : 0xffe6a6);
    document.body.classList.toggle("night", isNight);
  }

  // ------------------------------------------------------------------- HUD
  /* Money, short. A whole number of millions loses its decimal, because
   * "€1.0m" next to "€20m" in the same column reads as a different level of
   * precision rather than as the same. */
  const euro = (n) => {
    if (n >= 1e6) {
      const m = (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "");
      return `€${m}m`;
    }
    return n > 0 ? `€${Math.round(n / 1e3)}k` : "Not recorded";
  };

  function renderStats() {
    const t = CITY.totals;
    /* "in use" sits next to "developed" on purpose. 56 against 4 is the whole
     * argument, and the two numbers only land when they are side by side. */
    const stats = [
      [t.with_blueprint, "developed"],
      [t.in_use, "in use", true],
      [t.empty_lots, "empty lots"],
      [euro(t.spend_eur), "spend"],
    ];
    document.getElementById("stats").innerHTML = stats
      .map(([n, k, flag]) =>
        `<div class="stat${flag ? " sharp" : ""}"><span class="n">${n}</span><span class="k">${k}</span></div>`)
      .join("");
    document.getElementById("scope").textContent =
      `${CITY.meta.counts.districts} districts · ${CITY.meta.counts.plots} plots · ${CITY.meta.counts.categories} buildings`;
  }

  function renderLegend() {
    /* Occupancy is in this list now.
     *
     * It was bound in the config and left out of the legend, so the single
     * loudest thing in the city went unexplained: 52 of the 56 built lots are
     * drained to grey with their windows dark, and nothing on screen said
     * why. Whichever measure is bound to it, the same four rungs are drawn. */
    const order = ["foundation", "height", "value", "occupancy", "reactor"];
    document.getElementById("measures").innerHTML = order.map((layer, i) => {
      const name = layerMetric(layer);
      const def = metricDef(name);
      let badge = "";
      if (def.sample && CONFIG.disclosure.show_sample_badge) {
        badge = '<span class="badge sample">sample data</span>';
      } else if (def.provisional && CONFIG.disclosure.show_provisional_badge) {
        badge = '<span class="badge provisional">provisional</span>';
      }
      const swatches = def.tiers.map((tier) => {
        const icon = iconFor(layer, tier)
          || `<i style="background:${swatchFor(layer, tier)}"></i>`;
        return `<span class="sw">${icon}${tier.label}</span>`;
      }).join("");
      return `<div class="measure">
        <div class="name">${i + 1}. ${def.label}${badge}</div>
        <div class="by">${CONFIG.layers[layer].caption}</div>
        <div class="swatches">${swatches}</div>
        ${layer === "height" ? landmarkNote() : ""}
        ${layer === "occupancy" ? occupancyNote() : ""}
      </div>`;
    }).join("");
  }

  /* The monuments, in the legend, inside the height block.
   *
   * Eight of the 145 lots carry one, and a viewer who has not clicked one has
   * no way to know that the shape means anything.
   *
   * It belongs to the height block rather than standing as a fifth one. A
   * monument is what the measure bound to height does past the landmark
   * threshold, so it is the top rung of that ladder and not a separate
   * ladder. It also has to be read to be worth writing: as a fifth block it
   * fell below the fold of a panel that is already the tallest thing on the
   * screen. */
  /* Where the occupancy signal actually turns up.
   *
   * The rung above draws a facade with its windows lit, and at the moment no
   * lot in the city looks like that: all four categories anybody has run a
   * sourcing event through scored high enough to earn a monument, and a
   * monument has no windows. It carries the same signal as floodlighting
   * instead.
   *
   * So the legend says which, counted from what is standing rather than
   * asserted, because the day a used category does not have a monument on it
   * this line has to change by itself. */
  function occupancyNote() {
    const used = CITY.categories.filter((c) => (c.metrics.cbp_used || 0) > 0);
    if (!used.length) return "";
    const marked = used.filter((c) => standing.has(c.code)).length;
    if (!marked) return "";
    const lots = (n) => `${n} lot${n === 1 ? "" : "s"}`;
    const where = marked === used.length
      ? `All ${lots(used.length)} in use carry a monument, so the signal is
         floodlighting after dark.`
      : `${lots(used.length - marked)} light their windows. The other
         ${marked} carry a monument, floodlit after dark instead.`;
    return `<div class="also">${where}</div>`;
  }

  function landmarkNote() {
    const spec = CONFIG.landmarks || {};
    if (!spec.label || spec.min_score === undefined || spec.min_score === null) return "";
    return `<div class="also"><b>${spec.label}</b> at ${spec.min_score}+:
      ${spec.caption || ""}. ${landmarks.length} of ${CITY.categories.length}
      lots have earned one.</div>`;
  }

  /* The two measures people were confusing are the two drawn as shapes. Height
   * is a building that gets taller; value is houses that become a hotel. So the
   * legend draws the shapes rather than naming their colours. */
  function iconFor(layer, tier) {
    const svg = (w, h, body) =>
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

    if (layer === "height") {
      const floors = FLOORS[Math.min(tier.__i || 0, FLOORS.length - 1)];
      const colour = swatchFor(layer, tier);
      if (!floors) return svg(14, 16, `<rect x="1" y="12" width="12" height="3" rx="1" fill="#5b6068"/>`);
      const h = Math.max(3, Math.round(floors * 0.95));
      return svg(14, 16, `<rect x="1" y="12" width="12" height="3" rx="1" fill="#5b6068"/>`
        + `<rect x="3.5" y="${12 - h}" width="7" height="${h}" rx="1" fill="${colour}"/>`);
    }

    /* A facade rather than a swatch.
     *
     * Occupancy is drawn as two things at once, a drained wall and dark
     * windows, and neither is a colour a single square can stand for. Three
     * panes on a wall in the state being described says it in one glyph. */
    if (layer === "occupancy") {
      const dark = (tier.__i || 0) === 0;
      const wall = dark ? "#8d929a" : "#6f8fd0";
      const pane = dark ? "#2a2f38" : "#ffd98a";
      let glass = "";
      for (let i = 0; i < 3; i++) {
        glass += `<rect x="${2.6 + i * 3.4}" y="4" width="2.2" height="6.4" fill="${pane}"/>`;
      }
      return svg(16, 16, `<rect x="1" y="13" width="14" height="2.4" rx="1" fill="#5b6068"/>`
        + `<rect x="1.2" y="2" width="13.6" height="11" rx="1" fill="${wall}"/>` + glass);
    }

    if (layer === "value") {
      if (!tier.pieces) return svg(16, 16, `<rect x="1" y="12" width="14" height="3" rx="1" fill="#5b6068"/>`);
      const ground = `<rect x="0" y="13" width="26" height="2.5" rx="1" fill="#5b6068"/>`;
      if (tier.id === "hotel") {
        return svg(26, 16, ground
          + `<rect x="3" y="7.5" width="20" height="5.5" fill="#e60000"/>`
          + `<rect x="4.5" y="9" width="17" height="1.6" fill="#f1eee4"/>`
          + `<path d="M2 7.5 L13 3 L24 7.5 Z" fill="#b00000"/>`);
      }
      let houses = "";
      for (let i = 0; i < tier.pieces; i++) {
        const x = 2 + i * 6;
        houses += `<rect x="${x}" y="8.5" width="4.4" height="4.5" fill="#2e9e4f"/>`
          + `<path d="M${x - 0.7} 8.5 L${x + 2.2} 5.4 L${x + 5.1} 8.5 Z" fill="#1f7a3c"/>`;
      }
      return svg(26, 16, ground + houses);
    }
    return "";
  }

  function swatchFor(layer, tier) {
    if (layer === "foundation") {
      return { none: "#898781", draft: "#fab219", active: "#0ca30c" }[tier.value] || "#898781";
    }
    if (layer === "occupancy") {
      // Dark pane, then the warm one the city actually lights windows with.
      return (tier.__i || 0) === 0 ? "#2a2f38" : "#ffd98a";
    }
    if (layer === "value") {
      if (!tier.pieces) return "#3a3f47";
      return tier.id === "hotel" ? "#e60000" : "#2e9e4f";
    }
    if (layer === "reactor") {
      const steps = ["#3a3f47", "#3f7f96", "#5fbcdc", "#7fdcff"];
      return steps[Math.min(tier.__i || 0, 3)];
    }
    // ordinal ramp, kept above the dark-surface contrast floor
    const steps = ["#3a3f47", "#86b6ef", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
    return steps[Math.min(tier.__i || 0, 5)];
  }

  // stash tier order so swatchFor can shade by rank
  Object.values(CONFIG.metrics).forEach((def) => def.tiers.forEach((t, i) => { t.__i = i; }));

  const inspector = document.getElementById("inspector");
  /* Where this plot's lots sit in the range, so the size means something.
   *
   * Land area is one of the five measures and the only one with nothing on
   * the card: the legend says lots are larger where the money is, and then a
   * viewer looking at one lot has no way to tell whether theirs is a large
   * one. Ranked against the other plots rather than quoted as a number,
   * because 3.12 across is not a fact anybody can use.
   */
  const plotSizes = layout.districts
    .flatMap((d) => d.plots.map((plot) => plot.cell))
    .sort((a, b) => a - b);
  const SIZE_WORD = ["smallest", "small", "average-sized", "large", "largest"];

  function landRow(category) {
    const spot = positionOf.get(category.code);
    if (!spot) return null;
    const plot = spot.plot;
    const below = plotSizes.filter((cell) => cell < plot.cell - 0.001).length;
    const share = plotSizes.length > 1 ? below / (plotSizes.length - 1) : 0;
    const word = SIZE_WORD[Math.min(SIZE_WORD.length - 1, Math.floor(share * SIZE_WORD.length))];
    const perLot = plot.codes.reduce(
      (sum, code) => sum + ((byCode.get(code) || { metrics: {} }).metrics.spend_eur || 0), 0
    ) / plot.codes.length;
    return [
      "Land",
      `Among the ${word} lots in the city, because ${plot.name} averages `
      + `${euro(perLot)} across its ${plot.codes.length} categories`,
    ];
  }

  /* What is still on the table, in points.
   *
   * The Monopoly deed prints the rent ladder: what this property pays now and
   * what it would pay with a house on it. The city's equivalent is the score,
   * and the useful half of it is the part not yet earned, named as the thing
   * somebody would have to do. Read off the same weights the score uses, so
   * it cannot disagree with the number above it.
   */
  function whatItTakes(category) {
    const j = category.journey;
    const gaps = [];
    const short = (have, out, what) =>
      have < out - 0.5 ? gaps.push(`${Math.round(out - have)} for ${what}`) : null;
    short(j.blueprint, WEIGHTS.blueprint, "finishing the blueprint");
    short(j.usage, WEIGHTS.usage, "running a sourcing event through it");
    short(j.ai, WEIGHTS.ai, "generating the brief from the rules");
    return gaps.length ? gaps.join(" · ") : "Nothing. This one is the whole journey.";
  }

  /* The lot the city is currently talking about, or null.
   *
   * The marker pin and the speech bubble both follow this rather than the
   * figure: the figure stands at the foot of whatever was selected, so a pin
   * over its head sits halfway up the thing it is pointing at and the bubble
   * lands on the roof. */
  let spotlight = null;

  /* The spend band behind a property tier, in brackets, or nothing.
   *
   * Read from the metric's own tiers, so it cannot disagree with what the
   * lot is carrying. The bottom tier gets nothing: "No recorded spend
   * (nothing recorded)" is not an explanation. */
  function spendBand(tier) {
    const tiers = metricDef(layerMetric("value")).tiers || [];
    const at = tiers.indexOf(tier);
    if (at < 0 || tier.max === 0) return "";
    const under = tiers[at - 1];
    const from = under && under.max !== null ? under.max : 0;
    if (tier.max === null) return ` (above ${euro(from)})`;
    return from === 0 ? ` (up to ${euro(tier.max)})` : ` (${euro(from)} to ${euro(tier.max)})`;
  }

  function showCategory(category) {
    showOnArc(category);
    if (!category) {
      spotlight = null;
      inspector.classList.remove("on");
      return;
    }
    spotlight = positionOf.get(category.code) || null;
    const m = category.metrics;
    const heightTier = tierOf(layerMetric("height"), valueFor(category, "height"));
    const valueTier = tierOf(layerMetric("value"), valueFor(category, "value"));
    const stateTier = tierOf("blueprint_state", category.blueprint_state);
    const used = category.metrics.cbp_used || 0;
    const rows = [
      ["Blueprint", stateTier.label],
      ["In use", used
        ? `Yes, ${used} sourcing event${used === 1 ? "" : "s"}`
        : category.blueprint_state === "active" ? "Never used" : "Not yet"],
      [metricDef(layerMetric("height")).label, `${heightTier.label} (${valueFor(category, "height")})`],
      ["Spend FY26/27", euro(m.spend_eur)],
      /* The property, and the band it is in.
       *
       * "Hotel" on its own invites the question the next row already answers,
       * and the two are only linked if you know the ladder. This is the card
       * somebody is looking at when they ask why this lot has a hotel. */
      ["Property", `${valueTier.label}${spendBand(valueTier)}`],
      ["Blueprints", `${m.cbp_active} active · ${m.cbp_draft} draft`],
      ["Markets", category.markets.length ? category.markets.join(", ") : "None yet"],
    ];
    const land = landRow(category);
    if (land) rows.push(land);
    rows.push(["Still on the table", whatItTakes(category)]);
    if (category.owners && category.owners.length) {
      rows.push([category.owners.length > 1 ? "Owners" : "Owner", category.owners.join(", ")]);
    }
    /* The monument, on the deed as well as on the lot.
     *
     * Twice on purpose: a chip beside the name, so it is the first thing read
     * and the shape on the lot stops being a puzzle, and a row lower down
     * with the reason, because "why does this one have a monument" is the
     * next question and the answer is a sentence the build already wrote. */
    const monument = standing.has(category.code) ? category.landmark : null;
    if (monument) {
      rows.push(["Landmark", `${monument.name}, ${monument.market}`]);
      rows.push(["Earned it", monument.because]);
    }
    // Laid out as a Monopoly title deed, because that is what it is: one
    // property, its colour group across the top, what it is worth, and what
    // has been built on it. The board game does the explaining for us.
    const index = layout.districts.findIndex((d) => d.name === category.district);
    const band = DISTRICT_BANDS[(index < 0 ? 0 : index) % DISTRICT_BANDS.length];
    inspector.innerHTML = `
      <div class="deed-band" style="background:${band}">
        <span>${category.district}</span>
      </div>
      <button class="panel-toggle" data-collapse data-drag>Title deed &middot; ${category.code}<span class="caret">&#9662;</span></button>
      <h3>${category.name}</h3>
      ${monument ? `<div class="deed-landmark">${monument.name}</div>` : ""}
      <div class="panel-body">
        <div class="where">${category.plot}</div>
        <dl class="rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        ${category.definition ? `<div class="def">${category.definition}</div>` : ""}
      </div>`;
    inspector.classList.add("on");
  }

  /* ------------------------------------------------------ the arc and the score
   *
   * Traditional, Connected, Smart, Autonomous. The arc needs no new data:
   * the measures already on screen are that journey. The stage boundaries and every weight live in
   * config/metrics.yaml, so this draws whatever the score is defined to be.
   */
  const WEIGHTS = (CONFIG.score && CONFIG.score.weights) || { blueprint: 40, usage: 35, ai: 25 };
  const ARC_MAX = WEIGHTS.blueprint + WEIGHTS.usage + WEIGHTS.ai;
  /* What to call each component wherever a score is broken down.
   *
   * One place, because the scoreboard, the arc and the agent all say the same
   * three things and had three sets of words for them. From the config, so
   * renaming a component is a config edit rather than a search across the
   * renderer. */
  const COMPONENT_LABEL = Object.assign(
    { blueprint: "blueprint", usage: "used", ai: "AI" },
    (CONFIG.score && CONFIG.score.component_labels) || {}
  );

  /** Where a score sits along the rail, as a percentage of its width.
   *  Autonomous occupies the last quarter and nothing reaches it, which is
   *  the point rather than an oversight. */
  function arcPosition(score) {
    return Math.max(2, Math.min(74, (score / ARC_MAX) * 74));
  }

  function renderArc() {
    const j = CITY.totals.journey;
    if (!j) return;
    document.getElementById("arcYou").style.left = `${arcPosition(j.total)}%`;
    document.getElementById("arcScore").textContent = `Networks ${Math.round(j.total)} / ${ARC_MAX}`;
    document.getElementById("arcNote").textContent =
      `· ${Math.round(j.blueprint / WEIGHTS.blueprint * 100)}% written, `
      + `${Math.round(j.usage / WEIGHTS.usage * 100)}% used, `
      + `${Math.round(j.ai / WEIGHTS.ai * 100)}% with AI`
      + ` · ${STAGE_LABEL_ORG[stageOf(j.total)]}`;
    markStage(stageOf(j.total));
  }

  /* The stages on the rail, from the config.
   *
   * Both the boundaries and the wording used to be written here, which made
   * the rail the one part of the city a config edit could not move. Highest
   * first, so the first stage a score clears is the one it is in.
   */
  const STAGES = ((CONFIG.score && CONFIG.score.stages) || [])
    .slice()
    .sort((a, b) => (b.from || 0) - (a.from || 0));

  const STAGE_LABEL = {};
  const STAGE_LABEL_ORG = {};
  /* And one more reading for the bottom of the bottom stage.
   *
   * A score of nought means no blueprint at all, because drafting one already
   * scores ten. Without this the rail reads "Traditional: a blueprint exists"
   * over bare ground, which is the opposite of what that lot is showing. */
  const STAGE_LABEL_ZERO = {};
  for (const stage of STAGES) {
    STAGE_LABEL[stage.id] = `${stage.label}: ${stage.detail}`;
    STAGE_LABEL_ORG[stage.id] = `${stage.label}: ${stage.detail_org || stage.detail}`;
    STAGE_LABEL_ZERO[stage.id] = `${stage.label}: ${stage.detail_zero || stage.detail}`;
  }

  function stageOf(score) {
    const reached = STAGES.find((stage) => score >= (stage.from || 0));
    return (reached || STAGES[STAGES.length - 1] || { id: "traditional" }).id;
  }

  /** How a single score reads on the rail, including nought. */
  function stageText(score) {
    const stage = stageOf(score);
    return Math.round(score) > 0 ? STAGE_LABEL[stage] : STAGE_LABEL_ZERO[stage];
  }

  function markStage(stage) {
    for (const el of document.querySelectorAll("#arc .stage")) {
      el.classList.toggle("here", el.dataset.stage === stage);
    }
  }

  /** Put a single category's own marker on the rail, so the arc answers
   *  "where is this one" as well as "where are we". */
  /* Put a category's own marker on the rail, and make the reading follow it.
   *
   * The marker used to move while the text underneath went on reporting the
   * organisation figure, so the rail said one thing and the sentence said
   * another. The selected category now leads, and the organisation figure
   * drops to a second line so the comparison is still there. */
  function showOnArc(category) {
    const pick = document.getElementById("arcPick");
    const base = document.getElementById("arcBase");
    if (!category || !category.journey) {
      pick.hidden = true;
      base.hidden = true;
      renderArc();
      return;
    }
    const j = category.journey;
    pick.hidden = false;
    pick.style.left = `${arcPosition(j.total)}%`;
    document.getElementById("arcScore").textContent =
      `${category.code} ${Math.round(j.total)} / ${ARC_MAX}`;
    document.getElementById("arcNote").textContent =
      `· ${stageText(j.total)} · ${Math.round(j.blueprint)} blueprint, `
      + `${Math.round(j.usage)} used, ${Math.round(j.ai)} AI`;
    const n = CITY.totals.journey;
    base.hidden = false;
    base.textContent = `Networks overall ${Math.round(n.total)} / ${ARC_MAX}`;
    markStage(stageOf(j.total));
  }

  /* The journey panel. Three views of one score, because the same number
   * answers different questions depending on who is asking. */
  const journeyRows = document.getElementById("jRows");
  let journeyView = "districts";

  function scoreBar(j) {
    const seg = (key, value) =>
      `<i class="${key}" style="width:${(value / ARC_MAX) * 100}%"></i>`;
    return `<span class="bar">${seg("bp", j.blueprint)}${seg("use", j.usage)}${seg("ai", j.ai)}</span>`;
  }

  function rollUp(list) {
    // Same weighting as the build: the square root of spend, floored, so one
    // large category cannot carry a group that has done nothing else.
    const w = (c) => Math.sqrt(Math.max(c.metrics.spend_eur || 0, 1e6));
    const total = list.reduce((s, c) => s + w(c), 0) || 1;
    const part = (k) => list.reduce((s, c) => s + c.journey[k] * w(c), 0) / total;
    return { total: part("total"), blueprint: part("blueprint"), usage: part("usage"), ai: part("ai") };
  }

  function journeyData() {
    if (journeyView === "categories") {
      return CITY.categories
        .map((c) => ({ label: `${c.code} ${c.name}`, sub: c.district,
                       j: c.journey, go: () => window.NWCity.focus(c.code) }))
        .sort((a, b) => b.j.total - a.j.total);
    }
    if (journeyView === "people") {
      const by = new Map();
      for (const c of CITY.categories) {
        for (const person of c.owners || []) {
          if (!by.has(person)) by.set(person, []);
          by.get(person).push(c);
        }
      }
      const floor = (CONFIG.score && CONFIG.score.minimum_categories) || 3;
      return [...by.entries()]
        // Below the floor a score is a coin toss rather than a track record:
        // one category with one blueprint would sit at the top on merit it
        // did not earn.
        .filter(([, list]) => list.length >= floor)
        .map(([person, list]) => ({
          label: person,
          sub: `${list.length} categories`,
          j: rollUp(list),
          go: () => window.NWCity.focus(list.slice().sort((a, b) => b.journey.total - a.journey.total)[0].code),
        }))
        .sort((a, b) => b.j.total - a.j.total);
    }
    return CITY.districts
      .map((d) => ({ label: d.name, sub: `${d.totals.empty_lots} of ${d.totals.categories} empty`,
                     j: d.totals.journey, go: () => window.NWCity.focusDistrict(d.name) }))
      .sort((a, b) => b.j.total - a.j.total);
  }

  /* The three components, named, on every row.
   *
   * The bar alone put three unlabelled colours against a key at the foot of
   * the panel, so reading a row meant looking somewhere else and remembering
   * which colour was which. Naming them in place is what the key was for, so
   * the key is gone and the vertical it cost goes to the rows.
   *
   * Each is shown against its own ceiling, because 18 means nothing without
   * the 40 it is out of: a district on 18 of 40 for blueprint and 4 of 35 for
   * usage has written most of what it can write and used almost none of it,
   * and that is the whole finding. */
  function scoreParts(j) {
    const parts = [
      ["bp", COMPONENT_LABEL.blueprint, j.blueprint, WEIGHTS.blueprint],
      ["use", COMPONENT_LABEL.usage, j.usage, WEIGHTS.usage],
      ["ai", COMPONENT_LABEL.ai, j.ai, WEIGHTS.ai],
    ];
    return parts
      .map(([key, label, value, out]) =>
        `<span class="part ${key}">${label} ${Math.round(value)} of ${out}</span>`)
      .join("");
  }

  function renderJourney() {
    const rows = journeyData();
    journeyRows.innerHTML = rows.map((r, i) => `
      <div class="jRow" data-i="${i}">
        <span class="who">${r.label}</span>
        <span class="num">${Math.round(r.j.total)}</span>
        ${scoreBar(r.j)}
        <span class="parts">${scoreParts(r.j)}</span>
        <span class="sub">${r.sub}</span>
      </div>`).join("");
    journeyRows.querySelectorAll(".jRow").forEach((el) => {
      el.addEventListener("click", () => rows[Number(el.dataset.i)].go());
    });
  }

  document.getElementById("jSwitch").addEventListener("click", (e) => {
    const button = e.target.closest("[data-view]");
    if (!button) return;
    journeyView = button.dataset.view;
    for (const b of document.querySelectorAll("#jSwitch button")) {
      b.classList.toggle("on", b === button);
    }
    renderJourney();
  });

  renderStats();
  renderLegend();
  renderArc();
  renderJourney();

  /* On a phone the legend and the trace start closed. Both are reference
     rather than the thing itself, and open they cover the city on a screen
     that has no room to spare. The header stays visible, so it is obvious
     they are there. */
  if (window.matchMedia("(max-width: 760px), (pointer: coarse) and (max-width: 1024px)").matches) {
    for (const id of ["legend", "trace"]) {
      const panel = document.getElementById(id);
      if (panel) panel.classList.add("collapsed");
    }
  }

  // ----------------------------------------------------------- the builder
  // A minifigure in a hard hat. The figure is the only animate element, and
  // carries the construction metaphor the rest of the model is built on.
  const FIGURE_SCALE = 0.82;

  function buildFigure() {
    const group = new THREE.Group();
    const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });
    const overalls = mat(0xe60000);
    const legs = mat(0x2b3140);
    const skin = mat(0xf3c85c);
    const hat = mat(0xffc21a);
    const hiVis = mat(0xd7ef4a);
    const dark = mat(0x1b1e24);
    const paper = mat(0xf1eee4);
    const steel = mat(0xb9c0c9);

    const part = (parent, material, x, y, z, sx, sy, sz, geometry) => {
      const mesh = new THREE.Mesh(geometry || box, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Legs, with the hip block a real minifigure has between them.
    part(group, legs, -0.32, 0.5, 0, 0.52, 1.0, 0.68);
    part(group, legs, 0.32, 0.5, 0, 0.52, 1.0, 0.68);
    part(group, dark, -0.32, 0.06, 0.06, 0.56, 0.14, 0.8);
    part(group, dark, 0.32, 0.06, 0.06, 0.56, 0.14, 0.8);
    part(group, legs, 0, 1.06, 0, 1.24, 0.24, 0.72);

    /* Torso, and the hi-vis over it.
     *
     * A real vest has two full-length vertical bands and a horizontal one,
     * and drawn front-on at this scale that is a capital H. It read as a
     * letter on the chest, which is the one thing it must not do with a mark
     * there. So the verticals are shoulder straps and the band sits at the
     * waist, which leaves the whole chest clear.
     */
    part(group, overalls, 0, 1.62, 0, 1.42, 1.05, 0.78);
    for (const face of [0.4, -0.4]) {
      part(group, hiVis, -0.52, 2.0, face, 0.3, 0.26, 0.06);
      part(group, hiVis, 0.52, 2.0, face, 0.3, 0.26, 0.06);
      part(group, hiVis, 0, 1.24, face, 1.34, 0.22, 0.05);
    }

    /* The mark on the front of the vest.
     *
     * The vest is already the organisation's red, so the speech mark goes on
     * it as white geometry with no disc behind it, which is how the device is
     * actually rendered on a red field. Drawn rather than loaded, so the
     * repository carries no brand asset, and replaceable by one: put a data
     * URI in `city.vest_mark` and it is used instead, with no code change.
     *
     * Front and back, on their own plates. A box takes one material per
     * mesh, so marking a single face of the torso means giving it a plate,
     * and the plate sits clear of the hi-vis panels: level with them the two
     * surfaces fought for the same depth and half the mark went.
     */
    const vestMark = String((CONFIG.city && CONFIG.city.vest_mark) || "").trim();
    if (vestMark && vestMark !== "none") {
      const SIDE = 256;
      let texture = null;
      // Square by default, because a logo is: only the text badge is wide.
      let size = [0.8, 0.8];

      if (/^data:image\//i.test(vestMark)) {
        // An asset, inlined by the build. Nothing here assumes what it is,
        // beyond that a logo is square and wants the whole chest.
        texture = new THREE.TextureLoader().load(vestMark);
      } else if (vestMark === "speechmark") {
        const canvas = document.createElement("canvas");
        canvas.width = SIDE;
        canvas.height = SIDE;
        const ctx = canvas.getContext("2d");
        /* Drawn to fill the texture, not to sit inside it.
         *
         * The shape below occupies x 27 to 69 and y 19 to 88 of a 100 box, so
         * drawn straight it filled two fifths of the width and looked like a
         * speck on the chest. The context is scaled so the mark's own
         * bounding box fills the square, height first, and the plate is
         * square, so the mark comes out as large as the chest allows. */
        const MARK = { x0: 27, x1: 69, y0: 19, y1: 88 };
        const k = (SIDE * 0.94) / (MARK.y1 - MARK.y0);
        /* Turned through half a circle, which is the orientation of the mark.
         *
         * The shape below is built the way a comma is written, ball at the
         * top and tail descending. A speech mark is that shape rotated, ball
         * at the lower left and tail rising to the upper right, and drawn
         * unrotated it came out upside down on the chest.
         *
         * A rotation and not a mirror: mirroring would reverse the handedness
         * of the curve, which gives a shape that is the wrong way round in a
         * way that is harder to see and just as wrong. */
        ctx.translate(SIDE / 2, SIDE / 2);
        ctx.scale(-k, -k);
        ctx.translate(-(MARK.x0 + MARK.x1) / 2, -(MARK.y0 + MARK.y1) / 2);
        ctx.fillStyle = "#ffffff";
        // The head, then the tail, then a bite out of the head's upper right,
        // which is the notch that makes it a speech mark and not a comma.
        ctx.beginPath();
        ctx.arc(48, 40, 21, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(68, 44);
        ctx.bezierCurveTo(66, 68, 54, 82, 30, 88);
        ctx.bezierCurveTo(48, 70, 46, 58, 40, 48);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(60, 30, 12, 0, Math.PI * 2);
        ctx.fill();
        texture = new THREE.CanvasTexture(canvas);
      } else {
        // Any other value is a name, set on a pale badge. Dark on light,
        // because at the default zoom the whole figure is about forty pixels
        // tall: no lettering survives that, and a pale bar across the chest
        // still reads as a badge where white letters on red read as nothing.
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 168;
        const ctx = canvas.getContext("2d");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const pad = 10;
        ctx.fillStyle = "#f3f5f8";
        ctx.beginPath();
        ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 22);
        ctx.fill();
        ctx.font = '800 104px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = "#1b1e24";
        ctx.fillText(vestMark, canvas.width / 2, canvas.height / 2 + 6,
          canvas.width - pad * 2 - 26);
        texture = new THREE.CanvasTexture(canvas);
        size = [1.3, 0.427];
      }

      texture.anisotropy = 4;
      for (const [z, turn] of [[0.45, 0], [-0.45, Math.PI]]) {
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(size[0], size[1]),
          // Unlit: print on a vest is reflective, and under the scene light
          // the mark came out grey on the face turned away from the sun.
          new THREE.MeshBasicMaterial({ map: texture, transparent: true })
        );
        plate.position.set(0, 1.7, z);
        plate.rotation.y = turn;
        group.add(plate);
      }
    }

    part(group, dark, 0, 1.16, 0, 1.46, 0.2, 0.82);   // tool belt
    part(group, steel, 0.6, 1.14, 0.3, 0.16, 0.34, 0.16); // and something on it

    // A brick on his back. He is the one who builds the city, so he carries
    // the material: a 2x2 in the district red, studs and all.
    part(group, overalls, 0, 1.72, -0.56, 0.86, 0.72, 0.34);
    for (const dx of [-0.2, 0.2]) {
      for (const dy of [-0.16, 0.16]) {
        part(group, overalls, dx, 1.72 + dy, -0.76, 0.3, 0.3, 0.12, cyl)
          .rotation.x = Math.PI / 2;
      }
    }

    // Arms pivot at the shoulder, so the swing reads as a swing rather than a
    // part spinning about its own middle.
    const arms = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.92, 2.05, 0);
      shoulder.rotation.z = side * 0.12;
      part(shoulder, overalls, 0, -0.45, 0, 0.38, 0.92, 0.5);
      part(shoulder, skin, 0, -1.0, 0.04, 0.34, 0.26, 0.34, cyl);
      group.add(shoulder);
      arms.push(shoulder);
    }
    // The blueprint in the left hand, because it is the thing the whole city is
    // about, and a trowel in the right, because he is a builder and a builder
    // holding nothing is just a man standing about.
    part(arms[0], paper, 0.02, -1.16, 0.16, 0.62, 0.06, 0.78);
    part(arms[0], steel, 0.02, -1.13, 0.42, 0.5, 0.05, 0.12);
    part(arms[1], dark, 0, -1.2, 0.12, 0.1, 0.1, 0.44);
    part(arms[1], steel, 0, -1.22, 0.44, 0.34, 0.06, 0.44);

    // Neck, then the head as its own pivot so he can look around. A blank
    // cylinder read as a peg; eyes, brows and a mouth are what make it the
    // minifigure in someone's hand rather than a game piece.
    part(group, skin, 0, 2.16, 0, 0.5, 0.2, 0.5, cyl);
    const head = new THREE.Group();
    head.position.set(0, 2.16, 0);
    group.add(head);

    part(head, skin, 0, 0.3, 0, 0.86, 0.66, 0.86, cyl);
    part(head, dark, -0.17, 0.36, 0.42, 0.13, 0.16, 0.06);
    part(head, dark, 0.17, 0.36, 0.42, 0.13, 0.16, 0.06);
    part(head, dark, -0.18, 0.5, 0.42, 0.2, 0.06, 0.06).rotation.z = 0.18;
    part(head, dark, 0.18, 0.5, 0.42, 0.2, 0.06, 0.06).rotation.z = -0.18;
    part(head, dark, 0, 0.16, 0.42, 0.3, 0.07, 0.06);

    // Hard hat: brim, crown, the ridge down the middle, and a red band, which
    // is the difference between a hard hat and a yellow bowl.
    part(head, hat, 0, 0.5, 0, 1.34, 0.12, 1.34, cyl);
    part(head, hat, 0, 0.7, 0, 0.94, 0.36, 0.94, cyl);
    part(head, overalls, 0, 0.62, 0, 0.98, 0.1, 0.98, cyl);
    part(head, hat, 0, 0.86, 0, 0.22, 0.12, 0.9);
    part(head, hat, 0, 0.56, 0.56, 0.62, 0.1, 0.3);

    group.userData.head = head;

    group.userData.arms = arms;
    group.scale.setScalar(FIGURE_SCALE);
    return group;
  }

  const figure = buildFigure();
  scene.add(figure);

  /* Even in the diagonal lane a tall neighbour can cut across him, so he
   * carries a marker that is drawn over everything: a small pin in hard-hat
   * yellow above his head. It is how you find him in a wide shot, and how the
   * room keeps track of him when the camera is moving. */
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 0.9, 4).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffc21a })
  );
  scene.add(marker);

  /* The builder is drawn in a second pass, over the finished city.
   *
   * A minifigure standing among five-storey towers is behind one of them from
   * this camera more often than not, and the one thing that must never happen
   * is the focal element becoming invisible at the moment attention is on it.
   * Moving where it stands helped and did not solve it, because on a full plot
   * there is no clear line at all.
   *
   * So he and his marker go on their own layer. The city is drawn, the depth
   * buffer is cleared, and he is drawn on top of it, which keeps his own parts
   * correctly ordered against each other while never letting a building hide
   * him. He reads as a marker on a map, which is what he is.
   */
  const FIGURE_LAYER = 1;
  figure.traverse((o) => o.layers.set(FIGURE_LAYER));
  marker.layers.set(FIGURE_LAYER);
  for (const light of [hemi, ambient, sun]) light.layers.enableAll();
  renderer.autoClear = false;
  

  /* Where the builder can stand.
   *
   * Straight in front of the lot places it behind whatever stands in the next
   * row, which from this camera is nearer, so on a dense plot the figure was a
   * few pixels between two towers.
   *
   * The gaps between lots run diagonally, and the camera looks straight down
   * one of those diagonals, so the crossing point between four lots is the one
   * spot with a clear line back to the viewer. That is where he stands.
   */
  const standings = layout.buildings.map(
    (b) => new THREE.Vector3(b.x + CELL * 0.5, 0, b.z + CELL * 0.5)
  );

  const walker = {
    mode: "idle",
    from: standings[0].clone(),
    to: standings[0].clone(),
    start: 0,
    duration: 3,
    holdUntil: 0,
    pinned: false,
  };
  figure.position.copy(walker.to);

  function sendFigure(target, mode, duration) {
    walker.from.copy(figure.position).setY(0);
    walker.to.copy(target);
    walker.mode = mode;
    walker.start = clockNow();
    walker.duration = duration;
    walker.holdUntil = 0;
  }

  function wander(now) {
    const next = standings[Math.floor(Math.random() * standings.length)];
    const distance = figure.position.distanceTo(next);
    sendFigure(next, "walk", Math.max(1.4, distance / 9));
    walker.holdUntil = 0;
    return now;
  }

  function updateFigure(now, delta) {
    const t = walker.duration > 0
      ? THREE.MathUtils.clamp((now - walker.start) / walker.duration, 0, 1)
      : 1;
    const ease = t * t * (3 - 2 * t);
    figure.position.lerpVectors(walker.from, walker.to, ease);

    // Flying arcs over the city; walking bobs along the ground.
    if (walker.mode === "fly") {
      figure.position.y = Math.sin(Math.PI * t) * 14;
    } else if (walker.mode === "walk" && t < 1) {
      figure.position.y = Math.abs(Math.sin(now * 7)) * 0.14;
    } else {
      figure.position.y = 0;
    }

    // Facing. It walks the way it is going, and on arrival turns towards the
    // camera, so the figure reads as a character rather than an object.
    const heading = walker.to.clone().sub(walker.from);
    const toCamera = Math.atan2(CAM_DIR.x, CAM_DIR.z);
    if (t < 1 && heading.lengthSq() > 0.02) {
      figure.rotation.y = Math.atan2(heading.x, heading.z);
    } else {
      let turn = toCamera - figure.rotation.y;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      figure.rotation.y += turn * Math.min(1, delta * 3);
    }

    /* The pin marks what is being talked about.
     *
     * Over the figure while it wanders, because then the figure is the thing
     * worth finding. Over the lot once one is selected, because then the lot
     * is: a pin at the figure's own head height sits halfway up a monument
     * and points at nothing in particular. */
    const scale = figure.scale.y / FIGURE_SCALE;
    const bob = Math.sin(now * 2.4) * 0.16;
    if (spotlight) {
      marker.position.set(
        spotlight.x,
        (spotlight.top || 0) + 1.5 * scale + bob,
        spotlight.z
      );
    } else {
      marker.position.set(
        figure.position.x,
        figure.position.y + 4.1 * scale + bob,
        figure.position.z
      );
    }
    marker.scale.setScalar(scale);
    marker.rotation.y = now * 1.1;

    // Arms swing when moving, and go up when the building lands.
    const moving = t < 1;
    const swing = moving ? Math.sin(now * 9) * 0.7 : 0;
    const cheering = walker.mode === "watch" && now < walker.holdUntil - 1.5;
    figure.userData.arms.forEach((arm, i) => {
      arm.rotation.x = cheering ? -2.2 : swing * (i ? -1 : 1);
    });

    // He looks around while he waits, and up at the building while it goes up.
    // Standing perfectly still is what made him read as a prop rather than a
    // character, and it costs two lines to fix.
    const head = figure.userData.head;
    if (head) {
      head.rotation.y = moving ? 0 : Math.sin(now * 0.6) * 0.55;
      head.rotation.x = cheering ? -0.4 : Math.sin(now * 0.9) * 0.06;
    }

    if (t >= 1) {
      if (walker.mode === "fly") {
        walker.mode = "watch";
        walker.holdUntil = now + 3;
      } else if (walker.pinned) {
        // stay with the category until the city is reset
      } else if (walker.mode !== "watch" || now > walker.holdUntil) {
        if (!walker.holdUntil) walker.holdUntil = now + 1.2 + Math.random() * 2.5;
        if (now > walker.holdUntil) wander(now);
      }
    }
  }

  // --------------------------------------------------------------- the voice
  // Deterministic for now. When the model lands it replaces these sentences,
  // but the fallback has to be able to carry the demo on its own.
  function narrate(category) {
    const m = category.metrics;
    const spend = euro(m.spend_eur);
    if (category.blueprint_state === "none") {
      return m.spend_eur > 0
        ? {
            caption: `${spend} of spend. No blueprint. Nothing to build here yet.`,
            bubble: `Empty lot. ${spend} sitting on this ground, and no rules to build with.`,
          }
        : {
            caption: `No blueprint and no recorded spend. This lot is still open ground.`,
            bubble: `Nothing here yet. Someone has to claim this lot.`,
          };
    }
    if (category.blueprint_state === "draft") {
      return {
        caption: `Blueprint drafted but not active. The lot is marked out, no foundations.`,
        bubble: `Someone has claimed this lot. The blueprint is still in draft.`,
      };
    }
    /* Say what the building is actually showing.
     *
     * This read "Skyscraper. Adopted across 8 markets", which named the
     * height tier and then explained it with a measure height no longer
     * encodes. Height is the composite score, so the sentence leads with how
     * far the category has got and what is carrying it. */
    const reach = m.market_reach;
    const markets = `${reach} market${reach === 1 ? "" : "s"}`;
    const score = Math.round((category.journey || {}).total || 0);
    const used = m.cbp_used || 0;
    const strongest = used > 0
      ? `used ${used} time${used === 1 ? "" : "s"}`
      : reach > 1 ? `live in ${markets}` : "live in one market";
    /* The caption leads with the score, like everything else.
     *
     * It read "8 markets building on this blueprint" for the one category in
     * Networks that has finished the journey: the loudest line on the screen
     * was quoting the weakest measure the city holds, and the same line for
     * A221, live in sixteen markets and never used, read as praise. Score
     * first, then the stage that score reaches, then what is and is not
     * carrying it, in that order, because that is the order of the argument.
     */
    const use = used > 0
      ? `used ${used} time${used === 1 ? "" : "s"}`
      : "never used";
    const facts = [use, `live in ${markets}`];
    if (m.spend_eur > 0) facts.push(`${spend} of spend`);
    const lead = `${score} out of 100 on the journey. ${stageText(score)}.`;
    return {
      caption: `${lead} ${facts.join(", ")[0].toUpperCase()}${facts.join(", ").slice(1)}.`,
      bubble: category.landmark
        ? `${score} out of 100, and ${strongest}. ${category.landmark.name} stands here.`
        : `${score} out of 100 on the journey, and ${strongest}.`,
    };
  }

  const bubbleEl = document.getElementById("bubble");
  const captionEl = document.getElementById("caption");
  let bubbleText = "";

  function say(category) {
    if (!category) {
      bubbleText = "";
      bubbleEl.classList.remove("on");
      captionEl.classList.remove("on");
      return;
    }
    const lines = narrate(category);
    bubbleText = lines.bubble;
    bubbleEl.textContent = lines.bubble;
    captionEl.firstElementChild.textContent = lines.caption;
    captionEl.classList.add("on");
  }

  /** A world point in screen pixels. */
  function toScreen(point) {
    const p = point.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
      infront: p.z < 1,
    };
  }

  /* The bubble goes beside what is being talked about, never over it.
   *
   * It used to sit above the figure's head, which is above the foot of the
   * selected lot, so on anything tall it covered the thing it was describing:
   * the words "The Parthenon stands here" printed across the Parthenon.
   *
   * With a lot selected it is pushed clear of that lot's own width on screen
   * and set at the marker's height, with the tail on the side pointing back
   * at it. To the right by preference, to the left when the right would run
   * off the screen, because a bubble half off the edge is worse than one on
   * the other side. While the figure wanders there is nothing to clear, so it
   * goes back over its head with the tail underneath.
   */
  function placeBubble() {
    if (!bubbleText) return;
    const scale = figure.scale.y / FIGURE_SCALE;

    if (!spotlight) {
      const head = figure.position.clone();
      head.y += 4.1 * scale + 1.1;
      const at = toScreen(head);
      bubbleEl.classList.remove("beside", "flip");
      bubbleEl.style.left = `${at.x}px`;
      bubbleEl.style.top = `${at.y - 12}px`;
      bubbleEl.classList.toggle("on",
        at.infront && at.x > 0 && at.x < window.innerWidth);
      return;
    }

    const top = spotlight.top || 0;
    const pin = toScreen(new THREE.Vector3(spotlight.x, top + 1.5 * scale, spotlight.z));
    /* Half the lot's own width where it stands, in pixels.
     *
     * Measured at the x-plus, z-minus corner. The x-plus, z-plus corner is
     * the intuitive choice and it is the one corner that cannot answer this:
     * under this camera the two ground axes go to opposite sides of the
     * screen, so that corner sits directly above the centre and measures a
     * gap of nothing. The bubble was placed 24 pixels out from every lot and
     * sat on the wide ones. */
    const half = (spotlight.span || 1) * (spotlight.cell || CELL) / 2;
    const side = toScreen(new THREE.Vector3(spotlight.x + half, top, spotlight.z - half));
    const clear = Math.max(24, Math.abs(side.x - pin.x) + 18);

    /* Which side, decided by what is actually free.
     *
     * Going right by default put the bubble straight over the title deed,
     * which opens on the right the moment a lot is selected: one thing
     * covered traded for another. Both sides are measured against the panels
     * that are on screen and the edges of the window, and the one with less
     * in the way wins. */
    const width = bubbleEl.offsetWidth || 220;
    const height = bubbleEl.offsetHeight || 50;
    const obstacles = bubbleObstacles();
    /* Both sides and a few heights, scored, best wins.
     *
     * Either side alone is often partly occupied: the title deed opens on the
     * right the moment a lot is selected and the legend holds the left. Given
     * somewhere to slide vertically the placer can usually find a clear spot,
     * and the tail is drawn wherever the pin ended up relative to the bubble
     * so it still points at the thing it belongs to.
     *
     * The vertical nudge is scored slightly against itself, so the bubble
     * stays level with the pin unless moving earns it something. */
    let best = null;
    for (const flip of [false, true]) {
      const left = flip ? pin.x - clear - width : pin.x + clear;
      for (const dy of [0, -64, 64, -132, 132]) {
        const top = pin.y + dy - height / 2;
        const box = { left, right: left + width, top, bottom: top + height };
        const off = Math.max(0, -box.left) + Math.max(0, box.right - window.innerWidth)
          + Math.max(0, -box.top) + Math.max(0, box.bottom - window.innerHeight);
        const cost = covered(box, obstacles) + off * width + Math.abs(dy) * 30;
        if (!best || cost < best.cost) best = { cost, flip, dy, top };
      }
    }

    bubbleEl.classList.add("beside");
    bubbleEl.classList.toggle("flip", best.flip);
    bubbleEl.style.left = `${pin.x + (best.flip ? -clear : clear)}px`;
    bubbleEl.style.top = `${pin.y + best.dy}px`;
    // Where the tail sits inside the bubble, so it keeps pointing at the pin
    // however far the bubble has slid to get out of the way.
    bubbleEl.style.setProperty("--tail", `${pin.y - best.top}px`);
    bubbleEl.classList.toggle("on",
      pin.infront && pin.x > -clear && pin.x < window.innerWidth + clear);
  }

  /* The panels the bubble should not land on.
   *
   * Read live rather than listed as rectangles, because they move: the deed
   * only exists while a lot is selected, the trace only while the agent has
   * spoken, and any of them can be dragged somewhere else. */
  const BUBBLE_AVOID = [
    "masthead", "stats", "legend", "journey", "inspector",
    "arc", "trace", "chips", "ask", "caption", "hint", "touchbar",
  ];

  function bubbleObstacles() {
    const out = [];
    for (const id of BUBBLE_AVOID) {
      const el = document.getElementById(id);
      if (!el || el.hidden) continue;
      const style = getComputedStyle(el);
      if (style.display === "none" || Number(style.opacity) === 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) out.push(box);
    }
    return out;
  }

  /** How much of a box the given rectangles cover, in square pixels. */
  function covered(box, rects) {
    let sum = 0;
    for (const r of rects) {
      const w = Math.min(box.right, r.right) - Math.max(box.left, r.left);
      const h = Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top);
      if (w > 0 && h > 0) sum += w * h;
    }
    return sum;
  }

  // -------------------------------------------------------------- controls
  const HOME = fitTo(
    new THREE.Box3(
      new THREE.Vector3(-baseW / 2, 0, -baseD / 2),
      new THREE.Vector3(baseW / 2, 22, baseD / 2)
    ),
    1.04
  );
  view.size = HOME.size;
  view.target.copy(HOME.target);
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  const FLIGHT = 1.2; // seconds
  const FOCUS_SIZE = CELL * 3.4; // frame the plot, not the building
  const anim = { active: false, start: 0, duration: FLIGHT, fromSize: 0, toSize: 0,
                 from: new THREE.Vector3(), to: new THREE.Vector3() };

  function flyTo(target, size, duration) {
    anim.from.copy(view.target);
    anim.to.copy(target);
    anim.fromSize = view.size;
    anim.toSize = size;
    anim.start = clockNow();
    anim.duration = duration || FLIGHT;
    anim.active = true;
  }

  /* Pinch is the touch equivalent of a scroll wheel.
   *
   * Pointer events give touches and a mouse through the same handlers, so the
   * only thing that has to be tracked is how many are down: one drags the map,
   * two pinch it. Without this the city loads on a phone and cannot be zoomed
   * at all, which on a 390 pixel screen means never seeing a single building
   * closely enough to read it. */
  const touches = new Map();
  let pinchFrom = 0;

  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  renderer.domElement.addEventListener("pointerdown", (e) => {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinchFrom = spread();
      dragging = false;  // the second finger ends the drag it started
      return;
    }
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const now = spread();
      if (pinchFrom > 0 && now > 0) {
        view.size = THREE.MathUtils.clamp(view.size * (pinchFrom / now), 6, span * 1.4);
        anim.active = false;
      }
      pinchFrom = now;
      // Fingers moving apart is a zoom, not a tap, whatever the distance says.
      moved = 999;
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    const scale = (view.size * 2) / window.innerHeight;
    // screen-right and screen-up projected onto the ground plane
    const right = new THREE.Vector3().crossVectors(CAM_DIR, new THREE.Vector3(0, 1, 0)).normalize();
    const fwd = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), right).normalize();
    view.target.addScaledVector(right, -dx * scale).addScaledVector(fwd, -dy * scale);
    anim.active = false;
  });
  const endDrag = (e) => {
    dragging = false;
    if (e) touches.delete(e.pointerId);
    if (touches.size < 2) pinchFrom = 0;
  };
  renderer.domElement.addEventListener("pointerup", endDrag);
  renderer.domElement.addEventListener("pointercancel", endDrag);

  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.size = THREE.MathUtils.clamp(view.size * (e.deltaY > 0 ? 1.1 : 0.9), 6, span * 1.4);
    anim.active = false;
  }, { passive: false });

  const raycaster = new THREE.Raycaster();

  /* What is under the pointer, without having to click it.
   *
   * Clicking a building is a commitment: it opens the deed, moves the camera
   * and pins the builder. Hovering costs nothing, which is what people
   * actually do when they are finding their way round a map for the first
   * time. It answers the only question a newcomer has of any one square:
   * what is this, and is anything built on it. */
  const hoverEl = document.getElementById("hover");
  const pointer = new THREE.Vector2();

  function categoryUnder(clientX, clientY) {
    pointer.set(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    return hit ? hit.object.userData.category : null;
  }

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (dragging) {
      hoverEl.classList.remove("on");
      return;
    }
    const category = categoryUnder(e.clientX, e.clientY);
    if (!category) {
      hoverEl.classList.remove("on");
      return;
    }
    const state = tierOf("blueprint_state", category.blueprint_state).label;
    const spend = category.metrics.spend_eur;
    /* A monument gets named on hover.
     *
     * Recognising the shape is the point, and somebody who does not
     * recognise it should not have to click to find out what they are
     * looking at. The market comes with it, because the shape was chosen
     * from a market that adopted the blueprint and that is the only reason
     * this category has that monument and not another. */
    const monument = standing.has(category.code)
      ? `<span class="lm">${category.landmark.name} &middot; ${category.landmark.market}</span>`
      : "";
    hoverEl.innerHTML =
      `<b>${category.code}</b> ${category.name}<br>` +
      `<span>${category.district} &middot; ${state}` +
      (spend > 0 ? ` &middot; ${euro(spend)}` : "") + `</span>` + monument;
    hoverEl.classList.add("on");
    // Nudged clear of the cursor, and kept on screen near the edges.
    const box = hoverEl.getBoundingClientRect();
    const x = Math.min(e.clientX + 16, window.innerWidth - box.width - 12);
    const y = Math.min(e.clientY + 16, window.innerHeight - box.height - 12);
    hoverEl.style.left = `${Math.max(12, x)}px`;
    hoverEl.style.top = `${Math.max(12, y)}px`;
  });

  renderer.domElement.addEventListener("pointerleave", () => {
    hoverEl.classList.remove("on");
  });

  renderer.domElement.addEventListener("click", (e) => {
    if (moved > 6) return;
    const clicked = categoryUnder(e.clientX, e.clientY);
    if (clicked) {
      const spot = positionOf.get(clicked.code);
      showCategory(clicked);
      say(clicked);
      flyTo(new THREE.Vector3(spot.x, 0, spot.z), FOCUS_SIZE);
      sendFigure(
        new THREE.Vector3(spot.x + CELL * 0.5, 0, spot.z + CELL * 0.5), "fly", FLIGHT
      );
      walker.pinned = true;
    } else {
      showCategory(null);
      say(null);
      walker.pinned = false;
    }
  });

  // Panels collapse and can be dragged out of the way. Both behaviours are
  // delegated, because the category card is re-rendered on every question and
  // would otherwise lose its handlers.
  let drag = null;
  let dragEndedAt = 0;

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-collapse]");
    // A drag ends with a click on the handle; do not also collapse the panel.
    if (toggle && performance.now() - dragEndedAt > 250) {
      toggle.closest(".hud").classList.toggle("collapsed");
    }
  });

  document.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-drag]");
    if (!handle) return;
    const panel = handle.closest(".hud");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    // Panels are anchored by whichever corner suits them; pin to top-left
    // before moving so one set of coordinates governs.
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    drag = { panel, handle, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: 0 };
    handle.setPointerCapture(e.pointerId);
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    // Always leave enough of the panel on screen to grab it again.
    const maxLeft = window.innerWidth - 80;
    const maxTop = window.innerHeight - 44;
    drag.panel.style.left = `${THREE.MathUtils.clamp(drag.left + dx, 80 - drag.panel.offsetWidth, maxLeft)}px`;
    drag.panel.style.top = `${THREE.MathUtils.clamp(drag.top + dy, 0, maxTop)}px`;
  });

  const endDragPanel = () => {
    if (!drag) return;
    if (drag.moved > 5) dragEndedAt = performance.now();
    drag = null;
  };
  document.addEventListener("pointerup", endDragPanel);
  document.addEventListener("pointercancel", endDragPanel);

  // The closing ask. It is the point of the whole session, so it takes the
  // screen; a click anywhere puts the city back.
  const asksEl = document.getElementById("asks");
  let showingAsks = false;

  function setAsks(on) {
    showingAsks = !!on;
    asksEl.classList.toggle("on", showingAsks);
    return showingAsks;
  }

  asksEl.addEventListener("click", () => setAsks(false));

  /* Single-key shortcuts are for the person driving the city, not for the
   * person typing a question into it. Typing "reset the view" used to reset
   * the view, turn on night, raise the potential and open the asks before the
   * sentence was finished. So the keys are ignored the moment focus is in a
   * field, and whenever a modifier is held. */
  function typingInAField(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"
      || target.isContentEditable;
  }

  /* One place for the four things a key can ask for, because a phone has no
   * keys and the buttons that stand in for them must do exactly the same
   * thing. Two code paths to the same view is how they drift. */
  /* The explainer.
   *
   * Everything the legend abbreviates, written out once: what the ground is,
   * what each measure is bound to and how its values map to tiers, how the
   * score is put together, how a monument is earned, and what the data cannot
   * tell you.
   *
   * Generated from the same config the city draws from rather than written as
   * prose, so re-binding a layer rewrites this page as well. The authored
   * parts are the framing and the caveats, which no config can derive and
   * which an audience is entitled to before drawing a conclusion from a
   * picture. */
  const explainer = document.getElementById("explainer");

  /* A tier label dropped into the middle of a sentence.
   *
   * Only the first letter, and only when the word is not an acronym:
   * lowercasing the whole label turned "Several AI-generated RFPs" into
   * "several ai-generated rfps". */
  function soften(label) {
    const text = String(label || "");
    if (/^[A-Z]{2}/.test(text)) return text;
    return text[0] ? text[0].toLowerCase() + text.slice(1) : text;
  }

  function renderExplainer() {
    const copy = CONFIG.explainer || {};
    const counts = CITY.meta.counts;
    const layerOrder = ["foundation", "height", "value", "occupancy", "reactor"];

    const measures = layerOrder.filter((layer) => CONFIG.layers[layer]).map((layer) => {
      const name = layerMetric(layer);
      const def = metricDef(name);
      const rungs = def.tiers.map((tier) => tier.label).join(" → ");
      return `<div class="pair">
        <div class="name">${def.label}</div>
        <div class="from">${layer} ← ${name}</div>
        <div class="what">${CONFIG.layers[layer].detail || CONFIG.layers[layer].caption}</div>
        <div class="rungs">${rungs}</div>
      </div>`;
    }).join("");

    /* Lowest first here, the way a ladder is read, and each rung bounded by
     * the next rather than left open: "40 and up" four times over says
     * nothing about where one stage stops.
     *
     * The definition comes from `means` rather than from the short reading
     * the rail carries, and the count of lots in each band is counted here
     * rather than written down, so the table cannot claim a distribution the
     * data does not have. */
    const ladder = STAGES.slice().reverse();
    const stages = ladder.map((stage, i) => {
      const next = ladder[i + 1];
      const from = stage.from || 0;
      const to = next ? next.from - 1 : ARC_MAX;
      const span = `${from} to ${to}`;
      const here = CITY.categories.filter((c) => {
        const total = (c.journey || {}).total || 0;
        return total >= from && total <= to;
      }).length;
      return `<tr><td>${stage.label}</td><td>${span}</td>`
        + `<td>${here} of ${CITY.categories.length}</td>`
        + `<td>${stage.means || stage.detail || ""}</td></tr>`;
    }).join("");

    const built = CITY.categories.filter((c) => c.blueprint_state !== "none").length;
    const used = CITY.categories.filter((c) => (c.metrics.cbp_used || 0) > 0).length;

    /* The three components, rung by rung.
     *
     * The single most asked question about this city was how a category gets
     * to a number, and the answer was nowhere on screen: the weights were
     * there, the rungs were not. There is no partial credit between rungs, so
     * a category's total is always one of a small set of sums, and printing
     * the rungs is the only way that is knowable from the interface.
     */
    const rungs = ["blueprint", "usage", "ai"].map((part) => {
      const rows = (CONFIG.score[part] || []).map((rung) =>
        `<tr><td>${rung.points}</td><td>${rung.label}</td></tr>`).join("");
      const name = COMPONENT_LABEL[part];
      return `<div class="pair">
        <div class="name">${name[0].toUpperCase()}${name.slice(1)},
          out of ${WEIGHTS[part]}</div>
        <table class="rungs"><tbody>${rows}</tbody></table>
      </div>`;
    }).join("");

    /* Two worked examples, chosen from the data rather than invented.
     *
     * The top scorer and the category that leads on reach and has never been
     * used. Between them they show that the total is the three components
     * added up and nothing else. */
    const ranked = CITY.categories.slice()
      .sort((a, b) => b.journey.total - a.journey.total);
    const widest = CITY.categories.slice()
      .sort((a, b) => (b.metrics.market_reach || 0) - (a.metrics.market_reach || 0))[0];
    const worked = [ranked[0], widest].filter(Boolean).map((c) => {
      const j = c.journey;
      return `<tr><td>${c.code}</td>
        <td>${Math.round(j.blueprint)} + ${Math.round(j.usage)} + ${Math.round(j.ai)}</td>
        <td>${Math.round(j.total)}</td>
        <td>${soften(j.labels.blueprint)}, ${soften(j.labels.usage)},
          ${soften(j.labels.ai)}</td></tr>`;
    }).join("");

    /* The spend ladder, with the thresholds on it.
     *
     * "Houses, then a hotel" is not a rule anybody can apply. The numbers
     * come from the metric's own tiers, so the table cannot disagree with
     * what is drawn on the lots. */
    const spendDef = metricDef(layerMetric("value"));
    const money = (spendDef.tiers || []).map((tier, i, all) => {
      const under = all[i - 1];
      const from = under && under.max !== null ? under.max : 0;
      /* Four cases, and the middle two are easy to get wrong. The bottom
       * tier is nought, so its band is not a range; the tier above it starts
       * at nought, so euro() renders its lower bound as "Not recorded" and
       * the row read "Not recorded to €1m". */
      const band = tier.max === null ? `above ${euro(from)}`
        : tier.max === 0 ? "nothing recorded"
          : from === 0 ? `up to ${euro(tier.max)}`
            : `${euro(from)} to ${euro(tier.max)}`;
      return `<tr><td>${tier.label}</td><td>${band}</td></tr>`;
    }).join("");

    const monuments = landmarks
      .map((mark) => byCode.get(mark.code))
      .filter(Boolean)
      .sort((a, b) => b.metrics.journey_score - a.metrics.journey_score)
      .map((c) => `<tr><td>${c.landmark.name}</td><td>${c.code}</td>`
        + `<td>${Math.round(c.metrics.journey_score)} out of 100, from ${c.landmark.market}</td></tr>`)
      .join("");

    const caveats = (copy.caveats || []).map((item) =>
      `<div class="caveat"><div class="title">${item.title}</div><p>${item.body}</p></div>`
    ).join("");

    document.getElementById("explainerBody").innerHTML = `
      <h2>${CONFIG.city.name}</h2>
      <p class="lede">${CONFIG.city.scope_label} &middot; ${counts.districts} districts,
        ${counts.plots} plots, ${counts.categories} lots. ${built} built,
        ${used} that anybody has used.</p>

      <section>
        <h3>What you are looking at</h3>
        <p>${copy.opening || ""}</p>
        <div class="pairs">${(copy.audiences || []).map((a) => `<div class="pair">
          <div class="name">${a.who}</div>
          <div class="what">${a.body}</div></div>`).join("")}</div>
      </section>

      <section>
        <h3>The ground</h3>
        <p>${copy.ground || ""}</p>
      </section>

      <section>
        <h3>What is drawn, and what drives it</h3>
        <div class="pairs">${measures}</div>
      </section>

      <section>
        <h3>How a category gets to a number</h3>
        <p>Three components added together, out of 100. Each has fixed rungs
          and there is no partial credit between them, so a category's total
          is always one of a small set of sums.</p>
        <div class="pairs three">${rungs}</div>
        <p>${COMPONENT_LABEL.usage[0].toUpperCase()}${COMPONENT_LABEL.usage.slice(1)}
          is the heaviest single component on purpose: a blueprint nobody uses
          is paperwork, and the score should say so.</p>
        <table><thead><tr><th>Lot</th><th>Adds up as</th><th>Total</th>
          <th>Because</th></tr></thead><tbody>${worked}</tbody></table>
      </section>

      <section>
        <h3>Why a district scores 28 and no category does</h3>
        <p>A district, a category manager and the whole of Networks have no
          blueprint of their own, so their score is not on the rungs. It is
          the average of the categories they hold, weighted by the square root
          of spend and floored at
          ${euro((CONFIG.score.rollup || {}).floor_eur || 1e6)} so one large
          category cannot carry a group that has done nothing else.</p>
        <p>That is the whole reason the organisation reads
          ${Math.round(CITY.totals.journey.total)} out of 100 while single
          categories read 0, 25, 40 or 100. Networks is low because 89 of its
          ${counts.categories} lots are at nought. A grouping holding fewer
          than ${CONFIG.score.minimum_categories} categories is left off the
          scoreboard entirely, because below that a score is a coin toss
          rather than a track record.</p>
        <table class="stages"><thead><tr><th>Stage</th><th>Score</th>
          <th>Lots</th><th>What it means</th></tr></thead>
          <tbody>${stages}</tbody></table>
      </section>

      <section>
        <h3>Spend, houses and the hotel</h3>
        <p>${CONFIG.layers.value.detail}</p>
        <table><thead><tr><th>On the lot</th><th>Spend FY26/27</th></tr></thead>
          <tbody>${money}</tbody></table>
      </section>

      <section>
        <h3>The monuments</h3>
        <p>A monument replaces the <b>building</b>, which is the score. It does
          not replace the houses or the hotel: those are spend, and they stay
          where they are. The Parthenon stands on D408 with D408's hotel in
          front of it.</p>
        <p>Assignment is computed from the data at every build. The highest
          scorers above ${CONFIG.landmarks.min_score} take a monument from a
          market that has adopted their blueprint, highest first, and nothing
          is tracked by hand: a category that crosses the threshold next month
          takes one at the next build, and one that falls below it loses it.</p>
        <p>Two settings keep them scarce, because scores only go up and thirty
          monuments would mean nothing. The threshold decides who is eligible.
          ${CONFIG.landmarks.max_landmarks !== undefined
            && CONFIG.landmarks.max_landmarks !== null
            ? `A cap of ${CONFIG.landmarks.max_landmarks} decides how many
               exist, which is the number that matters; past that, the lowest
               scorers of the qualifying set go without.`
            : "There is no cap on the number, so the threshold is the only lever."}</p>
        <table><thead><tr><th>Monument</th><th>Lot</th><th>Earned</th></tr></thead>
          <tbody>${monuments}</tbody></table>
      </section>

      <section>
        <h3>What could we build</h3>
        <p>Press P. The light drops, everything already built desaturates to
          grey, and the only thing left with colour in it is what is not there
          yet. It is drawn in a different material for that reason: it can
          never be mistaken for the built city.</p>
        <p>A lot with a drafted blueprint rises to the height its own score
          already earns, because the work is done and not switched on. A lot
          with no blueprint rises to the height its <b>spend</b> would justify,
          which is the argument for writing one. A lot with neither a blueprint
          nor spend stays an outline, because nothing on record justifies a
          building there.</p>
        <p>It is a projection of the record, not a forecast, and no figure in
          it is invented: every height is a tier of a measure already on the
          card.</p>
      </section>

      <section>
        <h3>What this does not tell you</h3>
        ${caveats}
      </section>`;
  }

  function showExplainer(on) {
    const want = on === undefined ? explainer.hidden : on;
    if (want) explainer.scrollTop = 0;
    explainer.hidden = !want;
    return want;
  }

  renderExplainer();
  document.getElementById("legendMore").addEventListener("click", () => showExplainer(true));
  document.getElementById("explainerClose").addEventListener("click", () => showExplainer(false));
  // Anywhere off the sheet closes it, which is what a click on a dimmed
  // backdrop is for.
  explainer.addEventListener("click", (e) => {
    if (e.target === explainer) showExplainer(false);
  });

  const COMMANDS = {
    night: () => setNight(!isNight),
    explain: () => showExplainer(),
    potential: () => window.NWCity.potential(),
    asks: () => setAsks(!showingAsks),
    reset: () => {
      showCategory(null);
      flyTo(HOME.target, HOME.size);
    },
  };
  const KEYS = { n: "night", p: "potential", k: "asks", r: "reset", h: "explain", "?": "explain" };

  window.addEventListener("keydown", (e) => {
    if (typingInAField(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && !explainer.hidden) return void showExplainer(false);
    const command = KEYS[e.key.toLowerCase()];
    if (command) COMMANDS[command]();
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyCamera();
  });

  // ------------------------------------------------------------- public API

  window.NWCity = {
    data: CITY,
    config: CONFIG,
    focus(code) {
      const category = byCode.get(String(code || "").toUpperCase());
      if (!category) return false;
      const spot = positionOf.get(category.code);
      showCategory(category);
      /* Frame what is actually standing there.
       *
       * FOCUS_SIZE frames the plot, which is right for everything the city
       * currently builds. It stops being right the moment a taller tier is
       * bound to height, so the frame grows to hold whatever is standing and
       * the look-at point lifts to its middle, rather than being pinned to
       * the ground with the building running off the top. */
      const standing = spot.top || 0;
      const size = Math.max(FOCUS_SIZE, standing * 0.62);
      const ground = new THREE.Vector3(spot.x, Math.min(standing * 0.4, size * 0.5), spot.z);
      flyTo(ground, size);
      sendFigure(
        new THREE.Vector3(spot.x + CELL * 0.5, 0, spot.z + CELL * 0.5), "fly", FLIGHT
      );
      walker.pinned = true;
      say(category);
      // Fly first, then tear the building down and reassemble it, so the
      // construction lands once the camera has settled on the plot.
      clearTimeout(window.__nwBuildTimer);
      window.__nwBuildTimer = setTimeout(() => rebuild(spot), FLIGHT * 900);
      return true;
    },
    rise() {
      cityRise();
    },
    night(on) {
      setNight(on === undefined ? !isNight : on);
      return isNight;
    },
    potential(on) {
      const result = setPotential(on === undefined ? !showingPotential : on);
      return { showing: showingPotential, ...result };
    },
    asks(on) {
      return setAsks(on === undefined ? !showingAsks : on);
    },
    // Fly to a whole district rather than one lot. Used when the agent is
    // answering about a district or ranking within one.
    focusDistrict(name) {
      const wanted = String(name || "").toLowerCase();
      const district = layout.districts.find((d) => d.name.toLowerCase() === wanted);
      if (!district) return false;
      const cx = district.cx + district.w / 2;
      const cz = district.cz + district.d / 2;
      showCategory(null);
      flyTo(new THREE.Vector3(cx, 0, cz), Math.max(district.w, district.d) * 0.46);
      sendFigure(new THREE.Vector3(cx, 0, cz + district.d * 0.3), "fly", FLIGHT);
      walker.pinned = true;
      return true;
    },
    // Let the agent write its own line rather than using the built-in narrator.
    speak(caption, bubble) {
      if (!caption && !bubble) {
        say(null);
        return;
      }
      bubbleText = bubble || "";
      bubbleEl.textContent = bubbleText;
      if (caption) {
        captionEl.firstElementChild.textContent = caption;
        captionEl.classList.add("on");
      } else {
        captionEl.classList.remove("on");
      }
    },
    categories: CITY.categories,
    /* What the on-screen buttons call. The same functions the keyboard
       shortcuts call, by name, so touch and pointer input cannot diverge. */
    command(name) {
      const run = COMMANDS[name];
      if (!run) return false;
      run();
      return true;
    },
    /* Read the city without changing it.
     *
     * night(), potential() and asks() all toggle when called with nothing,
     * which makes them useless for asking a question: the act of looking
     * changes the answer, and a check written with one of them passes or
     * fails on its own side effect. */
    layout,
    state() {
      return {
        night: isNight,
        potential: showingPotential,
        asks: showingAsks,
        size: view.size,
        // Where the camera is looking, so a check can tell a panel that
        // scrolled from a city that panned.
        target: [+view.target.x.toFixed(3), +view.target.z.toFixed(3)],
      };
    },
    // Pieces still mid-flight. Read by the test suite to wait for settle.
    pending() {
      return scheduled.length;
    },
    /* Each monument shape's authored bounding box.
     *
     * The shapes are hand-built at very different proportions, because the
     * real things are: Big Ben is a narrow shaft, the Colosseum is a squat
     * ring. One scale constant cannot serve both, so each is scaled from its
     * own measured box and a check confirms they end up in the same size
     * class. */
    monumentShapes() {
      const out = {};
      for (const list of Object.values((CONFIG.landmarks || {}).by_market || {})) {
        for (const m of list) {
          const b = shapeBox(m.shape);
          out[m.shape] = b
            ? { w: +b.w.toFixed(2), d: +b.d.toFixed(2), h: +b.h.toFixed(2) }
            : null;
        }
      }
      return out;
    },
    /* The district names as drawn: the lines they were broken into, the size
     * they were set at, and which of the two passes is showing. A check that
     * read the config would pass while the lettering came out four pixels
     * high or ran off its own strip. */
    districtNames() {
      return layout.districts.map((district, i) => ({
        name: district.name,
        lines: district.nameFit.lines,
        size: district.nameFit.size,
        cap: +(district.nameFit.size / NAME_PPU).toFixed(2),
        strip: +district.strip.toFixed(2),
        fits: district.nameFit.depth <= district.strip - KERB - 0.6 + 0.001,
        lit: districtNames[i] ? districtNames[i].userData.lit.visible : null,
        stone: districtNames[i] ? districtNames[i].userData.stone.visible : null,
      }));
    },
    /* Where the marker pin is, and the screen box of what it marks.
     *
     * The pin belongs over the thing being talked about and the bubble beside
     * it, never over it. Both are placed in screen space from a projection, so
     * a check that read world coordinates would be checking a different
     * calculation than the one that can go wrong. */
    spotlightBox() {
      if (!spotlight) return null;
      const half = (spotlight.span || 1) * (spotlight.cell || CELL) / 2;
      const top = spotlight.top || 0;
      /* The eight corners of the lot's own volume, in screen pixels.
       *
       * Returned as points rather than as a bounding box. Under this
       * projection a lot is a hexagon on screen and its bounding box is half
       * empty corner, so a box overlap says the bubble is over the monument
       * when it is sitting in the gap beside it. */
      const corners = [];
      for (const dx of [-half, half]) {
        for (const dz of [-half, half]) {
          for (const dy of [0, top]) {
            const at = toScreen(new THREE.Vector3(spotlight.x + dx, dy, spotlight.z + dz));
            corners.push([+at.x.toFixed(1), +at.y.toFixed(1)]);
          }
        }
      }
      const pin = marker.position;
      return {
        code: spotlight.category.code,
        corners,
        pin: { x: +pin.x.toFixed(2), y: +pin.y.toFixed(2), z: +pin.z.toFixed(2) },
        lot: { x: +spotlight.x.toFixed(2), z: +spotlight.z.toFixed(2), top: +top.toFixed(2) },
        bubble: document.getElementById("bubble").getBoundingClientRect(),
      };
    },
    /* The ground plate, so a check can confirm nothing stands off the edge. */
    plate() {
      return {
        w: baseW,
        d: baseD,
        tallest: TALLEST,
        clearance: CLEARANCE,
        /* How far back a unit of height is thrown by this projection, per
         * ground axis. Reported rather than left to be inferred from the
         * clearance: the clearance is the shortfall left over after every
         * lot's own inset, so dividing it by the tallest assembly no longer
         * recovers this and a check doing that would be measuring against a
         * number it invented. */
        behind: BEHIND,
        flyover: FLYOVER_TOP,
        flyoverOut: FLYOVER_OUT,
      };
    },
    /* Roll the journey score up over a named set of categories.

     * The score is computed twice: in Python for the build, and here for the
     * People board, where the grouping does not exist until the page runs.
     * Two implementations of one formula drift, so this exposes the browser's
     * one and a check compares it against the figures the build wrote. The
     * alternative was shipping pre-computed rollups for every grouping
     * somebody might one day ask for.
     */
    score(codes) {
      const list = (codes || []).map((code) => byCode.get(code)).filter(Boolean);
      return list.length ? rollUp(list) : null;
    },
    /* Open the leaderboard on one of its three views and report what it says.

     * The journey panel is already the best answer the city has to "who is
     * doing best", so the agent opens it rather than inventing a second way
     * of saying the same thing. It returns the rows so whatever asked can
     * speak the top of the list without recomputing the score.
     */
    showJourney(view) {
      if (!["districts", "categories", "people"].includes(view)) return null;
      const button = document.querySelector(`#jSwitch [data-view="${view}"]`);
      if (!button) return null;
      button.click();
      // On a phone the panel starts collapsed, and a leaderboard nobody can
      // see is not an answer.
      const panel = document.getElementById("journey");
      if (panel) panel.classList.remove("collapsed");
      const rows = document.getElementById("jRows");
      if (rows) rows.scrollTop = 0;
      return journeyData().map((r) => ({
        label: r.label, sub: r.sub,
        total: Math.round(r.j.total),
        blueprint: Math.round(r.j.blueprint),
        usage: Math.round(r.j.usage),
        ai: Math.round(r.j.ai),
      }));
    },
    /* Which categories actually got a monument built on them.
     *
     * The assignment happens in the build and the geometry happens here, and
     * a check that only read the data would pass while the city drew nothing.
     * So this reports what is standing, not what was intended. */
    monuments() {
      return landmarks.map((l) => l.code).sort();
    },
    /* What the stone on each monument is actually doing.
     *
     * Occupancy is drawn on a monument as a colour wash by day and a
     * floodlight after dark, and reading the data would not tell you whether
     * either reached the geometry. This reports the material, so a check can
     * compare the two. */
    monumentLight() {
      return landmarks.map((mark) => {
        /* Averaged over every material in the monument, and reported as
         * saturation rather than as a colour.
         *
         * The shapes are built from different mixes of the same palette, so
         * the first material in one is sandstone and in another the darker
         * course under it. Saturation is what the wash moves, whatever the
         * shape: it pulls every colour towards a near-grey neutral. */
        const hsl = { h: 0, s: 0, l: 0 };
        let saturation = 0;
        let lightness = 0;
        let glow = 0;
        let count = 0;
        mark.group.traverse((node) => {
          if (!node.material || !node.material.color) return;
          node.material.color.getHSL(hsl);
          saturation += hsl.s;
          lightness += hsl.l;
          if (node.material.emissive) glow = Math.max(glow, node.material.emissive.getHex());
          count++;
        });
        return {
          code: mark.code,
          occupied: mark.occupied,
          saturation: count ? +(saturation / count).toFixed(3) : 0,
          lightness: count ? +(lightness / count).toFixed(3) : 0,
          glow,
          parts: count,
        };
      }).sort((a, b) => a.code.localeCompare(b.code));
    },
    reset() {
      showCategory(null);
      say(null);
      setAsks(false);
      walker.pinned = false;
      flyTo(HOME.target, HOME.size);
    },
    setLayerMetric(layer, metric) {
      if (!CONFIG.layers[layer] || !CONFIG.metrics[metric]) return false;
      CONFIG.layers[layer].metric = metric;
      window.location.reload();
      return true;
    },
  };

  // ------------------------------------------------------------------ loop
  let ready = false;
  function tick() {
    requestAnimationFrame(tick);
    if (anim.active) {
      const t = Math.min(1, (clockNow() - anim.start) / anim.duration);
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
      view.target.lerpVectors(anim.from, anim.to, e);
      view.size = anim.fromSize + (anim.toSize - anim.fromSize) * e;
      if (t >= 1) anim.active = false;
    }
    const nowSec = clockNow();
    const delta = Math.min(0.1, nowSec - (tick.last || nowSec));
    tick.last = nowSec;
    stepBuild();
    updateWalkers(nowSec, delta);
    updateTraffic(delta);
    updateFigure(nowSec, delta);
    applyCamera();
    placeBubble();
    const zoom = view.size / HOME.size;
    // The figure is the focal element, and at the wide view one scaled to the
    // street was too small to locate. It grows as the camera pulls back,
    // capped, so it stays a character rather than becoming
    // a monument standing over the city.
    figure.scale.setScalar(FIGURE_SCALE * THREE.MathUtils.clamp(zoom * 1.9, 1, 2.6));
    camera.layers.set(0);
    renderer.setClearColor(sky, 1);
    renderer.clear();
    renderer.render(scene, camera);
    camera.layers.set(FIGURE_LAYER);
    renderer.clearDepth();
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      document.body.dataset.ready = "1";
    }
  }

  setNight(false);
  // The city we could be starts collapsed. Its pieces live in the same meshes
  // as everything else, so without this they would stand there from the first
  // frame and the reveal would have nothing left to reveal.
  for (const b of potentialLots()) {
    for (const ref of b.pieces.potential) setPiece(ref, 0);
  }
  for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
  dirty.clear();
  applyCamera();
  cityRise();
  tick();
})();
