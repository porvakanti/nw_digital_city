/* Back to the Value: a 60-second trailer for the leadership summit breakout.
 *
 * Cut like a trailer, to a score written to its hits (bttv_score.py): four
 * slams in the dark, a flux capacitor that dives into its own core, a VCR
 * montage (rewind the past, pause the present, fast-forward the future), a
 * game's "choose your force" for the breakout's three forces, the Value
 * Manifesto typing itself, a run to 88, half a second of silence, and the
 * poster, pulled back to in full. The poster's art is passed in with the
 * frames; every other shape is drawn here.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const RED = '#e60000', FIRE = '#ff5a1f', AMBER = '#ffb02e', ORANGE = '#ff7a00', CYAN = '#29d3f5';
  const img = {};
  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  let loaded = null;
  function load(dir) {
    if (loaded) return loaded;
    loaded = Promise.all(['poster', 't1', 't2', 't3', 't4', 't5', 't6'].map((n) => new Promise((res) => {
      const i = new Image();
      i.onload = res; i.onerror = res;
      i.src = `file://${dir}/${n}.jpg`;
      img[n] = i;
    })));
    return loaded;
  }

  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const F = (T) => Math.floor(T * 30);

  // The poster seen through a 16:9 camera [x, y, w] in its own pixels.
  function shot(ctx, cam, filter) {
    const im = img.poster;
    if (!im || !im.width) return;
    const [x, y, w] = cam;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.drawImage(im, x, y, w, w * 9 / 16, 0, 0, W, H);
    ctx.restore();
  }

  function black(ctx, a = 1) { ctx.fillStyle = `rgba(3,3,6,${a})`; ctx.fillRect(0, 0, W, H); }
  function whiteout(ctx, a) { if (a > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(a)})`; ctx.fillRect(0, 0, W, H); } }
  function shake(ctx, T, amt) { ctx.translate((rnd(F(T)) - 0.5) * amt, (rnd(F(T) + 7) - 0.5) * amt); }

  // Light trails streaking out of a vanishing point.
  function trails(ctx, T, vx, vy, n, speed, a, col = '255,40,30') {
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ang = (rnd(i) * 1.4 + 0.15) * (i % 2 ? 1 : -1) + (i % 2 ? 0 : Math.PI);
      const ph = (T * speed + rnd(i + 50)) % 1;
      const r0 = lerp(40, 1400, ph * ph), r1 = r0 + lerp(60, 700, ph);
      const dx = Math.cos(ang), dy = Math.abs(Math.sin(ang)) * 0.55 + 0.05;
      ctx.strokeStyle = `rgba(${col},${a * (0.25 + 0.6 * ph)})`;
      ctx.lineWidth = lerp(1, 7, ph);
      ctx.beginPath(); ctx.moveTo(vx + dx * r0, vy + dy * r0); ctx.lineTo(vx + dx * r1, vy + dy * r1); ctx.stroke();
    }
    ctx.restore();
  }

  function bolt(ctx, x0, y0, x1, y1, seed, a, col = '190,220,255') {
    if (a <= 0) return;
    const pts = [[x0, y0]];
    for (let i = 1; i < 14; i++) {
      const u = i / 14;
      pts.push([lerp(x0, x1, u) + (rnd(seed + i) - 0.5) * 140, lerp(y0, y1, u) + (rnd(seed + i + 40) - 0.5) * 40]);
    }
    pts.push([x1, y1]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [lw, al] of [[18, 0.12], [8, 0.35], [3, 1]]) {
      ctx.strokeStyle = `rgba(${col},${a * al})`; ctx.lineWidth = lw; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const b = pts[6];
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (rnd(seed + 99) - 0.5) * 400, b[1] + 220); ctx.stroke();
    }
    ctx.restore();
  }

  // A synthwave floor: a red perspective grid running toward the horizon.
  function grid(ctx, T, a = 1, speed = 1) {
    if (a <= 0) return;
    const hz = 560;
    ctx.save();
    ctx.globalAlpha = a;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#030308'); sky.addColorStop(1, '#2a0408');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
    ctx.fillStyle = '#050207'; ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = 'rgba(230,0,0,0.55)'; ctx.lineWidth = 2;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, hz); ctx.lineTo(W / 2 + i * 260, H); ctx.stroke();
    }
    const off = (T * speed) % 1;
    for (let k = 0; k < 12; k++) {
      const z = (k + off) / 12;
      const y = hz + (H - hz) * z * z;
      ctx.globalAlpha = a * z;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = a;
    const glow = ctx.createLinearGradient(0, hz - 30, 0, hz + 30);
    glow.addColorStop(0, 'rgba(255,60,40,0)'); glow.addColorStop(0.5, 'rgba(255,60,40,0.7)'); glow.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, hz - 30, W, 60);
    ctx.restore();
  }

  /* --------------------------------------------------- the flux capacitor */

  // arms: the light in each arm, 0..1. Returns where the arm ends sit on screen.
  function flux(ctx, T, cx, cy, s, arms, opts = {}) {
    const { alpha = 1, core = 0 } = opts;
    const ends = [];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    const bw = 620;
    const mg = ctx.createLinearGradient(-bw / 2, -bw / 2, bw / 2, bw / 2);
    mg.addColorStop(0, '#3a3e45'); mg.addColorStop(0.5, '#1b1d22'); mg.addColorStop(1, '#2c2f35');
    ctx.fillStyle = mg; ctx.strokeStyle = '#5a5f68'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bw / 2, bw, bw, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#07080b';
    ctx.beginPath(); ctx.roundRect(-bw / 2 + 50, -bw / 2 + 50, bw - 100, bw - 100, 16); ctx.fill();
    [-150, -30, 90].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const ex = Math.cos(a) * 230, ey = Math.sin(a) * 230;
      ends.push([cx + ex * s, cy + ey * s]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(180,190,205,0.35)'; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#0d0f13'; ctx.lineWidth = 36;
      ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
      const on = arms[i];
      if (on > 0) {
        const fl = 0.7 + 0.3 * rnd(F(T) + i * 5);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,${130 + 90 * fl},70,${on * fl})`;
        ctx.shadowColor = FIRE; ctx.shadowBlur = 40; ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const p = 1 - ((T * 2.4 + k / 4) % 1);
          ctx.fillStyle = `rgba(255,240,200,${on * 0.9})`;
          ctx.beginPath(); ctx.arc(ex * lerp(0.15, 1, p), ey * lerp(0.15, 1, p), 7, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
      ctx.fillStyle = '#8a8f99';
      ctx.beginPath(); ctx.arc(ex, ey, 30, 0, 7); ctx.fill();
    });
    const lit = arms.reduce((a, b) => a + b, 0);
    ctx.globalCompositeOperation = 'lighter';
    const cr = 40 + lit * 14 + core * 120;
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 2.2);
    cg.addColorStop(0, `rgba(255,255,240,${clamp(0.25 + lit * 0.2 + core)})`);
    cg.addColorStop(0.4, `rgba(255,120,40,${clamp(0.15 + lit * 0.15 + core * 0.5)})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, cr * 2.2, 0, 7); ctx.fill();
    ctx.restore();
    return ends;
  }

  // A row of the time circuits, sized by width.
  function circuit(ctx, x, y, w, l, v, col, a) {
    if (a <= 0) return;
    const s = w / 900;
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#121418'; ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(0, 0, 900, 120, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.roundRect(18, 18, 864, 70, 6); ctx.fill();
    font(ctx, 54, 500, MONO, 10);
    ctx.fillStyle = col; ctx.globalAlpha = a * 0.13; ctx.fillText(v.replace(/[^\s]/g, '8'), 40, 74);
    ctx.globalAlpha = a; ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.fillText(v, 40, 74);
    ctx.shadowBlur = 0;
    font(ctx, 18, 700, SANS, 5);
    const lw = ctx.measureText(l).width + 30;
    ctx.fillStyle = RED; ctx.beginPath(); ctx.roundRect(450 - lw / 2, 96, lw, 28, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(l, 450, 116);
    ctx.restore();
  }

  /* ------------------------------------------------------------ the VCR */

  // Tape: scanlines, a rolling tracking band and dropouts.
  function vhs(ctx, T, a = 1) {
    ctx.save();
    ctx.globalAlpha = 0.14 * a;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
    ctx.globalAlpha = a;
    const by = ((T * 260) % (H + 200)) - 100;
    const band = ctx.createLinearGradient(0, by - 40, 0, by + 40);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.10)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(0, by - 40, W, 80);
    for (let i = 0; i < 5; i++) {
      if (rnd(F(T) * 3 + i) > 0.35) continue;
      ctx.fillStyle = `rgba(255,255,255,${0.15 * rnd(i + F(T))})`;
      ctx.fillRect(0, rnd(F(T) + i * 13) * H, W, 2 + rnd(i) * 3);
    }
    ctx.restore();
  }

  // The on-screen display, in the VCR's own type: an icon, a word, a counter.
  function osd(ctx, T, icon, text, at) {
    const a = ramp(T, at, at + 0.1);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    const x = 90, y = 110;
    if (icon === 'rew' || icon === 'ff') {
      const d = icon === 'ff' ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const ox = x + k * 34 + (d < 0 ? 34 : 0);
        ctx.beginPath(); ctx.moveTo(ox, y - 22); ctx.lineTo(ox + 34 * d, y); ctx.lineTo(ox, y + 22); ctx.fill();
      }
    } else {
      ctx.fillRect(x + 4, y - 22, 16, 44); ctx.fillRect(x + 32, y - 22, 16, 44);
    }
    font(ctx, 56, 500, MONO, 4);
    ctx.fillText(text, x + 100, y + 20);
    const sec = Math.floor(icon === 'rew' ? 3600 - (T - at) * 900 : icon === 'ff' ? 3600 + (T - at) * 2200 : 3600);
    const ss = Math.abs(sec);
    font(ctx, 40, 500, MONO, 3);
    ctx.fillText(`${Math.floor(ss / 3600)}:${String(Math.floor(ss / 60) % 60).padStart(2, '0')}:${String(ss % 60).padStart(2, '0')}`, x, H - 90);
    ctx.restore();
  }

  // One VCR chapter: a big question, set low left.
  function chapter(ctx, T, at, kicker, lines, col) {
    const tg = ctx.createLinearGradient(0, H * 0.45, 0, H);
    tg.addColorStop(0, 'rgba(3,3,6,0)'); tg.addColorStop(1, 'rgba(3,3,6,0.85)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
    label(ctx, kicker, 96, 760, { size: 26, color: col, alpha: ramp(T, at + 0.2, at + 0.4), ls: 10, weight: 700 });
    lines.forEach((l, i) => rise(ctx, l, 92, 850 + i * 92, { t: T, tin: at + 0.35 + i * 0.25, tout: at + 3.75, size: 84, weight: 900, ls: -2, stagger: 0.015 }));
  }

  /* ------------------------------------------------------------- beats */

  function cold(ctx, T) {
    black(ctx);
    const words = [['ONE ROOM.', 0.5], ['NINE TEAMS.', 2.0], ['THREE FORCES.', 3.5], ['ONE MISSION.', 5.0]];
    words.forEach(([w, a], i) => {
      const b = words[i + 1] ? words[i + 1][1] - 0.12 : 5.92;
      if (T < a || T > b) return;
      // A red streak sweeps across under each word.
      const u = ramp(T, a, a + 0.5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createLinearGradient(0, 0, W, 0);
      sg.addColorStop(0, 'rgba(230,0,0,0)'); sg.addColorStop(clamp(u), 'rgba(255,40,20,0.9)'); sg.addColorStop(clamp(u + 0.02), 'rgba(230,0,0,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, H / 2 + 70, W, 6);
      ctx.restore();
      ctx.save();
      shake(ctx, T, 18 * (1 - ramp(T, a, a + 0.25)));
      slam(ctx, w, W / 2, H / 2 + 40, { t: T, tin: a, tout: b - 0.05, size: i === 3 ? 190 : 170, weight: 900, ls: -5 });
      ctx.restore();
      whiteout(ctx, 0.35 * (1 - ramp(T, a, a + 0.15)));
    });
    label(ctx, 'LEADERSHIP SUMMIT · PROCUREMENT', W / 2, H - 80, { size: 20, color: 'rgba(255,255,255,0.5)', align: 'center', alpha: ramp(T, 0.6, 1.0), ls: 10 });
  }

  function ignite(ctx, T, at) {
    const t = T - at;
    black(ctx);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 900);
    g.addColorStop(0, `rgba(230,0,0,${0.08 + t * 0.02})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // The fluxing quickens: each arm flickers, faster as the riser climbs.
    const rate = lerp(2, 22, ei(ramp(t, 0, 7.8)));
    const arms = [0, 1, 2].map((i) => (Math.sin(T * rate * Math.PI + i * 2.1) > 0.2 ? lerp(0.35, 1, ramp(t, 0, 6)) : 0.08));
    const dive = ei(ramp(t, 6.2, 8.0));
    const s = lerp(0.95, 1.02, t / 8) * lerp(1, 9, dive);
    ctx.save();
    shake(ctx, T, ramp(t, 4, 8) * 10);
    flux(ctx, T, W / 2, H / 2, s, arms, { core: dive });
    ctx.restore();
    // The destination, scrolling through the years, locks on today.
    const ca = ramp(t, 0.6, 0.9) * (1 - ramp(t, 5.8, 6.2));
    if (ca > 0) {
      const dest = t < 3.0 ? `${['OCT', 'NOV', 'SEP'][F(T) % 3]} ${String(1 + (F(T) * 7) % 30).padStart(2, '0')} ${2019 + F(T) % 8}` : 'OCT 07 2026';
      circuit(ctx, W / 2 - 300, 940, 600, 'DESTINATION TIME', dest, '#ff3b2f', ca);
    }
    rise(ctx, 'TODAY,', W / 2, 140, { t: T, tin: at + 0.4, tout: at + 3.7, size: 46, weight: 700, align: 'center', ls: 12, color: 'rgba(255,255,255,0.75)' });
    rise(ctx, 'NINE TEAMS TAKE ONE JOURNEY.', W / 2, 140, { t: T, tin: at + 3.8, tout: at + 6.0, size: 46, weight: 800, align: 'center', ls: 6 });
    whiteout(ctx, ramp(t, 7.4, 8.0));
  }

  function rew(ctx, T, at) {
    const t = T - at;
    // Running backwards across the old city, fast, then slowing.
    const u = eo5(ramp(t, 0, 3.6));
    const x = lerp(260, 0, u), y = lerp(330, 300, u);
    ctx.save();
    shot(ctx, [x + (rnd(F(T)) - 0.5) * 6, y, 420], 'grayscale(1) sepia(0.45) contrast(1.2) brightness(0.85)');
    ctx.globalAlpha = 0.25; ctx.globalCompositeOperation = 'lighter';
    shot(ctx, [x - 4, y, 420], 'grayscale(1) brightness(0.5) sepia(1) hue-rotate(-40deg) saturate(4)');
    ctx.restore();
    vhs(ctx, T, 1);
    osd(ctx, T, 'rew', 'REWIND · PAST', at);
    chapter(ctx, T, at, '01 · BACK TO THE PAST', ['WHAT SHOULD', 'NEVER BE LOST?'], '#d9d9d9');
    whiteout(ctx, 0.5 * (1 - ramp(t, 0, 0.25)));
  }

  function pause(ctx, T, at) {
    const t = T - at;
    const tools = ['AskAVA', 'Sourcing Negotiation', 'D2C Product reCosting', 'Obligation Management', 'Executive Supplier Intelligence', 'Conversational Analytics'];
    const j = rnd(F(T)) < 0.25 ? (rnd(F(T) + 3) - 0.5) * 10 : 0;
    if (t < 1.6) {
      // Frozen on the present: the TODAY sign and the road, jittering.
      shot(ctx, [380, 380 + j * 0.2, 340], 'saturate(1.2) contrast(1.05)');
    } else {
      // Frame advance: one of our tools per step, on the beat.
      const k = Math.min(5, Math.floor((t - 1.6) / 0.36));
      black(ctx);
      trails(ctx, T, W / 2, H / 2, 50, 1.4, 1);
      const im = img[`t${k + 1}`];
      const local = (t - 1.6 - k * 0.36) / 0.36;
      const s = lerp(1.08, 1.0, eo5(clamp(local * 2)));
      ctx.save();
      ctx.translate(W / 2, H / 2 - 20);
      ctx.scale(s, s);
      ctx.shadowColor = 'rgba(230,0,0,0.6)'; ctx.shadowBlur = 60;
      ctx.fillStyle = '#0b0c10'; ctx.fillRect(-700, -360, 1400, 760);
      ctx.shadowBlur = 0;
      if (im && im.width) ctx.drawImage(im, 0, 0, im.width, im.height * 0.86, -690, -350, 1380, 660);
      ctx.fillStyle = RED; ctx.fillRect(-700, 310, 1400, 90);
      font(ctx, 52, 900, SANS, -1); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(tools[k], 0, 372);
      ctx.restore();
    }
    vhs(ctx, T, 0.8);
    osd(ctx, T, 'pause', t < 1.6 ? 'PAUSE · PRESENT' : 'FRAME ADV · PRESENT', at);
    if (t < 1.6) chapter(ctx, T, at, '02 · IN THE PRESENT', ['WHAT IS ALREADY', 'CHANGING THE GAME?'], RED);
  }

  function ff(ctx, T, at) {
    const t = T - at;
    const u = ei(ramp(t, 0, 4));
    ctx.save();
    shake(ctx, T, 6);
    shot(ctx, [lerp(560, 690, u), lerp(190, 250, u), lerp(460, 260, u)], 'saturate(1.3) contrast(1.08)');
    ctx.restore();
    trails(ctx, T, W / 2, H * 0.45, 60, 2.5, 0.8, '120,220,255');
    vhs(ctx, T, 0.6);
    osd(ctx, T, 'ff', 'FF ×32 · FUTURE', at);
    chapter(ctx, T, at, '03 · INTO THE FUTURE', ['IF VALUE WAS OUR', 'ONLY KPI…'], CYAN);
  }

  /* The select screen: three forces, a cursor, then the machine. */
  const FORCES = [
    { n: '01', l1: 'EXECUTE', l2: 'RELENTLESSLY', teams: 'TEAMS 1 · 2 · 3', col: RED, x: 420, off: 1.0 },
    { n: '02', l1: 'SIMPLIFY', l2: 'AGGRESSIVELY', teams: 'TEAMS 4 · 5 · 6', col: ORANGE, x: 960, off: 2.5 },
    { n: '03', l1: 'RAISE THE', l2: 'TALENT BAR', teams: 'TEAMS 7 · 8 · 9', col: CYAN, x: 1500, off: 4.0 },
  ];

  function icon(ctx, k, col) {
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (k === 0) { // Execute: three chevrons, forward.
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-70 + i * 45, -40); ctx.lineTo(-30 + i * 45, 0); ctx.lineTo(-70 + i * 45, 40); ctx.stroke(); }
    } else if (k === 1) { // Simplify: many lines into one.
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-80, -45 + i * 30); ctx.quadraticCurveTo(-10, -45 + i * 30, 20, 0); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(80, 0); ctx.stroke();
    } else { // Talent: rising bars to a star.
      for (let i = 0; i < 3; i++) ctx.fillRect(-80 + i * 40, 40 - (i + 1) * 25, 26, (i + 1) * 25);
      ctx.beginPath();
      for (let p = 0; p < 10; p++) { const r = p % 2 ? 14 : 32, a = -Math.PI / 2 + p * Math.PI / 5; ctx.lineTo(60 + Math.cos(a) * r, -18 + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function card(ctx, T, at, f, k, x, y, s, sel, alpha = 1) {
    const p = back(ramp(T, at + f.off, at + f.off + 0.35));
    if (p <= 0 || alpha <= 0) return;
    const w = 470, h = 600;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * clamp(p), s * clamp(p));
    ctx.globalAlpha = alpha;
    if (sel > 0) { ctx.shadowColor = f.col; ctx.shadowBlur = 80 * sel; }
    ctx.fillStyle = 'rgba(10,10,16,0.96)';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 24); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4 + 6 * sel; ctx.strokeStyle = f.col; ctx.stroke();
    ctx.fillStyle = f.col; ctx.fillRect(-w / 2, -h / 2 + 24, w, 10);
    font(ctx, 130, 900, SANS, -4); ctx.textAlign = 'center';
    ctx.fillStyle = f.col;
    ctx.fillText(f.n, 0, -120);
    ctx.save(); ctx.translate(0, -10); icon(ctx, k, '#fff'); ctx.restore();
    font(ctx, 58, 900, SANS, -1.5); ctx.fillStyle = '#fff';
    ctx.fillText(f.l1, 0, 120); ctx.fillText(f.l2, 0, 182);
    font(ctx, 28, 700, MONO, 5); ctx.fillStyle = f.col;
    ctx.fillText(f.teams, 0, 252);
    ctx.restore();
  }

  function choose(ctx, T, at) {
    const t = T - at;
    grid(ctx, T, 1, 1.2);
    // The title, arcade style.
    const ta = ramp(t, 0.2, 0.4) * (1 - ramp(t, 7.6, 8.0));
    if (ta > 0) {
      ctx.save(); ctx.globalAlpha = ta;
      font(ctx, 30, 600, MONO, 12); ctx.fillStyle = AMBER; ctx.textAlign = 'center';
      if (Math.floor(T * 3) % 2 === 0 || t > 1.2) ctx.fillText('PLAYER SELECT', W / 2, 110);
      ctx.restore();
      slam(ctx, 'CHOOSE YOUR FORCE', W / 2, 200, { t: T, tin: at + 0.3, tout: at + 7.7, size: 96, weight: 900, ls: -2 });
    }
    // The cursor cycles, then all three are chosen and fly into the machine.
    const cyc = t >= 5.0 && t < 7.5 ? Math.floor((t - 5.0) / 0.5) % 3 : -1;
    const all = ramp(t, 7.5, 7.8);
    const fly = eio(ramp(t, 8.0, 8.7));
    const show = ramp(t, 7.9, 8.3);
    let ends = null;
    if (show > 0) {
      const lit = [0, 1, 2].map((i) => ramp(t, 8.55 + i * 0.12, 8.75 + i * 0.12));
      const pulse = t > 9.0 ? 0.75 + 0.25 * Math.abs(Math.sin(T * 14)) : 1;
      ends = flux(ctx, T, W / 2, 600, lerp(0.6, 0.85, eo5(show)), lit.map((v) => v * pulse), { alpha: show, core: ramp(t, 8.8, 9.2) * 0.3 * pulse });
    }
    FORCES.forEach((f, k) => {
      const sel = Math.max(cyc === k ? 1 : 0, all);
      const bob = cyc === k ? -14 : 0;
      let x = f.x, y = 610 + bob, s = 1, a = 1;
      if (fly > 0 && ends) { x = lerp(f.x, ends[k][0], fly); y = lerp(610, ends[k][1], fly); s = lerp(1, 0.12, fly); a = 1 - ramp(fly, 0.8, 1); }
      card(ctx, T, at, f, k, x, y, s, sel, a);
    });
    if (t > 8.8 && ends) {
      label(ctx, 'ALL THREE. ONE MACHINE.', W / 2, 160, { size: 40, color: '#fff', align: 'center', alpha: ramp(t, 9.0, 9.3), ls: 8, weight: 700 });
      FORCES.forEach((f, k) => {
        const [ex, ey] = ends[k];
        const lx = k === 2 ? ex : ex + (k === 0 ? -260 : 260), ly = k === 2 ? ey + 120 : ey - 40;
        label(ctx, `${f.l1} ${f.l2}`, lx, ly, { size: 22, color: f.col, align: 'center', alpha: ramp(t, 9.1 + k * 0.15, 9.4 + k * 0.15), ls: 3, weight: 700 });
      });
      if (Math.floor(T * 12) % 3 === 0) { ctx.fillStyle = 'rgba(255,170,90,0.05)'; ctx.fillRect(0, 0, W, H); }
    }
    whiteout(ctx, 0.6 * (1 - ramp(t, 8.0, 8.35)) * ramp(t, 7.95, 8.0));
  }

  function mission(ctx, T, at) {
    const t = T - at;
    grid(ctx, T, 1, 0.8);
    ctx.fillStyle = 'rgba(3,3,6,0.55)'; ctx.fillRect(0, 0, W, H);
    const out = ramp(t, 6.4, 6.7);
    label(ctx, 'YOUR MISSION', W / 2, 160, { size: 30, color: AMBER, align: 'center', alpha: ramp(t, 0.2, 0.4) * (1 - out), ls: 14, weight: 700 });
    const rows = [['WE WILL PRESERVE', '#fff', 1.0], ['ACCELERATE', RED, 2.4], ['AND COMMIT TO CREATE', CYAN, 3.8]];
    rows.forEach(([txt, col, a], i) => {
      const n = Math.min(txt.length, Math.max(0, Math.floor((t - a) / 0.03)));
      if (n <= 0) return;
      const y = 340 + i * 150;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      font(ctx, 82, 900, SANS, -2);
      const full = ctx.measureText(txt + '  ').width;
      const lineW = 520;
      const x0 = W / 2 - (ctx.measureText('AND COMMIT TO CREATE  ').width + lineW) / 2;
      ctx.fillStyle = col; ctx.fillText(txt.slice(0, n), x0, y);
      if (n === txt.length) {
        const lu = eo5(ramp(t, a + txt.length * 0.03, a + txt.length * 0.03 + 0.4));
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x0 + full, y + 8, lineW * lu, 6);
        if (Math.floor(T * 3) % 2 === 0) { ctx.fillStyle = col; ctx.fillRect(x0 + full + 10, y - 62, 6, 70); }
      }
      ctx.restore();
    });
    [['SUCCESS MEASURE', 5.2], ['OWNER', 5.45], ['FIRST MILESTONE', 5.7]].forEach(([c, a], i) => {
      const p = back(ramp(t, a, a + 0.3)) * (1 - out);
      if (p <= 0) return;
      font(ctx, 26, 600, MONO, 5);
      const w = ctx.measureText(c).width + 60;
      const x = W / 2 + (i - 1) * 440;
      ctx.save(); ctx.translate(x, 840); ctx.scale(clamp(p), clamp(p));
      ctx.fillStyle = 'rgba(12,12,18,0.95)'; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-w / 2, -32, w, 64, 32); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(c, 0, 9);
      ctx.restore();
    });
    // The payoff: the manifesto's name, slammed.
    const s = at + 6.6;
    if (T >= s) {
      ctx.save(); shake(ctx, T, 14 * (1 - ramp(T, s, s + 0.3)));
      label(ctx, 'THE FINAL DESTINATION', W / 2, 400, { size: 30, color: '#fff', align: 'center', alpha: ramp(T, s, s + 0.2), ls: 12, weight: 700 });
      const k = eo5(ramp(T, s, s + 0.28));
      ctx.globalAlpha = k;
      ctx.translate(W / 2, 560); ctx.scale(lerp(1.4, 1, k), lerp(1.4, 1, k));
      font(ctx, 150, 900, SANS, -5);
      const w1 = ctx.measureText('THE ').width, w2 = ctx.measureText('VALUE ').width, w3 = ctx.measureText('MANIFESTO').width;
      const x0 = -(w1 + w2 + w3) / 2;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff'; ctx.fillText('THE ', x0, 0);
      ctx.fillStyle = RED; ctx.shadowColor = RED; ctx.shadowBlur = 40; ctx.fillText('VALUE ', x0 + w1, 0);
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.fillText('MANIFESTO', x0 + w1 + w2, 0);
      ctx.restore();
      label(ctx, '9 TEAMS · 9 MANIFESTOS · ONE DIRECTION', W / 2, 680, { size: 26, color: AMBER, align: 'center', alpha: ramp(T, s + 0.4, s + 0.7), ls: 8 });
      whiteout(ctx, 0.4 * (1 - ramp(T, s, s + 0.2)));
    }
  }

  function run(ctx, T, at) {
    const t = T - at;
    if (t >= 6.6) { black(ctx); return; } // the half-second of silence
    const sp = ei(ramp(t, 0.2, 6.4));
    ctx.save();
    shake(ctx, T, 6 + sp * 34);
    shot(ctx, [lerp(250, 300, sp), lerp(450, 510, sp), lerp(540, 400, sp)], `saturate(1.3) contrast(1.1) brightness(${1 + sp * 0.2})`);
    trails(ctx, T, W / 2, H * 0.5, 80, 0.8 + sp * 3, 0.5 + sp * 0.5);
    ctx.restore();
    black(ctx, 0.35);
    const tg = ctx.createLinearGradient(0, 0, 0, 330);
    tg.addColorStop(0, 'rgba(3,3,6,0.95)'); tg.addColorStop(1, 'rgba(3,3,6,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 330);
    // The readout, huge, climbing to 88.
    const v = Math.min(88, Math.floor(lerp(12, 89, sp)));
    const hot = v >= 88;
    ctx.save();
    const s = hot ? 1 + 0.04 * Math.sin(T * 40) : 1;
    ctx.translate(W / 2, 600); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(5,6,10,0.88)'; ctx.strokeStyle = hot ? FIRE : '#3a3f48'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(-430, -230, 860, 360, 24); ctx.fill(); ctx.stroke();
    font(ctx, 300, 500, MONO, 10); ctx.textAlign = 'right';
    ctx.fillStyle = '#ff3b2f'; ctx.globalAlpha = 0.12; ctx.fillText('88', 160, 70);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hot ? '#ffd27a' : '#ff3b2f'; ctx.shadowColor = hot ? FIRE : '#ff3b2f'; ctx.shadowBlur = hot ? 60 : 30;
    ctx.fillText(String(v).padStart(2, '0'), 160, 70);
    ctx.shadowBlur = 0;
    font(ctx, 64, 800, MONO, 4); ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText('MPH', 200, 40);
    ctx.restore();
    label(ctx, 'ADOPTION', W / 2, 790, { size: 30, color: AMBER, align: 'center', ls: 16, weight: 700 });
    label(ctx, 'GET READY', W / 2, 200, { size: 44, color: '#fff', align: 'center', alpha: ramp(t, 0.3, 0.5) * (Math.floor(T * 4) % 2 ? 1 : 0.4), ls: 18, weight: 700 });
    // Lightning gathers on the run.
    const storm = ramp(t, 3.2, 6.4);
    if (storm > 0 && rnd(F(T) >> 1) < 0.3 + storm * 0.6) {
      const k = F(T) >> 1;
      bolt(ctx, W * (0.15 + rnd(k) * 0.7), -20, W / 2 + (rnd(k + 3) - 0.5) * 500, H * 0.6, k, storm);
    }
    whiteout(ctx, hot ? 0.12 * rnd(F(T)) : 0);
  }

  /* Arrival: the title, close, then the whole poster. */
  function arrive(ctx, T, at) {
    const t = T - at;
    const im = img.poster;
    if (!im || !im.width) return;
    black(ctx);
    const z = eio(ramp(t, 1.0, 4.3));
    // The backdrop: the poster again, blurred and dark, filling the frame.
    ctx.save();
    ctx.globalAlpha = ramp(t, 1.0, 3.0);
    ctx.filter = 'blur(40px) brightness(0.35) saturate(1.3)';
    ctx.drawImage(im, 0, 300, 1024, 576, -100, -60, W + 200, H + 120);
    ctx.restore();
    const sEnd = (H / im.height) * 0.96, sStart = W / 620;
    const s = Math.exp(lerp(Math.log(sStart), Math.log(sEnd), z)) * (1 + 0.02 * ramp(t, 4.3, 7));
    const cx = lerp(345, 512, z), cy = lerp(205, 768, z);
    ctx.save();
    shake(ctx, T, 26 * (1 - ramp(t, 0, 0.6)));
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = 'rgba(230,0,0,0.5)'; ctx.shadowBlur = 60 * z;
    ctx.drawImage(im, 0, 0);
    ctx.restore();
    // Fire tracks burn across the frame at the moment of arrival.
    const fire = 1 - ramp(t, 0.1, 1.6);
    if (fire > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const yy of [H * 0.78, H * 0.9]) for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(255,${110 + i * 50},30,${fire * (0.6 - i * 0.15)})`; ctx.lineWidth = 16 - i * 5;
        ctx.beginPath();
        for (let x = -20; x < W * lerp(0.2, 1.1, ramp(t, 0, 0.4)); x += 14) ctx.lineTo(x, yy + Math.sin(x * 0.05 + T * 30 + i) * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
    whiteout(ctx, 1 - ramp(t, 0, 0.5));
    // Either side of the poster, the call.
    if (t > 4.0) {
      const lx = (W - im.width * sEnd) / 4;
      rise(ctx, 'THE BREAKOUT', lx, 470, { t: T, tin: at + 4.0, size: 44, weight: 800, align: 'center', ls: 4, color: 'rgba(255,255,255,0.85)' });
      rise(ctx, 'STARTS', lx, 580, { t: T, tin: at + 4.2, size: 104, weight: 900, align: 'center', ls: -3 });
      rise(ctx, 'NOW.', lx, 690, { t: T, tin: at + 4.4, size: 104, weight: 900, align: 'center', ls: -3, color: RED });
      const rx = W - lx;
      const ms = back(ramp(t, 4.4, 4.9));
      if (ms > 0 && mark.complete) ctx.drawImage(mark, rx - 50 * ms, 430 - 50 * ms, 100 * ms, 100 * ms);
      label(ctx, 'LEADERSHIP SUMMIT', rx, 570, { size: 30, color: '#fff', align: 'center', alpha: ramp(t, 4.6, 4.9), ls: 6, weight: 700 });
      label(ctx, 'PROCUREMENT', rx, 620, { size: 30, color: '#fff', align: 'center', alpha: ramp(t, 4.7, 5.0), ls: 6, weight: 700 });
      label(ctx, 'TOGETHER WE CAN', rx, 700, { size: 26, color: RED, align: 'center', alpha: ramp(t, 4.9, 5.2), ls: 8, weight: 700 });
    }
  }


  /* The kick: straight in at speed. 88, the jump, and the title on a hit. */
  function kick(ctx, T, at) {
    const t = T - at;
    if (t < 1.85) {
      const sp = eio(ramp(t, 0, 1.6));
      ctx.save();
      shake(ctx, T, 14 + sp * 30);
      shot(ctx, [lerp(250, 300, sp), lerp(450, 510, sp), lerp(520, 400, sp)], `saturate(1.35) contrast(1.12) brightness(${1 + sp * 0.25})`);
      trails(ctx, T, W / 2, H * 0.5, 90, 2.5 + sp * 2, 1);
      ctx.restore();
      if (rnd(F(T) >> 1) < 0.55) { const k = F(T) >> 1; bolt(ctx, W * (0.1 + rnd(k) * 0.8), -20, W / 2 + (rnd(k + 3) - 0.5) * 500, H * 0.6, k, 1); }
      const v = Math.min(88, Math.floor(lerp(81, 89, sp)));
      const hot = v >= 88;
      ctx.save();
      ctx.translate(W - 330, H - 190);
      ctx.fillStyle = 'rgba(5,6,10,0.9)'; ctx.strokeStyle = hot ? FIRE : '#3a3f48'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-230, -110, 460, 200, 18); ctx.fill(); ctx.stroke();
      font(ctx, 150, 500, MONO, 6); ctx.textAlign = 'right';
      ctx.fillStyle = hot ? '#ffd27a' : '#ff3b2f'; ctx.shadowColor = hot ? FIRE : '#ff3b2f'; ctx.shadowBlur = hot ? 50 : 24;
      ctx.fillText(String(v), 90, 45);
      ctx.shadowBlur = 0; font(ctx, 40, 800, MONO, 3); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText('MPH', 110, 30);
      ctx.restore();
      label(ctx, 'ADOPTION', W - 330, H - 60, { size: 20, color: AMBER, align: 'center', ls: 10, weight: 700 });
      whiteout(ctx, ramp(t, 1.55, 1.85));
      return;
    }
    if (t < 5.3) {
      // The title, close, on fire, with the storm still going.
      const u = (t - 1.85) / 3.45;
      ctx.save();
      shake(ctx, T, 30 * (1 - ramp(t, 1.85, 2.6)));
      shot(ctx, [lerp(30, 70, u), lerp(70, 95, u), lerp(640, 560, u)], 'saturate(1.2) contrast(1.05)');
      ctx.restore();
      const fire = 1 - ramp(t, 2.4, 4.6);
      if (fire > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const yy of [H * 0.82, H * 0.93]) for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(255,${110 + i * 50},30,${fire * (0.6 - i * 0.15)})`; ctx.lineWidth = 16 - i * 5;
          ctx.beginPath();
          for (let x = -20; x < W * lerp(0.1, 1.1, ramp(t, 1.85, 2.3)); x += 14) ctx.lineTo(x, yy + Math.sin(x * 0.05 + T * 30 + i) * 6);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (rnd(F(T) >> 2) < 0.18) { const k = F(T) >> 2; bolt(ctx, W * (0.55 + rnd(k) * 0.4), -20, W * (0.6 + rnd(k + 1) * 0.3), H * 0.75, k, 0.9); }
      label(ctx, 'LEADERSHIP SUMMIT · PROCUREMENT · THE BREAKOUT', W / 2, H - 60, { size: 24, color: '#fff', align: 'center', alpha: ramp(t, 2.6, 3.0) * (1 - ramp(t, 5.0, 5.3)), ls: 8, weight: 700 });
      whiteout(ctx, 1 - ramp(t, 1.85, 2.3));
      return;
    }
    // Three slams on the brass.
    black(ctx);
    const words = [['NINE TEAMS.', 5.35, '#fff'], ['THREE FORCES.', 6.05, '#fff'], ['ONE MISSION.', 6.75, RED]];
    words.forEach(([w, a, col], i) => {
      const b = words[i + 1] ? words[i + 1][1] - 0.04 : 7.6;
      if (t < a || t > b) return;
      ctx.save();
      shake(ctx, T, 22 * (1 - ramp(t, a, a + 0.2)));
      slam(ctx, w, W / 2, H / 2 + 50, { t, tin: a, tout: b, size: 180, weight: 900, color: col, ls: -5 });
      ctx.restore();
      whiteout(ctx, 0.4 * (1 - ramp(t, a, a + 0.12)));
    });
  }

  /* The bang: all three forces at full power, and a countdown to the jump. */
  function finale(ctx, T, at) {
    const t = T - at;
    grid(ctx, T, 1, 1.5 + t * 0.4);
    const dive = ei(ramp(t, 6.6, 7.4));
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(T * lerp(8, 30, ramp(t, 0, 7))));
    ctx.save();
    shake(ctx, T, lerp(2, 30, ramp(t, 3, 7.2)));
    const ends = flux(ctx, T, W / 2, 470, lerp(0.75, 0.9, ramp(t, 0, 6.6)) * lerp(1, 10, dive), [pulse, pulse, pulse], { core: clamp(ramp(t, 0, 6.6) * 0.6 + dive) });
    ctx.restore();
    if (dive < 0.2) {
      FORCES.forEach((f, k) => {
        const [ex, ey] = ends[k];
        const lx = k === 2 ? ex : ex + (k === 0 ? -360 : 360), ly = k === 2 ? ey + 110 : ey - 30;
        label(ctx, `${f.l1} ${f.l2}`, lx, ly, { size: 30, color: f.col, align: 'center', alpha: ramp(t, 0.2 + k * 0.25, 0.5 + k * 0.25), ls: 4, weight: 800 });
      });
      label(ctx, 'ALL THREE FORCES. ONE VALUE MANIFESTO.', W / 2, 90, { size: 34, color: '#fff', align: 'center', alpha: ramp(t, 0.8, 1.1) * (1 - ramp(t, 4.6, 4.9)), ls: 6, weight: 800 });
      circuit(ctx, W / 2 - 330, 900, 660, 'DESTINATION TIME', 'OCT 07 2026', '#ff3b2f', ramp(t, 1.5, 1.8));
    }
    // 3, 2, 1.
    [['3', 5.0], ['2', 5.8], ['1', 6.6]].forEach(([n, a], i) => {
      const b = a + 0.78;
      if (t < a || t > b) return;
      slam(ctx, n, W / 2, 560, { t, tin: a, tout: b - 0.2, size: 520, weight: 900, color: i === 2 ? '#ffd27a' : '#fff', ls: 0 });
      whiteout(ctx, 0.3 * (1 - ramp(t, a, a + 0.12)));
    });
    whiteout(ctx, ramp(t, 7.1, 7.4));
    if (t >= 7.4) black(ctx);
  }

  window.FILMSCRIPT = {
    noCaptions: () => true,
    async draw(T, { ctx, sh, dir }) {
      await load(dir);
      const { id, at } = sh.cut;
      if (id === 'cold') cold(ctx, T);
      if (id === 'ignite') ignite(ctx, T, at);
      if (id === 'rew') rew(ctx, T, at);
      if (id === 'pause') pause(ctx, T, at);
      if (id === 'ff') ff(ctx, T, at);
      if (id === 'choose') choose(ctx, T, at);
      if (id === 'mission') mission(ctx, T, at);
      if (id === 'run') run(ctx, T, at);
      if (id === 'kick') kick(ctx, T, at);
      if (id === 'finale') finale(ctx, T, at);
      if (id === 'arrive') arrive(ctx, T, at);
    },
  };
})();
