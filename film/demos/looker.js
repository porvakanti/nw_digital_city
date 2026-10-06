/* Conversational Analytics in Looker: the film's own graphics, over its shots.
 *
 * Its signature is the ask bar: the one input the whole film turns on. It
 * opens the film as the way past reports, filters and exports, carries the
 * real question into the product, and closes the film with "Just ask." The
 * colour is the blue-to-pink of Looker's own "Chat with your data".
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const PANEL = 'rgba(10,10,18,0.95)';
  const BLUE = '#4c8dff', VIOLET = '#a46bff', PINK = '#ff5fa2';

  function grad(ctx, x0, x1) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, BLUE); g.addColorStop(0.55, VIOLET); g.addColorStop(1, PINK);
    return g;
  }

  // Text filled with the gradient, centred on x.
  function gtext(ctx, text, x, y, size, a = 1, weight = 850, ls = -3) {
    if (a <= 0) return;
    font(ctx, size, weight, SANS, ls);
    const w = ctx.measureText(text).width;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = grad(ctx, x - w / 2, x + w / 2);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function sparkle(ctx, x, y, r, col) {
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  /* The ask bar: a white pill, a gradient rim, a sparkle, and whatever is
   * being typed into it. `n` characters of `text` are shown. */
  function askBar(ctx, T, x, y, w, a, text, n, placeholder = 'Ask a question', size = 40) {
    if (a <= 0) return;
    const h = size * 2.3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(164,107,255,0.45)'; ctx.shadowBlur = 60;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 4; ctx.strokeStyle = grad(ctx, x - w / 2, x + w / 2);
    ctx.stroke();
    const sx = x - w / 2 + h * 0.55;
    const g = grad(ctx, sx - 20, sx + 20);
    sparkle(ctx, sx, y, size * 0.42, g);
    font(ctx, size, 600, SANS, -0.5);
    const shown = text ? text.slice(0, n) : '';
    ctx.fillStyle = shown ? '#1d1f27' : '#8a8f9c';
    ctx.textBaseline = 'middle';
    ctx.fillText(shown || placeholder, sx + size * 0.9, y + 2);
    if (Math.floor(T * 2.5) % 2 === 0) {
      const cw = shown ? ctx.measureText(shown).width : 0;
      ctx.fillStyle = VIOLET; ctx.fillRect(sx + size * 0.9 + cw + 4, y - size * 0.55, 4, size * 1.1);
    }
    // The send arrow, right.
    ctx.fillStyle = shown ? VIOLET : '#c9ccd6';
    const ax = x + w / 2 - h * 0.55;
    ctx.beginPath(); ctx.moveTo(ax - 14, y - 16); ctx.lineTo(ax + 18, y); ctx.lineTo(ax - 14, y + 16); ctx.lineTo(ax - 8, y); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function tag(ctx, T, at, text, y = 64, x = 64, tout = 1e9) {
    const a = ramp(T, at, at + 0.3) * (1 - ramp(T, tout, tout + 0.3));
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = PANEL;
    ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = grad(ctx, x, x + w); ctx.stroke();
    ctx.restore();
    label(ctx, text, x + 22, y + 35, { size: 22, color: '#d9c9ff', alpha: a, ls: 5 });
  }

  function outline(ctx, sh, r, a, text, below = true) {
    if (a <= 0) return;
    const [x, y, w, h] = K.toScreen(sh.cam, r);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 5; ctx.strokeStyle = grad(ctx, x, x + w); ctx.shadowColor = VIOLET; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.roundRect(x - 10, y - 10, w + 20, h + 20, 16); ctx.stroke();
    ctx.restore();
    if (text) {
      font(ctx, 19, 500, MONO, 4);
      const tw = ctx.measureText(text).width + 32;
      const ty = below ? y + h + 22 : y - 62;
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = PANEL;
      ctx.beginPath(); ctx.roundRect(x - 10, ty, tw, 40, 20); ctx.fill(); ctx.restore();
      label(ctx, text, x + 6, ty + 28, { size: 19, color: '#d9c9ff', alpha: a, ls: 4 });
    }
  }

  function backdrop(ctx, T, a = 1) {
    // A deep field with two slow colour blooms.
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#06060c'; ctx.fillRect(0, 0, W, H);
    const blob = (x, y, r, col) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    blob(W * 0.28 + Math.sin(T * 0.21) * 120, H * 0.35, 900, 'rgba(76,141,255,0.16)');
    blob(W * 0.72 + Math.cos(T * 0.17) * 140, H * 0.65, 900, 'rgba(255,95,162,0.13)');
    ctx.restore();
  }

  /* ------------------------------------------------------------- opening */

  function opening(ctx, T) {
    backdrop(ctx, T);
    // 1. The business runs on questions: a field of them, drifting.
    const qs = ['Roaming revenue in Spain?', 'Top inbound countries?', 'YoY outbound growth?', 'Silent roamers this month?',
      'Net position by partner?', 'Which corridors are growing?', 'Cost per GB by market?', 'Permanent roamers in Italy?',
      'Where did traffic drop?', 'Wholesale margin trend?', 'Top 5 home countries?', 'Partner activity last quarter?'];
    const field = ramp(T, 0.6, 1.6) * (1 - ramp(T, 4.0, 4.6));
    if (field > 0) {
      qs.forEach((q, i) => {
        const a = ramp(T, 0.5 + i * 0.18, 0.9 + i * 0.18) * field;
        const spots = [[330, 170], [960, 140], [1590, 180], [560, 290], [1360, 300], [250, 400], [1680, 410],
          [300, 700], [1640, 690], [620, 820], [1300, 810], [960, 930]];
        const x = spots[i][0] + Math.sin(T * 0.4 + i) * 24;
        const y = spots[i][1] + Math.cos(T * 0.35 + i * 1.7) * 14;
        font(ctx, 30, 600, SANS, 0);
        const w = ctx.measureText(q).width + 56;
        ctx.save(); ctx.globalAlpha = a * (0.45 + 0.4 * ((i * 7) % 3) / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x - w / 2, y - 30, w, 60, 30); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(q, x, y + 10);
        ctx.restore();
      });
    }
    rise(ctx, 'Every day, the business runs on questions.', W / 2, 540, { t: T, tin: 0.9, tout: 3.9, size: 64, weight: 800, align: 'center', by: 'word', stagger: 0.06, ls: -1.5 });

    // 2. Three of them, typed large, one after another.
    const typed = [['Which markets are growing?', 4.3, 6.25], ['Where is our traffic coming from?', 6.37, 8.75], ['What changed this year?', 8.86, 10.6]];
    typed.forEach(([q, a, b]) => {
      if (T < a || T > b + 0.4) return;
      const n = Math.min(q.length, Math.floor((T - a) / 0.034));
      const out = ei(ramp(T, b, b + 0.35));
      font(ctx, 96, 850, SANS, -3);
      const shown = q.slice(0, n);
      const w = ctx.measureText(q).width;
      ctx.save();
      ctx.globalAlpha = 1 - out;
      ctx.translate(0, -out * 40);
      ctx.fillStyle = grad(ctx, W / 2 - w / 2, W / 2 + w / 2);
      ctx.textAlign = 'left';
      ctx.fillText(shown, W / 2 - w / 2, 560);
      if (n < q.length || Math.floor(T * 2.5) % 2 === 0) {
        ctx.fillStyle = INK; ctx.fillRect(W / 2 - w / 2 + ctx.measureText(shown).width + 8, 480, 6, 100);
      }
      ctx.restore();
    });

    // 3. What answering one takes today: reports, filters, exports, piling up.
    const blocks = [['NAVIGATE REPORTS', 13.17, -1], ['APPLY FILTERS', 15.03, 0], ['EXPORT DATA', 16.61, 1]];
    const clear = ramp(T, 18.3, 19.0);
    rise(ctx, 'Getting an answer usually means', W / 2, 250, { t: T, tin: 10.9, tout: 18.2, size: 48, weight: 600, align: 'center', by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.8)' });
    blocks.forEach(([name, a, k], i) => {
      const p = back(ramp(T, a, a + 0.45));
      if (p <= 0) return;
      const fly = ei(clear);
      const cx = W / 2 + k * 470 + fly * k * 900 + (k === 0 ? 0 : 0);
      const cy = 600 + fly * (k === 0 ? 700 : -300 * Math.abs(k));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i - 1) * 0.04 + fly * k * 0.6);
      ctx.scale(clamp(p), clamp(p));
      ctx.globalAlpha = clamp(p) * (1 - fly);
      ctx.fillStyle = '#f4f5f8'; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.roundRect(-210, -150, 420, 300, 18); ctx.fill();
      ctx.shadowBlur = 0;
      // A sketch of each chore.
      if (i === 0) {
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
          ctx.fillStyle = '#dfe2e8'; ctx.fillRect(-180 + c * 125, -110 + r * 105, 110, 90);
          ctx.fillStyle = ['#4c8dff', '#a46bff', '#ff5fa2'][c]; ctx.fillRect(-170 + c * 125, -60 + r * 105, 20, 30); ctx.fillRect(-145 + c * 125, -80 + r * 105, 20, 50);
        }
      } else if (i === 1) {
        ['Region', 'Market', 'Period', 'Partner', 'Service'].forEach((f, j) => {
          ctx.fillStyle = j % 2 ? '#e6e8ee' : '#ece3ff';
          ctx.beginPath(); ctx.roundRect(-180 + (j % 2) * 190, -110 + Math.floor(j / 2) * 70, 170, 50, 25); ctx.fill();
          font(ctx, 22, 600, SANS, 0); ctx.fillStyle = '#333'; ctx.fillText(f + ' ▾', -158 + (j % 2) * 190, -77 + Math.floor(j / 2) * 70);
        });
      } else {
        for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = r === 0 ? '#c9ccd6' : '#e3e6ec'; ctx.fillRect(-180 + c * 92, -120 + r * 34, 86, 28); }
        ctx.fillStyle = '#1e7d45'; ctx.beginPath(); ctx.roundRect(60, 70, 120, 50, 10); ctx.fill();
        font(ctx, 22, 700, SANS, 0); ctx.fillStyle = '#fff'; ctx.fillText('.xlsx ↓', 78, 103);
      }
      ctx.restore();
      label(ctx, name, cx, cy + 190, { size: 20, color: '#d9c9ff', align: 'center', alpha: clamp(p) * (1 - fly), ls: 6 });
    });

    // 4. Or just ask.
    const ab = eo5(ramp(T, 18.5, 19.2));
    gtext(ctx, 'What if you could just ask?', W / 2, 420, 92, ramp(T, 18.6, 19.0));
    askBar(ctx, T, W / 2, lerp(700, 600, ab), 1100, ab, '', 0);
  }

  /* --------------------------------------------------------------- beats */

  function title(ctx, T, at, dur) {
    backdrop(ctx, T);
    const out = 1 - ramp(T, at + dur - 0.5, at + dur);
    label(ctx, 'VODAFONE · DATA & ANALYTICS', W / 2, 330, { size: 22, color: '#d9c9ff', align: 'center', alpha: ramp(T, at + 0.4, at + 0.8) * out, ls: 8 });
    const k = eo5(ramp(T, at + 0.1, at + 0.6));
    ctx.save(); ctx.translate(W / 2, 500); ctx.scale(lerp(1.2, 1, k), lerp(1.2, 1, k)); ctx.translate(-W / 2, -500);
    if (k < 1) ctx.filter = `blur(${((1 - k) * 14).toFixed(1)}px)`;
    gtext(ctx, 'Conversational Analytics', W / 2, 500, 140, k * out, 900, -5);
    ctx.restore();
    rise(ctx, 'in Looker', W / 2, 610, { t: T, tin: at + 1.0, tout: at + dur - 0.5, size: 60, weight: 600, align: 'center', color: 'rgba(255,255,255,0.9)' });
    askBar(ctx, T, W / 2, 780, 820, ramp(T, at + 1.6, at + 2.0) * out, '', 0, 'Ask your data anything', 34);
  }

  // The real question, typed big into the ask bar, then sent up into the product.
  function bigAsk(ctx, T, at, dur) {
    const q = 'What are the top 5 visited countries by inbound data traffic, and the top 5 home countries by outbound?';
    const send = ei(ramp(T, at + dur - 0.55, at + dur));
    const pop = back(ramp(T, at + 0.2, at + 0.6));
    scrim(ctx, 'center', 0.9 * (1 - send * 0.6));
    if (pop <= 0) return;
    const n = Math.min(q.length, Math.max(0, Math.floor((T - at - 0.8) / 0.03)));
    // Wrap to two lines inside a tall bubble.
    font(ctx, 48, 650, SANS, -0.5);
    const words = q.split(' ');
    const lines = [''];
    for (const w of words) {
      const t = (lines[lines.length - 1] + ' ' + w).trim();
      if (ctx.measureText(t).width > 1260 && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = t;
    }
    const bw = 1460, bh = 90 + lines.length * 64;
    const cx = W / 2, cy = lerp(H / 2, 120, send);
    ctx.save();
    ctx.globalAlpha = clamp(pop) * (1 - send);
    ctx.translate(cx, cy);
    ctx.scale(lerp(clamp(pop), 0.5, send), lerp(clamp(pop), 0.5, send));
    ctx.shadowColor = 'rgba(164,107,255,0.5)'; ctx.shadowBlur = 70;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 44); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 5; ctx.strokeStyle = grad(ctx, -bw / 2, bw / 2); ctx.stroke();
    sparkle(ctx, -bw / 2 + 64, -bh / 2 + 70, 22, grad(ctx, -bw / 2 + 40, -bw / 2 + 90));
    font(ctx, 48, 650, SANS, -0.5); ctx.fillStyle = '#1d1f27';
    let left = n;
    lines.forEach((l, i) => {
      const shown = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      ctx.fillText(shown, -bw / 2 + 110, -bh / 2 + 86 + i * 64);
      if (left < 0 && left > -l.length - 2 && Math.floor(T * 3) % 2 === 0) {
        ctx.fillStyle = VIOLET; ctx.fillRect(-bw / 2 + 114 + ctx.measureText(shown).width, -bh / 2 + 44 + i * 64, 4, 54); ctx.fillStyle = '#1d1f27';
      }
    });
    ctx.restore();
    label(ctx, 'IN PLAIN ENGLISH', cx, cy - bh / 2 - 30, { size: 20, color: '#d9c9ff', align: 'center', alpha: clamp(pop) * (1 - send), ls: 7 });
  }

  // The parts of an answer, lit as they are named.
  function anatomy(ctx, T, at) {
    const parts = [['CHART', 2.6], ['TABLE', 4.3], ['KEY INSIGHTS', 6.15]];
    const x0 = W - 64, y = 880;
    font(ctx, 22, 600, MONO, 5);
    let x = x0;
    const items = parts.map(([p, w]) => [p, w, ctx.measureText(p).width + 48]).reverse();
    items.forEach(([p, when, w]) => {
      x -= w;
      const a = ramp(T, at + 0.3, at + 0.6);
      const on = ramp(T, at + when, at + when + 0.25);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = on > 0 ? grad(ctx, x, x + w) : PANEL;
      ctx.beginPath(); ctx.roundRect(x, y, w - 12, 52, 26); ctx.fill();
      ctx.restore();
      label(ctx, (on > 0.5 ? '✓ ' : '') + p, x + (w - 12) / 2, y + 35, { size: 20, color: on > 0 ? '#0b0b14' : 'rgba(255,255,255,0.6)', align: 'center', alpha: a, ls: 4, weight: 600 });
    });
    tag(ctx, T, at + 0.3, 'ANSWERED IN SECONDS', 880);
  }

  // A number lifted off the page.
  function callout(ctx, T, a0, x, y, big, small, color) {
    const k = back(ramp(T, a0, a0 + 0.4));
    if (k <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(clamp(k), clamp(k));
    ctx.globalAlpha = clamp(k);
    ctx.fillStyle = PANEL; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40;
    ctx.beginPath(); ctx.roundRect(-190, -110, 380, 220, 24); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = grad(ctx, -190, 190); ctx.stroke();
    ctx.restore();
    if (k > 0.3) {
      gtext(ctx, big, x, y + 20, 92, clamp(k), 900, -3);
      label(ctx, small, x, y - 56, { size: 17, color: '#d9c9ff', align: 'center', alpha: clamp(k), ls: 4 });
    }
  }

  function chips(ctx, T, at, items, x0, y0) {
    items.forEach(([it, when], i) => {
      const a = back(ramp(T, at + when, at + when + 0.35));
      if (a <= 0) return;
      font(ctx, 28, 700, SANS, 0);
      const w = ctx.measureText(it).width + 60;
      const y = y0 + i * 76;
      ctx.save();
      ctx.translate(x0, y);
      ctx.scale(clamp(a), clamp(a));
      ctx.globalAlpha = clamp(a);
      ctx.fillStyle = PANEL; ctx.lineWidth = 2; ctx.strokeStyle = grad(ctx, 0, w);
      ctx.beginPath(); ctx.roundRect(0, 0, w, 58, 29); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(it, 30, 39);
      ctx.restore();
    });
  }

  function value(ctx, T, at, dur) {
    backdrop(ctx, T);
    const out = at + dur - 0.6;
    rise(ctx, 'From question,', W / 2, 390, { t: T, tin: at + 0.4, tout: out, size: 110, weight: 850, align: 'center', ls: -4 });
    const a = ramp(T, at + 1.6, at + 2.0) * (1 - ramp(T, out, out + 0.4));
    gtext(ctx, 'to insight,', W / 2, 530, 110, a, 900, -4);
    rise(ctx, 'in one conversation.', W / 2, 650, { t: T, tin: at + 2.75, tout: out, size: 60, weight: 600, align: 'center', by: 'word', stagger: 0.06, color: 'rgba(255,255,255,0.9)' });
  }

  function endCard(ctx, T, at) {
    backdrop(ctx, T);
    const t = T - at;
    const s = back(ramp(t, 0.3, 0.9));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 230 - 55 * s, 110 * s, 110 * s);
    const k = eo5(ramp(t, 0.6, 1.2));
    gtext(ctx, 'Conversational Analytics', W / 2, 450, 120, k, 900, -4);
    rise(ctx, 'in Looker', W / 2, 545, { t: T, tin: at + 1.0, size: 50, weight: 600, align: 'center', color: 'rgba(255,255,255,0.85)' });
    // "Just ask." typed into the bar as the voice says it.
    const q = 'Just ask.';
    const n = Math.min(q.length, Math.max(0, Math.floor((T - at - 3.1) / 0.07)));
    askBar(ctx, T, W / 2, 720, 760, ramp(t, 1.4, 1.8), q, n, 'Ask a question', 44);
  }

  window.FILMSCRIPT = {
    noCaptions: () => false,
    async draw(T, { ctx, cfg, sh }) {
      const { id, at, dur } = sh.cut;
      if (id === 'open') opening(ctx, T);
      if (id === 'title') title(ctx, T, at, dur);
      if (id === 'access') tag(ctx, T, at + 0.3, 'BUILT INTO LOOKER', 880);
      if (id === 'agents') {
        tag(ctx, T, at + 0.3, 'ONE AGENT PER BUSINESS DOMAIN');
        [[537, 660, 394, 245, 'PERMANENT ROAMERS', 3.3], [952, 660, 394, 245, 'SILENT ROAMERS', 4.9], [1367, 660, 394, 245, 'WHOLESALE INSIGHTS', 6.45]]
          .forEach(([x, y, w, h, n, when]) => outline(ctx, sh, [x, y, w, h], ramp(T, at + when, at + when + 0.3), n, false));
      }
      if (id === 'agentpage') {
        outline(ctx, sh, [425, 1680 - 1000 - 25, 700, 245], ramp(T, at + 3.6, at + 3.9) * (1 - ramp(T, at + 5.3, at + 5.6)), 'SUGGESTED QUESTIONS', false);
        outline(ctx, sh, [10, 420, 360, 440], ramp(T, at + 5.4, at + 5.7) * (1 - ramp(T, at + 7.2, at + 7.5)), 'CONVERSATION HISTORY', false);
        outline(ctx, sh, [1440, 540, 410, 310], ramp(T, at + 8.4, at + 8.7), 'WHAT THE AGENT CAN SEE', false);
      }
      if (id === 'ask') bigAsk(ctx, T, at, dur);
      if (id === 'answer') anatomy(ctx, T, at);
      if (id === 'insights') {
        callout(ctx, T, at + 0.5, W - 215, 330, 'Spain', '#1 FOR INBOUND TRAFFIC', VIOLET);
        callout(ctx, T, at + 5.4, W - 215, 610, '+39%', 'UK · FASTEST GROWTH', VIOLET);
      }
      if (id === 'thinking') tag(ctx, T, at + 0.3, 'SHOW THINKING · THE REASONING, STEP BY STEP', 880);
      if (id === 'explore') {
        scrim(ctx, 'right', 0.75, 0.38);
        tag(ctx, T, at + 0.3, 'OPEN IN EXPLORE', 880);
        chips(ctx, T, at, [['Refine the query', 1.6], ['Dimensions & measures', 3.4], ['Keep investigating', 7.1]], W - 560, 340);
      }
      if (id === 'save') tag(ctx, T, at + 0.3, 'SAVE TO A DASHBOARD', 880);
      if (id === 'dash') tag(ctx, T, at, 'ALWAYS LIVE \u00b7 FILTERS REFRESH THE DATA', 880);
      if (id === 'value') value(ctx, T, at, dur);
      if (id === 'end') endCard(ctx, T, at);
    },
  };
})();
