/* Rehearsal smoke test: drives the real page in a real browser.
 *
 * Checks the things that would ruin a live demo — the city loading, the
 * resolver finding what people will actually type, and the agent driving the
 * city rather than just talking about it.
 *
 *   npm i playwright   (browsers are already present in CI images)
 *   node tests/smoke.js
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

// ?clean skips the first-run welcome card, which would otherwise sit over the
// city for every check in here.
const PAGE = "file://" + path.join(__dirname, "..", "renderer", "index.html") + "?clean";

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

  check("no page errors", errors.length === 0, errors[0] || "");
  await browser.close();
  console.log(failures ? `\n${failures} failed` : "\nall passed");
  process.exit(failures ? 1 : 0);
})();
