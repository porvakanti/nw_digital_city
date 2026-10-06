/* D2C: the graphics for both Design to Cost films, hardware and software.
 *
 * Their shared signature is the blueprint: a drafting grid, line drawings
 * that draw themselves, and dimension lines that measure a cost the way an
 * engineer measures a part. Each film has its own accent and its own reveal:
 * hardware, a price moved along a timeline; software, a should-cost range.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const PANEL = 'rgba(8,12,20,0.97)';
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // The drafting grid, drifting slowly.
  function grid(ctx, T, A, a = 1) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,12,24,0.72)';
    ctx.fillRect(0, 0, W, H);
    const off = (T * 6) % 40;
    for (let x = -off; x < W; x += 40) {
      ctx.fillStyle = rgba(A, Math.round((x + off) / 40) % 5 === 0 ? 0.16 : 0.06);
      ctx.fillRect(x, 0, 1, H);
    }
    for (let y = -off; y < H; y += 40) {
      ctx.fillStyle = rgba(A, Math.round((y + off) / 40) % 5 === 0 ? 0.16 : 0.06);
      ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();
  }

  // A path that draws itself between a and b.
  function draw(ctx, T, a, b, A, path, width = 3) {
    const k = ramp(T, a, b);
    if (k <= 0) return;
    ctx.save();
    ctx.strokeStyle = A; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.setLineDash([4000]); ctx.lineDashOffset = 4000 * (1 - eio(k));
    ctx.shadowColor = A; ctx.shadowBlur = 12;
    ctx.beginPath(); path(); ctx.stroke();
    ctx.restore();
  }

  // An engineer's dimension line: ticks at both ends, a value in the middle.
  function dimension(ctx, x1, x2, y, text, A, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = A; ctx.lineWidth = 2;
    const xm = lerp(x1, x2, 0.5), half = (x2 - x1) / 2 * eio(clamp(a));
    ctx.beginPath();
    ctx.moveTo(xm - half, y); ctx.lineTo(xm + half, y);
    ctx.moveTo(xm - half, y - 14); ctx.lineTo(xm - half, y + 14);
    ctx.moveTo(xm + half, y - 14); ctx.lineTo(xm + half, y + 14);
    ctx.stroke();
    font(ctx, 22, 500, MONO, 3);
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(6,12,24,1)'; ctx.fillRect(xm - w / 2, y - 16, w, 32);
    ctx.fillStyle = A; ctx.textAlign = 'center'; ctx.fillText(text, xm, y + 8);
    ctx.restore();
  }

  function tag(ctx, T, at, text, A, y = 64, x = 64, tout = 1e9) {
    const a = ramp(T, at, at + 0.3) * (1 - ramp(T, tout, tout + 0.3));
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.94;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
    ctx.strokeStyle = rgba(A, 0.6); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    label(ctx, text, x + 22, y + 35, { size: 22, color: A, alpha: a, ls: 5 });
  }

  /* ---------------------------------------------------------- hardware */

  // A network unit in line art, its parts called out with unknown prices.
  function unit(ctx, T, A) {
    const cx = W / 2, cy = 560, w = 900, h = 220;
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const out = ei(ramp(T, 12.6, 13.4));
    ctx.save();
    ctx.globalAlpha = 1 - out;
    draw(ctx, T, 0.3, 1.6, A, () => { ctx.roundRect(x0, y0, w, h, 14); });
    draw(ctx, T, 1.0, 2.0, A, () => {
      for (let i = 0; i < 12; i++) ctx.rect(x0 + 60 + i * 52, y0 + 130, 36, 28);
    }, 2);
    draw(ctx, T, 1.3, 2.2, A, () => {
      for (let i = 0; i < 3; i++) { ctx.moveTo(x0 + w - 150 + i * 40 + 16, y0 + 60); ctx.arc(x0 + w - 150 + i * 40, y0 + 60, 16, 0, 7); }
      ctx.rect(x0 + 60, y0 + 50, 280, 44);
    }, 2);
    // Callouts: what it is made of, and what each part costs now.
    const parts = [['OPTICS', x0 + 220, y0 + 144, x0 + 120, y0 - 120], ['SILICON', x0 + 200, y0 + 72, x0 + 460, y0 - 150],
      ['POWER', x0 + w - 110, y0 + 60, x0 + w - 60, y0 - 120], ['CHASSIS', x0 + w - 40, y0 + h - 20, x0 + w + 20, y0 + h + 130],
      ['FREIGHT', x0 + 40, y0 + h - 10, x0 - 20, y0 + h + 130]];
    parts.forEach(([name, px, py, lx, ly], i) => {
      const a = 2.0 + i * 0.3;
      draw(ctx, T, a, a + 0.4, A, () => { ctx.moveTo(px, py); ctx.lineTo(lx, ly); }, 2);
      const k = back(ramp(T, a + 0.3, a + 0.6));
      if (k <= 0) return;
      // From 6.4s the prices start to move: components move, currencies move.
      const moving = T > 6.6;
      const v = moving ? (Math.sin(T * (3 + i) + i * 2) > 0 ? '▲' : '▼') : '?';
      ctx.save();
      ctx.translate(lx, ly);
      ctx.scale(k, k);
      font(ctx, 20, 500, MONO, 4);
      const tw = ctx.measureText(name).width + 70;
      ctx.fillStyle = PANEL; ctx.strokeStyle = A; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-tw / 2, -24, tw, 48, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.fillText(name, -tw / 2 + 14, 7);
      ctx.fillStyle = moving ? (v === '▲' ? '#ff6b6b' : A) : A;
      ctx.textAlign = 'right'; ctx.fillText(v, tw / 2 - 14, 7);
      ctx.restore();
    });
    ctx.restore();
    // The old number, struck through.
    const oa = ramp(T, 10.6, 11.0) * (1 - out);
    if (oa > 0) {
      ctx.save();
      ctx.globalAlpha = oa;
      font(ctx, 64, 800, SANS, -1);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.textAlign = 'center';
      ctx.fillText('$2,821.20', cx, 930);
      const sw = ctx.measureText('$2,821.20').width * eio(ramp(T, 11.3, 11.7));
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(cx - sw / 2 - 10, 908, sw + 20, 7);
      ctx.restore();
      label(ctx, 'LAST PRICE · MARCH 2024', cx, 980, { size: 18, color: A, align: 'center', alpha: oa, ls: 6 });
    }
  }

  // The reveal: the price moved along a dated timeline.
  function reprice(ctx, T, at, A) {
    const t = T - at;
    const k = eo5(ramp(t, 1.0, 1.6)) * (1 - ei(ramp(t, 16.4, 16.9)));
    if (k <= 0) return;
    const x = lerp(W + 40, 1210, k), y = 190, w = 660, h = 600;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = PANEL;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50;
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 24); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    const L = x + 56;
    label(ctx, 'PRODUCT 3HE14034AA · NOKIA', L, y + 64, { size: 18, color: A, ls: 4 });
    // Original, then the line runs, then the latest.
    const o = ramp(t, 1.6, 2.0);
    label(ctx, 'ORIGINAL · MAR 2024', L, y + 130, { size: 17, color: 'rgba(255,255,255,0.7)', alpha: o, ls: 4 });
    ctx.save(); ctx.globalAlpha = o;
    font(ctx, 72, 850, SANS, -2); ctx.fillStyle = INK; ctx.fillText('$2,821.20', L, y + 206);
    ctx.restore();
    const run = eio(ramp(t, 6.2, 7.6));
    const tx0 = L + 10, tx1 = x + w - 70, ty = y + 290;
    if (run > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx0, ty); ctx.lineTo(tx1, ty); ctx.stroke();
      ctx.strokeStyle = A; ctx.lineWidth = 5; ctx.shadowColor = A; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(tx0, ty); ctx.lineTo(lerp(tx0, tx1, run), ty - 40 * run); ctx.stroke();
      ctx.fillStyle = A;
      ctx.beginPath(); ctx.arc(tx0, ty, 8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(lerp(tx0, tx1, run), ty - 40 * run, 9, 0, 7); ctx.fill();
      ctx.restore();
    }
    const l = ramp(t, 7.4, 7.8);
    label(ctx, 'LATEST · SEP 2026', L, y + 390, { size: 17, color: 'rgba(255,255,255,0.7)', alpha: l, ls: 4 });
    if (l > 0) {
      const v = lerp(2821.2, 3124.58, eo5(ramp(t, 7.4, 9.0)));
      ctx.save(); ctx.globalAlpha = l;
      font(ctx, 96, 900, SANS, -3); ctx.fillStyle = A;
      ctx.fillText('$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), L, y + 486);
      ctx.restore();
    }
    // The change, pinned on.
    const d = back(ramp(t, 10.6, 11.0));
    if (d > 0) {
      ctx.save();
      ctx.translate(x + w - 150, y + 560);
      ctx.scale(d, d);
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath(); ctx.roundRect(-110, -32, 220, 64, 32); ctx.fill();
      font(ctx, 36, 900, SANS, -1); ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText('+10.8%', 0, 13);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------- software */

  // The questions as a blank form: three fields nobody can fill in yet.
  function form(ctx, T, A) {
    const out = ei(ramp(T, 10.6, 11.2));
    const rows = [['MAN-DAYS', 0.8], ['RATE', 2.6], ['MARKET', 4.2]];
    const x0 = 380, w = 780;
    rows.forEach(([name, a], i) => {
      const k = eo5(ramp(T, a, a + 0.4));
      if (k <= 0) return;
      const y = 300 + i * 150;
      ctx.save();
      ctx.globalAlpha = k * (1 - out);
      ctx.translate((1 - k) * 60, 0);
      font(ctx, 22, 500, MONO, 6); ctx.fillStyle = A; ctx.fillText(name, x0, y - 18);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.strokeRect(x0, y, w, 84);
      font(ctx, 52, 700, SANS, -1); ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(name === 'RATE' ? '€ ?' : '?', x0 + 28, y + 60);
      if (Math.floor(T * 2.5) % 2 === 0) { ctx.fillStyle = A; ctx.fillRect(x0 + (name === 'RATE' ? 110 : 70), y + 18, 4, 50); }
      ctx.restore();
    });
    // The quote that usually fills them in.
    const q = back(ramp(T, 7.4, 7.9)) * (1 - out);
    if (q > 0) {
      ctx.save();
      ctx.translate(1500, 520);
      ctx.rotate(0.08 - 0.04 * q);
      ctx.scale(q, q);
      ctx.fillStyle = 'rgba(245,246,250,0.96)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40;
      ctx.fillRect(-170, -220, 340, 440);
      ctx.shadowBlur = 0;
      font(ctx, 20, 500, MONO, 4); ctx.fillStyle = '#555'; ctx.fillText('SUPPLIER QUOTE', -140, -170);
      ctx.fillStyle = '#c8c9cf';
      for (let i = 0; i < 7; i++) ctx.fillRect(-140, -130 + i * 34, 280 - (i % 3) * 50, 12);
      font(ctx, 44, 850, SANS, -1); ctx.fillStyle = '#1a1c22'; ctx.fillText('€ ???,???', -140, 170);
      ctx.restore();
    }
  }

  // The reveal: best, ideal and worst on one measured scale.
  function range(ctx, T, at, A) {
    const t = T - at;
    const k = eo5(ramp(t, 0.8, 1.4)) * (1 - ei(ramp(t, 13.0, 13.5)));
    if (k <= 0) return;
    const x = W / 2 - 520, y = lerp(H + 40, 170, k), w = 1040, h = 660;
    ctx.save();
    ctx.fillStyle = PANEL; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 24); ctx.fill();
    ctx.restore();
    const L = x + 56, R = x + w - 56;
    label(ctx, 'SHOULD COST · SYSTEM INTEGRATION · PORTUGAL', L, y + 64, { size: 15, color: A, ls: 3 });
    const pts = [['BEST', 604.39, 2061, 1.4], ['IDEAL', 656.95, 2240, 5.2], ['WORST', 709.5, 2420, 8.2]];
    const lo = 580, hi = 735;
    const sx = (v) => lerp(L + 10, R - 10, (v - lo) / (hi - lo));
    const by = y + 290;
    // The scale, then each point lands as it is said.
    const s = eio(ramp(t, 1.4, 2.4));
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(L, by - 6, (R - L) * s, 12);
    const span = ramp(t, 8.4, 9.4);
    if (span > 0) {
      ctx.fillStyle = rgba(A, 0.5);
      const a0 = sx(604.39), a1 = sx(709.5);
      ctx.fillRect(a0, by - 6, (a1 - a0) * eio(span), 12);
    }
    ctx.restore();
    pts.forEach(([name, v, days, when], i) => {
      const p = back(ramp(t, when, when + 0.4));
      if (p <= 0) return;
      const px = sx(v), up = i % 2 === 0;
      ctx.save();
      ctx.globalAlpha = clamp(p);
      ctx.fillStyle = i === 1 ? A : INK;
      ctx.beginPath(); ctx.arc(px, by, 14 * p, 0, 7); ctx.fill();
      ctx.fillRect(px - 1, up ? by - 80 : by + 14, 2, 66);
      font(ctx, i === 1 ? 54 : 42, 850, SANS, -1.5); ctx.textAlign = 'center';
      ctx.fillText(`€${Math.round(v)}K`, px, up ? by - 100 : by + 132);
      ctx.restore();
      label(ctx, name, px, up ? by - 160 : by + 166, { size: 16, color: i === 1 ? A : 'rgba(255,255,255,0.7)', align: 'center', alpha: clamp(p), ls: 5 });
    });
    // What it is built from, measured underneath.
    const b = ramp(t, 10.4, 10.9);
    dimension(ctx, L, R, y + h - 140, 'EFFORT 2,061 – 2,420 MAN-DAYS', A, b);
    dimension(ctx, L, R, y + h - 70, 'BLENDED RATE €294 · SHORE MIX 80:20', A, ramp(t, 11.0, 11.5));
  }

  /* ---------------------------------------------------------- shared */

  // A dark band along the top, for the track to sit on over the app's red header.
  function band(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 210);
    g.addColorStop(0, 'rgba(6,10,18,0.92)'); g.addColorStop(0.55, 'rgba(6,10,18,0.75)'); g.addColorStop(1, 'rgba(6,10,18,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 210);
  }

  function title(ctx, T, at, cfg) {
    const A = cfg.accent;
    grid(ctx, T, A, ramp(T, at, at + 0.4));
    const [a, b] = cfg.title;
    label(ctx, 'DESIGN TO COST', W / 2, 380, { size: 22, color: A, align: 'center', alpha: ramp(T, at + 0.4, at + 0.8) * (1 - ramp(T, at + 4.0, at + 4.3)), ls: 9 });
    slam(ctx, `${a} ${b}`, W / 2, 545, { t: T, tin: at + 0.15, tout: at + 4.1, size: 150, weight: 900, ls: -6 });
    font(ctx, 150, 900, SANS, -6);
    const tw = ctx.measureText(`${a} ${b}`).width;
    dimension(ctx, W / 2 - tw / 2, W / 2 + tw / 2, 640, cfg.kind === 'hardware' ? 'HARDWARE' : 'SOFTWARE SERVICES', A,
      ramp(T, at + 0.8, at + 1.3) * (1 - ramp(T, at + 3.9, at + 4.2)));
  }

  // The steps of the flow, as a measured track along the top.
  function steps(ctx, T, cfg, sh) {
    const A = cfg.accent;
    const cuts = cfg.cuts.filter((c) => c.step && c.step.includes('·'));
    const i = cuts.indexOf(sh.cut);
    const live = sh.cut.step;
    if (!live) return;
    band(ctx);
    const first = cuts[0].at;
    const a = ramp(T, first, first + 0.4);
    const x0 = 64, y = 1000 - 940, gap = 26;
    font(ctx, 19, 500, MONO, 3);
    let x = x0;
    ctx.save();
    ctx.globalAlpha = a;
    cuts.forEach((c, j) => {
      const text = c.step;
      const w = ctx.measureText(text).width + 40;
      const on = c === sh.cut, done = i < 0 ? true : j < i;
      ctx.fillStyle = on ? A : done ? 'rgba(8,12,20,0.9)' : 'rgba(8,12,20,0.7)';
      ctx.beginPath(); ctx.roundRect(x, y, w, 44, 22); ctx.fill();
      if (!on) { ctx.strokeStyle = rgba(A, done ? 0.8 : 0.3); ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = on ? '#071018' : done ? A : 'rgba(255,255,255,0.55)';
      font(ctx, 19, on ? 700 : 500, MONO, 3);
      ctx.fillText(text, x + 20, y + 29);
      x += w + gap;
    });
    ctx.restore();
    if (i < 0) tag(ctx, T, sh.cut.at, live === 'RE-COSTING' ? 'RE-COSTING WITH THE LATEST DATA' : 'CALCULATING SHOULD COST', A, 140);
    // Waiting is sped up, and says so.
    if (i < 0) {
      const n = (sh.srcT - sh.cut.src[0]) / ((sh.cut.src[1] - sh.cut.src[0]) / sh.cut.dur);
      label(ctx, `▶▶ ${Math.round((sh.cut.src[1] - sh.cut.src[0]) / sh.cut.dur)}×`, W - 64, 100, { size: 24, color: A, align: 'right', alpha: ramp(T, sh.cut.at, sh.cut.at + 0.2) * (n >= 0 ? 1 : 0), ls: 3 });
    }
  }

  function value(ctx, T, at, cfg) {
    const A = cfg.accent;
    grid(ctx, T, A, ramp(T, at, at + 0.4));
    const hw = cfg.kind === 'hardware';
    const words = hw ? ['Any vendor.', 'Any model.', 'The current cost, in seconds.'] : ['A defensible number,', 'before the first quote arrives.'];
    const times = hw ? [0.4, 1.4, 2.4] : [0.4, 1.6];
    words.forEach((wd, i) => rise(ctx, wd, W / 2, 300 + i * 110, { t: T, tin: at + times[i], tout: at + cfg.cuts.find((c) => c.id === 'value').dur - 0.6, size: i === words.length - 1 ? 76 : 76, weight: 850, align: 'center', ls: -2, color: i === words.length - 1 ? A : INK, stagger: 0.02 }));
    // The D2C record, from its own landing page.
    const r = ramp(T, at + (hw ? 4.0 : 3.2), at + (hw ? 4.4 : 3.6));
    if (r > 0) {
      const out = 1 - ramp(T, at + cfg.cuts.find((c) => c.id === 'value').dur - 0.6, at + cfg.cuts.find((c) => c.id === 'value').dur - 0.3);
      [['2.7×', 'HIGHER SAVINGS THAN TRADITIONAL METHODS'], ['100%', 'OF HARDWARE, SOFTWARE & SERVICES SPEND']].forEach(([big, small], i) => {
        const x = W / 2 + (i ? 330 : -330);
        ctx.save(); ctx.globalAlpha = r * out;
        font(ctx, 110, 900, SANS, -4); ctx.fillStyle = INK; ctx.textAlign = 'center';
        ctx.fillText(big, x, 760);
        ctx.restore();
        label(ctx, small, x, 810, { size: 18, color: A, align: 'center', alpha: r * out, ls: 4 });
      });
    }
  }

  function endCard(ctx, T, at, cfg) {
    const A = cfg.accent, t = T - at;
    grid(ctx, T, A, 0.7);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, rgba(A, 0.2)); g.addColorStop(1, rgba(A, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 280 - 55 * s, 110 * s, 110 * s);
    const [a, b] = cfg.title;
    rise(ctx, `${a} ${b}`, W / 2, 520, { t: T, tin: at + 0.6, size: 124, weight: 850, align: 'center', ls: -4, stagger: 0.03 });
    font(ctx, 124, 850, SANS, -4);
    const tw = ctx.measureText(`${a} ${b}`).width;
    dimension(ctx, W / 2 - tw / 2, W / 2 + tw / 2, 600, 'DESIGN TO COST', A, ramp(t, 1.2, 1.8));
    rise(ctx, cfg.tagline, W / 2, 700, { t: T, tin: at + 1.6, size: 48, weight: 600, align: 'center', by: 'word', stagger: 0.07, color: 'rgba(255,255,255,0.92)' });
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, sh }) {
      const A = cfg.accent;
      const { id, at, dur } = sh.cut;
      const hw = cfg.kind === 'hardware';
      if (id === 'open') {
        grid(ctx, T, A, 1);
        if (hw) {
          rise(ctx, 'Every hardware renewal comes down to one question.', W / 2, 200, { t: T, tin: 0.6, tout: 3.6, size: 50, weight: 600, align: 'center', by: 'word', stagger: 0.05 });
          slam(ctx, 'What should this cost, today?', W / 2, 220, { t: T, tin: 3.9, tout: 12.6, size: 96, weight: 900, ls: -3 });
          unit(ctx, T, A);
        } else {
          form(ctx, T, A);
          rise(ctx, "For software services, it's usually the supplier's quote.", W / 2, 880, { t: T, tin: 7.0, tout: 10.6, size: 52, weight: 700, align: 'center', by: 'word', stagger: 0.05 });
        }
      }
      if (id === 'title') title(ctx, T, at, cfg);
      if (sh.cut.step) steps(ctx, T, cfg, sh);
      if (id === 'result') {
        if (hw) scrim(ctx, 'right', 0.7, 0.55);
        if (hw) reprice(ctx, T, at, A);
        else {
          K.fadeBlack(ctx, 0.55 * ramp(T, at + 0.6, at + 1.2) * (1 - ramp(T, at + dur - 0.6, at + dur)));
          range(ctx, T, at, A);
        }
      }
      if (id === 'basis') band(ctx);
      if (id === 'basis') tag(ctx, T, at, 'THE BENCHMARK BEHIND THE NUMBER', A, 64);
      if (id === 'value') value(ctx, T, at, cfg);
      if (id === 'end') endCard(ctx, T, at, cfg);
    },
  };
})();
