/* Back to the Value, v6: the poster comes alive.
 *
 * The film never leaves Gorkem's poster. A single camera moves through it:
 * lightning wakes it, the camera dives onto the road and drives through its
 * three signs, each a gate into its own world (the past in black and white,
 * today in neon, the future in gold). Then the time circuits assign each
 * team its force, the car runs to 88, and the poster reassembles from its
 * pieces. The art is passed in with the frames; every other shape is drawn.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, font, SANS, MONO } = K;

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
  const FIT = H / 1536 * 0.97;

  function black(ctx, a = 1) { ctx.fillStyle = `rgba(3,3,6,${a})`; ctx.fillRect(0, 0, W, H); }
  function whiteout(ctx, a) { if (a > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(a)})`; ctx.fillRect(0, 0, W, H); } }
  function shake(ctx, T, amt) { if (amt > 0) ctx.translate((rnd(F(T)) - 0.5) * amt, (rnd(F(T) + 7) - 0.5) * amt); }

  /* The one camera: (cx, cy) is the poster point at the centre of the screen,
   * s the screen pixels per poster pixel. Keys are [T, cx, cy, s]. */
  const CAM = [
    [0.0, 512, 768, FIT], [2.4, 512, 768, FIT * 1.04],
    [4.0, 338, 470, 3.6], [7.2, 338, 462, 8.5], [7.75, 338, 462, 13],
    [8.0, 517, 455, 3.6], [11.2, 517, 452, 8.5], [11.75, 517, 452, 13],
    [12.0, 702, 468, 3.6], [13.6, 702, 465, 6.0], [15.4, 800, 300, 2.6], [16.0, 800, 300, 2.4],
  ];
  function camAt(T) {
    if (T <= CAM[0][0]) return CAM[0].slice(1);
    for (let i = 1; i < CAM.length; i++) {
      if (T <= CAM[i][0]) {
        const [t0, ...a] = CAM[i - 1], [t1, ...b] = CAM[i];
        const u = (T - t0) / (t1 - t0);
        // Through a gate the camera cuts, not slides.
        if (b[2] < a[2] * 0.6) return b;
        const k = b[2] > 10 ? ei(u) : eio(u);
        // Zoom in log space, so speed feels even.
        return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), k))];
      }
    }
    return CAM[CAM.length - 1].slice(1);
  }

  function poster(ctx, cx, cy, s, filter) {
    const im = img.poster;
    if (!im || !im.width) return;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.translate(W / 2, H / 2);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  }

  // The poster, blurred, filling the frame behind a fitted poster.
  function backdrop(ctx, a = 1, bright = 0.35) {
    const im = img.poster;
    if (!im || !im.width) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.filter = `blur(40px) brightness(${bright}) saturate(1.3)`;
    ctx.drawImage(im, 0, 300, 1024, 576, -100, -60, W + 200, H + 120);
    ctx.restore();
  }

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
    for (const [lw, al] of [[22, 0.12], [9, 0.35], [3.5, 1]]) {
      ctx.strokeStyle = `rgba(${col},${a * al})`; ctx.lineWidth = lw; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      const b = pts[6];
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + (rnd(seed + 99) - 0.5) * 400, b[1] + 220); ctx.stroke();
    }
    ctx.restore();
  }

  // Where a poster point lands on screen, through a camera.
  const toScreen = (cam, x, y) => [W / 2 + (x - cam[0]) * cam[2], H / 2 + (y - cam[1]) * cam[2]];

  // Light pouring from the car's tail lights.
  function tailGlow(ctx, cam, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[378, 645], [632, 645]]) {
      const [sx, sy] = toScreen(cam, x, y);
      const r = 90 * cam[2] * (0.8 + 0.4 * a);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(255,80,50,${0.9 * a})`); g.addColorStop(0.4, `rgba(230,0,0,${0.4 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  // A big statement over the drive, a kicker and up to two lines.
  function statement(ctx, T, a0, a1, kicker, lines, col) {
    const a = ramp(T, a0, a0 + 0.25) * (1 - ramp(T, a1 - 0.25, a1));
    if (a <= 0) return;
    const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
    g.addColorStop(0, 'rgba(3,3,6,0)'); g.addColorStop(1, `rgba(3,3,6,${0.85 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    label(ctx, kicker, W / 2, 790, { size: 30, color: col, align: 'center', alpha: a, ls: 14, weight: 800 });
    lines.forEach((l, i) => rise(ctx, l, W / 2, 890 + i * 96, { t: T, tin: a0 + 0.1 + i * 0.35, tout: a1 - 0.3, size: 86, weight: 900, align: 'center', ls: -2, stagger: 0.012 }));
  }

  /* --------------------------------------------------- 0-16: the drive */

  function drive(ctx, T) {
    const cam = camAt(T);
    const world = T < 7.75 ? 'past' : T < 11.75 ? 'today' : 'future';
    const filters = {
      past: `grayscale(${ramp(T, 4.0, 5.0)}) sepia(${0.4 * ramp(T, 4.0, 5.0)}) contrast(1.15)`,
      today: 'saturate(1.45) contrast(1.08) brightness(1.05)',
      future: 'saturate(1.3) sepia(0.15) contrast(1.05) brightness(1.1)',
    };
    black(ctx);
    if (T < 4.0) backdrop(ctx, 1 - ramp(T, 2.6, 3.6));
    ctx.save();
    shake(ctx, T, T < 1.0 ? 0 : T < 2.0 ? 24 * (1 - ramp(T, 1.0, 2.0)) : T > 4 ? 5 + 6 * ramp(T % 4, 2.5, 3.7) : 0);
    poster(ctx, cam[0], cam[1], cam[2], T < 4.0 ? `brightness(${T < 1.0 ? 0.55 : 1}) saturate(1.1)` : filters[world]);
    ctx.restore();

    // Ignition: lightning, and the car's lights coming up.
    if (T < 4.0) {
      if (T >= 1.0 && T < 1.5) {
        const k = Math.floor(T * 20);
        const [bx, by] = toScreen(cam, 760, 0);
        const [ex, ey] = toScreen(cam, 512, 560);
        bolt(ctx, bx, by, ex, ey, k, 1);
        bolt(ctx, toScreen(cam, 300, 0)[0], 0, ex - 40, ey, k + 9, 0.8);
        whiteout(ctx, 0.55 * (1 - ramp(T, 1.0, 1.2)));
      }
      tailGlow(ctx, cam, ramp(T, 1.3, 2.2) * (0.85 + 0.15 * Math.sin(T * 20)));
    }
    // On the road: speed and light.
    if (T >= 4.0) {
      const col = world === 'past' ? '220,220,220' : world === 'today' ? '255,40,30' : '255,180,80';
      trails(ctx, T, W / 2, H * 0.55, 70, 1.6, 0.85, col);
      if (world === 'today') trails(ctx, T + 0.3, W / 2, H * 0.55, 30, 2.2, 0.6, '41,211,245');
      // Old film on the past.
      if (world === 'past') {
        ctx.fillStyle = `rgba(0,0,0,${0.06 + 0.06 * rnd(F(T))})`; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 3; i++) if (rnd(F(T) + i * 9) < 0.4) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(rnd(F(T) * 3 + i) * W, 0, 1.5, H); }
      }
    }
    // Today: our tools, flying past like billboards.
    if (world === 'today') {
      const tools = ['AskAVA', 'Sourcing Negotiation', 'D2C', 'Obligation Mgmt', 'Exec Intelligence', 'Conversational Analytics'];
      tools.forEach((name, i) => {
        const a = 8.2 + i * 0.5;
        const u = (T - a) / 0.9;
        if (u < 0 || u > 1) return;
        const side = i % 2 ? 1 : -1;
        const s = lerp(0.15, 1.6, ei(u));
        const x = W / 2 + side * lerp(60, 1100, ei(u)), y = H * 0.45 + lerp(0, -120, u);
        const im = img[`t${i + 1}`];
        ctx.save();
        ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(side * 0.08);
        ctx.globalAlpha = clamp(u * 5) * (1 - ramp(u, 0.85, 1));
        ctx.shadowColor = 'rgba(41,211,245,0.7)'; ctx.shadowBlur = 40;
        ctx.fillStyle = '#0b0c10'; ctx.fillRect(-310, -175, 620, 400);
        ctx.shadowBlur = 0;
        if (im && im.width) ctx.drawImage(im, 0, 0, im.width, im.height * 0.85, -300, -165, 600, 320);
        ctx.fillStyle = RED; ctx.fillRect(-310, 160, 620, 64);
        font(ctx, 36, 900, SANS, -0.5); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(name, 0, 204);
        ctx.restore();
      });
    }
    // What each world asks.
    statement(ctx, T, 4.6, 7.5, 'THE PAST', ['WHAT SHOULD', 'NEVER BE LOST?'], '#e8e8e8');
    statement(ctx, T, 8.5, 11.0, 'TODAY', ["VALUE ISN'T IN THE", 'TOOLS WE BUILD.'], CYAN);
    statement(ctx, T, 11.0, 11.75, 'TODAY', ["IT'S IN THE", 'TOOLS WE USE.'], CYAN);
    statement(ctx, T, 12.6, 15.8, 'THE FUTURE', ['IF VALUE WAS OUR', 'ONLY KPI…'], AMBER);
    // The gates: a flash as the camera goes through each sign.
    for (const g of [7.75, 11.75]) whiteout(ctx, (T < g ? 0.95 * ramp(T, g - 0.3, g) : 0.95 * (1 - ramp(T, g, g + 0.25))));
    whiteout(ctx, ramp(T, 15.75, 16.0));
  }

  /* ------------------------------------------- 16-30: the destinations */

  const FORCES = [
    { name: 'EXECUTE RELENTLESSLY', teams: 'TEAMS 1 · 2 · 3', col: RED, land: 18.0 },
    { name: 'SIMPLIFY AGGRESSIVELY', teams: 'TEAMS 4 · 5 · 6', col: ORANGE, land: 22.0 },
    { name: 'RAISE THE TALENT BAR', teams: 'TEAMS 7 · 8 · 9', col: CYAN, land: 26.0 },
  ];
  const GLYPHS = 'ABCDEFGHIJKLMNOPRSTUVXYZ0123456789';

  function circuitRow(ctx, T, y, f, i) {
    const x = 170, w = 1580, h = 150;
    const on = ramp(T, f.land - 2.2, f.land - 2.0);
    if (on <= 0) return;
    const locked = T >= f.land;
    const glow = locked ? 1 + 1.5 * (1 - ramp(T, f.land, f.land + 0.4)) : 1;
    ctx.save();
    ctx.globalAlpha = on;
    ctx.fillStyle = '#121418'; ctx.strokeStyle = locked ? f.col : '#3a3f48'; ctx.lineWidth = locked ? 5 : 3;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.roundRect(x + 22, y + 20, w - 340, h - 40, 8); ctx.fill();
    // The display: spinning glyphs that settle left to right, then the force.
    font(ctx, 76, 500, MONO, 6);
    const text = f.name;
    let shown = '';
    for (let c = 0; c < text.length; c++) {
      const settle = f.land - 0.9 + c * 0.045;
      shown += text[c] === ' ' ? ' ' : T >= settle ? text[c] : GLYPHS[Math.floor(rnd(F(T) * 31 + c * 7) * GLYPHS.length)];
    }
    ctx.fillStyle = f.col; ctx.globalAlpha = on * 0.12;
    ctx.fillText(text.replace(/[^\s]/g, '8'), x + 50, y + 104);
    ctx.globalAlpha = on;
    ctx.shadowColor = f.col; ctx.shadowBlur = 26 * glow;
    ctx.fillText(shown, x + 50, y + 104);
    ctx.shadowBlur = 0;
    // The tag under it, and the teams on the right.
    font(ctx, 20, 800, SANS, 5);
    const tag = `DESTINATION · FORCE 0${i + 1}`;
    const tw = ctx.measureText(tag).width + 36;
    ctx.fillStyle = RED; ctx.beginPath(); ctx.roundRect(x + (w - 320) / 2 - tw / 2, y + h - 16, tw, 32, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(tag, x + (w - 320) / 2, y + h + 7);
    ctx.textAlign = 'left';
    const ta = ramp(T, f.land, f.land + 0.3);
    if (ta > 0) {
      ctx.globalAlpha = on * ta;
      font(ctx, 28, 800, MONO, 0); ctx.fillStyle = f.col; ctx.textAlign = 'center';
      ctx.fillText(f.teams, x + w - 150, y + 86);
    }
    ctx.restore();
  }

  function destinations(ctx, T, at) {
    const t = T - at;
    black(ctx);
    backdrop(ctx, 1, 0.22);
    ctx.save();
    shake(ctx, T, 10 * (1 - ramp(t, 0, 0.4)));
    label(ctx, 'EVERY TEAM GETS A DESTINATION', W / 2, 130, { size: 38, color: '#fff', align: 'center', alpha: ramp(t, 0.3, 0.6), ls: 10, weight: 800 });
    FORCES.forEach((f, i) => {
      circuitRow(ctx, T, 250 + i * 215, f, i);
      // The lock: a flash in the force's colour.
      const k = 1 - ramp(T, f.land, f.land + 0.25);
      if (T >= f.land && k > 0) { ctx.fillStyle = `rgba(255,255,255,${0.25 * k})`; ctx.fillRect(0, 0, W, H); }
    });
    ctx.restore();
    const p = ramp(t, 10.6, 11.0) * (1 - ramp(t, 13.6, 14.0));
    if (p > 0) {
      font(ctx, 52, 900, SANS, -1);
      const parts = [['PAST', '#e8e8e8'], ['  ▸  ', 'rgba(255,255,255,0.5)'], ['TODAY', CYAN], ['  ▸  ', 'rgba(255,255,255,0.5)'], ['FUTURE', AMBER]];
      const total = parts.reduce((s, [w]) => s + ctx.measureText(w).width, 0);
      let x = W / 2 - total / 2;
      ctx.save(); ctx.globalAlpha = p;
      for (const [w, c] of parts) { ctx.fillStyle = c; ctx.fillText(w, x, 960); x += ctx.measureText(w).width; }
      ctx.restore();
      label(ctx, 'ONE FORCE · THREE TIMES · ONE VALUE MANIFESTO', W / 2, 1030, { size: 22, color: '#fff', align: 'center', alpha: p, ls: 6, weight: 700 });
    }
    whiteout(ctx, ramp(t, 13.8, 14.0));
  }

  /* ------------------------------------------------- 30-35.6: 88 mph */

  function run(ctx, T, at) {
    const t = T - at;
    const sp = ei(ramp(t, 0, 5.2));
    const cam = [512, lerp(615, 640, sp), lerp(3.0, 4.4, sp)];
    black(ctx);
    ctx.save();
    shake(ctx, T, 8 + sp * 36);
    poster(ctx, cam[0], cam[1], cam[2], `saturate(1.35) contrast(1.12) brightness(${1 + sp * 0.2})`);
    tailGlow(ctx, cam, 0.7 + 0.3 * sp);
    trails(ctx, T, W / 2, H * 0.48, 90, 1.2 + sp * 3, 0.6 + 0.4 * sp);
    ctx.restore();
    const storm = ramp(t, 2.6, 5.2);
    if (storm > 0 && rnd(F(T) >> 1) < 0.35 + storm * 0.6) {
      const k = F(T) >> 1;
      bolt(ctx, W * (0.1 + rnd(k) * 0.8), -20, W / 2 + (rnd(k + 3) - 0.5) * 600, H * 0.55, k, storm);
    }
    // The readout.
    const v = Math.min(88, Math.floor(lerp(62, 89, sp)));
    const hot = v >= 88;
    ctx.save();
    ctx.translate(W / 2, 170);
    const s = hot ? 1 + 0.05 * Math.sin(T * 40) : 1;
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(5,6,10,0.88)'; ctx.strokeStyle = hot ? FIRE : '#3a3f48'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-300, -120, 600, 220, 20); ctx.fill(); ctx.stroke();
    font(ctx, 190, 500, MONO, 8); ctx.textAlign = 'right';
    ctx.fillStyle = hot ? '#ffd27a' : '#ff3b2f'; ctx.shadowColor = hot ? FIRE : '#ff3b2f'; ctx.shadowBlur = hot ? 60 : 26;
    ctx.fillText(String(v), 110, 60);
    ctx.shadowBlur = 0; font(ctx, 48, 800, MONO, 3); ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText('MPH', 135, 40);
    ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(5,6,10,0.88)'; ctx.beginPath(); ctx.roundRect(W / 2 - 150, 288, 300, 44, 22); ctx.fill(); ctx.restore();
    label(ctx, 'ADOPTION', W / 2, 319, { size: 26, color: AMBER, align: 'center', ls: 14, weight: 800 });
    whiteout(ctx, ramp(t, 5.3, 5.6));
  }

  /* ------------------------------------------- 36-45: reassembled */

  function finale(ctx, T, at) {
    const t = T - at;
    const im = img.poster;
    if (!im || !im.width) return;
    black(ctx);
    backdrop(ctx, ramp(t, 1.0, 2.5));
    // Fire tracks where the car was.
    const fire = 1 - ramp(t, 0.1, 1.8);
    if (fire > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(255,${110 + i * 50},30,${fire * (0.6 - i * 0.15)})`; ctx.lineWidth = 18 - i * 6;
        ctx.beginPath();
        for (let y = H + 20; y > H * 0.5; y -= 10) ctx.lineTo(W / 2 + side * (120 + (H - y) * 1.6) + Math.sin(y * 0.09 + T * 24 + i) * 9, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // The poster flies back together from its pieces.
    const cols = 6, rows = 9, tw = 1024 / cols, th = 1536 / rows;
    const s = FIT, ox = W / 2 - 512 * s, oy = H / 2 - 768 * s;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const d = 0.3 + rnd(i) * 1.2;
      const u = eo5(ramp(t, d, d + 0.9));
      if (u <= 0) continue;
      const fx = (rnd(i + 3) - 0.5) * 3200, fy = (rnd(i + 5) - 0.5) * 2200, fr = (rnd(i + 8) - 0.5) * 3;
      const x = ox + (c + 0.5) * tw * s, y = oy + (r + 0.5) * th * s;
      ctx.save();
      ctx.translate(lerp(x + fx, x, u), lerp(y + fy, y, u));
      ctx.rotate(lerp(fr, 0, u));
      ctx.scale(lerp(2.5, 1, u), lerp(2.5, 1, u));
      ctx.globalAlpha = clamp(u * 3);
      ctx.drawImage(im, c * tw, r * th, tw + 1, th + 1, -tw * s / 2, -th * s / 2, tw * s + 1, th * s + 1);
      ctx.restore();
    }
    // Locked: a glow and a pulse round the whole poster.
    const done = ramp(t, 2.4, 2.7);
    if (done > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(230,0,0,${0.9 * done})`; ctx.lineWidth = 4; ctx.shadowColor = RED; ctx.shadowBlur = 50 * (1 + (1 - ramp(t, 2.4, 3.4)) * 2);
      ctx.strokeRect(ox, oy, 1024 * s, 1536 * s);
      ctx.restore();
    }
    whiteout(ctx, 1 - ramp(t, 0, 0.4));
    whiteout(ctx, 0.5 * (1 - ramp(t, 2.4, 2.7)) * ramp(t, 2.35, 2.4));
    // Either side, the call.
    if (t > 2.6) {
      const lx = (W - 1024 * s) / 4, rx = W - lx;
      rise(ctx, 'THE BREAKOUT', lx, 470, { t: T, tin: at + 2.7, size: 44, weight: 800, align: 'center', ls: 4, color: 'rgba(255,255,255,0.85)' });
      rise(ctx, 'STARTS', lx, 580, { t: T, tin: at + 2.9, size: 104, weight: 900, align: 'center', ls: -3 });
      rise(ctx, 'NOW.', lx, 690, { t: T, tin: at + 3.1, size: 104, weight: 900, align: 'center', ls: -3, color: RED });
      const ms = back(ramp(t, 3.2, 3.7));
      if (ms > 0 && mark.complete) ctx.drawImage(mark, rx - 50 * ms, 430 - 50 * ms, 100 * ms, 100 * ms);
      label(ctx, 'LEADERSHIP SUMMIT', rx, 570, { size: 30, color: '#fff', align: 'center', alpha: ramp(t, 3.4, 3.7), ls: 6, weight: 700 });
      label(ctx, 'PROCUREMENT', rx, 620, { size: 30, color: '#fff', align: 'center', alpha: ramp(t, 3.5, 3.8), ls: 6, weight: 700 });
      label(ctx, 'TOGETHER WE CAN', rx, 700, { size: 26, color: RED, align: 'center', alpha: ramp(t, 3.7, 4.0), ls: 8, weight: 700 });
    }
  }

  window.FILMSCRIPT = {
    noCaptions: () => true,
    async draw(T, { ctx, sh, dir }) {
      await load(dir);
      const { id, at } = sh.cut;
      if (id === 'drive') drive(ctx, T);
      if (id === 'dest') destinations(ctx, T, at);
      if (id === 'run') run(ctx, T, at);
      if (id === 'gap') black(ctx);
      if (id === 'finale') finale(ctx, T, at);
    },
  };
})();
