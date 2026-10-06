/* Sourcing Negotiation: the film's own graphics, drawn over its shots.
 *
 * Its signature is the dossier: a seven-chapter tracker that lays over the
 * app's own section list and ticks off as the briefing is read, with one
 * number per chapter landing on a card beside it. Amber, the colour of a
 * highlighter on a briefing pack.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const PANEL = 'rgba(9,10,15,0.94)';

  // The three questions, one slammed after another, each pushing the last up.
  function questions(ctx, T, A) {
    const qs = [['Who do we push?', 1.0], ['How much leverage do we have?', 2.7], ["What's a realistic saving target?", 4.6]];
    const out = 6.6;
    qs.forEach(([q, a], i) => {
      const k = eo5(ramp(T, a, a + 0.3));
      if (k <= 0) return;
      const gone = ei(ramp(T, out, out + 0.5));
      const yy = 360 + i * 170;
      const active = i === qs.filter(([, b]) => T >= b).length - 1;
      ctx.save();
      ctx.globalAlpha = k * (1 - gone) * (active ? 1 : 0.38);
      font(ctx, active ? 96 : 72, 850, SANS, -2.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? INK : 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30;
      const s = lerp(1.35, 1, k);
      ctx.translate(W / 2, yy - gone * 60);
      ctx.scale(s, s);
      if (k < 1) ctx.filter = `blur(${((1 - k) * 14).toFixed(1)}px)`;
      ctx.fillText(q, 0, 0);
      ctx.restore();
      if (active && k > 0.5) {
        font(ctx, 96, 850, SANS, -2.5);
        const w = ctx.measureText(q).width * eio(ramp(T, a + 0.2, a + 0.6));
        ctx.fillStyle = A;
        ctx.globalAlpha = 1 - gone;
        ctx.fillRect(W / 2 - w / 2, yy + 26, w, 8);
        ctx.globalAlpha = 1;
      }
    });
  }

  // The work as it is done today: files everywhere, and the hours running.
  function scatter(ctx, T, A) {
    const a0 = 7.0, out = 15.9;
    const files = ['RFP_Laptops_Q1.pdf', 'Bid_Evaluation_v4.xlsx', 'Market_Report_H1.pdf', 'Past_POs_2022-24.csv',
      'Supplier_Scores.docx', 'Pricing_Dell_HP_final2.xlsx', 'BOM_costs.xlsx', 'Risk_notes.txt', 'Lenovo_offer.pdf', 'MSFT_bid.pdf'];
    const spots = [[360, 260], [1500, 230], [260, 560], [1640, 520], [520, 850], [1380, 860], [820, 200], [1300, 760], [560, 740], [1200, 330]];
    const fall = ei(ramp(T, out, out + 0.9));
    files.forEach((f, i) => {
      const a = a0 + 0.25 + i * 0.32;
      const k = back(ramp(T, a, a + 0.35));
      if (k <= 0) return;
      const [sx, sy] = spots[i];
      const rot = Math.sin(i * 2.3) * 0.12 + Math.sin(T * 0.7 + i) * 0.02 + fall * (i % 2 ? 0.5 : -0.5);
      ctx.save();
      ctx.translate(sx, sy + Math.sin(T * 0.9 + i) * 6 + fall * fall * 900);
      ctx.rotate(rot);
      ctx.scale(k, k);
      ctx.globalAlpha = clamp(k) * (1 - fall * 0.6);
      font(ctx, 24, 500, MONO, 1);
      const w = ctx.measureText(f).width + 84;
      ctx.fillStyle = 'rgba(245,246,250,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.roundRect(-w / 2, -32, w, 64, 8); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = A; ctx.fillRect(-w / 2 + 18, -14, 22, 28);
      ctx.fillStyle = '#1a1c22'; ctx.textAlign = 'left';
      ctx.fillText(f, -w / 2 + 54, 8);
      ctx.restore();
    });
    // Hours on the clock, running fast.
    const run = ramp(T, a0 + 0.5, out);
    const secs = Math.floor(run * 5.4 * 3600);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0'), mm = String(Math.floor(secs / 60) % 60).padStart(2, '0'), ss = String(secs % 60).padStart(2, '0');
    const ca = ramp(T, a0 + 0.4, a0 + 0.8) * (1 - ramp(T, out, out + 0.4));
    if (ca > 0) {
      ctx.save();
      ctx.globalAlpha = ca;
      ctx.fillStyle = PANEL;
      ctx.beginPath(); ctx.roundRect(W / 2 - 250, 430, 500, 190, 20); ctx.fill();
      ctx.strokeStyle = A; ctx.lineWidth = 3; ctx.stroke();
      font(ctx, 110, 800, MONO, 0); ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText(`${hh}:${mm}`, W / 2 - 40, 560);
      font(ctx, 48, 800, MONO, 0); ctx.fillStyle = A;
      ctx.fillText(ss, W / 2 + 190, 560);
      ctx.restore();
      label(ctx, 'HOURS · OFFLINE · MANUAL', W / 2, 670, { size: 22, color: A, align: 'center', alpha: ca * ramp(T, 11.5, 12.0), ls: 7 });
    }
  }

  function table(ctx, T, A) {
    const a = 16.2;
    rise(ctx, 'Insights get missed.', W / 2, 400, { t: T, tin: a, tout: 19.4, size: 80, weight: 800, align: 'center', by: 'word', stagger: 0.07, ls: -2, color: 'rgba(255,255,255,0.75)' });
    slam(ctx, 'SAVINGS LEFT', W / 2, 590, { t: T, tin: a + 1.5, tout: 19.5, size: 150, weight: 900, color: A, ls: -5 });
    slam(ctx, 'ON THE TABLE.', W / 2, 740, { t: T, tin: a + 2.1, tout: 19.5, size: 150, weight: 900, ls: -5 });
  }

  // A dark pill, top left, so a label reads over the white app.
  function tag(ctx, T, at, text, A, y = 64, x = 64) {
    const a = ramp(T, at, at + 0.3);
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
    ctx.restore();
    label(ctx, text, x + 22, y + 35, { size: 22, color: A, alpha: a, ls: 5 });
  }

  function outline(ctx, sh, r, a, A, text) {
    if (a <= 0) return;
    const [x, y, w, h] = K.toScreen(sh.cam, r);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = A; ctx.lineWidth = 5; ctx.shadowColor = A; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.roundRect(x - 12, y - 8, w + 24, h + 16, 12); ctx.stroke();
    ctx.restore();
    if (text) tag(ctx, 0, -1, text, A, y - 74, x - 12);
  }

  /* The dossier: seven chapters over the app's own section list. `at` is when
   * it assembles; `cur` is the chapter being read and `u` how far through. */
  function tracker(ctx, T, cfg, cur, u, build) {
    const A = cfg.accent;
    const x = 0, w = 458, top = 0;
    const slide = eo5(build);
    ctx.save();
    ctx.translate(lerp(-w - 40, 0, slide), 0);
    ctx.fillStyle = '#0a0b10';
    ctx.fillRect(x, top, w, H);
    ctx.fillStyle = A; ctx.fillRect(w - 4, 0, 4, H);
    label(ctx, 'NEGOTIATION BRIEFING', 48, 92, { size: 18, color: A, ls: 5 });
    font(ctx, 40, 800, SANS, -1); ctx.fillStyle = INK; ctx.fillText('RFP-2025001', 48, 142);
    label(ctx, 'ENTERPRISE LAPTOPS · Q1 2025', 48, 176, { size: 15, color: 'rgba(255,255,255,0.6)', ls: 3 });
    cfg.chapters.forEach(([, , , , , title], i) => {
      const y = 262 + i * 88;
      const appear = ramp(build, 0.25 + i * 0.09, 0.45 + i * 0.09);
      if (appear <= 0) return;
      const done = i < cur, on = i === cur;
      ctx.save();
      ctx.globalAlpha = appear * (done || on ? 1 : 0.45);
      ctx.translate((1 - eo5(appear)) * -60, 0);
      if (on) {
        ctx.fillStyle = 'rgba(255,176,46,0.14)';
        ctx.fillRect(28, y - 40, w - 60, 72);
        ctx.fillStyle = A; ctx.fillRect(28, y - 40, 5, 72);
      }
      font(ctx, 22, 500, MONO, 2); ctx.fillStyle = on ? A : INK;
      ctx.fillText(String(i + 1).padStart(2, '0'), 52, y + 6);
      font(ctx, 27, on ? 800 : 600, SANS, 0); ctx.fillStyle = INK;
      ctx.fillText(title, 102, y + 7);
      // A tick for a chapter read; a ring filling for the one being read.
      const cx = w - 62, cy = y - 2;
      if (done) {
        ctx.fillStyle = A; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill();
        ctx.strokeStyle = '#111'; ctx.lineWidth = 3.5; ctx.beginPath();
        ctx.moveTo(cx - 7, cy); ctx.lineTo(cx - 2, cy + 6); ctx.lineTo(cx + 8, cy - 6); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.stroke();
        if (on) {
          ctx.strokeStyle = A; ctx.beginPath(); ctx.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    });
    // The evidence meter: how much of the briefing is read.
    const read = clamp((cur + u) / 7);
    const ma = ramp(build, 0.8, 1);
    if (ma > 0) {
      ctx.globalAlpha = ma;
      label(ctx, 'EVIDENCE GATHERED', 48, 935, { size: 16, color: 'rgba(255,255,255,0.65)', ls: 4 });
      label(ctx, `${Math.round(read * 100)}%`, w - 48, 935, { size: 18, color: A, ls: 2, align: 'right' });
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(48, 955, w - 96, 10);
      ctx.fillStyle = A; ctx.fillRect(48, 955, (w - 96) * read, 10);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // One number per chapter, on a card to the right of the page.
  function card(ctx, T, at, dur, ch, i, A) {
    const [name, big, what, sub, when] = ch;
    const a = at + when, b = at + dur - 0.35;
    const k = back(ramp(T, a, a + 0.4)) * (1 - ei(ramp(T, b, b + 0.3)));
    if (k <= 0) return;
    const x = 1480, y = 300, w = 400, h = 330;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(lerp(0.85, 1, clamp(k)), lerp(0.85, 1, clamp(k)));
    ctx.globalAlpha = clamp(k);
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 50;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 22); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = A; ctx.fillRect(-w / 2, -h / 2 + 30, 6, 60);
    ctx.restore();
    const ox = x + 40, alpha = clamp(k);
    label(ctx, `${String(i + 1).padStart(2, '0')} · ${name}`, ox, y + 70, { size: 17, color: A, alpha, ls: 4 });
    // The number counts up where it can.
    const m = big.match(/^([^\d]*)([\d,.]+)(.*)$/);
    let shown = big;
    if (m && !big.includes('/')) {
      const target = parseFloat(m[2].replace(/,/g, ''));
      const dec = (m[2].split('.')[1] || '').length;
      const v = target * eo5(ramp(T, a + 0.1, a + 1.1));
      shown = m[1] + v.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    font(ctx, big.length > 6 ? 72 : 104, 900, SANS, -3);
    ctx.fillStyle = INK; ctx.fillText(shown, ox - 4, y + 186);
    ctx.restore();
    label(ctx, what, ox, y + 236, { size: 17, color: INK, alpha, ls: 3 });
    ctx.save(); ctx.globalAlpha = alpha * 0.7;
    font(ctx, 21, 500, SANS, 0); ctx.fillStyle = INK; ctx.fillText(sub, ox, y + 282);
    ctx.restore();
  }

  function ready(ctx, T, at, A) {
    const t = T - at;
    scrim(ctx, 'center', 0.5);
    // The stamp: dropped onto the briefing, a little crooked.
    const k = ramp(t, 0.25, 0.5);
    if (k > 0) {
      const s = lerp(2.4, 1, eo5(k));
      ctx.save();
      ctx.translate(W / 2, 400);
      ctx.rotate(-0.07);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(k * 1.5);
      font(ctx, 118, 900, SANS, 2);
      const w = ctx.measureText('READY TO NEGOTIATE').width + 100;
      ctx.strokeStyle = A; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.roundRect(-w / 2, -100, w, 170, 18); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(-w / 2 + 16, -84, w - 32, 138, 10); ctx.stroke();
      ctx.fillStyle = A; ctx.textAlign = 'center';
      ctx.fillText('READY TO NEGOTIATE', 0, 26);
      ctx.restore();
    }
    const facts = [['DELL · 88.7%', 'PREFERRED SUPPLIER'], ['70/30', 'DUAL AWARD WITH HP'], ['£154,000', 'PROJECTED SAVINGS']];
    facts.forEach(([big, small], i) => {
      const x = W / 2 + (i - 1) * 520;
      const a = ramp(t, 1.4 + i * 0.35, 1.8 + i * 0.35);
      if (a <= 0) return;
      rise(ctx, big, x, 700, { t: T, tin: at + 1.4 + i * 0.35, size: 76, weight: 850, align: 'center', ls: -2, color: i === 2 ? A : INK });
      label(ctx, small, x, 760, { size: 18, color: 'rgba(255,255,255,0.75)', alpha: a, align: 'center', ls: 5 });
    });
  }

  function endCard(ctx, T, at, A) {
    const t = T - at;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, 'rgba(255,176,46,0.22)'); g.addColorStop(1, 'rgba(255,176,46,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 280 - 55 * s, 110 * s, 110 * s);
    rise(ctx, 'Sourcing Negotiation Agent', W / 2, 520, { t: T, tin: at + 0.6, size: 112, weight: 850, align: 'center', ls: -4, stagger: 0.025 });
    const bar = eio(ramp(t, 1.2, 1.9));
    ctx.fillStyle = A; ctx.fillRect(W / 2 - 180 * bar, 568, 360 * bar, 7);
    rise(ctx, 'Walk into every negotiation fully briefed.', W / 2, 660, { t: T, tin: at + 1.5, size: 50, weight: 600, align: 'center', by: 'word', stagger: 0.07, color: 'rgba(255,255,255,0.92)' });
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, sh }) {
      const A = cfg.accent;
      const { id, at, dur } = sh.cut;
      if (id === 'open') {
        questions(ctx, T, A);
        scatter(ctx, T, A);
        table(ctx, T, A);
      }
      if (id === 'title') {
        scrim(ctx, 'center', 0.9);
        label(ctx, 'VODAFONE PROCUREMENT · AI AGENT', W / 2, 380, { size: 22, color: A, align: 'center', alpha: ramp(T, at + 0.5, at + 0.9) * (1 - ramp(T, at + 3.8, at + 4.1)), ls: 7 });
        slam(ctx, 'Sourcing Negotiation', W / 2, 540, { t: T, tin: at + 0.15, tout: at + 3.8, size: 150, weight: 900, ls: -6 });
        const bar = eio(ramp(T, at + 0.6, at + 1.3)) * (1 - ramp(T, at + 3.6, at + 4.1));
        ctx.fillStyle = A; ctx.fillRect(W / 2 - 260 * bar, 590, 520 * bar, 9);
        rise(ctx, 'From sourcing event to negotiation briefing.', W / 2, 680, { t: T, tin: at + 0.9, tout: at + 3.7, size: 48, weight: 600, align: 'center', by: 'word', stagger: 0.06 });
      }
      if (id === 'agent') tag(ctx, T, at + 0.2, 'SOURCING NEGOTIATION AGENT', A, 860);
      if (id === 'events') {
        outline(ctx, sh, [634, 754, 730, 82], sh.srcT >= 27.4 ? ramp(sh.srcT, 27.4, 27.9) : 0, A);
      }
      if (id === 'generate') {
        const b = ramp(T, at + 1.6, at + 3.6);
        tracker(ctx, T, cfg, -1, 0, b);
        K.badge(ctx, T, at + 0.4, at + 2.4, 'BRIEFING GENERATED', '7 SECTIONS \u00b7 DATA-BACKED', A, 170);
      }
      if (sh.cut.chapter !== undefined) {
        const i = sh.cut.chapter;
        tracker(ctx, T, cfg, i, ramp(T, at, at + dur), 1);
        card(ctx, T, at, dur, cfg.chapters[i], i, A);
      }
      if (id === 'ready') {
        tracker(ctx, T, cfg, 7, 0, 1 - ramp(T, at, at + 0.6));
        ready(ctx, T, at, A);
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
