/* Obligation Management: the film's own graphics, drawn over its shots.
 *
 * Its signature is the case file: a depth gauge that follows the drill from
 * supplier to a single obligation, then a ledger that builds the case line by
 * line (the promise, what happened, the verdict, the claim). Blue, the colour
 * of ink on a signed contract.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const PANEL = 'rgba(8,10,18,0.96)';
  const BAD = '#ff5d6c';

  function tag(ctx, T, at, text, A, y = 64, x = 64, tout = 1e9) {
    const a = ramp(T, at, at + 0.3) * (1 - ramp(T, tout, tout + 0.3));
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.94;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
    ctx.restore();
    label(ctx, text, x + 22, y + 35, { size: 22, color: A, alpha: a, ls: 5 });
  }

  function outline(ctx, sh, r, a, col, text) {
    if (a <= 0) return;
    const [x, y, w, h] = K.toScreen(sh.cam, r);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 12); ctx.stroke();
    ctx.restore();
    if (text) label(ctx, text, x - 6, y + h + 40, { size: 17, color: col, alpha: a, ls: 4 });
  }

  /* The promises a contract makes, and the few anyone checks. */
  function promises(ctx, T, A) {
    const cards = [['DELIVERY', '6 weeks from the PO', 3.0], ['DISCOUNTS', 'at agreed volumes', 4.6],
      ['REBATES', 'when thresholds are hit', 6.4], ['PAYMENT TERMS', 'on the agreed dates', 7.6]];
    const out = ei(ramp(T, 16.6, 17.3));
    rise(ctx, 'Every contract makes promises.', W / 2, 190, { t: T, tin: 0.6, tout: 16.4, size: 64, weight: 800, align: 'center', by: 'word', stagger: 0.06, ls: -1.5 });
    cards.forEach(([name, what, a], i) => {
      const k = back(ramp(T, a, a + 0.4));
      if (k <= 0) return;
      const cx = W / 2 + (i % 2 ? 300 : -300), cy = 400 + Math.floor(i / 2) * 220;
      // Only the first is ever checked; the rest go grey.
      const checked = i === 0;
      const grey = checked ? 0 : ramp(T, 11.4 + i * 0.3, 12.0 + i * 0.3);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.globalAlpha = clamp(k) * (1 - out) * (1 - 0.55 * grey);
      ctx.fillStyle = PANEL; ctx.strokeStyle = checked ? A : `rgba(255,255,255,${0.35 - 0.2 * grey})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-260, -80, 520, 160, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = A; ctx.fillRect(-260, -80, 6, 160);
      font(ctx, 18, 500, MONO, 5); ctx.fillStyle = A; ctx.fillText(name, -226, -30);
      font(ctx, 40, 750, SANS, -1); ctx.fillStyle = INK; ctx.fillText(what, -226, 28);
      ctx.restore();
      // The verdict on each: checked, or not.
      const v = ramp(T, 10.6 + i * 0.3, 11.0 + i * 0.3) * (1 - out);
      if (v > 0) label(ctx, checked ? '✓ CHECKED' : 'NOT CHECKED', cx + 230, cy - 30, { size: 17, color: checked ? A : BAD, align: 'right', alpha: v, ls: 4 });
    });
    slam(ctx, 'Claims never made.', W / 2, 870, { t: T, tin: 14.0, tout: 16.8, size: 86, weight: 900, color: BAD, ls: -3 });
  }

  /* How deep the drill is: supplier, contract, order, obligation. */
  function depth(ctx, T, cut, sh, A, build) {
    const levels = [['SUPPLIER', 'HP'], ['CONTRACT', 'CT-…092143'], ['PURCHASE ORDER', 'PO-125'], ['OBLIGATION', 'LEAD TIME']];
    const s = sh.srcT;
    const lv = s < 33.2 ? 0 : s < 38.6 ? 1 : s < 42.2 ? 2 : 3;
    const w = 360, slide = eo5(build);
    ctx.save();
    ctx.translate(lerp(-w - 40, 0, slide), 0);
    ctx.fillStyle = '#080a12'; ctx.fillRect(0, 0, w, H);
    ctx.fillStyle = A; ctx.fillRect(w - 4, 0, 4, H);
    label(ctx, 'DRILL-DOWN', 44, 110, { size: 18, color: A, ls: 6 });
    const x = 70, top = 210, gap = 170;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + gap * 3); ctx.stroke();
    ctx.strokeStyle = A; ctx.shadowColor = A; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + gap * lv); ctx.stroke();
    ctx.shadowBlur = 0;
    levels.forEach(([name, id], i) => {
      const y = top + i * gap, on = i === lv, done = i < lv;
      ctx.globalAlpha = on || done ? 1 : 0.4;
      ctx.fillStyle = on || done ? A : '#080a12';
      ctx.strokeStyle = on || done ? A : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, on ? 16 : 11, 0, 7); ctx.fill(); ctx.stroke();
      font(ctx, 17, 500, MONO, 4); ctx.fillStyle = on ? A : 'rgba(255,255,255,0.75)'; ctx.fillText(name, x + 36, y - 8);
      font(ctx, on ? 34 : 26, 800, SANS, -0.5); ctx.fillStyle = INK; ctx.fillText(id, x + 36, y + 30);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  /* The case, built a line at a time beside the evidence. */
  function ledger(ctx, T, cfg, step, at, A) {
    const first = cfg.cuts.find((c) => c.ledger === 1);
    const last = cfg.cuts.find((c) => c.ledger === 4);
    const k = eo5(ramp(T, first.at + 0.4, first.at + 1.0)) * (1 - ei(ramp(T, last.at + last.dur - 0.5, last.at + last.dur)));
    if (k <= 0) return;
    const x = lerp(W + 40, 1370, k), y = 120, w = 520, h = 800;
    ctx.save();
    ctx.fillStyle = PANEL; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill();
    ctx.restore();
    const L = x + 40;
    label(ctx, 'THE CASE · PO-125', L, y + 56, { size: 18, color: A, ls: 5 });
    const rows = [
      [1, 'THE PROMISE', 'Lead time 6 weeks', INK, 'CONTRACT CLAUSE · SIRION'],
      [2, 'WHAT HAPPENED', '8.86 weeks', INK, 'PO 29 APR → GOODS 30 JUN'],
      [3, 'THE VERDICT', 'Violated', BAD, '3 WEEKS LATE'],
    ];
    rows.forEach(([n, head, big, col, small], i) => {
      const startCut = cfg.cuts.find((c) => c.ledger === n);
      const a = ramp(T, startCut.at + (n === 1 ? 1.2 : 0.4), startCut.at + (n === 1 ? 1.6 : 0.8));
      if (a <= 0) return;
      const ry = y + 120 + i * 140;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(L, ry - 34, w - 80, 1);
      ctx.restore();
      label(ctx, head, L, ry, { size: 16, color: 'rgba(255,255,255,0.65)', alpha: a, ls: 4 });
      ctx.save(); ctx.globalAlpha = a;
      font(ctx, 46, 850, SANS, -1.5); ctx.fillStyle = col; ctx.fillText(big, L, ry + 52);
      ctx.restore();
      label(ctx, small, L, ry + 86, { size: 15, color: n === 3 ? BAD : A, alpha: a, ls: 3 });
    });
    // The claim, worked through in front of you.
    const c = cfg.cuts.find((c) => c.ledger === 4);
    const t = T - c.at;
    if (t > 0) {
      const ry = y + 540;
      label(ctx, 'THE CLAIM', L, ry, { size: 16, color: 'rgba(255,255,255,0.65)', alpha: ramp(t, 0.3, 0.6), ls: 4 });
      const parts = [['3 wks', 1.8], ['× 10%', 2.8], ['× 359,352', 4.4]];
      let px = L;
      font(ctx, 30, 700, MONO, 0);
      parts.forEach(([p, when]) => {
        const a = ramp(t, when, when + 0.3);
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = INK; ctx.fillText(p, px, ry + 46); ctx.restore();
        px += ctx.measureText(p + ' ').width;
      });
      const cap = ramp(t, 6.4, 6.8);
      label(ctx, '✓ BELOW THE 50% CAP (179,676)', L, ry + 90, { size: 15, color: A, alpha: cap, ls: 3 });
      const fin = ramp(t, 8.0, 8.3);
      if (fin > 0) {
        const v = 107806 * eo5(ramp(t, 8.0, 9.2));
        ctx.save(); ctx.globalAlpha = fin;
        font(ctx, 76, 900, SANS, -3); ctx.fillStyle = A;
        ctx.fillText('£' + Math.round(v).toLocaleString('en-GB'), L, ry + 180);
        ctx.restore();
      }
    }
  }

  function chips(ctx, T, at, items, A, x0, y0, title) {
    label(ctx, title, x0, y0, { size: 18, color: A, alpha: ramp(T, at, at + 0.3), ls: 5 });
    items.forEach((it, i) => {
      const a = back(ramp(T, at + 0.4 + i * 0.25, at + 0.75 + i * 0.25));
      if (a <= 0) return;
      font(ctx, 26, 700, SANS, 0);
      const w = ctx.measureText(it).width + 56;
      const y = y0 + 40 + i * 74;
      ctx.save();
      ctx.translate(x0, y);
      ctx.scale(clamp(a), clamp(a));
      ctx.globalAlpha = clamp(a);
      ctx.fillStyle = PANEL; ctx.strokeStyle = A; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(0, 0, w, 56, 28); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(it, 28, 37);
      ctx.restore();
    });
  }

  function endCard(ctx, T, at, A) {
    const t = T - at;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, 'rgba(91,140,255,0.24)'); g.addColorStop(1, 'rgba(91,140,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 280 - 55 * s, 110 * s, 110 * s);
    rise(ctx, 'Obligation Management', W / 2, 520, { t: T, tin: at + 0.6, size: 124, weight: 850, align: 'center', ls: -4, stagger: 0.03 });
    const bar = eio(ramp(t, 1.2, 1.9));
    ctx.fillStyle = A; ctx.fillRect(W / 2 - 180 * bar, 568, 360 * bar, 7);
    rise(ctx, 'Promises, kept.', W / 2, 670, { t: T, tin: at + 1.6, size: 56, weight: 650, align: 'center', by: 'word', stagger: 0.08, color: 'rgba(255,255,255,0.92)' });
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, sh }) {
      const A = cfg.accent;
      const { id, at, dur } = sh.cut;
      if (id === 'open') promises(ctx, T, A);
      if (id === 'title') {
        scrim(ctx, 'center', 0.9);
        label(ctx, 'VODAFONE PROCUREMENT · AI', W / 2, 390, { size: 22, color: A, align: 'center', alpha: ramp(T, at + 0.5, at + 0.9) * (1 - ramp(T, at + 3.8, at + 4.1)), ls: 7 });
        slam(ctx, 'Obligation Management', W / 2, 545, { t: T, tin: at + 0.15, tout: at + 3.8, size: 140, weight: 900, ls: -5 });
        const bar = eio(ramp(T, at + 0.6, at + 1.3)) * (1 - ramp(T, at + 3.6, at + 4.1));
        ctx.fillStyle = A; ctx.fillRect(W / 2 - 260 * bar, 595, 520 * bar, 9);
        rise(ctx, 'Every obligation, every purchase order.', W / 2, 685, { t: T, tin: at + 0.9, tout: at + 3.7, size: 48, weight: 600, align: 'center', by: 'word', stagger: 0.06 });
      }
      if (id === 'intro') tag(ctx, T, at + 0.3, 'AI-POWERED OBLIGATION MANAGEMENT', A, 880);
      if (id === 'kpis') {
        const tiles = [[310, 403, 247, 75, 'VIOLATIONS', 0.4], [572, 403, 247, 75, 'POTENTIAL CLAIMS', 1.6], [1359, 403, 247, 75, 'SUPPLIERS IN BREACH', 3.6]];
        tiles.forEach(([x, y, w, h, name, when]) => outline(ctx, sh, [x, y, w, h], ramp(T, at + when, at + when + 0.3), A, name));
      }
      if (sh.cut.level !== undefined) {
        const first = cfg.cuts.find((c) => c.level !== undefined);
        depth(ctx, T, sh.cut, sh, A, ramp(T, first.at, first.at + 0.6));
      }
      if (sh.cut.ledger) ledger(ctx, T, cfg, sh.cut.ledger, at, A);
      if (id === 'configure') {
        scrim(ctx, 'right', 0.8, 0.4);
        tag(ctx, T, at + 0.3, 'CONFIGURE ONCE · APPLIED TO EVERY ORDER', A);
        chips(ctx, T, at + 3.0, ['Delivery', 'Payment', 'Quality', 'Compliance', 'Reporting', 'Support'], A, 1500, 300, 'OBLIGATION TYPES');
      }
      if (id === 'override') {
        scrim(ctx, 'right', 0.8, 0.4);
        tag(ctx, T, at + 0.3, 'HUMAN IN THE LOOP', A);
        chips(ctx, T, at + 2.0, ['Override the AI', 'Adjust the claim', 'Justify it', 'On record'], A, 1460, 330, 'BUYERS · CATEGORY MANAGERS');
      }
      if (id === 'value') {
        scrim(ctx, 'center', 0.6);
        const words = [['Every obligation tracked.', INK], ['Every claim counted.', INK], ['No revenue left on the table.', A]];
        words.forEach(([w, col], i) => rise(ctx, w, W / 2, 360 + i * 130, { t: T, tin: at + 0.4 + i * 1.6, tout: at + dur - 0.6, size: 92, weight: 850, align: 'center', ls: -3, color: col, stagger: 0.02 }));
        label(ctx, 'AND LEVERAGE FOR EVERY SUPPLIER NEGOTIATION', W / 2, 820, { size: 20, color: A, align: 'center', alpha: ramp(T, at + 5.2, at + 5.6) * (1 - ramp(T, at + dur - 0.6, at + dur - 0.3)), ls: 6 });
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
