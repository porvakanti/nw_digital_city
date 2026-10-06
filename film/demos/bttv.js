/* Back to the Value: a 60-second teaser for the leadership summit breakout.
 *
 * Past, present, future, as the poster has it, run through a time machine of
 * our own: time-circuit displays that open and close the film, and a flux
 * capacitor whose three arms are the breakout's three forces, Execute
 * Relentlessly, Simplify Aggressively and Raise the Talent Bar. It only runs
 * when all three light. The car, the cities and the title are the poster's
 * own art; every other shape is drawn here.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const RED = '#e60000', FIRE = '#ff5a1f', CYAN = '#29d3f5', GREEN = '#3dff7a', AMBER = '#ffb02e';
  const img = {};
  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  let loaded = null;
  function load(dir) {
    if (loaded) return loaded;
    const names = ['poster', 'wide', 't1', 't2', 't3', 't4', 't5', 't6'];
    loaded = Promise.all(names.map((n) => new Promise((res) => {
      const i = new Image();
      i.onload = res; i.onerror = res;
      i.src = `file://${dir}/${n}.jpg`;
      img[n] = i;
    })));
    return loaded;
  }

  // A seeded random, so every frame renders the same every time.
  const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // An image seen through a camera rectangle [x, y, w] (16:9), with a filter.
  function shot(ctx, im, cam, filter) {
    if (!im || !im.width) return;
    const [x, y, w] = cam;
    ctx.save();
    if (filter) ctx.filter = filter;
    ctx.drawImage(im, x, y, w, w * 9 / 16, 0, 0, W, H);
    ctx.restore();
  }

  function shake(ctx, amount, T) {
    ctx.translate((rnd(Math.floor(T * 30)) - 0.5) * amount, (rnd(Math.floor(T * 30) + 7) - 0.5) * amount);
  }

  /* ------------------------------------------------- the time circuits */

  // One row of the time circuits: a label, LED digits in their own colour.
  function circuitRow(ctx, x, y, w, labelText, value, col, a, flicker = 0, T = 0) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#121418';
    ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x, y, w, 120, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#05070a';
    ctx.beginPath(); ctx.roundRect(x + 18, y + 18, w - 36, 70, 6); ctx.fill();
    font(ctx, 54, 500, MONO, 10);
    const on = flicker > 0 && rnd(Math.floor(T * 20) + y) < flicker ? 0.35 : 1;
    ctx.fillStyle = col; ctx.globalAlpha = a * 0.13;
    ctx.fillText(value.replace(/[^\s]/g, '8'), x + 40, y + 74);
    ctx.globalAlpha = a * on;
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.fillText(value, x + 40, y + 74);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = RED;
    font(ctx, 18, 700, SANS, 5);
    const lw = ctx.measureText(labelText).width + 30;
    ctx.beginPath(); ctx.roundRect(x + w / 2 - lw / 2, y + 96, lw, 28, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(labelText, x + w / 2, y + 116);
    ctx.restore();
  }

  const scramble = (T, len) => Array.from({ length: len }, (_, i) => '0123456789ACEJMNOPTV'[Math.floor(rnd(Math.floor(T * 18) * 31 + i) * 20)]).join('');

  /* ------------------------------------------------------------ beats */

  function opening(ctx, T) {
    ctx.fillStyle = '#030305'; ctx.fillRect(0, 0, W, H);
    const w = 900, x = W / 2 - w / 2;
    const dest = T < 6.2 ? `${scramble(T, 3)} ${scramble(T + 1, 2)} ${scramble(T + 2, 4)}` : 'OCT 07 2026';
    circuitRow(ctx, x, 250, w, 'DESTINATION TIME', dest, '#ff3b2f', ramp(T, 0.8, 1.0), 0.15, T);
    circuitRow(ctx, x, 420, w, 'PRESENT TIME', 'OCT 07 2026', GREEN, ramp(T, 1.6, 1.8), 0.05, T);
    circuitRow(ctx, x, 590, w, 'LAST TIME DEPARTED', '--- -- ----', AMBER, ramp(T, 2.4, 2.6), 0.05, T);
    label(ctx, 'LEADERSHIP SUMMIT · PROCUREMENT', W / 2, 840, { size: 22, color: 'rgba(255,255,255,0.75)', align: 'center', alpha: ramp(T, 3.6, 4.0), ls: 9 });
    // The jump: everything pulls toward the centre and whites out.
    const j = ei(ramp(T, 6.4, 7.0));
    if (j > 0) { ctx.fillStyle = `rgba(255,255,255,${j})`; ctx.fillRect(0, 0, W, H); }
  }

  function past(ctx, T, at) {
    const t = T - at, u = t / 10;
    shot(ctx, img.poster, [lerp(0, 20, eio(u)), lerp(385, 400, eio(u)), lerp(540, 440, eio(u))], 'grayscale(1) sepia(0.35) contrast(1.15) brightness(0.9)');
    // Old film: flicker, scratches, heavier grain.
    const f = 0.06 + 0.06 * rnd(Math.floor(T * 24));
    ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      if (rnd(Math.floor(T * 12) + i * 9) > 0.55) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(rnd(Math.floor(T * 12) * 3 + i) * W, 0, 1.5, H);
    }
    scrim(ctx, 'left', 0.9, 0.6);
    rise(ctx, 'LEARN FROM', 120, 330, { t: T, tin: at + 1.0, tout: at + 9.4, size: 60, weight: 800, ls: 6, color: 'rgba(255,255,255,0.8)' });
    rise(ctx, 'YESTERDAY.', 120, 440, { t: T, tin: at + 1.3, tout: at + 9.4, size: 120, weight: 900, ls: -3 });
    const lessons = ['Behaviours that created value.', 'Decisions that aged well.', 'Lessons from every transformation.'];
    lessons.forEach((l, i) => rise(ctx, l, 124, 560 + i * 62, { t: T, tin: at + 4.6 + i * 1.0, tout: at + 9.4, size: 38, weight: 600, by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.85)' }));
    // The circuits, small, rolling back.
    const yr = Math.round(lerp(2026, 2019, eio(ramp(t, 0.3, 3.0))));
    circuitRowSmall(ctx, W - 520, 70, 'LAST TIME DEPARTED', `OCT 07 ${yr}`, AMBER, ramp(t, 0.2, 0.5) * (1 - ramp(t, 9.4, 9.8)));
  }

  function circuitRowSmall(ctx, x, y, l, v, col, a) {
    if (a <= 0) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(0.5, 0.5);
    circuitRow(ctx, 0, 0, 900, l, v, col, a);
    ctx.restore();
  }

  // Red light trails streaking out of the vanishing point.
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

  function present(ctx, T, at) {
    const t = T - at;
    // The poster's road and the TODAY sign, pushing in.
    shot(ctx, img.poster, [lerp(150, 290, eio(ramp(t, 0, 3.2))), lerp(330, 405, eio(ramp(t, 0, 3.2))), lerp(720, 480, eio(ramp(t, 0, 3.2)))], 'saturate(1.2) contrast(1.05)');
    trails(ctx, T, W / 2, H * 0.5, 40, 0.9, ramp(t, 0, 0.6));
    scrim(ctx, 'bottom', 0.8, 0.5);
    slam(ctx, 'ACCELERATE TODAY.', W / 2, 900, { t: T, tin: at + 0.9, tout: at + 2.8, size: 110, weight: 900, ls: -3 });
    // The burst: what is already in motion, rushing past like road signs.
    const tools = ['AskAVA', 'Sourcing Negotiation', 'D2C Product reCosting', 'Obligation Management', 'Executive Supplier Intelligence', 'Conversational Analytics'];
    const b0 = at + 3.0, each = 1.0;
    const dark = ramp(t, 2.8, 3.2);
    if (dark > 0) { ctx.fillStyle = `rgba(3,3,6,${0.78 * dark})`; ctx.fillRect(0, 0, W, H); trails(ctx, T, W / 2, H / 2, 60, 1.6, dark, '255,60,40'); }
    tools.forEach((name, i) => {
      const a = b0 + i * each;
      const u = (T - a) / (each * 1.35);
      if (u < 0 || u > 1) return;
      const s = lerp(0.18, 1.5, ei(u) * 0.6 + u * 0.4);
      const side = i % 2 ? 1 : -1;
      const cx = W / 2 + side * lerp(0, 520, ei(u)), cy = H / 2 + lerp(0, -60, u);
      const im = img[`t${i + 1}`];
      const cw = 900, ch = 430;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.rotate(side * 0.04 * u);
      ctx.globalAlpha = clamp(u * 6) * (1 - ramp(u, 0.82, 1));
      ctx.shadowColor = 'rgba(230,0,0,0.6)'; ctx.shadowBlur = 50;
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(-cw / 2 - 10, -ch / 2 - 10, cw + 20, ch + 80);
      ctx.shadowBlur = 0;
      if (im && im.width) ctx.drawImage(im, 0, 0, im.width, im.height * 0.8, -cw / 2, -ch / 2, cw, ch);
      ctx.fillStyle = RED; ctx.fillRect(-cw / 2 - 10, ch / 2, cw + 20, 70);
      font(ctx, 38, 850, SANS, -0.5); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(name, 0, ch / 2 + 48);
      ctx.restore();
    });
    label(ctx, 'CAPABILITIES IN MOTION', W / 2, 90, { size: 24, color: '#fff', align: 'center', alpha: dark * (1 - ramp(t, 9.5, 9.9)), ls: 10 });
  }

  /* The flux capacitor: three arms in a Y, one per force. */
  function flux(ctx, T, at) {
    const t = T - at;
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 900);
    g.addColorStop(0, 'rgba(230,0,0,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = 520;
    const arms = [
      { ang: -150, name: ['EXECUTE', 'RELENTLESSLY'], n: '01', lit: at + 3.0, lx: 300, ly: 250 },
      { ang: -30, name: ['SIMPLIFY', 'AGGRESSIVELY'], n: '02', lit: at + 6.5, lx: W - 300, ly: 250 },
      { ang: 90, name: ['RAISE THE', 'TALENT BAR'], n: '03', lit: at + 10.0, lx: W / 2, ly: 960 },
    ];
    const all = ramp(t, 12.5, 12.9);
    const pulse = all > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(T * 14)) : 1;
    // The box.
    const bw = 620, bh = 620;
    const k = eo5(ramp(t, 0.2, 1.0));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(lerp(0.9, 1, k), lerp(0.9, 1, k));
    ctx.globalAlpha = k;
    const mg = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
    mg.addColorStop(0, '#3a3e45'); mg.addColorStop(0.5, '#1b1d22'); mg.addColorStop(1, '#2c2f35');
    ctx.fillStyle = mg; ctx.strokeStyle = '#5a5f68'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#07080b';
    ctx.beginPath(); ctx.roundRect(-bw / 2 + 50, -bh / 2 + 50, bw - 100, bh - 100, 16); ctx.fill();
    // Each arm: a glass tube with a filament that fires toward the centre.
    arms.forEach((arm, i) => {
      const a = (arm.ang * Math.PI) / 180;
      const on = ramp(T, arm.lit, arm.lit + 0.25);
      const len = 230;
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(180,190,205,0.35)'; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#0d0f13'; ctx.lineWidth = 36;
      ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
      if (on > 0) {
        const flick = 0.75 + 0.25 * rnd(Math.floor(T * 30) + i * 5);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,${120 + 80 * flick},60,${on * flick * pulse})`;
        ctx.shadowColor = FIRE; ctx.shadowBlur = 40;
        ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(ex * 0.15, ey * 0.15); ctx.lineTo(ex, ey); ctx.stroke();
        // Sparks running inward.
        for (let s = 0; s < 4; s++) {
          const p = 1 - ((T * 2.2 + s / 4) % 1);
          ctx.fillStyle = `rgba(255,240,200,${on * 0.9})`;
          ctx.beginPath(); ctx.arc(ex * lerp(0.15, 1, p), ey * lerp(0.15, 1, p), 7, 0, 7); ctx.fill();
        }
      }
      // The electrode cap.
      ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
      ctx.fillStyle = '#8a8f99';
      ctx.beginPath(); ctx.arc(ex, ey, 30, 0, 7); ctx.fill();
      ctx.restore();
    });
    // The core.
    const lit = arms.filter((a) => T >= a.lit).length;
    ctx.globalCompositeOperation = 'lighter';
    const cr = 40 + lit * 12 + all * 30 * pulse;
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, cr * 2.2);
    cg.addColorStop(0, `rgba(255,255,240,${0.3 + lit * 0.2})`); cg.addColorStop(0.4, `rgba(255,120,40,${0.2 + lit * 0.15})`); cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, cr * 2.2, 0, 7); ctx.fill();
    ctx.restore();
    // The labels, as each arm lights.
    arms.forEach((arm) => {
      const a = ramp(T, arm.lit, arm.lit + 0.3);
      if (a <= 0) return;
      const s = lerp(1.4, 1, eo5(ramp(T, arm.lit, arm.lit + 0.3)));
      ctx.save();
      ctx.translate(arm.lx, arm.ly);
      ctx.scale(s, s);
      ctx.globalAlpha = a;
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, -120, 34, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      font(ctx, 30, 900, SANS, 0); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(arm.n, 0, -109);
      font(ctx, 66, 900, SANS, -1.5); ctx.shadowColor = 'rgba(255,90,31,0.6)'; ctx.shadowBlur = 30;
      ctx.fillText(arm.name[0], 0, -24);
      ctx.fillText(arm.name[1], 0, 46);
      ctx.restore();
    });
    label(ctx, 'THREE FORCES · ONE MACHINE', W / 2, 80, { size: 24, color: '#fff', align: 'center', alpha: ramp(t, 0.4, 0.8) * (1 - all), ls: 10 });
    const m = ramp(t, 13.0, 13.4);
    if (m > 0) {
      label(ctx, '9 TEAMS · 3 FORCES · 1 VALUE MANIFESTO', W / 2, 80, { size: 28, color: AMBER, align: 'center', alpha: m, ls: 8 });
    }
    // At full power, the whole frame strobes.
    if (all > 0 && Math.floor(T * 12) % 3 === 0) { ctx.fillStyle = 'rgba(255,170,90,0.06)'; ctx.fillRect(0, 0, W, H); }
  }

  // Lightning: a jagged bolt with a branch, new shape every few frames.
  function bolt(ctx, x0, y0, x1, y1, seed, a, col = '190,220,255') {
    if (a <= 0) return;
    const pts = [[x0, y0]];
    const n = 14;
    for (let i = 1; i < n; i++) {
      const u = i / n;
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

  function accel(ctx, T, at) {
    const t = T - at;
    const sp = eio(ramp(t, 1.0, 8.2));
    ctx.save();
    shake(ctx, sp * 26, T);
    // The poster's car, pushing in as it gathers speed.
    shot(ctx, img.poster, [lerp(260, 300, sp), lerp(450, 500, sp), lerp(520, 420, sp)], `saturate(1.25) contrast(1.08) brightness(${1 + sp * 0.15})`);
    trails(ctx, T, W / 2, H * 0.52, 70, 0.6 + sp * 2.2, 0.4 + sp * 0.6);
    ctx.restore();
    const tg = ctx.createLinearGradient(0, 0, 0, 420);
    tg.addColorStop(0, 'rgba(3,3,6,0.92)'); tg.addColorStop(1, 'rgba(3,3,6,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 420);
    // What we need, landing with the voice.
    rise(ctx, "WHERE WE'RE GOING,", W / 2, 150, { t: T, tin: at + 0.4, tout: at + 1.5, size: 54, weight: 800, align: 'center', by: 'word', stagger: 0.06, ls: 3 });
    rise(ctx, "WE DON'T NEED ROADS.", W / 2, 150, { t: T, tin: at + 1.7, tout: at + 3.2, size: 54, weight: 800, align: 'center', by: 'word', stagger: 0.06, ls: 3, color: 'rgba(255,255,255,0.75)' });
    slam(ctx, 'WE NEED VALUE.', W / 2, 190, { t: T, tin: at + 3.4, tout: at + 8.3, size: 120, weight: 900, color: '#fff', ls: -2 });
    // The readout: adoption, climbing to 88.
    const v = Math.min(88, Math.floor(sp * 90));
    const ra = ramp(t, 1.2, 1.6);
    if (ra > 0) {
      ctx.save(); ctx.globalAlpha = ra;
      ctx.fillStyle = 'rgba(5,6,10,0.9)'; ctx.strokeStyle = v >= 88 ? FIRE : '#3a3f48'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(W - 470, 820, 400, 190, 14); ctx.fill(); ctx.stroke();
      font(ctx, 120, 500, MONO, 4); ctx.textAlign = 'right';
      ctx.fillStyle = v >= 88 ? FIRE : '#ff3b2f'; ctx.shadowColor = '#ff3b2f'; ctx.shadowBlur = 24;
      ctx.fillText(String(v).padStart(2, '0'), W - 200, 960);
      ctx.shadowBlur = 0;
      font(ctx, 26, 700, MONO, 3); ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText('MPH', W - 186, 930);
      ctx.restore();
      label(ctx, 'ADOPTION', W - 270, 1000, { size: 18, color: AMBER, align: 'center', alpha: ra, ls: 8 });
    }
    // Lightning gathers, then the jump.
    const storm = ramp(t, 5.8, 8.2);
    if (storm > 0 && rnd(Math.floor(T * 15)) < 0.3 + storm * 0.6) {
      const s = Math.floor(T * 15);
      bolt(ctx, W * (0.2 + rnd(s) * 0.6), -20, W / 2 + (rnd(s + 3) - 0.5) * 300, H * 0.55, s, storm);
    }
    const fl = ramp(t, 8.1, 8.6);
    if (fl > 0) { ctx.fillStyle = `rgba(255,255,255,${fl})`; ctx.fillRect(0, 0, W, H); }
  }

  function arrive(ctx, T, at) {
    const t = T - at;
    // The destination: the poster's own hero frame.
    shot(ctx, img.poster, [lerp(40, 0, eio(ramp(t, 0, 7))), lerp(40, 20, eio(ramp(t, 0, 7))), lerp(950, 1024, eio(ramp(t, 0, 7)))], 'saturate(1.1)');
    // Fire trails left on the road where the jump happened.
    const fire = (1 - ramp(t, 0.2, 3.5));
    if (fire > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = `rgba(255,${110 + i * 50},30,${fire * (0.5 - i * 0.12)})`;
          ctx.lineWidth = 14 - i * 4;
          ctx.beginPath();
          for (let y = H + 20; y > H * 0.78; y -= 10) ctx.lineTo(W / 2 + side * (180 + (y - H * 0.78) * 2.4) + Math.sin(y * 0.09 + T * 24 + i) * 9, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    const flash = 1 - ramp(t, 0, 0.6);
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
    // The circuits land on the destination.
    const ca = ramp(t, 1.4, 1.8) * (1 - ramp(t, 6.6, 7.0));
    if (ca > 0) {
      ctx.save(); ctx.translate(W / 2 - 270, 950); ctx.scale(0.6, 0.6);
      circuitRow(ctx, 0, 0, 900, 'DESTINATION TIME', 'OCT 07 2026', '#ff3b2f', ca);
      ctx.restore();
      label(ctx, 'FINAL DESTINATION · THE VALUE MANIFESTO', W / 2, 1050, { size: 22, color: '#fff', align: 'center', alpha: ca, ls: 6 });
    }
    // The close.
    const e = ramp(t, 7.0, 7.5);
    if (e > 0) {
      ctx.fillStyle = `rgba(3,3,6,${e * 0.97})`; ctx.fillRect(0, 0, W, H);
      const s = back(ramp(t, 7.2, 7.7));
      if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 60 * s, 380 - 60 * s, 120 * s, 120 * s);
      rise(ctx, 'The future is a choice we make today.', W / 2, 560, { t: T, tin: at + 7.4, size: 54, weight: 700, align: 'center', by: 'word', stagger: 0.05 });
      label(ctx, 'LEADERSHIP SUMMIT · BREAKOUT · 07 OCT 2026', W / 2, 640, { size: 22, color: AMBER, align: 'center', alpha: ramp(t, 7.9, 8.3), ls: 8 });
      label(ctx, 'TOGETHER WE CAN', W / 2, 700, { size: 20, color: 'rgba(255,255,255,0.7)', align: 'center', alpha: ramp(t, 8.2, 8.6), ls: 10 });
    }
  }

  window.FILMSCRIPT = {
    noCaptions: () => true,
    async draw(T, { ctx, sh, dir }) {
      await load(dir);
      const { id, at } = sh.cut;
      if (id === 'open') opening(ctx, T);
      if (id === 'past') past(ctx, T, at);
      if (id === 'present') present(ctx, T, at);
      if (id === 'flux') flux(ctx, T, at);
      if (id === 'accel') accel(ctx, T, at);
      if (id === 'end') arrive(ctx, T, at);
    },
  };
})();
