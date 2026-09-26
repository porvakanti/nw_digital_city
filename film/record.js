/* Record one video per shot.
 *
 * Driven by film/out/shots.json, which film/make.py writes from film.yaml:
 * node has no YAML parser in this checkout and adding one to carry nine
 * entries across a process boundary is not worth a dependency.
 *
 * Every recording starts on the welcome dialog and is trimmed afterwards by
 * looking at the frames. Nothing here reports where the usable footage
 * begins, because nothing here can: the recording clock and the wall clock do
 * not agree when the frames come from a software renderer.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/* Which Chromium to drive.
 *
 * Playwright's own path is used when the browser is actually there. On a host
 * where the browsers were installed out of band, the bundled path points at a
 * download that never happened, and the error names a command that would put
 * a second copy on disk. The same lookup is in tests/smoke.js; it is twelve
 * lines of probing the environment rather than logic, and keeping film/ able
 * to run without tests/ is worth the repetition.
 */
function findChromium(configured) {
  if (configured) return configured;
  const bundled = (() => {
    try { return chromium.executablePath(); } catch { return null; }
  })();
  if (bundled && fs.existsSync(bundled)) return undefined;  // playwright chooses
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  for (const dir of fs.readdirSync(root).filter((d) => d.startsWith('chromium-'))) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome',
                       'chrome-mac/Chromium.app']) {
      const candidate = path.join(root, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

async function perform(page, step) {
  if (step.focus !== undefined)
    return page.evaluate((code) => window.NWCity.focus(code), step.focus);
  if (step.focus_district !== undefined)
    return page.evaluate((name) => window.NWCity.focusDistrict(name), step.focus_district);
  if (step.reset !== undefined)
    return page.evaluate(() => window.NWCity.reset());
  if (step.key !== undefined)
    return page.keyboard.press(step.key);
  if (step.wait_ms !== undefined)
    return page.waitForTimeout(step.wait_ms);
  if (step.ask !== undefined) {
    await page.click('#askInput');
    await page.type('#askInput', step.ask, { delay: 55 });
    return page.click('#askGo');
  }
  throw new Error(`film.yaml asks for ${JSON.stringify(step)}, which is not a step`);
}

(async () => {
  for (const shot of plan.shots) {
    const dir = path.join(plan.dir, shot.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader',
                            '--enable-unsafe-swiftshader'] };
    const executable = findChromium(plan.chromium);
    if (executable) launch.executablePath = executable;
    const browser = await chromium.launch(launch);
    const ctx = await browser.newContext({
      viewport: { width: plan.width, height: plan.height },
      recordVideo: { dir, size: { width: plan.width, height: plan.height } },
    });
    const page = await ctx.newPage();

    await page.goto(plan.url);
    await page.waitForSelector('body[data-ready="1"]', { timeout: plan.ready_timeout_ms });
    await page.waitForTimeout(plan.settle_ms);
    await page.click('#welcomeSkip');

    if (!shot.panels) {
      await page.evaluate(() =>
        document.querySelectorAll('.hud').forEach((e) => { e.style.display = 'none'; }));
    } else {
      await page.evaluate(({ ids, keep }) => {
        for (const id of ids) {
          if (keep.includes(id)) continue;
          const el = document.getElementById(id);
          if (el) el.style.display = 'none';
        }
      }, { ids: plan.hide_ids, keep: shot.keep || [] });
    }
    if (plan.hide_model_badge) {
      // The deed re-renders on every selection, so this runs on an interval
      // rather than once.
      await page.evaluate(() => {
        const strip = () => {
          const badge = document.getElementById('modelBadge');
          if (badge) badge.style.display = 'none';
        };
        strip();
        setInterval(strip, 120);
      });
    }

    await page.waitForTimeout(plan.after_dismiss_ms);
    for (const step of shot.do) await perform(page, step);
    await page.waitForTimeout(shot.hold_ms);

    await ctx.close();
    await browser.close();
    console.log(`  recorded ${shot.id}`);
  }
})().catch((error) => { console.error(error); process.exit(1); });
