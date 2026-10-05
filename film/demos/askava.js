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
  function tag(ctx, T, at, text, accent, y = 64) {
    const a = ramp(T, at, at + 0.3);
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = 'rgba(8,9,14,0.88)';
    ctx.beginPath(); ctx.roundRect(64, y, w, 52, 26); ctx.fill();
    ctx.restore();
    label(ctx, text, 86, y + 35, { size: 22, color: accent, alpha: a, ls: 5 });
  }

  /* The people who ask: each question tagged with who is asking, across
   * roles and markets. They gather into one point, which becomes AVA. */
  function questions(ctx, T, accent) {
    const qs = [
      ['CATEGORY MANAGER', 'What is the LD cap across my contracts?'],
      ['LOCAL MARKET \u00b7 BUYER', 'How do I raise a PO?'],
      ['SOURCING', 'Which suppliers are on this framework?'],
      ['FINANCE', 'Why was my invoice rejected?'],
      ['SUPPLIER MANAGEMENT', 'How do I onboard a new supplier?'],
      ['BUSINESS USER', 'How do I create a PR?'],
      ['LOCAL MARKET \u00b7 ITALY', 'Where is my order?'],
      ['CONTRACTS', 'When does this agreement renew?'],
    ];
    const spots = [[560, 250], [1400, 220], [330, 470], [1180, 430], [760, 690], [1560, 640], [380, 880], [1250, 860]];
    const gather = eio(ramp(T, 9.4, 10.6));
    qs.forEach(([who, q], i) => {
      const a = 0.4 + i * 0.55;
      const k = back(ramp(T, a, a + 0.35));
      if (k <= 0) return;
      const [sx, sy] = spots[i];
      const x = lerp(sx, W / 2, gather), y = lerp(sy + Math.sin(T * 0.8 + i) * 8, H / 2, gather);
      font(ctx, 32, 600, SANS, 0);
      const w = ctx.measureText(q).width + 56;
      const dim = 1 - 0.5 * ramp(T, 7.4, 8.0);
      ctx.save();
      ctx.globalAlpha = clamp(k) * dim * (1 - gather);
      ctx.translate(x, y);
      ctx.scale(k * lerp(1, 0.2, gather), k * lerp(1, 0.2, gather));
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-w / 2, -34, w, 68, 24); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText(q, 0, 11);
      font(ctx, 15, 500, MONO, 4);
      ctx.fillStyle = accent; ctx.textAlign = 'left';
      ctx.fillText(who, -w / 2 + 18, -46);
      ctx.restore();
    });
    rise(ctx, 'Hundreds of questions. Thousands of documents.', W / 2, 1000, { t: T, tin: 7.6, tout: 9.4, size: 40, weight: 600, align: 'center', by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.88)' });
    const dot = eo5(ramp(T, 10.3, 10.8)) * (1 - ramp(T, 10.9, 11.0));
    if (dot > 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(W / 2, H / 2, 40 * dot, 0, 7); ctx.fill(); }
  }

  function sources(ctx, T, at, dur, accent) {
    const t = T - at, out = dur - 0.5;
    rise(ctx, 'One place for every answer.', W / 2, 190, { t: T, tin: at + 0.3, tout: at + out, size: 72, weight: 800, align: 'center', by: 'word', stagger: 0.07, ls: -2 });
    const cx = W / 2, cy = 600;
    const items = [['PROCESS GUIDES', -580, -230], ['POLICIES & FAQs', -640, 0], ['SOURCING KNOWLEDGE', -580, 230],
      ['CONTRACTS', 580, -230], ['SUPPLIER INFORMATION', 640, 0], ['BUSINESS DATA', 580, 230]];
    items.forEach(([name, dx, dy], i) => {
      const a = ramp(t, 0.9 + i * 0.4, 1.3 + i * 0.4) * (1 - ramp(t, out, out + 0.4));
      if (a <= 0) return;
      const x = cx + dx, y = cy + dy;
      font(ctx, 22, 500, MONO, 4);
      const w = ctx.measureText(name).width + 48;
      // The line in, with light running along it towards AVA.
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.moveTo(x + (dx < 0 ? w / 2 : -w / 2), y); ctx.lineTo(cx + (dx < 0 ? -105 : 105), cy + dy * 0.25); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(10,11,16,0.85)'; ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 34, w, 68, 34); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(name, x, y + 8);
      ctx.restore();
    });
    const core = back(ramp(t, 0.4, 0.9)) * (1 - ramp(t, out, out + 0.4));
    if (core > 0) {
      const pulse = 1 + 0.04 * Math.sin(t * 4);
      ctx.save();
      ctx.globalAlpha = clamp(core);
      ctx.shadowColor = accent; ctx.shadowBlur = 60;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(cx, cy, 105 * core * pulse, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      font(ctx, 54, 900, SANS, -1); ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText('AVA', cx, cy + 19);
      ctx.restore();
    }
    label(ctx, 'GROUNDED IN APPROVED DOCUMENTS', W / 2, 960, { size: 20, color: accent, align: 'center', alpha: ramp(t, 4.0, 4.4) * (1 - ramp(t, out, out + 0.4)), ls: 6 });
  }

  /* The day: a clock and who is asking, top left, like a game's HUD. */
  function hud(ctx, T, at, persona, accent, fresh) {
    const [clock, who] = persona.split(' \u00b7 ');
    const a = fresh ? ramp(T, at, at + 0.3) : 1;
    font(ctx, 40, 800, SANS, -1);
    const cw = ctx.measureText(clock).width;
    font(ctx, 20, 500, MONO, 5);
    const ww = ctx.measureText(who).width;
    const w = cw + ww + 88;
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = 'rgba(8,9,14,0.9)';
    ctx.beginPath(); ctx.roundRect(56, 52, w, 70, 35); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    font(ctx, 40, 800, SANS, -1); ctx.fillStyle = INK; ctx.fillText(clock, 86, 102);
    ctx.fillStyle = accent; ctx.fillRect(86 + cw + 18, 70, 2, 34);
    ctx.restore();
    label(ctx, who, 86 + cw + 40, 95, { size: 20, color: accent, alpha: a, ls: 5 });
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
      if (id === 'sources') sources(ctx, T, at, sh.cut.dur, A);
      if (cfg.questions[id]) {
        scrim(ctx, 'center', 0.5);
        bubble(ctx, T, at, sh.cut.dur, cfg.questions[id], A);
      }
      if (id.endsWith('wait')) tag(ctx, T, at, 'AVA IS SEARCHING APPROVED SOURCES', A, 136);
      if (id === 'd1ans') badge(ctx, T, at + 0.5, at + 4.2, 'STEP BY STEP', 'RAISE A PO IN ARIBA', A, 210);
      if (id === 'd2ans') {
        badge(ctx, T, at + 0.5, at + 3.9, 'STEP BY STEP', 'AND WHAT TO DO IF IT IS REJECTED', A, 210);
        outline(ctx, sh, [596, 668, 440, 140], ramp(T, at + 5.0, at + 5.5), A, 'SOURCES CITED');
      }
      if (id === 'd5wait') badge(ctx, T, at + 0.3, at + 2.1, 'SUPPLIER QUERIES', 'ONBOARDING \u00b7 EVERYDAY TASKS', A, 210);
      if (id === 'd6ans') badge(ctx, T, at + 0.6, at + 5.2, 'CONTRACT DATA', 'EVERY CONTRACT \u00b7 ONE QUESTION', A, 210);
      // The day's clock runs through every question and its answer.
      if (sh.cut.persona) {
        const prev = cfg.cuts[cfg.cuts.indexOf(sh.cut) - 1];
        hud(ctx, T, at, sh.cut.persona, A, !(prev && prev.persona === sh.cut.persona));
      }
      if (id === 'value') {
        scrim(ctx, 'center', 0.6);
        const words = [['Faster answers.', INK], ['Fewer files.', INK], ['More confidence.', A]];
        rise(ctx, 'Clear answers, exactly when they are needed.', W / 2, 250, { t: T, tin: at + 0.4, tout: at + 3.6, size: 56, weight: 700, align: 'center', by: 'word', stagger: 0.06 });
        words.forEach(([w, col], i) => rise(ctx, w, W / 2, 420 + i * 140, { t: T, tin: at + 4.2 + i * 1.0, tout: at + 8.0, size: 110, weight: 850, align: 'center', ls: -3, color: col, stagger: 0.025 }));
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
