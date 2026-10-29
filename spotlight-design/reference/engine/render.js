/* Render a demo film, or stills from it.
 *
 *   node film/demos/render.js askava --frames <dir> --out film.mp4
 *   node film/demos/render.js askava --frames <dir> --stills 3,12.5 --dir stills
 *
 * --frames is the team's recording as numbered JPEGs (00001.jpg, ...), kept
 * outside the repository. Captions are read from film/out/demos/<film>/.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const film = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

function findChromium() {
  const bundled = (() => { try { return chromium.executablePath(); } catch { return null; } })();
  if (bundled && fs.existsSync(bundled)) return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const name of ['chromium', ...fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()]) {
    for (const exe of [path.join(root, name), path.join(root, name, 'chrome-linux', 'chrome')]) {
      if (fs.existsSync(exe) && fs.statSync(exe).isFile()) return exe;
    }
  }
  return undefined;
}

(async () => {
  const launch = { args: ['--allow-file-access-from-files', '--disable-web-security'] };
  const exe = findChromium();
  if (exe) launch.executablePath = exe;
  const browser = await chromium.launch(launch);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
  const frames = path.resolve(args.frames);
  await page.goto('file://' + path.join(__dirname, 'stage.html') + '?frames=' + encodeURIComponent(frames));
  const capsFile = path.join(ROOT, 'film', 'out', 'demos', film, 'captions.json');
  const caps = fs.existsSync(capsFile) ? JSON.parse(fs.readFileSync(capsFile, 'utf8')) : [];
  const { length, fps } = await page.evaluate(([f, c]) => window.setup(f, c), [film, caps]);
  const shoot = () => page.screenshot({ type: 'jpeg', quality: 94 });

  if (args.stills) {
    const dir = path.resolve(args.dir || '.');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of String(args.stills).split(',').map(Number)) {
      await page.evaluate((T) => window.frame(T), t);
      fs.writeFileSync(path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.jpg`), await shoot());
    }
    await browser.close();
    return;
  }

  const ff = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const enc = spawn(ff, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(fps), out],
  { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(length * fps);
  const started = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((T) => window.frame(T), i / fps);
    const jpg = await shoot();
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n} · ${((Date.now() - started) / (i + 1) / 1000).toFixed(2)}s/frame`);
  }
  enc.stdin.end();
  await new Promise((r) => enc.on('close', r));
  await browser.close();
  console.log(`wrote ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
