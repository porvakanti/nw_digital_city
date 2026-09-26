/* Render the reel, or part of it, a frame at a time.
 *
 *   node film/reel/capture.js --from 0 --to 120 --out film/out/reel/picture.mp4
 *   node film/reel/capture.js --stills 5,17.5,48 --dir film/out/reel/stills
 *
 * The page runs on the virtual clock in clock.js, so each frame is exactly
 * 1/fps after the last however long the software renderer takes to draw it.
 * A part that starts later than 0 fast-forwards to its first frame without
 * drawing anything, which is why parts are cut at chapter changes: the traffic
 * is in a slightly different place after a fast-forward, and a cut hides it.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const cues = JSON.parse(fs.readFileSync(path.join(__dirname, 'cues.json'), 'utf8'));
const FPS = cues.fps;
const FRAME = 1000 / FPS;

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

function findChromium() {
  const bundled = (() => { try { return chromium.executablePath(); } catch { return null; } })();
  if (bundled && fs.existsSync(bundled)) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(root)) return undefined;
  for (const dir of fs.readdirSync(root).filter((d) => d.startsWith('chromium-'))) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
      const candidate = path.join(root, dir, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function ffmpegPath() {
  return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
}

const b64 = (file) => fs.readFileSync(path.join(__dirname, file)).toString('base64');

(async () => {
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                          '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
  const exe = findChromium();
  if (exe) launch.executablePath = exe;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript({ path: path.join(__dirname, 'clock.js') });
  await page.addInitScript({ path: path.join(__dirname, 'director.js') });
  // The build speed slowed so the city takes its time to rise on camera.
  await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html') + '?speed=0.6');

  const advance = (ms) => page.evaluate((m) => window.__reel.advance(m), ms);
  for (let i = 0; i < 600; i++) {
    await advance(FRAME);
    if (await page.evaluate(() => document.body.dataset.ready === '1')) break;
  }
  // Let the city finish the rise it does on load and the traffic spread out.
  await page.evaluate(() => { window.__reel.skip = true; });
  for (let i = 0; i < 120; i++) await advance(100);
  await page.evaluate(() => { window.__reel.skip = false; });

  const mark = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'renderer', 'vest-mark.png')).toString('base64');
  await page.evaluate(async (cfg) => { await window.__reel.director.setup(cfg); }, {
    marks: cues.marks,
    fps: FPS,
    mark,
    fonts: [
      { family: 'Inter Tight', data: b64('fonts/inter-tight-latin-wght-normal.woff2'), descriptors: { weight: '100 900' } },
      { family: 'JetBrains Mono', data: b64('fonts/jetbrains-mono-latin-500-normal.woff2'), descriptors: { weight: '500' } },
    ],
  });
  await page.evaluate((f) => window.__reel.director.start(f), FRAME);

  // Frame n is shown at t = n / FPS.
  let frame = 0;
  const step = () => advance(FRAME).then(() => { frame++; });
  async function seek(n, quiet) {
    await page.evaluate((q) => { window.__reel.director.ff = q; }, !!quiet);
    while (frame < n) {
      if (quiet && n - frame >= 3) {
        await advance(FRAME * 3);
        frame += 3;
      } else {
        await step();
      }
      if (process.env.REEL_DEBUG && frame % 15 === 0) console.log(`  at ${(frame / FPS).toFixed(2)}s`);
    }
    await page.evaluate(() => { window.__reel.director.ff = false; });
  }
  // The first advance after start() lands on t = 0.
  const shoot = async () => page.screenshot({ type: 'jpeg', quality: 94 });

  if (args.stills) {
    const dir = path.resolve(args.dir || path.join(ROOT, 'film', 'out', 'reel', 'stills'));
    fs.mkdirSync(dir, { recursive: true });
    const times = String(args.stills).split(',').map(Number).sort((a, b) => a - b);
    for (const t of times) {
      const n = Math.round(t * FPS);
      // Fast-forward to a second before the still, then play into it, so
      // anything animated has its real history.
      await seek(Math.max(0, n - FPS), true);
      await seek(n, false);
      await step();
      fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await shoot());
      console.log(`still ${t}`);
    }
    await browser.close();
    return;
  }

  const from = Math.round(Number(args.from || 0) * FPS);
  const to = Math.round(Number(args.to || cues.length) * FPS);
  const out = path.resolve(args.out || path.join(ROOT, 'film', 'out', 'reel', 'picture.mp4'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await seek(from, true);
  const enc = spawn(ffmpegPath(), ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS),
    '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let n = from; n < to; n++) {
    await step();
    const jpg = await shoot();
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r));
    if ((n - from) % 60 === 0) {
      const done = n - from + 1;
      const rate = (Date.now() - started) / done;
      console.log(`frame ${n} (${(n / FPS).toFixed(1)}s) · ${(rate / 1000).toFixed(2)}s/frame · ~${Math.round((to - n) * rate / 60000)} min left`);
    }
  }
  enc.stdin.end();
  await new Promise((r) => enc.on('close', r));
  await browser.close();
  console.log(`wrote ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
