/* Coming to VP&C: ten films cut into one, for the community call.
 *
 * Every shot plays above a black band that carries the captions and the
 * chapter (number, verb and name), with a red rail along its top edge that
 * fills as the film runs. The band also covers the captions burned into the
 * source films, so the film speaks with one voice. Three beats are drawn
 * here rather than cut from footage: the proof, the roadmap and the close.
 */
(() => {
  const K = window.KIT;
  const { W, H, ramp, eio, eo5, ei, back, clamp, lerp, rise, slam, label, scrim, font, SANS, MONO, INK } = K;

  const mark = new Image();
  mark.src = '../../renderer/vest-mark.png';
  const BAND = 930;
  const RED = '#e60000';
  const NUMBERED = ['pa', 'ava', 'neg', 'hw', 'sw', 'obl', 'ex', 'lk', 'dc', 'mp'];

  // ------------------------------------------------------------ the band
  function band(ctx, T, cfg) {
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, BAND, W, H - BAND);
    const ch = [...cfg.chapters].reverse().find((c) => T >= c.at - 1e-6);
    // The rail: a hairline, filling red as the film runs.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, BAND, W, 3);
    ctx.fillStyle = RED;
    ctx.fillRect(0, BAND, W * clamp(T / cfg.length), 3);
    for (const c of cfg.chapters.filter((x) => NUMBERED.includes(x.id))) {
      const x = W * c.at / cfg.length;
      ctx.fillStyle = T >= c.at ? RED : 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 1, BAND - 4, 3, 11);
    }
    if (!ch || ch.id === 'end') return;
    const a = ramp(T, ch.at + 0.15, ch.at + 0.55);
    const n = NUMBERED.indexOf(ch.id);
    const left = n >= 0 ? `${String(n + 1).padStart(2, '0')} / 10   ${ch.verb}` : ch.id === 'proof' ? 'VP&C · DIGITAL' : 'VP&C · ROADMAP';
    label(ctx, left, 56, BAND + 88, { size: 22, color: '#ff4d4d', alpha: a, ls: 5 });
    const right = n >= 0 ? ch.name : ch.id === 'proof' ? 'Already delivering' : 'Next six months';
    font(ctx, 26, 650, SANS, 0);
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = INK;
    ctx.textAlign = 'right';
    ctx.fillText(right, W - 56, BAND + 88);
    ctx.restore();
  }

  // ------------------------------------------------------------ the proof
  const PROOF = [
    { at: 3.6, pre: '€', n: 110, post: 'm', cap: 'VALUE DELIVERED' },
    { at: 6.25, pre: '', n: 100, post: '%', cap: 'AVA SOURCING ADOPTION' },
    { at: 7.6, pre: '+', n: 31, post: '', cap: 'AVA NPS · UP 105 POINTS' },
    { at: 8.71, pre: '', n: 500, post: '+', cap: 'IDEAS FROM YOU' },
  ];
  function proof(ctx, T, at, dur) {
    const out = at + dur - 0.5;
    const g = ctx.createRadialGradient(W / 2, 420, 0, W / 2, 420, W * 0.6);
    g.addColorStop(0, 'rgba(230,0,0,0.20)'); g.addColorStop(1, 'rgba(230,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, BAND);
    label(ctx, 'VODAFONE PROCURE & CONNECT', W / 2, 190, { size: 22, color: RED, align: 'center', ls: 8, alpha: ramp(T, 0.4, 0.9) * (1 - ramp(T, out, out + 0.3)) });
    rise(ctx, 'AI is already at work.', W / 2, 330, { t: T, tin: 0.7, tout: out, size: 104, weight: 850, align: 'center', ls: -3, stagger: 0.025 });
    PROOF.forEach((p, i) => {
      const x = 300 + i * 440;
      const k = back(ramp(T, p.at, p.at + 0.45)) * (1 - ei(ramp(T, out, out + 0.35)));
      if (k <= 0) return;
      const v = Math.round(p.n * eo5(ramp(T, p.at, p.at + 1.1)));
      ctx.save();
      ctx.translate(x, 600);
      ctx.scale(k, k);
      ctx.globalAlpha = clamp(k);
      ctx.fillStyle = 'rgba(8,9,14,0.72)';
      ctx.beginPath(); ctx.roundRect(-195, -150, 390, 260, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(230,0,0,0.75)'; ctx.lineWidth = 2; ctx.stroke();
      font(ctx, 118, 900, SANS, -4);
      ctx.fillStyle = INK; ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(230,0,0,0.5)'; ctx.shadowBlur = 30;
      ctx.fillText(`${p.pre}${v}${p.post}`, 0, 10);
      ctx.restore();
      label(ctx, p.cap, x, 680, { size: 19, color: '#ff8080', align: 'center', ls: 4, alpha: clamp(k) });
    });
  }

  // ------------------------------------------------------------ prompt academy
  function academy(ctx, T, cut) {
    const { id, at } = cut;
    if (id === 'pa2') {
      const a = ramp(T, at, at + 0.35) * (1 - ramp(T, at + 3.5, at + 4.0));
      ctx.fillStyle = `rgba(7,8,12,${0.78 * a})`;
      ctx.fillRect(0, 0, W, BAND);
      label(ctx, 'LEARN · PRACTISE · LEVEL UP', W / 2, 360, { size: 22, color: RED, align: 'center', ls: 8, alpha: ramp(T, at + 0.6, at + 1.0) * (1 - ramp(T, at + 3.4, at + 3.7)) });
      slam(ctx, 'Prompt Academy', W / 2, 520, { t: T, tin: at + 0.75, tout: at + 3.5, size: 150, weight: 900, ls: -5 });
      const bar = eio(ramp(T, at + 1.1, at + 1.7)) * (1 - ramp(T, at + 3.3, at + 3.7));
      ctx.fillStyle = RED; ctx.fillRect(W / 2 - 240 * bar, 570, 480 * bar, 9);
    }
    const tags = { pa1: 'GUIDED LEARNING PATHS', pa3: 'REAL PROCUREMENT CHALLENGES', pa4: 'SCORED ON EVERY PROMPT', pa5: 'A SANDBOX TO EXPERIMENT', pa6: 'YOUR SKILLS PROFILE' };
    if (tags[id]) tag(ctx, T, at + 0.25, tags[id], at + cut.dur - 0.25);
    if (id === 'pa6') K.badge(ctx, T, at + 2.6, at + cut.dur - 0.2, 'JANUARY', 'LAUNCHING FOR VP&C', RED, 170);
  }

  function tag(ctx, T, at, text, tout, x = 56, y = 56) {
    const a = ramp(T, at, at + 0.3) * (1 - ramp(T, tout, tout + 0.25));
    if (a <= 0) return;
    font(ctx, 22, 500, MONO, 5);
    const w = ctx.measureText(text).width + 44;
    ctx.save();
    ctx.globalAlpha = a * 0.94;
    ctx.fillStyle = 'rgba(8,10,18,0.94)';
    ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
    ctx.restore();
    label(ctx, text, x + 22, y + 35, { size: 22, color: '#ff6b6b', alpha: a, ls: 5 });
  }

  // ------------------------------------------------------------ the roadmap
  const CASES = [
    'True Up', 'Invoice Validation', 'Domestic eSIM', 'Supplier Discovery', 'Bid Evaluation', 'RFP Generation',
    'OLA Validity', 'Ask AVA 2.1', 'Historical Purchase Insights', 'Supplier Discovery', 'D2C Software', 'Contract Redaction',
    'GfK Automation', 'Corporate Analysis', 'International Voice – Forecasting', 'Workforce Extraction', 'Ask AVA 2.2',
    'Agent Marketplace', 'Digital City', 'Gantt Chart Generator', 'Executive Supplier Briefing',
    'Wholesale Positioning', 'International Voice – Deal Optimisation', 'Supplier Negotiation', 'Obligation Management',
    'Performance Management', 'Ask AVA 2.3', 'Risk Management', 'SoW Creation', 'Negotiation Plan', 'Wholesale Positioning II',
    'Roaming Data Analysis', 'CDR Reconciliation', 'Market Intelligence',
  ];
  const FEATURED = new Set(['Ask AVA 2.1', 'D2C Software', 'Agent Marketplace', 'Digital City', 'Executive Supplier Briefing', 'Supplier Negotiation', 'Obligation Management']);
  let layout = null;
  function chipsLayout(ctx) {
    font(ctx, 23, 600, SANS, 0);
    const rows = [[]];
    let w = 0;
    const maxW = 1640;
    for (const name of CASES) {
      const cw = ctx.measureText(name).width + 40;
      if (w + cw > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
      rows[rows.length - 1].push({ name, cw });
      w += cw + 14;
    }
    const out = [];
    rows.forEach((r, ri) => {
      const total = r.reduce((s, c) => s + c.cw, 0) + 14 * (r.length - 1);
      let x = W / 2 - total / 2;
      r.forEach((c) => { out.push({ ...c, x, y: 540 + ri * 66 }); x += c.cw + 14; });
    });
    return out;
  }
  function roadmap(ctx, T, at, dur) {
    const g = ctx.createRadialGradient(W / 2, 360, 0, W / 2, 360, W * 0.7);
    g.addColorStop(0, '#2a0508'); g.addColorStop(1, '#07080c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, BAND);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BAND); ctx.stroke(); }
    for (let y = 0; y < BAND; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const turn = at + 6.2;
    const dim = 1 - 0.8 * ramp(T, turn, turn + 0.5);
    if (!layout) layout = chipsLayout(ctx);
    const span = 3.6;
    const shown = layout.filter((_, i) => T >= at + 0.5 + i * span / CASES.length).length;
    // The count, rolling up with the chips.
    ctx.save();
    ctx.globalAlpha = (1 - ramp(T, turn, turn + 0.4)) * ramp(T, at + 0.3, at + 0.6);
    font(ctx, 210, 900, SANS, -8);
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(230,0,0,0.6)'; ctx.shadowBlur = 50;
    ctx.fillText(String(shown), W / 2, 330);
    ctx.restore();
    label(ctx, 'AI USE CASES · NEXT SIX MONTHS', W / 2, 410, { size: 24, color: '#ff4d4d', align: 'center', ls: 8, alpha: (1 - ramp(T, turn, turn + 0.4)) * ramp(T, at + 0.5, at + 0.9) });
    layout.forEach((c, i) => {
      const t0 = at + 0.5 + i * span / CASES.length;
      const k = eo5(ramp(T, t0, t0 + 0.35));
      if (k <= 0) return;
      const feat = FEATURED.has(c.name);
      ctx.save();
      ctx.globalAlpha = k * dim;
      ctx.translate(0, (1 - k) * 30);
      ctx.fillStyle = feat ? 'rgba(230,0,0,0.85)' : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(c.x, c.y - 33, c.cw, 46, 23); ctx.fill();
      if (!feat) { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      font(ctx, 23, 600, SANS, 0);
      ctx.fillStyle = INK; ctx.textAlign = 'left';
      ctx.fillText(c.name, c.x + 20, c.y - 2);
      ctx.restore();
    });
    // The turn: the next one could be yours.
    rise(ctx, 'The next one', W / 2, 420, { t: T, tin: turn + 0.2, size: 120, weight: 900, align: 'center', ls: -4, stagger: 0.02 });
    rise(ctx, 'could be yours.', W / 2, 560, { t: T, tin: turn + 0.75, size: 120, weight: 900, align: 'center', ls: -4, stagger: 0.02, color: RED });
  }

  // ------------------------------------------------------------ the close
  function close(ctx, T, at) {
    ctx.fillStyle = '#07080c'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, 440, 0, W / 2, 440, W * 0.55);
    g.addColorStop(0, 'rgba(230,0,0,0.26)'); g.addColorStop(1, 'rgba(230,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const s = back(ramp(T, at + 0.2, at + 0.8));
    if (s > 0 && mark.complete) ctx.drawImage(mark, W / 2 - 55 * s, 250 - 55 * s, 110 * s, 110 * s);
    rise(ctx, "The future won't happen to us.", W / 2, 520, { t: T, tin: at + 0.3, size: 92, weight: 850, align: 'center', ls: -3, by: 'word', stagger: 0.09 });
    rise(ctx, "We'll build it.", W / 2, 650, { t: T, tin: at + 1.9, size: 92, weight: 900, align: 'center', ls: -3, by: 'word', stagger: 0.12, color: RED });
    label(ctx, 'COMING TO VP&C', W / 2, 790, { size: 22, color: 'rgba(255,255,255,0.75)', align: 'center', ls: 8, alpha: ramp(T, at + 2.6, at + 3.0) });
  }

  window.FILMSCRIPT = {
    // Words the frame already says are not captioned twice.
    noCaptions: (T) => T >= 206 || (T >= 181.2 && T < 186),
    async draw(T, { ctx, cfg, sh }) {
      const cut = sh.cut;
      const { id, at, dur } = cut;
      // Keep the top of each recording clean of the source's own chrome.
      if (sh.img && id !== 'proof') {
        const s = ctx.createLinearGradient(0, 0, 0, 140);
        s.addColorStop(0, 'rgba(0,0,0,0.35)'); s.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = s; ctx.fillRect(0, 0, W, 140);
      }
      if (id === 'proof') proof(ctx, T, at, dur);
      if (cut.ch === 'pa') academy(ctx, T, cut);
      if (id === 'road') roadmap(ctx, T, at, dur);
      if (id === 'end') close(ctx, T, at);
      if (id !== 'end') band(ctx, T, cfg);
    },
  };
})();
