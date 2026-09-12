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

  /* Market questions answer about markets.
   *
   * "Which market is doing best" used to answer with one category ranked by
   * how many markets it reached: the word "market" steered the metric and
   * nothing steered the shape of the answer, so the reply named a lot that
   * nobody has ever used. A named market used to get a count and its largest
   * category by spend, which said the same thing about a market with 23
   * blueprints and 3 in use as about one with 2 blueprints and 1.
   *
   * The thin-base guard is the part worth pinning. Italy holds two
   * blueprints, one of them the only category in Networks at 100, and rolls
   * up above Germany's twenty-three. Quoting that as a rank would be a league
   * table nobody could defend.
   */
  const MARKET_ASKS = [
    ["which markets are doing best", /Furthest along of the \d+ markets/],
    ["which market is furthest behind", /Furthest behind of the \d+ markets/],
    ["Germany", /Germany has adopted 23 blueprints and scores \d+ out of 100, \d+\w+ of the/],
    ["Germany", /supplies two of the city's monuments/],
    ["Italy", /too few to rank/],
    ["UK", /supplies the city's Big Ben/],
  ];
  for (const [question, shape] of MARKET_ASKS) {
    await page.fill("#askInput", question);
    await page.click("#askGo");
    await page.waitForTimeout(2200);
    const said = await page.evaluate(() =>
      document.querySelector("#caption b").innerText.replace(/\s+/g, " "));
    check(`"${question}" answers about the market`, shape.test(said),
      said.slice(0, 110));
  }

  /* The explanation opens, and says what the city is actually drawing.
   *
   * Generated from the config, so the assertion is that the generated page
   * agrees with the bindings rather than that some prose exists: every layer
   * named with the metric behind it, every stage bounded, every monument
   * listed, and the caveats present. A sheet of confident text that has
   * drifted from what is on screen is worse than no sheet at all.
   */
  const sheet = await page.evaluate(async () => {
    document.getElementById("legendMore").click();
    await new Promise((done) => setTimeout(done, 250));
    const el = document.getElementById("explainer");
    const body = document.getElementById("explainerBody");
    const config = window.NW_CONFIG;
    const open = !el.hidden && el.getBoundingClientRect().height > 100;
    const text = body.innerText;
    const bindings = Object.entries(config.layers)
      .map(([layer, spec]) => `${layer} \u2190 ${spec.metric}`)
      .filter((line) => !text.includes(line));
    const stages = (config.score.stages || [])
      .filter((stage) => !text.includes(stage.detail));
    const monuments = window.NWCity.monuments()
      .filter((code) => !text.includes(code));
    const caveats = (config.explainer.caveats || [])
      .filter((item) => !text.includes(item.title));
    document.getElementById("explainerClose").click();
    return {
      open,
      closed: document.getElementById("explainer").hidden,
      missingBindings: bindings,
      missingStages: stages.map((s) => s.id),
      missingMonuments: monuments,
      missingCaveats: caveats.map((c) => c.title),
      length: text.length,
    };
  });
  check("the explanation opens and closes", sheet.open && sheet.closed,
    `open ${sheet.open}, closed after ${sheet.closed}`);
  check("the explanation names every layer and the measure behind it",
    sheet.missingBindings.length === 0, sheet.missingBindings.join("; "));
  check("the explanation carries every stage, monument and caveat",
    sheet.missingStages.length === 0 && sheet.missingMonuments.length === 0
      && sheet.missingCaveats.length === 0,
    [...sheet.missingStages, ...sheet.missingMonuments, ...sheet.missingCaveats].join(", ")
      || `${sheet.length} characters`);

  /* The reading of a lot leads with the score, and says nothing untrue at nought.
   *
   * The caption is the loudest line on the screen and it quoted market reach:
   * "8 markets building on this blueprint" for the one category in Networks
   * that has finished the journey, and the same sentence for A221, live in
   * sixteen markets and never used, where it read as praise.
   *
   * The nought case is the other half. A score of nought means no blueprint
   * at all, because drafting one already scores ten, so the bottom of the
   * bottom stage needs its own words or the rail says "Traditional: a
   * blueprint exists" over bare ground.
   */
  const readings = [];
  for (const code of ["A251", "A221", "A311"]) {
    await page.evaluate((c) => window.NWCity.focus(c), code);
    await page.waitForTimeout(900);
    readings.push(await page.evaluate((c) => ({
      code: c,
      caption: document.querySelector("#caption b").innerText.replace(/\s+/g, " "),
      note: document.getElementById("arcNote").textContent.replace(/\s+/g, " "),
    }), code));
  }
  const byCodeRead = new Map(readings.map((r) => [r.code, r]));
  check("the reading of a built lot leads with its score",
    /^100 out of 100 on the journey\./.test(byCodeRead.get("A251").caption)
      && /^40 out of 100 on the journey\./.test(byCodeRead.get("A221").caption),
    byCodeRead.get("A251").caption.slice(0, 80));
  check("a lot with no blueprint is not told it has one",
    !/blueprint exists/.test(byCodeRead.get("A311").note)
      && /no blueprint/.test(byCodeRead.get("A311").note),
    byCodeRead.get("A311").note.slice(0, 80));
  await page.evaluate(() => window.NWCity.reset());

  // A district answer says where the district sits, not just how big it is.
  await page.fill("#askInput", "how is Energy doing");
  await page.click("#askGo");
  await page.waitForTimeout(2200);
  const districtSaid = await page.evaluate(() =>
    document.querySelector("#caption b").innerText.replace(/\s+/g, " "));
  check("a district answer carries its score and its place",
    /Energy scores \d+ out of 100, \w+ of the eight districts/.test(districtSaid),
    districtSaid.slice(0, 110));

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
  check("hover names the lot", /[A-Z]\d{3}/.test(hovered),
    hovered.replace(/\s+/g, " ") || "nothing under the pointer");

  /* Hovering a monument names the monument.
   *
   * Recognising the shape is what a monument is for, and somebody who does
   * not recognise it should not have to click to find out what it is. Driven
   * by focusing the lot first, which centres the camera on it, so the check
   * does not depend on where a monument happens to land in the wide view.
   */
  const named = [];
  for (const code of await page.evaluate(() => window.NWCity.monuments())) {
    await page.evaluate((c) => window.NWCity.focus(c), code);
    await page.waitForTimeout(1400);
    /* A short sweep down the middle rather than one point.
     *
     * The camera frames the lot, but where on the screen the lot lands
     * depends on how tall what is standing on it is, and the two needle
     * monuments put their own base well below the centre of the frame. */
    const mid = Math.round(page.viewportSize().width / 2);
    let tip = { code: "", name: "" };
    for (const fraction of [0.5, 0.56, 0.62, 0.68, 0.44]) {
      await page.mouse.move(mid, Math.round(page.viewportSize().height * fraction));
      await page.waitForTimeout(110);
      tip = await page.evaluate(() => {
        const el = document.getElementById("hover");
        const line = el.querySelector(".lm");
        return { code: (el.querySelector("b") || {}).textContent || "", name: line ? line.textContent : "" };
      });
      if (tip.code === code) break;
    }
    if (tip.code === code && tip.name.trim()) named.push(`${code} ${tip.name.trim()}`);
    else named.push(null);
  }
  const missed = named.filter((n) => !n).length;
  check("hovering a monument names it", missed === 0,
    missed ? `${missed} of ${named.length} gave no name`
      : `all ${named.length} named, e.g. ${named[0]}`);
  await page.evaluate(() => window.NWCity.reset());

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

  /* This block asserts the rail at rest, so it has to be at rest.
   *
   * The reading under the rail now follows the selected category, and by this
   * point the served pass has selected one. Clearing first is the difference
   * between checking the default state and checking whatever the previous
   * block happened to leave behind. */
  const arc = await page.evaluate(() => {
    window.NWCity.reset();
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
        // Scoped to the bar: the same three class names also mark the
        // written-out components below it, and counting both made this
        // assertion pass on any number of segments.
        bars: el.querySelectorAll(".bar .bp, .bar .use, .bar .ai").length,
        named: el.querySelectorAll(".parts .part").length,
        namedText: [...el.querySelectorAll(".parts .part")].map((p) => p.textContent.trim()),
      }));
      return {
        rows: rows.length,
        sorted: rows.every((r, i) => i === 0 || rows[i - 1].num >= r.num),
        components: rows.every((r) => r.bars === 3),
        // Every component named, against the ceiling it is scored out of.
        labelled: rows.every((r) => r.named === 3
          && r.namedText.every((t) => /^[A-Za-z ]+ \d+ of \d+$/.test(t))),
        sample: (rows[0] || {}).namedText,
        inRange: rows.every((r) => r.num >= 0 && r.num <= 100),
        top: rows[0] || null,
      };
    }, view);

    check(`the journey panel fills in for ${view}`,
      panel.rows > 0 && panel.sorted && panel.inRange && panel.components,
      panel.top ? `${panel.rows} rows, top ${panel.top.who} at ${panel.top.num}` : "no rows");
    check(`the {} score components are named on every row`.replace("{}", view),
      panel.labelled, (panel.sample || []).join(" · "));
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

  /* Nothing may stand off the edge of the ground plate.
   *
   * Under this projection a point at height h lands where the ground point
   * h * hypot(dx,dz)/dy behind it would, so a tall object near the city's edge
   * appears above the plate's horizon with nothing behind it and reads as
   * floating. A monument at the western edge did exactly that.
   */
  const grounded = await page.evaluate(() => {
    const plate = window.NWCity.plate();
    const L = window.NWCity.layout;
    // The same shift the renderer derives the margin from, per ground axis.
    const shift = plate.clearance / plate.tallest;
    const off = [];
    for (const code of window.NWCity.monuments()) {
      const b = L.buildings.find((x) => x.category.code === code);
      const back = (b.top || 0) * shift;
      if (b.x - back < -plate.w / 2 || b.z - back < -plate.d / 2) {
        off.push(`${code} at x${b.x.toFixed(0)} z${b.z.toFixed(0)} top${(b.top || 0).toFixed(0)}`);
      }
    }
    return { off, plate: `${plate.w.toFixed(0)}x${plate.d.toFixed(0)}`, tallest: plate.tallest.toFixed(1) };
  });
  check("no monument stands off the edge of the ground",
    grounded.off.length === 0,
    grounded.off.length ? grounded.off.join("; ")
      : `plate ${grounded.plate}, tallest assembly ${grounded.tallest}`);

  /* A monument has to be taller than every plain tower.
   *
   * It used to replace the tower and was drawn at a fixed height, so the five
   * categories that earned one rendered shorter than their neighbours.
   */
  const heights = await page.evaluate(() => {
    const L = window.NWCity.layout;
    const marked = new Set(window.NWCity.monuments());
    let tallestPlain = 0, shortestMonument = Infinity;
    for (const b of L.buildings) {
      const top = b.top || 0;
      if (marked.has(b.category.code)) shortestMonument = Math.min(shortestMonument, top);
      else tallestPlain = Math.max(tallestPlain, top);
    }
    return { tallestPlain, shortestMonument };
  });
  check("every monument stands above every plain tower",
    heights.shortestMonument > heights.tallestPlain,
    `shortest monument ${heights.shortestMonument.toFixed(1)} vs tallest plain tower ${heights.tallestPlain.toFixed(1)}`);

  /* The district names are cut into the ground, at one size, and they light up.
   *
   * The binding constraint is width, not the strip a name sits in: the
   * longest name is 32 characters across a district 33 units wide, so on one
   * line it cannot exceed about 1.5 units of cap height whatever depth it is
   * given. So the long names wrap and the strip is reserved per district,
   * which is the only way all eight come out the same height. If one district
   * quietly shrank its lettering to fit, the set stops reading as one piece
   * of lettering and this is what says so.
   */
  const names = await page.evaluate(() => {
    window.NWCity.night(false);
    const day = window.NWCity.districtNames();
    window.NWCity.night(true);
    const night = window.NWCity.districtNames();
    window.NWCity.night(false);
    return { day, night };
  });
  const caps = [...new Set(names.day.map((d) => d.cap))];
  check("every district name is cut at the same size",
    caps.length === 1, `${caps.length} sizes: ${caps.join(", ")}`);
  check("every district name is big enough to read",
    Math.min(...names.day.map((d) => d.cap)) >= 2,
    `${Math.min(...names.day.map((d) => d.cap))} units of cap height`);
  check("every district name fits the strip reserved for it",
    names.day.every((d) => d.fits),
    names.day.filter((d) => !d.fits).map((d) => d.name).join(", ")
      || names.day.map((d) => `${d.name.split(" ")[0]} ${d.lines.length}L`).join(" · "));
  check("the district names are engraved by day and lit at night",
    names.day.every((d) => d.stone && !d.lit)
      && names.night.every((d) => d.lit && !d.stone),
    `day stone ${names.day.filter((d) => d.stone).length}/8, night lit ${names.night.filter((d) => d.lit).length}/8`);

  /* A monument stands on more ground than a plain lot, and on nobody else's.
   *
   * Widening the lot is half of what marks a monument out, and it is the half
   * that survives being looked at from across the city, where the shape is
   * only a few pixels. So it has to be real: wider than its neighbours in the
   * same plot, and not one millimetre into their footprints. The first pass
   * let a monument overhang, which put a colonnade through the wall of the
   * office block next door.
   */
  const ground = await page.evaluate(() => {
    const L = window.NWCity.layout;
    const marked = new Set(window.NWCity.monuments());
    const boxes = L.buildings.map((b) => {
      const monument = marked.has(b.category.code);
      const side = monument
        ? b.span * b.cell * 0.92
        : (b.cell / 4) * 2.4 + 0.5;
      return { code: b.category.code, plot: b.plot.name, monument, x: b.x, z: b.z, half: side / 2 };
    });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const reach = a.half + b.half - 0.02;
        if (Math.abs(a.x - b.x) < reach && Math.abs(a.z - b.z) < reach) {
          overlaps.push(`${a.code} into ${b.code}`);
        }
      }
    }
    // Every monument against the plain lots sharing its plot.
    const narrow = [];
    for (const m of boxes.filter((b) => b.monument)) {
      const neighbours = boxes.filter((b) => !b.monument && b.plot === m.plot);
      if (neighbours.some((n) => n.half >= m.half)) narrow.push(m.code);
    }
    return { overlaps, narrow, monuments: boxes.filter((b) => b.monument).length };
  });
  check("no lot overlaps another",
    ground.overlaps.length === 0,
    ground.overlaps.length ? ground.overlaps.slice(0, 4).join("; ")
      : `${ground.monuments} monument lots, none overhanging a neighbour`);
  check("a monument stands on more ground than its plain neighbours",
    ground.narrow.length === 0,
    ground.narrow.length ? `no wider than a plain lot: ${ground.narrow.join(", ")}`
      : `all ${ground.monuments} widened`);

  // A landmark is earned: the blueprint reached enough markets and one of
  // them has a monument defined. A landmark that appeared anywhere else would
  // be decoration, which is the one thing the city does not do.
  const monuments = await page.evaluate(() => {
    const config = window.NW_CONFIG.landmarks || {};
    const floor = config.min_score || 50;
    const earned = window.NW_CITY.categories.filter((c) => c.landmark);
    const shapes = new Set();
    for (const list of Object.values(config.by_market || {})) {
      for (const m of list) shapes.add(m.name);
    }
    return {
      drawn: window.NWCity.monuments(),
      earned: earned.map((c) => c.code).sort(),
      floor,
      // Earned by progress now, not by spread.
      unearned: earned.filter((c) => c.journey.total < floor).map((c) => c.code),
      // And still drawn from a market that actually adopted it.
      offMap: earned.filter((c) => !(c.markets || []).includes(c.landmark.market)
                                || !shapes.has(c.landmark.name))
        .map((c) => c.code),
      named: earned.map((c) => `${c.landmark.name} (${c.landmark.market})`),
      // Nobody over the threshold may be left without one.
      missed: window.NW_CITY.categories
        .filter((c) => c.blueprint_state === "active" && c.journey.total >= floor && !c.landmark)
        .map((c) => c.code),
    };
  });

  check("every category over the threshold has a monument",
    monuments.missed.length === 0,
    monuments.missed.length ? `no monument for ${monuments.missed.join(", ")}`
      : `all ${monuments.earned.length} at ${monuments.floor}+ are covered`);
  check("every landmark in the data is standing in the city",
    monuments.drawn.join(",") === monuments.earned.join(","),
    `${monuments.drawn.length} built: ${monuments.named.join(", ")}`);
  /* Occupancy reaches the monuments.
   *
   * Every one of the four categories anybody has run a sourcing event through
   * earned a monument, so when the monument replaced the building the
   * lit-window layer stopped encoding anything: the only four lots carrying
   * the signal were the only four with no windows to put it in. This asserts
   * the replacement, on the materials rather than on the data, in both
   * lighting states.
   */
  const stone = await page.evaluate(async () => {
    const used = new Set(window.NWCity.data.categories
      .filter((c) => (c.metrics.cbp_used || 0) > 0).map((c) => c.code));
    window.NWCity.night(false);
    const day = window.NWCity.monumentLight();
    window.NWCity.night(true);
    const night = window.NWCity.monumentLight();
    window.NWCity.night(false);
    return { used: [...used], day, night };
  });
  const usedSet = new Set(stone.used);
  const flagged = stone.day.filter((m) => m.occupied !== usedSet.has(m.code));
  const inUse = stone.day.filter((m) => usedSet.has(m.code));
  const idle = stone.day.filter((m) => !usedSet.has(m.code));
  const dullest = Math.min(...inUse.map((m) => m.saturation));
  const brightest = Math.max(...idle.map((m) => m.saturation));
  const wrongGlow = stone.night.filter((m) => usedSet.has(m.code) !== (m.glow > 0));
  check("the city agrees with the data about which monuments are in use",
    flagged.length === 0, flagged.map((m) => m.code).join(", "));
  check("a monument in use keeps its colour and an unused one is washed out",
    inUse.length > 0 && idle.length > 0 && dullest > brightest,
    `in use ${dullest.toFixed(2)} saturation, unused ${brightest.toFixed(2)}`);
  check("only the monuments in use are floodlit after dark",
    wrongGlow.length === 0 && stone.night.every((m) => m.parts > 0),
    wrongGlow.length ? wrongGlow.map((m) => m.code).join(", ")
      : stone.night.filter((m) => m.glow > 0).map((m) => m.code).join(", "));

  check("no monument was awarded without the score to earn it",
    monuments.unearned.length === 0 && monuments.offMap.length === 0,
    [...monuments.unearned, ...monuments.offMap].join(", "));

  /* No two HUD panels may occupy the same ground at rest.
   *
   * The trace panel and the journey panel were both pinned to the top right at
   * the same width, so on a fresh load one covered the other completely and
   * only dragging a header separated them. The phone pass has always checked
   * this; the desktop layout never did.
   */
  await page.fill("#askInput", "batteries");
  await page.click("#askGo");
  await page.waitForTimeout(2600);
  const collisions = await page.evaluate(() => {
    /* The panels themselves, identified by id. Descendants are excluded: a
     * panel always overlaps its own children, and an element with no id is
     * part of a panel rather than one.
     *
     * Visibility is read from the computed style and the measured box, NOT
     * from offsetParent: every panel here is position:fixed, for which
     * offsetParent is null, and filtering on it emptied the list and made
     * this check pass whatever the layout did.
     */
    const panels = [...document.querySelectorAll(".hud")]
      .filter((el) => {
        if (!el.id || el.hasAttribute("hidden")) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return parseFloat(style.opacity || "1") > 0.05;
      })
      .map((el) => ({ id: el.id, r: el.getBoundingClientRect() }))
      .filter((p) => p.r.width > 40 && p.r.height > 20);
    if (panels.length < 4) return [`only ${panels.length} panels measured, check is not looking at the layout`];
    const hits = [];
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i].r, b = panels[j].r;
        const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
                      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        // A few pixels of touching is not a collision; covering a third of the
        // smaller panel is.
        if (overlap > 0.33 * Math.min(a.width * a.height, b.width * b.height)) {
          hits.push(`${panels[i].id} over ${panels[j].id}`);
        }
      }
    }
    return hits;
  });
  check("no two panels cover each other on a desktop viewport",
    collisions.length === 0, collisions.join("; "));

  /* The arc reading has to follow the marker that moved.
   *
   * Selecting a lot moved the second marker and left the text underneath
   * reporting the organisation figure, so the rail and the sentence disagreed.
   */
  const arcFollows = await page.evaluate(() => {
    window.NWCity.focus("A251");
    const score = document.getElementById("arcScore").textContent;
    const base = document.getElementById("arcBase");
    return { score, base: base.textContent, baseShown: !base.hidden };
  });
  check("the arc reading names the selected category",
    /A251/.test(arcFollows.score) && arcFollows.baseShown
      && /Networks/.test(arcFollows.base),
    `${arcFollows.score} | ${arcFollows.base}`);

  const arcClears = await page.evaluate(() => {
    window.NWCity.reset();
    return { score: document.getElementById("arcScore").textContent,
             baseShown: !document.getElementById("arcBase").hidden };
  });
  check("clearing the selection returns the reading to the organisation",
    /Networks/.test(arcClears.score) && !arcClears.baseShown, arcClears.score);

  /* Every category over the spend threshold shows its property.
   *
   * The property encodes spend, which does not depend on blueprint state, but
   * it was drawn at 7% opacity on any lot without a live blueprint. Two of the
   * six categories carrying hotel-scale spend were therefore invisible.
   */
  const property = await page.evaluate(() => {
    const bands = window.NW_CONFIG.metrics.spend_eur.tiers;
    const top = bands[bands.length - 1];
    const floor = bands[bands.length - 2].max;
    const owed = window.NW_CITY.categories.filter((c) => c.metrics.spend_eur > floor);
    return {
      floor,
      label: top.label,
      owed: owed.map((c) => c.code).sort(),
      withoutABlueprint: owed.filter((c) => c.blueprint_state !== "active")
        .map((c) => c.code).sort(),
    };
  });
  check(`every category over €${Math.round(property.floor / 1e6)}m is owed a ${property.label}`,
    property.owed.length === 6 && property.withoutABlueprint.length === 2,
    `${property.owed.join(", ")} (${property.withoutABlueprint.join(", ")} have no live blueprint)`);

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
