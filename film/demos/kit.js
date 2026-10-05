/* The demo films' type kit and camera, shared by every film in the series.
 *
 * The same voice as the Digital City reel: Inter Tight for words, JetBrains
 * Mono for labels, type that rises from behind a mask, a word that lands,
 * captions on a dark band. Each film brings its own accent colour. Everything
 * is a function of T, the film's time in seconds, so any frame renders alone
 * and the same every time.
 */
(() => {
  const W = 1920, H = 1080;
  const SANS = '"Inter Tight", "Liberation Sans", Arial, sans-serif';
  const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';
  const INK = '#ffffff', BG = '#07080c', RED = '#e60000';

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const eio = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const eo5 = (u) => 1 - Math.pow(1 - u, 5);
  const ei = (u) => u * u * u;
  const back = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };

  function font(ctx, size, weight = 700, family = SANS, ls = 0) {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.letterSpacing = `${ls}px`;
  }

  // Text that rises into place from behind a mask, and leaves the same way.
  function rise(ctx, text, x, y, o) {
    const { size = 64, weight = 700, family = SANS, ls = 0, color = INK, t, tin, tout = 1e9,
      stagger = 0.03, dur = 0.7, align = 'left', by = 'char', outDur = 0.45, alpha = 1 } = o;
    if (t < tin) return 0;
    font(ctx, size, weight, family, ls);
    const parts = by === 'word' ? text.split(/(\s+)/) : [...text];
    const total = ctx.measureText(text).width;
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - size, y - size * 1.05, total + size * 2, size * 1.38);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.35;
    let acc = '', k = 0;
    for (const p of parts) {
      const px = x0 + ctx.measureText(acc).width;
      acc += p;
      if (!p.trim()) continue;
      const a = eo5(ramp(t, tin + k * stagger, tin + k * stagger + dur));
      const b = ei(ramp(t, tout + k * stagger * 0.4, tout + k * stagger * 0.4 + outDur));
      k++;
      if (a <= 0 || b >= 1) continue;
      ctx.globalAlpha = alpha * Math.min(1, a * 1.4) * (1 - b);
      ctx.fillText(p, px, y + (1 - a) * size * 1.15 - b * size * 1.15);
    }
    ctx.restore();
    return total;
  }

  // A word that lands: oversized and soft, snapping to size. Centred on x.
  function slam(ctx, text, x, y, o) {
    const { size = 200, weight = 900, color = INK, t, tin, tout = 1e9, ls = -6, align = 'center' } = o;
    if (t < tin || t > tout + 0.35) return;
    const k = eo5(ramp(t, tin, tin + 0.28));
    const out = ei(ramp(t, tout, tout + 0.3));
    const scale = lerp(1.5, 1, k) * (1 + 0.035 * ramp(t, tin + 0.28, tout)) * lerp(1, 0.94, out);
    ctx.save();
    font(ctx, size, weight, SANS, ls);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = k * (1 - out);
    ctx.filter = k < 1 ? `blur(${((1 - k) * 18).toFixed(1)}px)` : 'none';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 40;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function label(ctx, text, x, y, o = {}) {
    const { size = 18, color = INK, alpha = 1, ls = 3, weight = 500, align = 'left' } = o;
    if (alpha <= 0) return;
    font(ctx, size, weight, MONO, ls);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // A mono label typed out a character at a time, with a cursor.
  function typed(ctx, text, x, y, t, tin, o = {}) {
    if (t < tin) return;
    const n = Math.floor((t - tin) / (o.per || 0.028));
    const tout = o.tout || 1e9;
    const a = 1 - ramp(t, tout, tout + 0.3);
    if (a <= 0) return;
    label(ctx, text.slice(0, n), x, y, { ...o, alpha: a * (o.alpha === undefined ? 1 : o.alpha) });
  }

  function scrim(ctx, side, a, reach = 0.55) {
    if (a <= 0) return;
    const g = side === 'left' ? ctx.createLinearGradient(0, 0, W * reach, 0)
      : side === 'right' ? ctx.createLinearGradient(W, 0, W * (1 - reach), 0)
        : side === 'bottom' ? ctx.createLinearGradient(0, H, 0, H * (1 - reach))
          : ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, `rgba(5,6,10,${0.82 * a})`);
    g.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // A dark panel with a leading edge in the accent sweeps across a cut.
  function wipe(ctx, t, at, accent, dur = 0.42) {
    if (t < at - dur || t > at + dur) return;
    const skew = 260;
    const cover = eio(ramp(t, at - dur, at));
    const leave = eio(ramp(t, at, at + dur));
    const front = lerp(-skew, W + skew, cover);
    const backEdge = lerp(-skew - 40, W + skew, leave);
    ctx.save();
    ctx.fillStyle = BG;
    ctx.beginPath();
    ctx.moveTo(backEdge, 0); ctx.lineTo(front + skew, 0); ctx.lineTo(front, H); ctx.lineTo(backEdge - skew, H);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = accent;
    const edge = (x, wdt) => {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + wdt, 0); ctx.lineTo(x + wdt - skew, H); ctx.lineTo(x - skew, H);
      ctx.closePath(); ctx.fill();
    };
    if (cover < 1) edge(front + skew - 34, 34 + 60 * (1 - cover));
    if (leave > 0) edge(backEdge - 10, 26 + 50 * leave);
    ctx.restore();
  }

  function flash(ctx, t, at, peak = 0.5, color = '255,255,255') {
    const k = 1 - ramp(t, at, at + 0.2);
    if (t < at || k <= 0) return;
    ctx.fillStyle = `rgba(${color},${peak * k * k})`;
    ctx.fillRect(0, 0, W, H);
  }

  function fadeBlack(ctx, a) {
    if (a <= 0) return;
    ctx.fillStyle = `rgba(0,0,0,${clamp(a)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // A pill that pops in at the top of the frame and drops away.
  function badge(ctx, t, a, b, big, small, col, y = 150) {
    if (t < a || t > b + 0.3) return;
    const k = back(ramp(t, a, a + 0.35)) * (1 - ei(ramp(t, b, b + 0.3)));
    if (k <= 0) return;
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.scale(k, k);
    font(ctx, 46, 900, SANS, -0.5);
    const w = Math.max(ctx.measureText(big).width, 260) + 80;
    ctx.globalAlpha = clamp(k);
    ctx.fillStyle = 'rgba(6,7,11,0.86)';
    ctx.beginPath(); ctx.roundRect(-w / 2, -54, w, 104, 14); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(big, 0, 4);
    font(ctx, 17, 500, MONO, 5);
    ctx.fillStyle = INK;
    ctx.fillText(small, 0, 34);
    ctx.restore();
  }

  // Captions on a dark band, one phrase at a time.
  function captions(ctx, T, caps, y = H - 96) {
    const cap = (caps || []).find((c) => T >= c.a && T < c.b);
    if (!cap) return;
    const a = ramp(T, cap.a, cap.a + 0.12) * (1 - ramp(T, cap.b - 0.12, cap.b));
    font(ctx, 34, 600, SANS, 0);
    const w = ctx.measureText(cap.text).width;
    ctx.save();
    ctx.globalAlpha = a * 0.78;
    ctx.fillStyle = '#05060a';
    ctx.beginPath(); ctx.roundRect(W / 2 - w / 2 - 24, y - 42, w + 48, 60, 10); ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(cap.text, W / 2, y);
    ctx.restore();
  }

  // Vignette and a seeded grain, the finish every frame gets.
  let grain = null;
  function finish(ctx, T, fps) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    if (!grain) {
      grain = document.createElement('canvas');
      grain.width = grain.height = 256;
      const g = grain.getContext('2d');
      const img = g.createImageData(256, 256);
      let s = 1337;
      for (let i = 0; i < img.data.length; i += 4) {
        s = (s * 16807) % 2147483647;
        const c = Math.floor((s / 2147483647) * 255);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    const f = Math.floor(T * fps);
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.globalCompositeOperation = 'overlay';
    const ox = (f * 97) % 256, oy = (f * 61) % 256;
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(grain, x, y);
    ctx.restore();
  }

  /* The virtual camera. A shot is a list of keys [u, x, y, w]: at fraction u
   * of the shot, the frame shows the source rectangle at (x, y), w wide and
   * 16:9 tall. Between keys it eases. */
  function camAt(keys, u) {
    if (u <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) {
      const [u1] = keys[i];
      if (u <= u1) {
        const [u0] = keys[i - 1];
        const k = eio((u - u0) / (u1 - u0 || 1));
        return keys[i - 1].slice(1).map((v, j) => lerp(v, keys[i][j + 1], k));
      }
    }
    return keys[keys.length - 1].slice(1);
  }
  // A source rectangle to its place on screen, through a camera rectangle.
  function toScreen(cam, r) {
    const s = W / cam[2];
    return [(r[0] - cam[0]) * s, (r[1] - cam[1]) * s, r[2] * s, r[3] * s];
  }

  window.KIT = { W, H, SANS, MONO, INK, BG, RED, clamp, ramp, lerp, eio, eo5, ei, back, font, rise, slam,
    label, typed, scrim, wipe, flash, fadeBlack, badge, captions, finish, camAt, toScreen };
})();
