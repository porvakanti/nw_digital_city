/* Executive Supplier Intelligence: the film's own graphics, over its shots.
 *
 * Its signature is the count: a forty-page pack that riffles, gathers and
 * folds into one screen, and a corner counter that holds it there, "40 → 1",
 * for as long as the film stays on that screen. Emerald, for clarity.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const PANEL = 'rgba(8,12,14,0.96)';

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

  function outline(ctx, sh, r, a, col, text, below = true) {
    if (a <= 0) return;
    const [x, y, w, h] = K.toScreen(sh.cam, r);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(x - 8, y - 8, w + 16, h + 16, 12); ctx.stroke();
    ctx.restore();
    if (text) {
      font(ctx, 18, 500, MONO, 4);
      const tw = ctx.measureText(text).width + 28;
      const ty = below ? y + h + 16 : y - 52;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = PANEL;
      ctx.beginPath(); ctx.roundRect(x - 8, ty, tw, 36, 18); ctx.fill(); ctx.restore();
      label(ctx, text, x + 6, ty + 25, { size: 18, color: col, alpha: a, ls: 4 });
    }
  }

  /* The pack: forty pages riffling, fed by a dozen systems, then folded flat. */
  function pack(ctx, T, A) {
    const fold = eio(ramp(T, 12.8, 14.2));
    const out = ei(ramp(T, 15.4, 16.0));
    const cx = W / 2, cy = 480;
    const pages = 40;
    const shown = Math.floor(clamp(ramp(T, 0.8, 4.4)) * pages);
    rise(ctx, 'Before every supplier meeting:', W / 2, 160, { t: T, tin: 0.6, tout: 12.4, size: 52, weight: 700, align: 'center', by: 'word', stagger: 0.05 });
    // The systems it is pulled from.
    const sys = [['SAP DATASPHERE', -620, -170], ['SIRION CONTRACT WATCH', 620, -200], ['EXIGER', -680, 60],
      ['CRM', 660, 50], ['AVA SOURCING', -560, 270], ['NEWSROOMS & FILINGS', 600, 280]];
    sys.forEach(([name, dx, dy], i) => {
      const a = ramp(T, 5.4 + i * 0.4, 5.8 + i * 0.4) * (1 - ramp(T, 12.2, 12.8));
      if (a <= 0) return;
      const k = eo5(ramp(T, 5.4 + i * 0.4, 6.2 + i * 0.4));
      const x = cx + dx * lerp(1.15, 1, k), y = cy + dy;
      font(ctx, 20, 500, MONO, 4);
      const w = ctx.measureText(name).width + 40;
      ctx.save(); ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -T * 40;
      ctx.beginPath(); ctx.moveTo(x + (dx < 0 ? w / 2 : -w / 2), y); ctx.lineTo(cx + (dx < 0 ? -190 : 190), cy + dy * 0.3); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PANEL; ctx.strokeStyle = A; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 26, w, 52, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(name, x, y + 7);
      ctx.restore();
    });
    // Pages, stacked with a riffle, folding into one screen.
    ctx.save();
    ctx.globalAlpha = 1 - out;
    for (let i = 0; i < shown; i++) {
      const off = (pages - i) * lerp(3.2, 0, fold);
      const wob = Math.sin(T * 3 + i * 0.7) * 2 * (1 - fold);
      const pw = lerp(300, 560, fold), ph = lerp(400, 330, fold);
      ctx.save();
      ctx.translate(cx + off * 0.6 + wob, cy - off * 0.8 + 20);
      ctx.rotate((i % 2 ? 0.012 : -0.01) * (1 - fold));
      ctx.fillStyle = i === shown - 1 || fold > 0.9 ? '#f4f5f7' : `rgba(230,232,236,${0.6 + 0.4 * (i / pages)})`;
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10;
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
    // The top page: text lines while it is a pack, a dashboard once it is a screen.
    if (shown > 0) {
      const pw = lerp(300, 560, fold), ph = lerp(400, 330, fold);
      ctx.save();
      ctx.translate(cx, cy + 20);
      if (fold < 0.5) {
        ctx.fillStyle = '#c9ccd3';
        for (let l = 0; l < 11; l++) ctx.fillRect(-pw / 2 + 28, -ph / 2 + 40 + l * 30, pw - 56 - (l % 3) * 40, 9);
      } else {
        const a = ramp(fold, 0.5, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#2a2d33'; ctx.fillRect(-pw / 2 + 20, -ph / 2 + 20, pw - 40, 70);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-pw / 2 + 20 + i * ((pw - 40) / 4), -ph / 2 + 104, (pw - 40) / 4 - 10, 50); }
        ctx.fillStyle = A; ctx.fillRect(-pw / 2 + 20, -ph / 2 + 168, 90, 14);
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#e1e4ea'; ctx.fillRect(-pw / 2 + 20 + i * ((pw - 40) / 3), -ph / 2 + 196, (pw - 40) / 3 - 10, 110); }
      }
      ctx.restore();
    }
    ctx.restore();
    // The count, then the fold.
    const n = fold > 0 ? Math.round(lerp(40, 1, fold)) : shown;
    const ca = ramp(T, 0.8, 1.1) * (1 - out);
    if (ca > 0) {
      ctx.save(); ctx.globalAlpha = ca;
      font(ctx, 120, 900, SANS, -4); ctx.fillStyle = fold > 0.95 ? A : INK; ctx.textAlign = 'center';
      ctx.fillText(String(n), cx, 840);
      ctx.restore();
      label(ctx, fold > 0.95 ? 'SCREEN' : n === 1 ? 'PAGE' : 'PAGES', cx, 880, { size: 20, color: A, align: 'center', alpha: ca, ls: 8 });
    }
  }

  // The corner counter that holds the promise while the film is on the screen.
  function counter(ctx, T, A, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(W - 64 - 230, 40, 230, 64, 32); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    font(ctx, 30, 800, SANS, -0.5); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('40', W - 64 - 200, 83);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(W - 64 - 204, 72, 42, 3);
    ctx.fillStyle = INK; ctx.fillText('→', W - 64 - 148, 83);
    ctx.fillStyle = A; ctx.fillText('1', W - 64 - 108, 83);
    ctx.restore();
    label(ctx, 'SCREEN', W - 64 - 82, 80, { size: 16, color: A, alpha: a, ls: 4 });
  }

  function chips(ctx, T, at, items, A, x0, y0, title) {
    label(ctx, title, x0, y0, { size: 18, color: A, alpha: ramp(T, at - 0.3, at), ls: 5 });
    items.forEach(([it, when], i) => {
      const a = back(ramp(T, at + when, at + when + 0.35));
      if (a <= 0) return;
      font(ctx, 26, 700, SANS, 0);
      const w = ctx.measureText(it).width + 56;
      const y = y0 + 30 + i * 68;
      ctx.save();
      ctx.translate(x0, y);
      ctx.scale(clamp(a), clamp(a));
      ctx.globalAlpha = clamp(a);
      ctx.fillStyle = PANEL; ctx.strokeStyle = i < 5 ? A : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(0, 0, w, 54, 27); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(it, 28, 36);
      ctx.restore();
    });
  }

  // The question, typed into a bubble beside the assistant.
  function ask(ctx, T, at, text, A) {
    const per = 0.05;
    const n = Math.min(text.length, Math.max(0, Math.floor((T - at - 0.6) / per)));
    const pop = back(ramp(T, at + 0.3, at + 0.6));
    if (pop <= 0) return;
    font(ctx, 54, 700, SANS, -1);
    const w = ctx.measureText(text).width + 90;
    const x = 80, y = 380;
    ctx.save();
    ctx.globalAlpha = clamp(pop);
    ctx.fillStyle = A; ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.roundRect(x, y, w, 120, 30); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#04140e';
    ctx.fillText(text.slice(0, n), x + 45, y + 78);
    if (n < text.length && Math.floor(T * 3) % 2 === 0) ctx.fillRect(x + 48 + ctx.measureText(text.slice(0, n)).width, y + 32, 4, 56);
    ctx.restore();
    label(ctx, 'ASK AI', x + 4, y - 22, { size: 18, color: A, alpha: clamp(pop), ls: 6 });
  }

  // A PDF slides out, as if from a printer.
  function pdf(ctx, T, at, A) {
    const t = T - at;
    const k = eo5(ramp(t, 2.6, 3.8));
    if (k <= 0) return;
    const x = 1360, y = lerp(H + 20, 250, k), w = 460, h = 600;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(0.04 * (1 - k) + 0.02);
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 50;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e60000'; ctx.fillRect(-w / 2, -h / 2, w, 70);
    font(ctx, 22, 800, SANS, 0); ctx.fillStyle = '#fff'; ctx.fillText('Executive briefing', -w / 2 + 28, -h / 2 + 44);
    font(ctx, 34, 850, SANS, -1); ctx.fillStyle = '#111'; ctx.fillText('Microsoft', -w / 2 + 28, -h / 2 + 124);
    const facts = [['€126m', 'SPEND'], ['83/100', 'PERFORMANCE'], ['2027-03-18', 'RENEWAL']];
    facts.forEach(([v, l], i) => {
      font(ctx, 24, 800, SANS, -0.5); ctx.fillStyle = '#111'; ctx.fillText(v, -w / 2 + 28 + i * 140, -h / 2 + 184);
      font(ctx, 11, 500, MONO, 2); ctx.fillStyle = '#777'; ctx.fillText(l, -w / 2 + 28 + i * 140, -h / 2 + 206);
    });
    font(ctx, 16, 700, SANS, 0); ctx.fillStyle = '#111'; ctx.fillText('Recommended talking points', -w / 2 + 28, -h / 2 + 260);
    ['Align on a 24-month commercial roadmap', 'Confirm resilience and executive ownership', 'Agree renewal strategy and benchmark rights', 'Review delivery actions and 90-day milestones'].forEach((p, i) => {
      font(ctx, 14, 500, SANS, 0); ctx.fillStyle = '#333'; ctx.fillText(`0${i + 1} · ${p}`, -w / 2 + 28, -h / 2 + 296 + i * 30);
    });
    ctx.fillStyle = '#d7dae0';
    for (let l = 0; l < 5; l++) ctx.fillRect(-w / 2 + 28, -h / 2 + 440 + l * 24, w - 56 - (l % 2) * 80, 8);
    ctx.restore();
    label(ctx, 'DESIGNED PDF · READY TO PRINT', x, y - 24, { size: 17, color: A, alpha: k, ls: 4 });
  }

  function endCard(ctx, T, at, A) {
    const t = T - at;
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.6);
    g.addColorStop(0, 'rgba(46,230,166,0.2)'); g.addColorStop(1, 'rgba(46,230,166,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 270 - 55 * s, 110 * s, 110 * s);
    rise(ctx, 'Executive Supplier', W / 2, 470, { t: T, tin: at + 0.6, size: 112, weight: 850, align: 'center', ls: -4, stagger: 0.03 });
    rise(ctx, 'Intelligence', W / 2, 590, { t: T, tin: at + 0.8, size: 112, weight: 850, align: 'center', ls: -4, stagger: 0.03, color: A });
    const bar = eio(ramp(t, 1.3, 2.0));
    ctx.fillStyle = A; ctx.fillRect(W / 2 - 180 * bar, 636, 360 * bar, 7);
    rise(ctx, 'The whole supplier, at a glance.', W / 2, 730, { t: T, tin: at + 1.7, size: 50, weight: 600, align: 'center', by: 'word', stagger: 0.07, color: 'rgba(255,255,255,0.92)' });
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, sh }) {
      const A = cfg.accent;
      const { id, at, dur } = sh.cut;
      if (id === 'open') pack(ctx, T, A);
      if (id === 'title') {
        scrim(ctx, 'center', 0.9);
        label(ctx, 'VODAFONE PROCUREMENT · AI-ASSISTED', W / 2, 370, { size: 22, color: A, align: 'center', alpha: ramp(T, at + 0.5, at + 0.9) * (1 - ramp(T, at + 4.0, at + 4.3)), ls: 7 });
        slam(ctx, 'Executive Supplier', W / 2, 500, { t: T, tin: at + 0.15, tout: at + 4.0, size: 128, weight: 900, ls: -5 });
        slam(ctx, 'Intelligence', W / 2, 630, { t: T, tin: at + 0.45, tout: at + 4.0, size: 128, weight: 900, ls: -5, color: A });
        rise(ctx, 'Forty pages. One screen.', W / 2, 740, { t: T, tin: at + 1.2, tout: at + 3.9, size: 46, weight: 600, align: 'center', by: 'word', stagger: 0.07 });
      }
      const onScreen = ['tiles', 'priorities', 'tabs', 'switch', 'ticker', 'news', 'compare', 'briefing', 'ask'];
      if (onScreen.includes(id)) {
        const first = cfg.cuts.find((c) => c.id === 'tiles');
        const last = cfg.cuts.find((c) => c.id === 'ask');
        counter(ctx, T, A, ramp(T, first.at + 0.5, first.at + 0.9) * (1 - ramp(T, last.at + last.dur - 0.4, last.at + last.dur)));
      }
      if (id === 'tiles') {
        const tiles = [[297, 367, 315, 81, 'SPEND', 1.8], [631, 367, 315, 81, 'CONTRACTS', 3.0], [964, 367, 315, 81, 'SOURCING EVENTS', 3.8], [1298, 367, 317, 81, 'RISK · RED / AMBER / GREEN', 5.2]];
        tiles.forEach(([x, y, w, h, n, when]) => outline(ctx, sh, [x, y, w, h], ramp(T, at + when, at + when + 0.3) * (1 - ramp(T, at + dur - 0.4, at + dur)), A, n));
      }
      if (id === 'priorities') {
        const cards = [[297, 742, 428, 272, 'SAP / DATASPHERE', 1.4], [741, 742, 428, 272, 'EXIGER', 2.2], [1187, 742, 428, 272, 'SIRION CONTRACT WATCH', 3.0]];
        cards.forEach(([x, y, w, h, n, when]) => outline(ctx, sh, [x, y, w, h], ramp(T, at + when, at + when + 0.3), A, n, false));
        tag(ctx, T, at + 0.3, 'LEADERSHIP PRIORITIES · WITH NEXT STEPS', A);
      }
      if (id === 'tabs') tag(ctx, T, at + 0.3, 'EVERY DETAIL · ONE TAB AWAY', A, 860);
      if (id === 'switch') tag(ctx, T, at, 'SWITCH SUPPLIER', A, 860);
      if (id === 'ticker') outline(ctx, sh, [597, 211, 296, 30], ramp(T, at + 1.0, at + 1.4), A, 'LIVE SHARE PRICE');
      if (id === 'news') {
        scrim(ctx, 'right', 0.85, 0.42);
        chips(ctx, T, at, [['Company website', 1.6], ['Financial reports', 3.0], ['Sustainability reports', 3.9], ['Investor relations', 5.2], ['SEC filings', 6.6], ['+ Trusted publishers', 8.4], ['+ Your own sources', 10.4]], A, 1420, 250, 'PRIMARY SOURCES FIRST');
      }
      if (id === 'briefing') tag(ctx, T, at + 0.3, 'DESIGNED PDF \u00b7 IN SECONDS', A, 860);
      if (id === 'ask') ask(ctx, T, at, 'Which contract renews next?', A);
      if (id === 'value') {
        const t = T - at;
        rise(ctx, '40 pages', W / 2, 430, { t: T, tin: at + 0.3, tout: at + dur - 0.6, size: 150, weight: 900, align: 'center', ls: -5, color: 'rgba(255,255,255,0.55)' });
        const sw = eio(ramp(t, 1.0, 1.4)) * (1 - ramp(t, dur - 0.6, dur - 0.3));
        font(ctx, 150, 900, SANS, -5);
        const tw = ctx.measureText('40 pages').width;
        ctx.fillStyle = A; ctx.fillRect(W / 2 - tw / 2 - 10, 380, (tw + 20) * sw, 10);
        rise(ctx, 'on one screen.', W / 2, 600, { t: T, tin: at + 1.4, tout: at + dur - 0.6, size: 150, weight: 900, align: 'center', ls: -5, color: A });
        rise(ctx, 'Ready before the meeting starts.', W / 2, 740, { t: T, tin: at + 2.8, tout: at + dur - 0.6, size: 52, weight: 600, align: 'center', by: 'word', stagger: 0.06 });
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
