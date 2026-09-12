/* Browser smoke test: drives the real page in a real browser.
 *
 * Checks the things that would ruin a live demo: the city loading, the
 * resolver finding what people will actually type, and the agent driving the
 * city rather than just talking about it.
 *
 *   npm i playwright   (browsers are already present in CI images)
 *   node tests/smoke.js
 */
const { chromium, devices } = require("playwright");
const path = require("path");
const fs = require("fs");

/* Two configurations, one page.
 *
 * Opened from a file the agent has no service to ask and uses the browser's
 * own rules. Served, it asks the service first and takes a different branch
 * through the same code. The served one is what gets deployed, and until this
 * could be pointed at a URL that branch had never been driven in a browser at
 * all: everything in the suite was testing the fallback.
 *
 *   node tests/smoke.js                              the file
 *   NW_SMOKE_URL=http://127.0.0.1:8099 node ...      the service
 */
const TARGET = (process.env.NW_SMOKE_URL || "").replace(/\/+$/, "");
// A file:// target is the packaged single file, which has no service behind
// it, so it gets the same checks as the folder rather than the served ones.
const SERVED = /^https?:/.test(TARGET) ? TARGET : "";

// ?clean skips the first-run welcome card, which would otherwise sit over the
// city for every check in here.
const PAGE = (SERVED ? SERVED + "/index.html"
  : TARGET || "file://" + path.join(__dirname, "..", "renderer", "index.html")) + "?clean";

// Representative queries, and what each has to resolve to.
const RESOLUTIONS = [
  ["A221", "category", "A221"],
  ["batteries", "category", "D504"],
  ["field maintenance", "category", "A311"],
  ["how is energy doing", "district", "Energy"],
  ["worst in software and core", "district", "Software and Core"],
  ["packet switching", "plot", "Packet Switching"],
  ["Germany", "market", "Germany"],
  ["banana bread", "none", "no match"],
];

