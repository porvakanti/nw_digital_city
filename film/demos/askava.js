/* AskAVA: the film's own graphics, drawn over its shots.
 *
 * Its signature is the question: typed large in a violet chat bubble over the
 * dimmed app, sent, and answered by the real thing. Violet, because it is the
 * product's own colour.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, back, clamp, lerp, rise, slam, label, badge, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';

  // The question, typed into a bubble, then sent up out of frame.
  function bubble(ctx, T, at, dur, text, accent) {
    const per = Math.min(0.045, (dur - 0.9) / text.length);
    const n = Math.min(text.length, Math.floor((T - at - 0.25) / per));
    const sent = eio(ramp(T, at + dur - 0.4, at + dur));
    const pop = back(ramp(T, at, at + 0.3));
    if (pop <= 0) return;
    font(ctx, 52, 650, SANS, -0.5);
    // Wrap to two lines at most, sized to the whole question so it does not jump.
    const words = text.split(' ');
    const lines = [''];
    for (const w of words) {
      const tryLine = (lines[lines.length - 1] + ' ' + w).trim();
      if (ctx.measureText(tryLine).width > 1180 && lines[lines.length - 1]) lines.push(w);
      else lines[lines.length - 1] = tryLine;
    }
    const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 96;
    const bh = 64 * lines.length + 60;
    const cx = W / 2, cy = lerp(H / 2, H * 0.18, sent);
    ctx.save();
    ctx.globalAlpha = clamp(pop) * (1 - sent);
    ctx.translate(cx, cy);
    ctx.scale(lerp(pop, 0.6, sent), lerp(pop, 0.6, sent));
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 32); ctx.fill();
    ctx.shadowBlur = 0;
    // The tail, bottom right, as the product draws the user's own messages.
    ctx.beginPath(); ctx.moveTo(bw / 2 - 70, bh / 2 - 2); ctx.lineTo(bw / 2 - 18, bh / 2 + 34); ctx.lineTo(bw / 2 - 30, bh / 2 - 2); ctx.fill();
    ctx.fillStyle = INK;
    let left = n;
    lines.forEach((l, i) => {
      const shown = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      ctx.fillText(shown, -bw / 2 + 48, -bh / 2 + 76 + i * 64);
      if (left < 0 && left > -l.length - 2 && Math.floor(T * 3) % 2 === 0) {
        const cw = ctx.measureText(shown).width;
        ctx.fillRect(-bw / 2 + 50 + cw, -bh / 2 + 34 + i * 64, 4, 52);
      }
    });
    ctx.restore();
    label(ctx, 'ASK AVA', cx, cy - bh / 2 - 34, { size: 18, color: INK, align: 'center', alpha: clamp(pop) * (1 - sent) * 0.8, ls: 6 });
  }

  // A rectangle of the source, outlined on screen through the camera.
  function outline(ctx, sh, r, a, accent, text) {
    if (a <= 0) return;
    const [x, y, w, h] = K.toScreen(sh.cam, r);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.shadowColor = accent; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.roundRect(x - 14, y - 10, w + 28, h + 20, 12); ctx.stroke();
    ctx.restore();
    if (text) label(ctx, text, x - 14, y - 26, { size: 20, color: accent, alpha: a, ls: 4 });
  }

  // A small tag, top left, on a dark pill so it reads over the white app.
  function tag(ctx, T, at, text, accent) {
    const a = ramp(T, at, at + 0.3);
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = 'rgba(8,9,14,0.88)';
    ctx.beginPath(); ctx.roundRect(64, 64, w, 52, 26); ctx.fill();
    ctx.restore();
    label(ctx, text, 86, 99, { size: 22, color: accent, alpha: a, ls: 5 });
  }

  function questions(ctx, T, accent) {
    const qs = ['How do I raise a PO?', 'How do I submit an invoice?', 'Where is my order?',
      'What is the LD cap on this contract?', 'How do I onboard a supplier?', 'Which form do I need?'];
    const spots = [[520, 300], [1380, 260], [380, 560], [1260, 520], [720, 780], [1500, 760]];
    qs.forEach((q, i) => {
      const a = 0.5 + i * 0.5;
      const k = back(ramp(T, a, a + 0.35));
      if (k <= 0) return;
      const gather = eio(ramp(T, 5.6, 6.8));
      const [sx, sy] = spots[i];
      const x = lerp(sx, W / 2, gather), y = lerp(sy + Math.sin(T * 0.8 + i) * 8, H / 2, gather);
      font(ctx, 34, 600, SANS, 0);
      const w = ctx.measureText(q).width + 56;
      const dim = 1 - 0.55 * ramp(T, 4.0, 4.6);
      ctx.save();
      ctx.globalAlpha = clamp(k) * dim * (1 - gather);
      ctx.translate(x, y);
      ctx.scale(k * lerp(1, 0.2, gather), k * lerp(1, 0.2, gather));
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-w / 2, -36, w, 72, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText(q, 0, 12);
      ctx.restore();
    });
    // What every question runs into.
    rise(ctx, 'The answers are buried in documents.', W / 2, 990, { t: T, tin: 4.3, tout: 6.0, size: 40, weight: 600, align: 'center', by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.85)' });
    const dot = eo5(ramp(T, 6.4, 6.9)) * (1 - ramp(T, 6.9, 7.0));
    if (dot > 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 * dot, 0, 7); ctx.fill(); }
  }

  function sources(ctx, T, at, accent) {
    const t = T - at;
    rise(ctx, 'One place for every answer.', W / 2, 200, { t: T, tin: at + 0.3, tout: at + 5.5, size: 72, weight: 800, align: 'center', by: 'word', stagger: 0.07, ls: -2 });
    const cx = W / 2, cy = 590;
    const items = [['PROCESS GUIDES', -560, -150], ['POLICIES & FAQs', -560, 150], ['CONTRACTS', 560, -150], ['SUPPLIER KNOW-HOW', 560, 150]];
    items.forEach(([name, dx, dy], i) => {
      const a = ramp(t, 0.9 + i * 0.35, 1.3 + i * 0.35) * (1 - ramp(t, 5.5, 5.9));
      if (a <= 0) return;
      const x = cx + dx, y = cy + dy;
      // The line in, with light running along it towards AVA.
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.moveTo(x + (dx < 0 ? 170 : -170), y); ctx.lineTo(cx + (dx < 0 ? -110 : 110), cy); ctx.stroke();
      ctx.setLineDash([]);
      font(ctx, 22, 500, MONO, 4);
      const w = ctx.measureText(name).width + 48;
      ctx.fillStyle = 'rgba(10,11,16,0.85)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 34, w, 68, 34); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(name, x, y + 8);
      ctx.restore();
    });
    const core = back(ramp(t, 0.4, 0.9)) * (1 - ramp(t, 5.5, 5.9));
    if (core > 0) {
      const pulse = 1 + 0.04 * Math.sin(t * 4);
      ctx.save();
      ctx.globalAlpha = clamp(core);
      ctx.shadowColor = accent; ctx.shadowBlur = 60;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(cx, cy, 100 * core * pulse, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      font(ctx, 54, 900, SANS, -1); ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText('AVA', cx, cy + 19);
      ctx.restore();
    }
  }

  function endCard(ctx, T, at, accent) {
    const t = T - at;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, 'rgba(143,107,255,0.28)'); g.addColorStop(1, 'rgba(143,107,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 300 - 55 * s, 110 * s, 110 * s);
    rise(ctx, 'AskAVA', W / 2, 560, { t: T, tin: at + 0.6, size: 160, weight: 850, align: 'center', ls: -5, stagger: 0.04 });
    const bar = eio(ramp(t, 1.2, 1.9));
    ctx.fillStyle = accent; ctx.fillRect(W / 2 - 180 * bar, 600, 360 * bar, 7);
    rise(ctx, 'Answers, just a question away.', W / 2, 690, { t: T, tin: at + 1.5, size: 50, weight: 600, align: 'center', by: 'word', stagger: 0.07, color: 'rgba(255,255,255,0.92)' });
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, M, sh }) {
      const A = cfg.accent;
      const id = sh.cut.id;
      const at = sh.cut.at;
      if (id === 'open') questions(ctx, T, A);
      if (id === 'title') {
        scrim(ctx, 'center', ramp(T, at, at + 0.4) * 0.9);
        slam(ctx, 'AskAVA', W / 2, 560, { t: T, tin: at + 0.2, tout: at + 4.6, size: 220, weight: 900, ls: -8 });
        const bar = eio(ramp(T, at + 0.6, at + 1.3)) * (1 - ramp(T, at + 4.4, at + 4.9));
        ctx.fillStyle = A; ctx.fillRect(W / 2 - 260 * bar, 612, 520 * bar, 9);
        rise(ctx, 'Your AI procurement assistant.', W / 2, 700, { t: T, tin: at + 0.9, tout: at + 4.5, size: 52, weight: 600, align: 'center', by: 'word', stagger: 0.07 });
      }
      if (id === 'sources') sources(ctx, T, at, A);
      if (cfg.questions[id]) {
        scrim(ctx, 'center', 0.5);
        bubble(ctx, T, at, sh.cut.dur, cfg.questions[id], A);
      }
      if (id === 'q1wait' || id === 'ldwait') tag(ctx, T, at, 'AVA IS SEARCHING APPROVED SOURCES', A);
      if (id === 'q1ans') {
        badge(ctx, T, at + 0.5, at + 4.6, 'STEP BY STEP', 'FROM APPROVED PROCESS DOCUMENTS', A);
        const refs = ramp(T, at + 5.6, at + 6.1);
        outline(ctx, sh, [596, 668, 440, 140], refs, A, 'SOURCES CITED');
      }
      if (id === 'q2ans') tag(ctx, T, at, 'RAISE A REQUISITION', A);
      if (id === 'q3ans') tag(ctx, T, at, 'CHECK AN ORDER', A);
      if (id === 'ldans') badge(ctx, T, at + 0.6, at + 5.2, 'CONTRACT DATA', 'EVERY CONTRACT · ONE QUESTION', A);
      if (id === 'value') {
        scrim(ctx, 'center', 0.6);
        const words = [['Faster answers.', INK], ['Fewer files.', INK], ['More confidence.', A]];
        words.forEach(([w, col], i) => rise(ctx, w, W / 2, 420 + i * 140, { t: T, tin: at + 0.4 + i * 1.1, tout: at + 6.3, size: 110, weight: 850, align: 'center', ls: -3, color: col, stagger: 0.025 }));
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
