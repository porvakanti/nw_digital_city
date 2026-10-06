/* Executive Supplier Intelligence: the film's own graphics, over its shots.
 *
 * Its signature is the clock: the film opens on a meeting forty-five minutes
 * away and counts down in the corner while the tour runs, ending with minutes
 * to spare. Emerald, for clarity.
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

  // Minutes until the meeting, counting down from 45:00 at the film's start.
  const clock = (T) => {
    const left = Math.max(0, 45 * 60 - T);
    return `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  };

  /* The meeting: a calendar alert, the countdown already running. */
  function alert(ctx, T, A) {
    const k = back(ramp(T, 0.3, 0.8));
    const out = ei(ramp(T, 3.6, 4.2));
    if (k <= 0 || out >= 1) return;
    const w = 760, h = 230, x = W / 2 - w / 2, y = lerp(-h, 330, eo5(ramp(T, 0.3, 0.9))) - out * 500;
    ctx.save();
    ctx.globalAlpha = clamp(k) * (1 - out);
    ctx.fillStyle = 'rgba(246,247,249,0.97)'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 60;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 28); ctx.fill();
    ctx.shadowBlur = 0;
    // The calendar icon.
    ctx.fillStyle = '#e60000'; ctx.beginPath(); ctx.roundRect(x + 40, y + 50, 120, 130, 18); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 40, y + 88, 120, 92);
    font(ctx, 20, 700, MONO, 3); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('09:00', x + 100, y + 78);
    font(ctx, 56, 900, SANS, -2); ctx.fillStyle = '#111'; ctx.fillText('15', x + 100, y + 158);
    ctx.textAlign = 'left';
    font(ctx, 19, 500, MONO, 4); ctx.fillStyle = '#e60000'; ctx.fillText('UPCOMING · TODAY', x + 196, y + 78);
    font(ctx, 40, 800, SANS, -1); ctx.fillStyle = '#111'; ctx.fillText('Huawei quarterly review', x + 196, y + 128);
    font(ctx, 28, 600, SANS, 0); ctx.fillStyle = '#555'; ctx.fillText('Executive meeting · Board room', x + 196, y + 170);
    ctx.restore();
    // The countdown, big, beneath it.
    const c = ramp(T, 1.0, 1.4) * (1 - out);
    if (c > 0) {
      ctx.save(); ctx.globalAlpha = c;
      font(ctx, 150, 900, MONO, -4); ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.fillText(clock(T), W / 2, 780);
      ctx.restore();
      label(ctx, 'UNTIL THE MEETING', W / 2, 830, { size: 22, color: A, align: 'center', alpha: c, ls: 8 });
    }
  }

  /* The pack: files flicking past at speed, pulled from system after system. */
  function flick(ctx, T, A) {
    const a0 = 4.2, out = 10.9;
    if (T < a0 || T > out + 0.6) return;
    const files = ['Spend_by_market_Q3.xlsx', 'Contract_summary_v7.pptx', 'Risk_register.xlsx', 'Sourcing_history.pdf',
      'Relationship_notes.docx', 'News_digest_week41.pdf', 'Renewals_2027.xlsx', 'Performance_scorecard.pptx',
      'Exec_pack_FINAL_v3.pptx', 'Market_exposure.xlsx'];
    const fade = 1 - ramp(T, out, out + 0.5);
    // A stream of pages, fast, each with its own file name.
    const rate = lerp(2.2, 7.5, ramp(T, a0, a0 + 3));
    const n = Math.floor((T - a0) * rate);
    for (let i = Math.max(0, n - 9); i <= n; i++) {
      const born = a0 + i / rate;
      const u = (T - born) * rate / 9;
      if (u < 0 || u > 1) continue;
      const y = lerp(H + 260, -320, eio(u));
      const x = W / 2 + Math.sin(i * 2.1) * 120;
      const r = Math.sin(i * 1.3) * 0.06;
      ctx.save();
      ctx.globalAlpha = fade * (1 - Math.abs(u - 0.5) * 0.8);
      ctx.translate(x, y); ctx.rotate(r);
      ctx.fillStyle = '#f4f5f7'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30;
      ctx.fillRect(-260, -170, 520, 340);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#d8dbe1';
      for (let l = 0; l < 7; l++) ctx.fillRect(-220, -80 + l * 30, 440 - (l % 3) * 70, 10);
      font(ctx, 22, 600, MONO, 0); ctx.fillStyle = '#e60000'; ctx.fillRect(-220, -132, 14, 26);
      ctx.fillStyle = '#222'; ctx.fillText(files[i % files.length], -196, -112);
      ctx.restore();
    }
    // The systems they come from.
    const sys = [['SAP DATASPHERE', -640, -260], ['SIRION CONTRACT WATCH', 600, -300], ['EXIGER', -700, 20],
      ['CRM', 700, 0], ['AVA SOURCING', -620, 280], ['NEWSROOMS & FILINGS', 600, 300]];
    sys.forEach(([name, dx, dy], i) => {
      const a = ramp(T, 8.3 + i * 0.2, 8.6 + i * 0.2) * fade;
      if (a <= 0) return;
      const x = W / 2 + dx, y = 540 + dy;
      font(ctx, 20, 500, MONO, 4);
      const w = ctx.measureText(name).width + 40;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = PANEL; ctx.strokeStyle = A; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 26, w, 52, 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(name, x, y + 7);
      ctx.restore();
    });
  }

  /* What an executive actually needs: three questions, landing with the voice. */
  function needs(ctx, T, A) {
    const out = 18.4;
    rise(ctx, 'All you really need to know:', W / 2, 300, { t: T, tin: 11.3, tout: out, size: 48, weight: 600, align: 'center', by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.75)' });
    [['How much we spend.', 13.6], ['How risky they are.', 15.1], ["What's coming up.", 16.65]].forEach(([q, a], i) => {
      rise(ctx, q, W / 2, 470 + i * 140, { t: T, tin: a, tout: out, size: 100, weight: 900, align: 'center', ls: -3, stagger: 0.02, color: i === 2 ? A : INK });
    });
  }

  // The countdown, held in the corner while the film is on the screen.
  function countdown(ctx, T, A, a) {
    if (a <= 0) return;
    const w = 410, x = W - 64 - w, y = 40;
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(x, y, w, 64, 32); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = A; ctx.beginPath(); ctx.arc(x + 30, y + 32, 7 + Math.sin(T * 4) * 1.5, 0, 7); ctx.fill();
    ctx.restore();
    label(ctx, 'HUAWEI REVIEW', x + 50, y + 39, { size: 16, color: 'rgba(255,255,255,0.7)', alpha: a, ls: 3 });
    ctx.save(); ctx.globalAlpha = a;
    font(ctx, 30, 800, MONO, 0); ctx.fillStyle = INK; ctx.textAlign = 'right';
    ctx.fillText(clock(T), x + w - 26, y + 43);
    ctx.restore();
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
      if (id === 'open') {
        alert(ctx, T, A);
        flick(ctx, T, A);
        needs(ctx, T, A);
      }
      if (id === 'reveal') {
        const k = ramp(T, at + 0.8, at + 1.2) * (1 - ramp(T, at + dur - 0.4, at + dur));
        if (k > 0) {
          ctx.save(); ctx.globalAlpha = k * 0.85; ctx.fillStyle = PANEL;
          ctx.beginPath(); ctx.roundRect(W / 2 - 250, 880, 500, 92, 46); ctx.fill(); ctx.restore();
          ctx.save(); ctx.globalAlpha = k; font(ctx, 52, 850, SANS, -1.5); ctx.fillStyle = A; ctx.textAlign = 'center';
          ctx.fillText('One screen.', W / 2, 944); ctx.restore();
        }
      }
      if (id === 'title') {
        scrim(ctx, 'center', 0.9);
        label(ctx, 'VODAFONE PROCUREMENT · AI-ASSISTED', W / 2, 370, { size: 22, color: A, align: 'center', alpha: ramp(T, at + 0.5, at + 0.9) * (1 - ramp(T, at + 3.5, at + 3.8)), ls: 7 });
        slam(ctx, 'Executive Supplier', W / 2, 500, { t: T, tin: at + 0.15, tout: at + 3.5, size: 128, weight: 900, ls: -5 });
        slam(ctx, 'Intelligence', W / 2, 630, { t: T, tin: at + 0.45, tout: at + 3.5, size: 128, weight: 900, ls: -5, color: A });
        rise(ctx, 'The whole supplier, on one screen.', W / 2, 740, { t: T, tin: at + 1.2, tout: at + 3.4, size: 46, weight: 600, align: 'center', by: 'word', stagger: 0.06 });
      }
      const onScreen = ['reveal', 'tiles', 'priorities', 'tabs', 'switch', 'ticker', 'news', 'compare', 'briefing', 'ask'];
      if (onScreen.includes(id)) {
        const first = cfg.cuts.find((c) => c.id === 'tiles');
        const last = cfg.cuts.find((c) => c.id === 'ask');
        countdown(ctx, T, A, ramp(T, first.at + 0.5, first.at + 0.9) * (1 - ramp(T, last.at + last.dur - 0.4, last.at + last.dur)));
      }
      if (id === 'tiles') {
        const tiles = [[297, 367, 315, 81, 'SPEND', 2.95], [631, 367, 315, 81, 'CONTRACTS', 3.83], [964, 367, 315, 81, 'SOURCING EVENTS', 4.99], [1298, 367, 317, 81, 'RISK · RED / AMBER / GREEN', 6.51]];
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
        chips(ctx, T, at, [['Company website', 3.26], ['Financial reports', 5.18], ['Sustainability reports', 6.4], ['Investor relations', 8.32], ['SEC filings', 10.1], ['+ Trusted publishers', 11.83], ['+ Your own sources', 13.8]], A, 1420, 250, 'PRIMARY SOURCES FIRST');
      }
      if (id === 'briefing') tag(ctx, T, at + 0.3, 'DESIGNED PDF \u00b7 TALKING POINTS INCLUDED', A, 124, W - 64 - 740);
      if (id === 'ask') ask(ctx, T, at, 'Which contract renews next?', A);
      if (id === 'value') {
        rise(ctx, 'Everything you need, on one screen.', W / 2, 300, { t: T, tin: at + 0.4, tout: at + dur - 0.6, size: 64, weight: 800, align: 'center', by: 'word', stagger: 0.05, ls: -1.5 });
        const c = ramp(T, at + 1.8, at + 2.2) * (1 - ramp(T, at + dur - 0.6, at + dur - 0.3));
        if (c > 0) {
          ctx.save(); ctx.globalAlpha = c;
          font(ctx, 220, 900, MONO, -8); ctx.fillStyle = A; ctx.textAlign = 'center';
          ctx.fillText(clock(T), W / 2, 620);
          ctx.restore();
          label(ctx, 'MINUTES TO SPARE', W / 2, 690, { size: 26, color: INK, align: 'center', alpha: c, ls: 10 });
        }
      }
      if (id === 'end') endCard(ctx, T, at, A);
    },
  };
})();