function findChromium() {
  const bundled = (() => {
    try { return chromium.executablePath(); } catch { return null; }
  })();
  if (bundled && fs.existsSync(bundled)) return undefined; // let playwright choose
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(root)) return undefined;
  for (const dir of fs.readdirSync(root).filter((d) => d.startsWith("chromium-"))) {
    for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app"]) {
      const candidate = path.join(root, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/* Generous, because the wait is not a download.
 *
 * In the packaged single file every script is inline, so the load event does
 * not fire until the whole city has been built: 145 buildings, the roads, the
 * trees and the trams, synchronously. That is fast on a developer machine
 * with a warm cache and slow on a loaded host, and a timeout
 * here reads as "the page is broken" when it means "the page was still
 * working". A real hang still fails, a minute later, with the same message.
 */
const NAVIGATION = 90000;

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? " · " + detail : ""}`);
};

/* The same page on a phone.
 *
 * Not the primary target viewport, but a supported one. It
 * is how a reviewer opens a link, and the first version of this laid a 320px
 * legend over the whole city, hid the question box behind six lines of
 * starter prompts, and offered a corner note advising them to hover a
 * building and press T.
 *
 * A second context on the browser already launched, rather than a third full
 * run: only the things that differ on a touchscreen are worth checking twice.
 */
/* Every control you can see, you can reach.
 *
 * The rule a handset breaks and a desktop viewport does not. It caught a card centred
 * with translateX(-50%) that had been given left:10 right:10 instead of
 * left:50%: the transform then drags it half its own width off the screen,
 * and it measured -175 to 195 on a 390px viewport with both its buttons
 * entirely outside. It looked correct, because the half still on screen was
 * the half with the words in it.
 *
 * Asserted rather than left to a tap to discover, because whether a tap
 * refuses an off-screen element is a property of the Playwright version and
 * this is a property of the page. One machine passed and another failed on
 * exactly the same file.
 */
async function reachable(page, where) {
  const stray = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, input, a[href]")) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden"
          || style.pointerEvents === "none" || el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;         // not rendered
      if (el.closest("[hidden]")) continue;
      // Anything scrollable may legitimately hold content out of sight.
      let inScroller = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowY === "auto" || ps.overflowY === "scroll"
            || ps.overflowX === "auto" || ps.overflowX === "scroll") inScroller = true;
      }
      if (inScroller) continue;
      if (r.right < 1 || r.left > innerWidth - 1
          || r.bottom < 1 || r.top > innerHeight - 1) {
        out.push(`${el.id || el.textContent.trim().slice(0, 18)} at ${Math.round(r.left)},${Math.round(r.top)}`);
      }
    }
    return out;
  });
  check(`phone: every control is on the screen (${where})`, stray.length === 0,
    stray.join("; "));
}

async function onAPhone(browser) {
  /* The desktop page must be closed before this runs, and it is not a
     tidiness point. Two live WebGL contexts in one browser contend badly
     enough to take this pass from 1.4 seconds to 21, which sat just inside
     the default 30 second navigation timeout on one machine and outside it on
     another. Same file, same code, one green run and one red. */
  const ctx = await browser.newContext({
    ...devices["iPhone 13"],
    // Layout is in CSS pixels either way, and 3x is nine times the pixels to
    // rasterise for a check that never looks at one.
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  console.log("· and again on a phone");
  await page.goto(PAGE, { timeout: NAVIGATION });
  await page.waitForSelector('body[data-ready="1"]', { timeout: NAVIGATION });

  check("phone: buttons replace the keyboard shortcuts",
    (await page.isVisible("#touchbar")) && !(await page.isVisible("#hint")));

  // The original failure, and the one most likely to come back: a panel
  // written for a desktop corner, laid over the model on a 390px screen.
  const overlap = await page.evaluate(() => {
    const boxes = ["ask", "touchbar", "chips", "legend", "trace"]
      .map((id) => [id, document.getElementById(id)])
      .filter(([, el]) => el && getComputedStyle(el).display !== "none")
      .map(([id, el]) => [id, el.getBoundingClientRect()])
      .filter(([, r]) => r.width > 0 && r.height > 0);
    const hits = [];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [ia, ra] = boxes[a], [ib, rb] = boxes[b];
        if (ra.left < rb.right && rb.left < ra.right
            && ra.top < rb.bottom && rb.top < ra.bottom) hits.push(`${ia} over ${ib}`);
      }
    }
    return hits;
  });
  check("phone: nothing is laid over anything else", overlap.length === 0,
    overlap.join(", "));

  check("phone: the page does not scroll sideways",
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  await reachable(page, "at rest");

  // Every button, because they are the only way in without a keyboard.
  const state = () => page.evaluate(() => window.NWCity.state());
  await page.tap("#touchbar button[data-command='night']");
  await page.waitForTimeout(1200);
  check("phone: Night", (await state()).night === true);
  await page.tap("#touchbar button[data-command='night']");
  await page.waitForTimeout(900);

  await page.tap("#touchbar button[data-command='potential']");
  await page.waitForTimeout(1800);
  check("phone: Could be", (await state()).potential === true);
  await page.tap("#touchbar button[data-command='potential']");
  await page.waitForTimeout(1200);

  await page.tap("#touchbar button[data-command='asks']");
  await page.waitForTimeout(900);
  const asksFits = await page.evaluate(() => {
    const c = document.querySelector("#asks .card");
    if (!c) return false;
    const r = c.getBoundingClientRect();
    return r.left >= -1 && r.right <= innerWidth + 1;
  });
  check("phone: The ask, and the card fits", (await state()).asks && asksFits);
  await page.tap("#asks");
  await page.waitForTimeout(600);

  await page.tap("#touchbar button[data-command='tour']");
  await page.waitForTimeout(1200);
  check("phone: Tour", await page.isVisible("#tour"));
  await reachable(page, "tour open");
  await page.tap("#tourExit");
  await page.waitForTimeout(400);

  await page.tap("#askInput");
  await page.fill("#askInput", "batteries");
  await page.tap("#askGo");
  await page.waitForTimeout(4500);
  const deed = await page.evaluate(
    () => document.getElementById("inspector").innerText);
  check("phone: a typed question still works", /D504/.test(deed),
    deed.split("\n")[1] || "no title deed");

  /* Two fingers are the only way to zoom without a scroll wheel. Synthesised
   * rather than driven, because Playwright has no pinch: two pointers down,
   * moving apart, which is exactly what the handler listens for. */
  const before = (await state()).size;
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const send = (type, id, x) => canvas.dispatchEvent(new PointerEvent(type,
      { pointerId: id, clientX: x, clientY: 300, bubbles: true, pointerType: "touch" }));
    send("pointerdown", 1, 150); send("pointerdown", 2, 250);
    send("pointermove", 1, 100); send("pointermove", 2, 300);
    send("pointerup", 1, 100); send("pointerup", 2, 300);
  });
  const after = (await state()).size;
  check("phone: pinching zooms", after < before - 0.01,
    `${before.toFixed(1)} to ${after.toFixed(1)}`);

  await reachable(page, "a lot selected");
  check("phone: no page errors", errors.length === 0, errors[0] || "");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({
    // Prefer a browser already on the machine over whatever this playwright
    // build expects, so the check runs on a CI image and a local host alike.
    executablePath: findChromium(),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log(SERVED ? `· driving the served page at ${SERVED}`
    : `· driving ${TARGET ? "the packaged file" : "the page from a file"}`);
  await page.goto(PAGE, { timeout: NAVIGATION });
  await page.waitForSelector('body[data-ready="1"]', { timeout: NAVIGATION });

  const counts = await page.evaluate(() => window.NWCity.data.meta.counts);
  check("city loads", counts.categories === 145 && counts.districts === 8,
    `${counts.districts} districts, ${counts.categories} buildings`);

  const resolved = await page.evaluate(
    (cases) => cases.map(([q]) => {
      const r = window.NWAgent.tools.find_category(q);
      return { kind: r.kind, label: String(r.label) };
    }),
    RESOLUTIONS
  );
  RESOLUTIONS.forEach(([query, kind, label], i) => {
    const got = resolved[i];
    check(`resolve "${query}"`, got.kind === kind && got.label === label,
      `${got.kind} ${got.label}`);
  });

  // The agent must move the city, not merely describe it.
  await page.fill("#askInput", "where are the biggest gaps");
  await page.click("#askGo");
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({
    trace: document.getElementById("calls").innerText,
    caption: document.querySelector("#caption b").innerText,
  }));
  check("agent calls tools", /find_gaps/.test(after.trace) && /render/.test(after.trace));
  check("agent renders a finding", /A311/.test(after.caption), after.caption);

  /* Leaderboard questions open the leaderboard.
   *
   * All of these used to answer with A221: a category that leads on blueprint
   * reach and that nobody has ever used. Asked who the top category manager
   * was, the city named a lot. The checks pin the board that opens as well as
   * the intent, because landing on the category board is the right intent and
   * still the wrong answer.
   *
   * Worth running on both browser passes: served, the routing comes from the
   * model prompt, and from a file it comes from the rules in agent.js. Those
   * two are a known way for the same question to get two answers.
   */
  const BOARDS = [
    ["who is doing best", "People"],
    ["who is doing well", "People"],
    ["who is the top category manager", "People"],
    ["show me the leaders", "People"],
    ["which district is doing best", "Districts"],
  ];
  for (const [question, board] of BOARDS) {
    await page.fill("#askInput", question);
    await page.click("#askGo");
    await page.waitForTimeout(2200);
    const got = await page.evaluate(() => ({
      caption: document.querySelector("#caption b").innerText,
      view: (document.querySelector("#jSwitch button.on") || {}).textContent || "",
      open: !document.getElementById("journey").classList.contains("collapsed"),
      top: (document.querySelector("#jRows .jRow .who") || {}).textContent || "",
    }));
    // The answer has to name the thing at the top of the board it opened, or
    // the sentence and the screen are describing different things.
    check(`"${question}" opens the ${board} board`,
      got.view === board && got.open && got.top !== ""
        && got.caption.includes(got.top) && /out of 100/.test(got.caption),
      `${got.view}, top ${got.top}: ${got.caption.slice(0, 60)}`);
  }

  // And a ranking question still takes you to a lot, scored on the journey
  // rather than on reach. A251 is the only category in Networks at 100.
  await page.fill("#askInput", "which category is doing best");
  await page.click("#askGo");
  await page.waitForTimeout(2500);
  const best = await page.evaluate(() =>
    document.querySelector("#caption b").innerText);
  check("a category ranking is scored on the journey, not on reach",
    /A251/.test(best) && /100 out of 100/.test(best), best);

  // Type-ahead: four letters of a name should already offer the right lot.
  await page.fill("#askInput", "");
  await page.click("#askInput");
  await page.type("#askInput", "batt", { delay: 40 });
  await page.waitForTimeout(400);
  const offered = await page.$$eval("#suggest button",
    (bs) => bs.map((b) => b.textContent));
  check("type-ahead offers the lot", offered.some((t) => /D504/.test(t)),
    offered[0] || "nothing offered");

  // Hovering a lot should say what it is without having to click it.
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.NWCity.reset());
  await page.waitForTimeout(1500);
  let hovered = "";
  for (let x = 700; x < 1300 && !hovered; x += 25) {
    for (let y = 250; y < 700 && !hovered; y += 25) {
      await page.mouse.move(x, y);
      hovered = await page.$eval("#hover",
        (el) => (el.classList.contains("on") ? el.innerText : ""));
    }
  }
  check("hover names the lot", /[A-D]\d{3}/.test(hovered),
    hovered.replace(/\s+/g, " ") || "nothing under the pointer");

  // The definitions are a net under the names: "lead acid" is nowhere in a
  // category name, and is the first two words of what D504 actually is.
  const viaDefinition = await page.evaluate(
    () => window.NWAgent.tools.find_category("lead acid"));
  check("definition finds what a name cannot",
    viaDefinition.label === "D504" && viaDefinition.viaDefinition === true,
    `${viaDefinition.kind} ${viaDefinition.label}`);

  // ...and never a rival to them. This one has a name match, weak but real.
  const byName = await page.evaluate(
    () => window.NWAgent.tools.find_category("radio kit"));
  check("a weak name still beats a definition",
    byName.kind === "plot" && byName.label === "Radio Equipment",
    `${byName.kind} ${byName.label}`);

  /* Served only: the deployed shape.
   *
   * The agent is supposed to ask the service, believe a plan it gets back and
   * drive the city from it. From a file there is nothing to ask, so none of
   * that runs. These three are the only checks in the suite that see it.
   */
  if (SERVED) {
    const health = await page.evaluate(
      async (base) => (await fetch(base + "/health")).json(), SERVED);
    check("service says what is wired up", health.ok === true,
      `${health.provider}${health.ready ? "" : ": " + health.detail}`);

    await page.evaluate(() => window.NWCity.reset());
    await page.fill("#askInput", "batteries");
    await page.click("#askGo");
    await page.waitForTimeout(4000);
    const planned = await page.evaluate(() => ({
      trace: document.getElementById("calls").innerText,
      // The title deed is the city saying which lot it is standing on.
      deed: document.getElementById("inspector").innerText,
    }));
    // The trace names the source, so a plan that silently fell back to the
    // local rules cannot pass this as though the service had answered.
    check("a plan comes back from the service",
      /plan/.test(planned.trace) && !/using local rules/.test(planned.trace),
      planned.trace.split("\n").find((l) => /plan/.test(l)) || "no plan in the trace");
    check("the city acts on the plan", /D504/.test(planned.deed),
      planned.deed.split("\n")[1] || "no title deed open");
  }

  /* Land is worth what is spent on it, and no lot may sit on another.
   *
   * A treemap looks wrong long before it is wrong, and the failure that
   * matters is silent: two buildings occupying the same square, or a plot
   * whose size says the opposite of its spend. Neither is visible in a
   * screenshot, so both are measured from the packed geometry. */
  const land = await page.evaluate(() => {
    const city = window.NWCity.data;
    const layout = window.NWCity.layout;
    const byCode = new Map(city.categories.map((c) => [c.code, c]));
    const plots = [];
    for (const district of layout.districts) {
      for (const plot of district.plots) {
        plots.push({
          name: plot.name,
          spend: plot.codes.reduce(
            (sum, code) => sum + (byCode.get(code).metrics.spend_eur || 0), 0),
          perLot: plot.codes.reduce(
            (sum, code) => sum + (byCode.get(code).metrics.spend_eur || 0), 0) / plot.codes.length,
          area: plot.w * plot.d,
          cell: plot.cell,
        });
      }
    }
    const lots = layout.buildings.map((b) => ({ x: b.x, z: b.z, half: (b.cell || 4) / 2 }));
    let overlaps = 0;
    for (let i = 0; i < lots.length; i++) {
      for (let j = i + 1; j < lots.length; j++) {
        if (Math.abs(lots[i].x - lots[j].x) < lots[i].half + lots[j].half - 0.01
         && Math.abs(lots[i].z - lots[j].z) < lots[i].half + lots[j].half - 0.01) overlaps++;
      }
    }
    return { plots, overlaps, lots: lots.length };
  });

  check("no two lots occupy the same ground", land.overlaps === 0,
    `${land.overlaps} overlaps across ${land.lots} lots`);

  const richest = land.plots.slice().sort((a, b) => b.spend - a.spend)[0];
  const biggest = land.plots.slice().sort((a, b) => b.area - a.area)[0];
  check("the most expensive plot is the biggest place in the city",
    richest.name === biggest.name, `${richest.name} vs ${biggest.name}`);

  // Lot size must never contradict spend per category: a cheaper plot with
  // bigger lots would be the map telling a lie about where the money is.
  const wrongWay = land.plots.filter((a) =>
    land.plots.some((b) => a.perLot > b.perLot + 1e6 && a.cell < b.cell - 0.01));
  check("lot size never contradicts spend", wrongWay.length === 0,
    wrongWay.map((p) => p.name).join(", "));

  // ------------------------------------------------- the four newest layers
  // Occupancy, the arc, the journey panel and the landmarks all went in at
  // once and all four are read from the data at render time, so a build that
  // dropped a column would draw a plausible-looking city that says nothing.
  // Each check here compares what is drawn against what the data holds.

  const occupancy = await page.evaluate(() => {
    const cats = window.NW_CITY.categories;
    return {
      used: cats.filter((c) => (c.metrics.cbp_used || 0) > 0).length,
      built: cats.filter((c) => c.metrics.market_reach > 0).length,
      declared: window.NW_CITY.totals.in_use,
    };
  });

  check("the city knows how many blueprints anybody has used",
    occupancy.used === occupancy.declared && occupancy.used > 0,
    `${occupancy.used} used of ${occupancy.built} built`);

  const arc = await page.evaluate(() => {
    const track = document.querySelector("#arc .track").getBoundingClientRect();
    const you = document.getElementById("arcYou").getBoundingClientRect();
    return {
      score: document.getElementById("arcScore").textContent.trim(),
      note: document.getElementById("arcNote").textContent.trim(),
      stages: [...document.querySelectorAll("#arc .stage")].map((s) => s.textContent),
      inside: you.left >= track.left - 1 && you.right <= track.right + 1,
      offset: Math.round(((you.left - track.left) / track.width) * 100),
      total: Math.round(window.NW_CITY.totals.journey.total),
    };
  });

  check("the arc names all four stages",
    arc.stages.join(" ") === "Traditional Connected Smart Autonomous",
    arc.stages.join(", "));
  check("the arc reports the score the data holds",
    arc.score.includes(String(arc.total)), `${arc.score} ${arc.note}`);
  check("the marker sits on the rail rather than beside it", arc.inside,
    `${arc.offset}% along`);

  // Three views over one score. Each groups the same 145 categories a
  // different way, so all three must produce rows, sort highest first, and
  // agree with the city's own total when rolled back up.
  for (const view of ["districts", "categories", "people"]) {
    const panel = await page.evaluate((which) => {
      document.querySelector(`#jSwitch [data-view="${which}"]`).click();
      const rows = [...document.querySelectorAll("#jRows .jRow")].map((el) => ({
        who: el.querySelector(".who").textContent,
        num: Number(el.querySelector(".num").textContent),
        bars: el.querySelectorAll(".bp, .use, .ai").length,
      }));
      return {
        rows: rows.length,
        sorted: rows.every((r, i) => i === 0 || rows[i - 1].num >= r.num),
        components: rows.every((r) => r.bars === 3),
        inRange: rows.every((r) => r.num >= 0 && r.num <= 100),
        top: rows[0] || null,
      };
    }, view);

    check(`the journey panel fills in for ${view}`,
      panel.rows > 0 && panel.sorted && panel.inRange && panel.components,
      panel.top ? `${panel.rows} rows, top ${panel.top.who} at ${panel.top.num}` : "no rows");
  }

  // People is the one view that withholds rows, and it must: below the
  // minimum a score is a coin toss rather than a track record, and a single
  // category with a single blueprint would sit at the top on merit it did
  // not earn.
  const people = await page.evaluate(() => {
    document.querySelector('#jSwitch [data-view="people"]').click();
    const floor = (window.NW_CONFIG.score || {}).minimum_categories || 3;
    const rows = [...document.querySelectorAll("#jRows .jRow")];
    const held = new Set();
    for (const c of window.NW_CITY.categories) for (const p of c.owners || []) held.add(p);
    return {
      floor,
      shown: rows.length,
      everybody: held.size,
      counts: rows.map((el) => Number(el.querySelector(".sub").textContent.split(" ")[0])),
    };
  });

  check("nobody below the minimum appears on the leaderboard",
    people.counts.every((n) => n >= people.floor) && people.shown < people.everybody,
    `${people.shown} of ${people.everybody} people qualify at ${people.floor}+`);

  await page.evaluate(() => document.querySelector('#jSwitch [data-view="districts"]').click());

  /* The two score implementations must agree.
   *
   * Python computes the score during the build; the browser computes it again
   * for the People board, where the grouping does not exist until the page
   * runs. Nothing forces those two to stay the same, and a formula that
   * differs by a rounding rule would put a different person top of a board
   * with names on it. So roll the browser's version up over each district and
   * over the whole city, and compare against what the build wrote.
   */
  const rollup = await page.evaluate(() => {
    const drift = [];
    const check = (label, codes, expected) => {
      const got = window.NWCity.score(codes);
      if (!got) return drift.push(`${label}: no score`);
      for (const key of ["total", "blueprint", "usage", "ai"]) {
        const d = Math.abs(got[key] - expected[key]);
        // The build rounds to one decimal before writing, so anything inside
        // half of that is the same number and anything outside is a formula
        // that has moved.
        if (d > 0.05) drift.push(`${label}.${key}: ${got[key].toFixed(3)} vs ${expected[key]}`);
      }
    };
    const all = window.NW_CITY.categories.map((c) => c.code);
    check("Networks", all, window.NW_CITY.totals.journey);
    for (const d of window.NW_CITY.districts) {
      const codes = window.NW_CITY.categories
        .filter((c) => c.district === d.name).map((c) => c.code);
      check(d.name, codes, d.totals.journey);
    }
    return { drift, groups: window.NW_CITY.districts.length + 1 };
  });

  check("the browser and the build compute the same score",
    rollup.drift.length === 0,
    rollup.drift.length ? rollup.drift.join("; ")
      : `${rollup.groups} groupings agree to one decimal`);

  // A landmark is earned: the blueprint reached enough markets and one of
  // them has a monument defined. A landmark that appeared anywhere else would
  // be decoration, which is the one thing the city does not do.
  const monuments = await page.evaluate(() => {
    const config = window.NW_CONFIG.landmarks || {};
    const floor = config.min_markets || 5;
    const earned = window.NW_CITY.categories.filter((c) => c.landmark);
    return {
      drawn: window.NWCity.monuments(),
      earned: earned.map((c) => c.code).sort(),
      floor,
      unearned: earned.filter((c) => c.metrics.market_reach < floor).map((c) => c.code),
      offMap: earned.filter((c) => !(config.by_market || {})[c.landmark.market])
        .map((c) => c.code),
      named: earned.map((c) => `${c.landmark.name} (${c.landmark.market})`),
    };
  });

  check("every landmark in the data is standing in the city",
    monuments.drawn.join(",") === monuments.earned.join(","),
    `${monuments.drawn.length} built: ${monuments.named.join(", ")}`);
  check("no landmark was awarded without the markets to earn it",
    monuments.unearned.length === 0 && monuments.offMap.length === 0,
    [...monuments.unearned, ...monuments.offMap].join(", "));

  check("no page errors", errors.length === 0, errors[0] || "");

  // Hand the phone pass a browser with nothing else rendering in it.
  await page.close();
  await onAPhone(browser);
  await browser.close();
})().then(done, (err) => {
  /* A thrown error is a failed check, not a crash.
   *
   * Playwright throws when it cannot tap or reach something, and left alone
   * that ends the process with thirty lines of Node internals: the one line
   * saying which check failed scrolls away, and the packager's "do not send
   * it" is buried under a stack trace. The stack still prints, underneath,
   * because when it is a genuine fault rather than a failed expectation it
   * is the only thing that helps.
   */
  check("the browser check ran to the end", false,
    String(err && err.message || err).split("\n")[0]);
  console.error("\n" + (err && err.stack || err));
  done();
});

function done() {
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
