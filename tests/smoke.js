/* Rehearsal smoke test: drives the real page in a real browser.
 *
 * Checks the things that would ruin a live demo — the city loading, the
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

// What the room is likely to shout, and what it has to resolve to.
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

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? " — " + detail : ""}`);
};

/* The same page on a phone.
 *
 * Not the demo, and never will be: the demo is a laptop and a projector. It
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
 * The rule a phone breaks and a laptop does not. It caught a card centred
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
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  console.log("· and again on a phone");
  await page.goto(PAGE);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });

  check("phone: buttons replace the keyboard shortcuts",
    (await page.isVisible("#touchbar")) && !(await page.isVisible("#hint")));

  // The original failure, and the one most likely to come back: a panel
  // written for a laptop corner, laid over the city on a 390px screen.
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
    // build expects, so the check runs on a CI image and on a laptop alike.
    executablePath: findChromium(),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  console.log(SERVED ? `· driving the served page at ${SERVED}`
    : `· driving ${TARGET ? "the packaged file" : "the page from a file"}`);
  await page.goto(PAGE);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });

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
      `${health.provider}${health.ready ? "" : " — " + health.detail}`);

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

  check("no page errors", errors.length === 0, errors[0] || "");

  await onAPhone(browser);
  await browser.close();
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
