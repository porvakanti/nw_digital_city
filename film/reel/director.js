/* The reel's director. Runs in the page, after clock.js.
 *
 * One function of time, t in seconds from the first frame of the reel, decides
 * everything on screen: where the camera is, which state the city is in, and
 * every piece of motion graphics drawn over it. Nothing is keyed to wall time,
 * so any frame can be rendered on its own and comes out the same every time.
 *
 * The city itself is untouched. Its public API (window.NWCity) is used to
 * raise it, switch the lights off, show the city it could be and ask the
 * agent a question; the camera is swapped for a perspective one through the
 * render hook in clock.js; everything else is drawn on a canvas laid over it.
 *
 * Figures are never typed in here. They are read from the city's own data
 * when the reel starts, so a refreshed extract cannot leave a stale number in
 * a frame.
 */
(() => {
  const R = window.__reel;
  const W = 1920, H = 1080;
  const RED = '#e60000';
  const INK = '#ffffff';
  const BG = '#07080c';
  const SANS = '"Inter Tight", "Liberation Sans", Arial, sans-serif';
  const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

  // ------------------------------------------------------------- easing
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const eio = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const eio5 = (u) => (u < 0.5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2);
  const eo = (u) => 1 - Math.pow(1 - u, 3);
  const eo5 = (u) => 1 - Math.pow(1 - u, 5);
  const ei = (u) => u * u * u;
  const back = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  const within = (t, a, b) => t >= a && t < b;
  const mix = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));

  // Catmull-Rom through a list of points, u from 0 to 1.
  function spline(pts, u) {
    const n = pts.length - 1;
    const f = clamp(u) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const s = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    return [0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * s
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s * s
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s * s * s));
  }
  const orbit = (c, r, y, a) => [c[0] + Math.cos(a) * r, y, c[2] + Math.sin(a) * r];

  // A deterministic wobble, for a camera that is held rather than mounted.
  const wob = (t, amp, seed = 0) => [
    amp * (Math.sin(t * 0.73 + seed) * 0.6 + Math.sin(t * 1.91 + seed * 2) * 0.4),
    amp * 0.6 * (Math.sin(t * 0.57 + seed * 3) * 0.7 + Math.sin(t * 1.37 + seed) * 0.3),
    amp * (Math.sin(t * 0.61 + seed * 5) * 0.6 + Math.sin(t * 1.53 + seed * 4) * 0.4),
  ];

  // ------------------------------------------------------------- state
  const D = {
    M: null, facts: null, cam: null, ctx: null, bg: null, stage: null,
    t0: null, mode: 'cine', events: [], mark: null, grain: null,
  };
  R.director = D;

  // ------------------------------------------------------------- facts
  function readFacts() {
    const N = window.NWCity;
    const city = N.data;
    const lots = new Map();
    for (const b of N.layout.buildings) {
      if (b.category) lots.set(b.category.code, b);
    }
    const cats = city.categories;
    const bareSpend = cats.filter((c) => c.blueprint_state === 'none' && (c.metrics.spend_eur || 0) > 0)
      .sort((a, b) => b.metrics.spend_eur - a.metrics.spend_eur);
    const used = cats.filter((c) => (c.metrics.cbp_used || 0) > 0);
    // The asks screen computes what each ask is worth; read it off the page
    // rather than computing it a second time here.
    const asks = [...document.querySelectorAll('#asks .asks-list li')].map((li) => {
      const worth = li.querySelector('.worth');
      const to = worth ? parseFloat(worth.querySelector('b').textContent) : null;
      return {
        ask: li.querySelector('.ask').textContent.trim(),
        to,
        best: !!(worth && worth.classList.contains('best')),
      };
    });
    const nowText = (document.querySelector('#asks .worth') || {}).textContent || '';
    const scoreNow = parseFloat((nowText.match(/([\d.]+)\s*→/) || [])[1]) || city.totals.journey.total;
    return {
      totals: city.totals,
      districts: city.districts,
      plots: new Set(cats.map((c) => c.district + '|' + c.plot)).size,
      lots,
      cats,
      byCode: new Map(cats.map((c) => [c.code, c])),
      bareSpend,
      bareSpendSum: bareSpend.reduce((s, c) => s + c.metrics.spend_eur, 0),
      used,
      asks,
      scoreNow,
      best: asks.reduce((m, a) => (a.to > (m ? m.to : -1) ? a : m), null),
    };
  }

  const money = (eur) => `€${Math.round(eur / 1e6)}M`;

  // ------------------------------------------------------------- setup
  D.setup = async function setup(cfg) {
    D.M = cfg.marks;
    D.fps = cfg.fps;
    for (const f of cfg.fonts) {
      const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      const face = new FontFace(f.family, bytes.buffer, f.descriptors || {});
      await face.load();
      document.fonts.add(face);
    }
    D.mark = new Image();
    D.mark.src = cfg.mark;
    await D.mark.decode();

    const style = document.createElement('style');
    style.textContent = `
      #welcome, #tour, #legend, #journey, #chips, #hint, #touchbar, #modelBadge,
      #explainer, #hover, #asks, #suggest { display: none !important; }
      body.reel-cine .hud, body.reel-cine #bubble, body.reel-cine #caption { display: none !important; }
      #reelstage { position: fixed; inset: 0; transform-origin: 50% 50%; overflow: hidden;
                   background: #05070d; }
      #reelbg, #reelfx { position: fixed; inset: 0; width: 1920px; height: 1080px; pointer-events: none; }
      #reelbg { z-index: 0; } #reelstage { z-index: 1; } #reelfx { z-index: 2; }
      body { background: ${BG}; }
    `;
    document.head.appendChild(style);

    // Everything the city put on the page goes onto one stage, so the whole
    // product can be picked up and moved as a single surface.
    const stage = document.createElement('div');
    stage.id = 'reelstage';
    for (const node of [...document.body.childNodes]) {
      if (node.nodeType === 1 && node.tagName === 'SCRIPT') continue;
      stage.appendChild(node);
    }
    document.body.appendChild(stage);
    const bg = document.createElement('canvas');
    bg.id = 'reelbg'; bg.width = W; bg.height = H;
    const fx = document.createElement('canvas');
    fx.id = 'reelfx'; fx.width = W; fx.height = H;
    document.body.insertBefore(bg, stage);
    document.body.appendChild(fx);
    D.stage = stage;
    D.ctx = fx.getContext('2d');
    D.bg = bg.getContext('2d');
    document.body.classList.add('reel-cine');

    D.cam = new THREE.PerspectiveCamera(38, W / H, 0.3, 4000);
    D.none = new THREE.PerspectiveCamera(38, W / H, 0.3, 4000);
    D.none.layers.mask = 0;
    R.camera = (scene, cam) => {
      if (D.mode === 'product') return cam;
      // The renderer's second pass draws its guide figure alone, scaled for
      // the isometric view. It has no place in a cinematic frame.
      if (cam.layers.mask !== 1) return D.none;
      return D.cam;
    };

    /* A sky. The isometric view never sees the horizon, so the city has none;
     * a perspective camera at street level looks straight into a flat void.
     * A dome with a gradient gives it one, and is only drawn in the reel's
     * own shots. */
    D.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x04060b) },
          mid: { value: new THREE.Color(0x1d2230) },
          glow: { value: new THREE.Color(0x5a1216) },
          glowAmt: { value: 0.35 },
        },
        vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 glow; uniform float glowAmt; varying vec3 vDir;'
          + 'void main() { float h = vDir.y; vec3 c = mix(mid, top, smoothstep(-0.02, 0.5, h));'
          + 'c = mix(c, glow, glowAmt * exp(-abs(h - 0.02) * 16.0)); gl_FragColor = vec4(c, 1.0); }',
      }));
    D.sky.frustumCulled = false;
    D.sky.renderOrder = -10;
    R.scene.add(D.sky);

    D.facts = readFacts();
    D.grain = makeGrain();
    buildEvents();
    R.hooks.push((sec) => { if (D.t0 !== null) D.frame(sec - D.t0); });
  };

  // t = 0 falls on the first frame advanced after this.
  D.start = function start(frameMs) { D.t0 = R.now() + frameMs / 1000; };

  // ------------------------------------------------------------- events
  // Things that happen to the city once, when the reel passes a point.
  function buildEvents() {
    const M = D.M, N = window.NWCity;
    const on = (at, fn) => D.events.push({ at, fn, done: false });
    on(0, () => { N.night(false); N.potential(false); });
    on(M.reveal - 0.45, () => N.rise());
    on(M.tower - 1.0, () => N.focus(towerCode()));
    on(M.lightsOff, () => N.night(true));
    on(M.gap - 0.05, () => { N.night(false); N.reset(); });
    on(M.agent - 1.2, () => N.reset());
    on(M.agent - 0.05, () => enterProduct());
    on(M.agent + 0.9, () => typeQuestion('Where are the biggest gaps?'));
    on(M.potential - 0.05, () => { leaveProduct(); N.reset(); });
    on(M.potentialOn, () => N.potential(true));
    on(M.ask1 - 0.05, () => N.potential(false));
  }

  function runEvents(t) {
    for (const e of D.events) {
      if (!e.done && t >= e.at) { e.done = true; try { e.fn(); } catch (err) { console.error(err); } }
    }
  }

  const towerCode = () => {
    // The tallest building on the map that somebody has actually used.
    const f = D.facts;
    return f.used.map((c) => f.lots.get(c.code)).sort((a, b) => b.top - a.top)[0].category.code;
  };

  function enterProduct() {
    D.mode = 'product';
    document.body.classList.remove('reel-cine');
  }
  function leaveProduct() {
    D.mode = 'cine';
    document.body.classList.add('reel-cine');
    D.stage.style.transform = '';
    D.stage.style.borderRadius = '';
    D.stage.style.boxShadow = '';
  }

  function typeQuestion(text) {
    const input = document.getElementById('askInput');
    const start = D.now;
    const per = 0.055;
    const step = () => {
      const n = Math.min(text.length, Math.floor((D.now - start) / per) + 1);
      input.value = text.slice(0, n);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (n < text.length) setTimeout(step, per * 1000);
      else setTimeout(() => document.getElementById('askGo').click(), 380);
    };
    step();
  }

  // ------------------------------------------------------------- camera
  const lot = (code) => {
    const b = D.facts.lots.get(code);
    return b ? [b.x, b.top, b.z] : [0, 0, 0];
  };

  /* The shots. Each returns where the camera is and what it looks at, from
   * u, the eased progress through the shot, and t, the reel time. */
  function shotAt(t) {
    const M = D.M;
    const S = [];
    // 0: the plan from above, slowly turning. The cold open is drawn over
    // it, and the city is revealed underneath it without a cut.
    S.push({ a: 0, b: M.reveal + 0.8, cam(u, tt) {
      const a = -1.2 + tt * 0.018;
      return { pos: [Math.cos(a) * 8, 300 - tt * 1.5, Math.sin(a) * 8 + 30], look: [0, 0, 0], fov: 34, up: [Math.cos(a + 1.57), 0, Math.sin(a + 1.57)] };
    } });
    // 1: the city rises while the camera swings down into it.
    S.push({ a: M.reveal + 0.8, b: M.grammar, ease: eio, cam(u, tt) {
      const a0 = -1.2 + (M.reveal + 0.8) * 0.018;
      const pos = spline([
        [Math.cos(a0) * 8, 300 - (M.reveal + 0.8) * 1.5, Math.sin(a0) * 8 + 30],
        [70, 210, 140], [135, 95, 120], [118, 46, 96],
      ], u);
      return { pos, look: mix([0, 0, 0], [-8, 2, -12], u), fov: lerp(34, 36, u), upBlend: u };
    } });
    // 2: street level beside Access Radio/Fixed: bare lots, then foundations.
    S.push({ a: M.grammar, b: M.tower, ease: (u) => u, cam(u, tt) {
      const w = wob(tt, 0.12, 1);
      return { pos: mix([-16, 5.2, -14], [-17.5, 6.5, -33], eio(u)).map((v, i) => v + w[i]),
               look: mix([-38, 1.2, -24], [-36, 2.4, -38], eio(u)), fov: 40 };
    } });
    // 3: craning up the tallest tower that somebody has used.
    S.push({ a: M.tower, b: M.hotel, ease: eio, cam(u, tt) {
      const c = lot(towerCode());
      const a = lerp(0.55, 0.95, u);
      const w = wob(tt, 0.08, 3);
      return { pos: orbit(c, lerp(15, 19, u), lerp(1.2, 17, u), a).map((v, i) => v + w[i]),
               look: [c[0], lerp(3, 9.5, u), c[2]], fov: 42 };
    } });
    // 4: around a hotel: the biggest spend with a building on it.
    S.push({ a: M.hotel, b: M.roof, ease: eio, cam(u, tt) {
      const c = lot(hotelCode());
      const a = lerp(2.1, 2.9, u);
      return { pos: orbit(c, 17, lerp(9, 6.5, u), a), look: [c[0], 2.4, c[2]], fov: 40 };
    } });
    // 5: over a lit rooftop, then all the way out to the whole city.
    S.push({ a: M.roof, b: M.written, ease: (u) => u, cam(u, tt) {
      const c = lot(roofCode());
      const out = eio5(ramp(tt, M.roof + 3.2, M.written));
      const a = lerp(3.6, 4.3, ramp(tt, M.roof, M.roof + 3.4));
      const near = orbit(c, 13, c[1] + 6.5, a);
      const far = wideAt(M.written);
      return { pos: mix(near, far.pos, out), look: mix([c[0], c[1] + 1.5, c[2]], far.look, out), fov: lerp(40, far.fov, out), shift: far.shift * out };
    } });
    // 6: the whole city, turning, while the lights go out.
    S.push({ a: M.written, b: M.gap, ease: (u) => u, cam(u, tt) { return wideAt(tt); } });
    // 7: straight down onto the largest category with no blueprint.
    S.push({ a: M.gap, b: M.gapWide, ease: (u) => u, cam(u, tt) {
      const c = lot(D.facts.bareSpend[0].code);
      const k = eio(ramp(tt, M.gap, M.gap + 4.6));
      const pos = spline([[c[0] + 60, 70, c[2] + 55], [c[0] + 26, 24, c[2] + 20], [c[0] + 10, 8.5, c[2] + 9]], k);
      const drift = ramp(tt, M.gap + 4.6, M.gapWide);
      return { pos: [pos[0] + drift * 1.4, pos[1] + drift * 0.5, pos[2] - drift * 1.2],
               look: [c[0], 1.0, c[2]], fov: 38 };
    } });
    // 8: up and out, so every lot like it can be seen at once.
    S.push({ a: M.gapWide, b: M.agent, ease: (u) => u, cam(u, tt) {
      const c = lot(D.facts.bareSpend[0].code);
      const k = eio(ramp(tt, M.gapWide, M.gapWide + 3.6));
      const a = 1.25 + (tt - M.gapWide) * 0.012;
      const pos = spline([[c[0] + 11.4, 9, c[2] + 7.8], [c[0] + 30, 70, c[2] + 40], [Math.cos(a) * 70, 285, Math.sin(a) * 70 + 20]], k);
      // Lift the city up the frame to leave the bottom for the figures.
      return { pos, look: mix([c[0], 1, c[2]], [0, 0, -2], k), fov: 36, lift: 150 * k };
    } });
    // 9: the agent: the product's own camera, so nothing here is set.
    S.push({ a: M.agent, b: M.potential, cam() { return null; } });
    // 10: the city it could be, from low to high around the middle.
    S.push({ a: M.potential, b: M.ask1, ease: (u) => u, cam(u, tt) {
      const k = eio(u);
      const a = lerp(0.35, 1.9, k);
      const shift = 360 * eio(ramp(tt, M.score - 0.6, M.score + 0.8));
      return { pos: orbit([0, 0, -4], lerp(95, 175, k), lerp(9, 120, k), a), look: [0, lerp(7, 0, k), -4], fov: lerp(42, 38, k), shift };
    } });
    // 11..14: one shot per ask, each over the lots that ask is about.
    S.push({ a: M.ask1, b: M.ask2, ease: (u) => u, cam(u, tt) {
      // Fixed: twelve categories, one built.
      const w = wob(tt, 0.1, 7);
      return { pos: mix([2, 6, 72], [0, 5, 50], eio(u)).map((v, i) => v + w[i]), look: mix([-22, 0, 58], [-24, 1, 50], u), fov: 42 };
    } });
    S.push({ a: M.ask2, b: M.ask3, ease: (u) => u, cam(u, tt) {
      // Network Revenue Platforms: the cranes over the drafts.
      return { pos: orbit([31, 0, 6], 26, lerp(12, 9, u), lerp(-0.2, 0.5, eio(u))), look: [31, 1.5, 6], fov: 40 };
    } });
    S.push({ a: M.ask3, b: M.ask4, ease: (u) => u, cam(u, tt) {
      // Access Radio/Fixed: live blueprints nobody has used, and to-let boards.
      return { pos: orbit([-35, 0, -44], lerp(20, 24, u), lerp(5, 8, u), lerp(0.2, 0.9, eio(u))), look: [-35, 3, -44], fov: 42 };
    } });
    S.push({ a: M.ask4, b: M.finale, ease: (u) => u, cam(u, tt) {
      // The lit rooftops: where briefs are already being generated.
      const c = lot('A314');
      return { pos: orbit(c, lerp(16, 30, u), lerp(12, 26, u), lerp(-2.2, -1.5, eio(u))), look: [c[0], lerp(7, 4, u), c[2]], fov: 40 };
    } });
    // 15: the finale: from a street corner up to the whole city.
    S.push({ a: M.finale, b: 999, ease: (u) => u, cam(u, tt) {
      const k = eio(ramp(tt, M.finale, M.end + 0.4));
      const pos = spline([[14, 3.2, 22], [60, 30, 80], [150, 150, 180], [175, 205, 205]], k);
      return { pos, look: mix([-4, 7, -14], [0, 0, -6], k), fov: lerp(44, 36, k) };
    } });

    const s = S.find((x) => t >= x.a && t < x.b) || S[S.length - 1];
    const u = (s.ease || ((v) => v))(ramp(t, s.a, s.b));
    return s.cam(u, t);
  }

  function wideAt(tt) {
    const a = 0.72 + (tt - D.M.written) * 0.02;
    const shift = 330 * eio(ramp(tt, D.M.written - 1.2, D.M.written + 0.6));
    return { pos: orbit([0, 0, -4], 205, lerp(165, 150, ramp(tt, D.M.written, D.M.gap)), a), look: [0, 0, -2], fov: 36, shift };
  }

  const hotelCode = () => {
    const f = D.facts;
    // The biggest spend that has a building standing on it.
    return f.cats.filter((c) => c.blueprint_state === 'active' && f.lots.get(c.code).top > 3)
      .sort((a, b) => b.metrics.spend_eur - a.metrics.spend_eur)[0].code;
  };
  const roofCode = () => {
    const f = D.facts;
    // A lit roof on the tallest building that nobody has used yet.
    return f.cats.filter((c) => (c.metrics.ai_rfps || 0) >= 2 && !(c.metrics.cbp_used > 0))
      .sort((a, b) => f.lots.get(b.code).top - f.lots.get(a.code).top)[0].code;
  };

  function placeCamera(t) {
    const s = shotAt(t);
    if (!s) return;
    const cam = D.cam;
    cam.fov = s.fov || 38;
    cam.position.set(...s.pos);
    if (s.up) {
      cam.up.set(...s.up);
    } else if (s.upBlend !== undefined) {
      const a = -1.2 + (D.M.reveal + 0.8) * 0.018;
      const from = new THREE.Vector3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57));
      cam.up.copy(from.lerp(new THREE.Vector3(0, 1, 0), eio(clamp(s.upBlend * 1.6))).normalize());
    } else {
      cam.up.set(0, 1, 0);
    }
    cam.lookAt(...s.look);
    // Slide the frame sideways without turning the camera, to leave room
    // for type beside the city.
    const shift = s.shift || 0, lift = s.lift || 0;
    if (shift || lift) cam.setViewOffset(W, H, -shift, lift, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  let tmp = null;
  // World to screen through the reel's camera. z > 1 is behind it.
  function proj(p) {
    tmp = tmp || new THREE.Vector3();
    tmp.set(p[0], p[1], p[2]).project(D.cam);
    return [(tmp.x + 1) / 2 * W, (1 - tmp.y) / 2 * H, tmp.z];
  }

  // ------------------------------------------------------------- drawing kit
  function font(ctx, size, weight = 700, family = SANS, ls = 0) {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.letterSpacing = `${ls}px`;
  }

  /* Text that rises into place from behind a mask, a letter or a word at a
   * time, and leaves the same way. */
  function rise(ctx, text, x, y, o) {
    const { size = 64, weight = 700, family = SANS, ls = 0, color = INK, t, tin, tout = 1e9,
      stagger = 0.03, dur = 0.7, align = 'left', by = 'char', outDur = 0.45, alpha = 1 } = o;
    if (t < tin) return 0;
    font(ctx, size, weight, family, ls);
    const parts = by === 'word' ? text.split(/(\s+)/) : [...text];
    const total = ctx.measureText(text).width;
    let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - size, y - size * 1.05, total + size * 2, size * 1.38);
    ctx.clip();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.35;
    let acc = '';
    let k = 0;
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

  function label(ctx, text, x, y, o = {}) {
    const { size = 18, color = RED, alpha = 1, ls = 3, weight = 500, align = 'left' } = o;
    font(ctx, size, weight, MONO, ls);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // A mono label typed out a character at a time, with a cursor.
  function typed(ctx, text, x, y, t, tin, o = {}) {
    if (t < tin) return;
    const n = Math.floor((t - tin) / (o.per || 0.028));
    const shown = text.slice(0, n);
    const tout = o.tout || 1e9;
    const a = 1 - ramp(t, tout, tout + 0.3);
    label(ctx, shown, x, y, { ...o, alpha: a * (o.alpha || 1) });
    if (n < text.length && Math.floor(t * 8) % 2 === 0) {
      font(ctx, o.size || 18, 500, MONO, o.ls === undefined ? 3 : o.ls);
      const w = ctx.measureText(shown).width;
      ctx.fillStyle = o.color || RED;
      ctx.fillRect(x + w + 2, y - (o.size || 18) * 0.8, (o.size || 18) * 0.55, (o.size || 18) * 0.95);
    }
  }

  function count(from, to, t, t0, dur, ease = eo5) {
    return lerp(from, to, ease(ramp(t, t0, t0 + dur)));
  }

  /* A callout: a point on something in the city, a line out from it, and what
   * that thing means. Tracks the point as the camera moves. */
  function callout(ctx, t, o) {
    const { at, tin, tout, head, body, side = 1, dx = 150, dy = -120, value } = o;
    if (t < tin || t > tout + 0.5) return;
    const p = proj(at);
    if (p[2] > 1) return;
    const out = 1 - eo(ramp(t, tout, tout + 0.45));
    const pop = back(ramp(t, tin, tin + 0.35));
    const line = eio(ramp(t, tin + 0.15, tin + 0.6));
    ctx.save();
    ctx.globalAlpha = out;
    // The point.
    const pulse = (t - tin) % 1.4 / 1.4;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2;
    ctx.globalAlpha = out * (1 - pulse) * 0.9;
    ctx.beginPath(); ctx.arc(p[0], p[1], 8 + pulse * 26, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = out;
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(p[0], p[1], 9 * pop, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(p[0], p[1], 5 * pop, 0, Math.PI * 2); ctx.fill();
    // The line: a diagonal, then a run under the text.
    const ex = p[0] + dx * side, ey = p[1] + dy;
    font(ctx, 44, 700);
    const tw = Math.max(ctx.measureText(body).width, 260);
    const run = tw + 24;
    const seg1 = Math.hypot(dx, dy), total = seg1 + run;
    const drawn = total * line;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    if (drawn <= seg1) {
      ctx.lineTo(p[0] + (ex - p[0]) * drawn / seg1, p[1] + (ey - p[1]) * drawn / seg1);
    } else {
      ctx.lineTo(ex, ey);
      ctx.lineTo(ex + side * (drawn - seg1), ey);
    }
    ctx.stroke();
    // The words.
    const tx = side > 0 ? ex + 8 : ex - run + 8;
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = out;
    typed(ctx, head, tx, ey - 62, t, tin + 0.45, { size: 17, ls: 3 });
    rise(ctx, body, tx, ey - 14, { t, tin: tin + 0.55, tout, size: 44, weight: 700, stagger: 0.05, by: 'word' });
    if (value) rise(ctx, value, tx, ey + 44, { t, tin: tin + 0.8, tout, size: 26, weight: 500, family: MONO, color: RED, stagger: 0.02 });
    ctx.restore();
  }

  // Four corner brackets around a box on screen.
  function brackets(ctx, box, k, color = RED, len = 26) {
    const [x0, y0, x1, y1] = box;
    const g = (1 - k) * 60;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = k;
    const c = [[x0 - g, y0 - g, 1, 1], [x1 + g, y0 - g, -1, 1], [x0 - g, y1 + g, 1, -1], [x1 + g, y1 + g, -1, -1]];
    for (const [x, y, sx, sy] of c) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * len); ctx.lineTo(x, y); ctx.lineTo(x + sx * len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The screen box around a lot, from its eight corners.
  function lotBox(code, pad = 0) {
    const b = D.facts.lots.get(code);
    const half = (b.span || 1) * (b.cell || 3) / 2 + pad;
    const top = Math.max(b.top, 2.4);
    const pts = [];
    for (const dx of [-half, half]) for (const dz of [-half, half]) for (const y of [0, top]) {
      pts.push(proj([b.x + dx, y, b.z + dz]));
    }
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
      Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  }

  // A panel of dark glass for text to sit on.
  function glass(ctx, x, y, w, h, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(7,8,12,0.78)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = RED;
    ctx.fillRect(x, y, 4, h);
    ctx.restore();
  }

  // Darken one side of the frame so type can sit over a busy city.
  function scrim(ctx, side, a, reach = 0.55) {
    if (a <= 0) return;
    const g = side === 'left'
      ? ctx.createLinearGradient(0, 0, W * reach, 0)
      : side === 'right' ? ctx.createLinearGradient(W, 0, W * (1 - reach), 0)
        : side === 'bottom' ? ctx.createLinearGradient(0, H, 0, H * (1 - reach))
          : ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, `rgba(5,6,10,${0.82 * a})`);
    g.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* A chapter change: a dark panel with a red leading edge sweeps across,
   * covers the cut at `at`, and carries on off the other side. */
  function wipe(ctx, t, at, dur = 0.42) {
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
    ctx.fillStyle = RED;
    const edge = (x, wdt) => {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + wdt, 0); ctx.lineTo(x + wdt - skew, H); ctx.lineTo(x - skew, H);
      ctx.closePath(); ctx.fill();
    };
    if (cover < 1) edge(front + skew - 34, 34 + 60 * (1 - cover));
    if (leave > 0) edge(backEdge - 10, 26 + 50 * leave);
    ctx.restore();
  }

  // A hard cut marked by two frames of light.
  function flash(ctx, t, at, peak = 0.55, color = '255,255,255') {
    const k = 1 - ramp(t, at, at + 0.2);
    if (t < at || k <= 0) return;
    ctx.fillStyle = `rgba(${color},${peak * k * k})`;
    ctx.fillRect(0, 0, W, H);
  }

  function makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    let s = 1337;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 16807) % 2147483647;
      const v = s % 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function finish(ctx, t) {
    // Vignette.
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // Grain, moved every frame.
    const f = Math.floor(t * D.fps);
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.globalCompositeOperation = 'overlay';
    const ox = (f * 97) % 256, oy = (f * 61) % 256;
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(D.grain, x, y);
    ctx.restore();
  }

  // ------------------------------------------------------------- chrome
  const CHAPTERS = () => {
    const M = D.M;
    return [
      [M.grammar, '01', 'The language of the city'],
      [M.written, '02', 'The adoption gap'],
      [M.gap, '03', 'Where the money is'],
      [M.agent, '04', 'Ask the city'],
      [M.potential, '05', 'The city we could be'],
      [M.ask1, '06', 'Four asks'],
      [M.finale, null, null],
    ];
  };

  function chrome(ctx, t) {
    const M = D.M;
    if (t < M.grammar - 0.2 || t > M.end) return;
    const a = ramp(t, M.grammar, M.grammar + 0.6) * (1 - ramp(t, M.end - 0.6, M.end));
    ctx.save();
    const band = ctx.createLinearGradient(0, 0, 0, 150);
    band.addColorStop(0, `rgba(5,6,10,${0.6 * a})`);
    band.addColorStop(1, 'rgba(5,6,10,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 150);
    ctx.globalAlpha = a;
    ctx.fillStyle = RED;
    ctx.fillRect(64, 44, 14, 14);
    label(ctx, 'NW DIGITAL CITY', 90, 57, { color: INK, size: 16, alpha: a * 0.85 });
    const ch = CHAPTERS();
    for (let i = 0; i < ch.length - 1; i++) {
      const [at, num, name] = ch[i];
      const next = ch[i + 1][0];
      if (t < at - 0.1 || t >= next) continue;
      typed(ctx, `${num} \u2014 ${name.toUpperCase()}`, 64, 92, t, at + 0.35, { size: 16, color: INK, alpha: 0.6, tout: next - 0.35 });
    }
    // Progress along the bottom.
    ctx.globalAlpha = a * 0.18;
    ctx.fillStyle = INK;
    ctx.fillRect(64, H - 46, W - 128, 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = RED;
    ctx.fillRect(64, H - 46, (W - 128) * clamp(t / 120), 2);
    const f = Math.floor(t * D.fps);
    const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}:${String(f % D.fps).padStart(2, '0')}`;
    label(ctx, tc, W - 64, H - 62, { color: INK, size: 14, alpha: a * 0.5, align: 'right' });
    label(ctx, 'NETWORKS · CATEGORY ESTATE', W - 64, 57, { color: INK, size: 14, alpha: a * 0.5, align: 'right' });
    ctx.restore();
  }

  // ------------------------------------------------------------- scenes
  // 0: the cold open: the estate as numbers, then as a plan, then as a city.
  function coldOpen(ctx, t) {
    const M = D.M, f = D.facts;
    if (t > M.reveal + 1.4) return;
    const matte = 1 - eio(ramp(t, M.reveal, M.reveal + 1.2));
    ctx.save();
    ctx.globalAlpha = matte;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, W * 0.6);
    glow.addColorStop(0, `rgba(230,0,0,${0.10 + 0.03 * Math.sin(t * 2)})`);
    glow.addColorStop(1, 'rgba(230,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // The ground grid, seen through the camera that will reveal the city.
    const gridA = ramp(t, 0.8, 3) * (1 - ramp(t, M.reveal - 0.6, M.reveal + 0.6)) * 0.22;
    if (gridA > 0) {
      ctx.save();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = gridA;
      for (let i = -9; i <= 9; i++) {
        for (const [a, b] of [[[i * 12, 0, -110], [i * 12, 0, 110]], [[-110, 0, i * 12], [110, 0, i * 12]]]) {
          const p = proj(a), q = proj(b);
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // The signal: a point that pulses, then a line that opens the frame.
    if (t < 3.0) {
      const a = ramp(t, 0.2, 0.5) * (1 - ramp(t, 2.3, 2.9));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = RED;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 7, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 3; k++) {
        const p = ((t - 0.3 - k * 0.35) % 1.2) / 1.2;
        if (t - 0.3 - k * 0.35 < 0) continue;
        ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.globalAlpha = a * (1 - p);
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 7 + p * 140, 0, Math.PI * 2); ctx.stroke();
      }
      const l = eio(ramp(t, 0.9, 1.9));
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = INK;
      ctx.fillRect(W / 2 - l * W * 0.42, H / 2 - 0.5, l * W * 0.84, 1);
      ctx.restore();
    }

    // The 145 lots: a grid of squares, then sized by spend, then flown to
    // where each one stands on the plan.
    const N = f.cats.length;
    const cols = 15;
    const maxSpend = Math.max(...f.cats.map((c) => c.metrics.spend_eur || 0));
    const order = f.cats.map((c, i) => i);
    const lotsA = ramp(t, 2.6, 3.0) * (1 - ramp(t, M.reveal + 0.1, M.reveal + 0.9));
    if (lotsA > 0) {
      ctx.save();
      for (const i of order) {
        const c = f.cats[i];
        const b = f.lots.get(c.code);
        const col = i % cols, row = Math.floor(i / cols);
        const gx = 1060 + col * 50, gy = 300 + row * 50;
        const appear = back(ramp(t, 2.7 + i * 0.012, 2.95 + i * 0.012));
        const spend = c.metrics.spend_eur || 0;
        const sizeBySpend = spend > 0 ? 8 + 34 * Math.sqrt(spend / maxSpend) : 6;
        const sized = eio(ramp(t, 8.2 + (i % cols) * 0.02, 9.4 + (i % cols) * 0.02));
        let size = lerp(34, sizeBySpend, sized);
        // To the plan.
        const d = f.districts.findIndex((x) => x.name === c.district);
        const fly = eio5(ramp(t, 10.6 + d * 0.14 + (i % 7) * 0.012, 12.6 + d * 0.14 + (i % 7) * 0.012));
        const half = (b.span || 1) * (b.cell || 3) / 2;
        const pc = proj([b.x, 0, b.z]);
        const pe = proj([b.x + half, 0, b.z]);
        const onPlan = Math.max(4, Math.abs(pe[0] - pc[0]) * 1.5);
        const x = lerp(gx, pc[0], fly), y = lerp(gy, pc[1], fly);
        size = lerp(size, onPlan, fly) * appear;
        const bare = c.blueprint_state === 'none';
        const hot = bare && spend > 0;
        const tint = eio(ramp(t, 8.6, 9.6));
        ctx.globalAlpha = lotsA * (bare ? 0.55 : 0.92);
        if (bare) {
          ctx.strokeStyle = hot && tint > 0 ? `rgba(255,${Math.round(255 * (1 - tint))},${Math.round(255 * (1 - tint))},1)` : INK;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.restore();
    }

    // The words.
    const tot = f.totals;
    const txtOut = M.reveal - 2.6;
    ctx.save();
    typed(ctx, 'VODAFONE NETWORKS · CATEGORY ESTATE', 150, 340, t, 2.8, { size: 20, tout: txtOut });
    const n1 = Math.round(count(0, tot.categories, t, 2.9, 1.9));
    rise(ctx, String(n1), 142, 590, { t, tin: 2.9, tout: 7.7, size: 250, weight: 800, ls: -8, stagger: 0.05 });
    rise(ctx, 'categories', 150, 670, { t, tin: 3.3, tout: 7.7, size: 54, weight: 500, color: 'rgba(255,255,255,0.8)' });
    const n2 = Math.round(count(0, tot.spend_eur / 1e6, t, 8.0, 2.0));
    rise(ctx, `€${n2}M`, 142, 590, { t, tin: 7.95, tout: txtOut, size: 250, weight: 800, ls: -8, stagger: 0.04 });
    rise(ctx, 'of spend, year to date', 150, 670, { t, tin: 8.35, tout: txtOut, size: 54, weight: 500, color: 'rgba(255,255,255,0.8)' });
    typed(ctx, `${f.districts.length} DISTRICTS · ${f.plots} PLOTS · ${tot.categories} LOTS`, 150, 740, t, 9.6, { size: 20, color: INK, alpha: 0.6, tout: txtOut });
    ctx.restore();
  }

  // 1: the title, while the city rises.
  function title(ctx, t) {
    const M = D.M;
    const t0 = M.title, t1 = M.grammar - 0.75;
    if (t < t0 - 0.5 || t > M.grammar) return;
    scrim(ctx, 'center', ramp(t, t0 - 0.4, t0 + 0.4) * (1 - ramp(t, t1, t1 + 0.6)) * 0.9);
    rise(ctx, 'NW DIGITAL CITY', W / 2, 560, { t, tin: t0, tout: t1, size: 168, weight: 800, ls: -4, align: 'center', stagger: 0.035, dur: 0.9 });
    const bar = eio(ramp(t, t0 + 0.6, t0 + 1.4)) * (1 - eio(ramp(t, t1, t1 + 0.5)));
    ctx.fillStyle = RED;
    ctx.fillRect(W / 2 - 330 * bar, 604, 660 * bar, 8);
    rise(ctx, 'The Networks category estate, as a living city', W / 2, 676, { t, tin: t0 + 1.1, tout: t1, size: 38, weight: 500, align: 'center', by: 'word', stagger: 0.06, color: 'rgba(255,255,255,0.85)' });
  }

  // 2: what the city is made of.
  function grammar(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.grammar || t > M.written) return;
    const bare = 'D115', found = 'D307';
    callout(ctx, t, { at: [f.lots.get(bare).x, 0.6, f.lots.get(bare).z], tin: M.grammar + 0.7, tout: M.grammar + 3.2,
      head: 'LOT', body: 'One category', side: 1, dx: 120, dy: -170, value: 'EMPTY GROUND · NO BLUEPRINT' });
    callout(ctx, t, { at: [f.lots.get(found).x - 1.2, 0.7, f.lots.get(found).z + 1.2], tin: M.grammar + 3.4, tout: M.tower - 0.35,
      head: 'FOUNDATION', body: 'A blueprint', side: 1, dx: 120, dy: -150, value: 'GREEN = LIVE · YELLOW = DRAFT' });

    // The tower and its score.
    const tc = towerCode();
    const tcat = f.byCode.get(tc);
    if (within(t, M.tower, M.hotel + 0.3)) {
      const a = ramp(t, M.tower + 0.2, M.tower + 0.6) * (1 - ramp(t, M.hotel - 0.35, M.hotel));
      scrim(ctx, 'right', a * 0.8, 0.45);
      const x = W - 84, top = 340, h = 520;
      ctx.save();
      ctx.globalAlpha = a;
      label(ctx, 'HEIGHT = JOURNEY SCORE', x + 6, top - 215, { size: 18, align: 'right' });
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, top, 6, h);
      const score = count(0, tcat.journey.total, t, M.tower + 0.6, 2.4, eio);
      ctx.fillStyle = RED;
      ctx.fillRect(x, top + h * (1 - score / 100), 6, h * score / 100);
      for (const [v, name] of [[0, 'NO BLUEPRINT'], [25, 'LIVE'], [60, 'USED'], [100, 'AI AT WORK']]) {
        const y = top + h * (1 - v / 100);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(x - 10, y, 26, 1);
        label(ctx, `${name}  ${String(v).padStart(3, ' ')}`, x - 26, y + 6, { size: 14, color: INK, alpha: a * (score >= v ? 0.95 : 0.4), align: 'right' });
      }
      ctx.restore();
      rise(ctx, `${Math.round(score)}`, x + 10, top - 60, { t, tin: M.tower + 0.4, tout: M.hotel - 0.4, size: 150, weight: 800, ls: -4, align: 'right' });
      rise(ctx, `${tc} · ${tcat.name}`, x + 6, top - 24, { t, tin: M.tower + 0.7, tout: M.hotel - 0.4, size: 24, weight: 600, by: 'word', color: 'rgba(255,255,255,0.8)', align: 'right' });
    }

    // The hotel.
    const hc = hotelCode();
    const hb = f.lots.get(hc);
    callout(ctx, t, { at: [hb.x, hb.top * 0.55, hb.z], tin: M.hotel + 0.5, tout: M.roof - 0.35,
      head: 'HOUSES → HOTEL', body: 'Spend', side: -1, dx: 160, dy: -200, value: `${hc} · ${money(f.byCode.get(hc).metrics.spend_eur)} THIS YEAR` });

    // The rooftop.
    const rc = roofCode();
    const rb = f.lots.get(rc);
    callout(ctx, t, { at: [rb.x, rb.top + 0.6, rb.z], tin: M.roof + 0.5, tout: M.roof + 3.4,
      head: 'ROOFTOP LIGHT', body: 'AI at work', side: 1, dx: 170, dy: -170, value: `${f.byCode.get(rc).metrics.ai_rfps} AI-GENERATED RFPs` });
  }

  // 3: forty-four written, four used.
  function adoption(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.written - 0.2 || t > M.gap) return;
    const tot = f.totals;
    const out = M.gap - 0.9;
    scrim(ctx, 'left', ramp(t, M.written, M.written + 0.6) * (1 - ramp(t, out, out + 0.5)), 0.6);
    const n = Math.round(count(0, tot.active, t, M.written + 0.3, 1.6));
    const dim = t > M.lightsOff ? 0.35 : 1;
    typed(ctx, 'BLUEPRINTS WRITTEN', 120, 350, t, M.written + 0.2, { size: 20, tout: M.lightsOff - 0.2 });
    rise(ctx, String(n), 110, 600, { t, tin: M.written + 0.2, tout: M.four - 0.6, size: 300, weight: 800, ls: -10, alpha: dim });
    // Lights out.
    flash(ctx, t, M.lightsOff - 0.04, 0.35);
    // The four that are lit.
    const used = f.used.map((c) => [c, f.lots.get(c.code)]);
    used.forEach(([c, b], i) => {
      const tin = M.lightsOff + 0.8 + i * 0.45;
      if (t < tin || t > out + 0.4) return;
      const p = proj([b.x, b.top + 1.2, b.z]);
      const k = back(ramp(t, tin, tin + 0.4)) * (1 - ramp(t, out, out + 0.4));
      const pulse = ((t - tin) % 1.6) / 1.6;
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.arc(p[0], p[1], 22 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = k * (1 - pulse);
      ctx.beginPath(); ctx.arc(p[0], p[1], 22 + pulse * 40, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = k;
      ctx.fillStyle = INK;
      // Neighbours alternate height and side, so two lit buildings side by
      // side do not print their names over each other.
      const rise2 = 60 + (i % 2) * 70;
      const side = i % 2 ? -1 : 1;
      ctx.fillRect(p[0], p[1] - 22 - rise2 * k, 1.5, rise2 * k);
      ctx.fillRect(p[0], p[1] - 22 - rise2 * k, 14 * side * k, 1.5);
      ctx.restore();
      const lx = p[0] + side * 22;
      const align = side > 0 ? 'left' : 'right';
      label(ctx, c.code, lx, p[1] - 16 - rise2, { size: 16, color: INK, alpha: k, align });
      label(ctx, c.name.toUpperCase().slice(0, 30), lx, p[1] + 4 - rise2, { size: 13, color: INK, alpha: k * 0.6, ls: 2, align });
    });
    // Four.
    const four = M.four;
    rise(ctx, String(tot.in_use), 110, 600, { t, tin: four, tout: out, size: 300, weight: 800, ls: -10, color: RED });
    rise(ctx, `of ${tot.active}`, 330, 600, { t, tin: four + 0.35, tout: out, size: 120, weight: 700 });
    typed(ctx, 'EVER USED', 120, 680, t, four + 0.7, { size: 24, color: INK, tout: out });
  }

  // 4: the biggest spend with no blueprint, then all of them.
  function gap(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.gap || t > M.agent) return;
    const top = f.bareSpend[0];
    const tb = f.lots.get(top.code);
    // Brackets on the lot.
    if (t < M.gapWide + 1) {
      const k = eo(ramp(t, M.gap + 1.6, M.gap + 2.3)) * (1 - ramp(t, M.gapWide, M.gapWide + 0.6));
      if (k > 0) brackets(ctx, lotBox(top.code, 0.6), k);
    }
    // The card.
    const cin = M.gap + 1.2, cout = M.gapWide - 0.4;
    const a = ramp(t, cin, cin + 0.4) * (1 - ramp(t, cout, cout + 0.4));
    if (a > 0) {
      const x = 1180, y = 280, w = 640;
      const grow = eio(ramp(t, cin, cin + 0.5));
      glass(ctx, x, y, w * grow, 420, a);
      ctx.save();
      ctx.globalAlpha = a;
      typed(ctx, `CATEGORY ${top.code}`, x + 40, y + 60, t, cin + 0.3, { size: 18 });
      ctx.restore();
      rise(ctx, top.name, x + 40, y + 140, { t, tin: cin + 0.45, tout: cout, size: 58, weight: 800, by: 'word', stagger: 0.07, ls: -1 });
      const rows = [
        ['SPEND · YEAR TO DATE', money(top.metrics.spend_eur), INK],
        ['BLUEPRINT', 'None', RED],
        ['JOURNEY SCORE', `${top.journey.total} / 100`, INK],
      ];
      rows.forEach(([k2, v, col], i) => {
        const ry = y + 220 + i * 62;
        const ra = ramp(t, cin + 0.9 + i * 0.25, cin + 1.2 + i * 0.25) * a;
        ctx.fillStyle = `rgba(255,255,255,${0.14 * ra})`;
        ctx.fillRect(x + 40, ry + 18, (w - 80) * ra, 1);
        label(ctx, k2, x + 40, ry, { size: 15, color: INK, alpha: ra * 0.6 });
        rise(ctx, v, x + w - 40, ry + 4, { t, tin: cin + 1.0 + i * 0.25, tout: cout, size: 34, weight: 700, align: 'right', color: col });
      });
    }
    // Every lot like it.
    if (t > M.gapWide) {
      const out = M.agent - 0.5;
      scrim(ctx, 'bottom', ramp(t, M.gapWide + 0.6, M.gapWide + 1.2) * (1 - ramp(t, out, out + 0.4)), 0.5);
      const maxS = f.bareSpend[0].metrics.spend_eur;
      f.bareSpend.forEach((c, i) => {
        const b = f.lots.get(c.code);
        const tin = M.gapWide + 1.4 + i * 0.07;
        const k = back(ramp(t, tin, tin + 0.35)) * (1 - ramp(t, out, out + 0.4));
        if (k <= 0) return;
        const p = proj([b.x, 0.6, b.z]);
        const r = (7 + 26 * Math.sqrt(c.metrics.spend_eur / maxS)) * k;
        const pulse = ((t - tin) % 1.2) / 1.2;
        ctx.save();
        ctx.fillStyle = 'rgba(230,0,0,0.35)';
        ctx.globalAlpha = 1;
        ctx.fillRect(p[0] - r, p[1] - r * 0.6, r * 2, r * 1.2);
        ctx.strokeStyle = RED; ctx.lineWidth = 2;
        ctx.strokeRect(p[0] - r, p[1] - r * 0.6, r * 2, r * 1.2);
        ctx.globalAlpha = 1 - pulse;
        ctx.strokeRect(p[0] - r - pulse * 16, p[1] - r * 0.6 - pulse * 10, r * 2 + pulse * 32, r * 1.2 + pulse * 20);
        ctx.restore();
      });
      const n = Math.round(count(0, f.bareSpend.length, t, M.gapWide + 1.4, 1.4));
      const m = Math.round(count(0, f.bareSpendSum / 1e6, t, M.gapWide + 1.6, 1.8));
      rise(ctx, String(n), 110, 900, { t, tin: M.gapWide + 1.2, tout: out, size: 170, weight: 800, ls: -5 });
      rise(ctx, 'categories with spend', 330, 850, { t, tin: M.gapWide + 1.4, tout: out, size: 40, weight: 600, by: 'word' });
      rise(ctx, 'and no blueprint', 330, 900, { t, tin: M.gapWide + 1.55, tout: out, size: 40, weight: 600, by: 'word', color: RED });
      rise(ctx, `€${m}M`, W - 110, 900, { t, tin: M.gapWide + 1.6, tout: out, size: 170, weight: 800, ls: -5, align: 'right' });
      typed(ctx, 'UNMAPPED SPEND', W - 110 - 280, 720, t, M.gapWide + 2.0, { size: 18, tout: out });
    }
  }

  // 5: the product itself, floated on a stage.
  function agent(ctx, bg, t) {
    const M = D.M;
    bg.clearRect(0, 0, W, H);
    if (t < M.agent - 0.1 || t > M.potential + 0.1) {
      D.stage.style.transform = '';
      return;
    }
    // Behind the stage: dark, a red glow, the grid.
    bg.fillStyle = BG;
    bg.fillRect(0, 0, W, H);
    const g = bg.createRadialGradient(W * 0.2, H * 0.3, 0, W * 0.2, H * 0.3, W * 0.8);
    g.addColorStop(0, 'rgba(230,0,0,0.22)');
    g.addColorStop(1, 'rgba(230,0,0,0)');
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);
    bg.strokeStyle = 'rgba(255,255,255,0.05)';
    bg.lineWidth = 1;
    const off = (t * 12) % 60;
    for (let x = -off; x < W; x += 60) { bg.beginPath(); bg.moveTo(x, 0); bg.lineTo(x, H); bg.stroke(); }
    for (let y = -off; y < H; y += 60) { bg.beginPath(); bg.moveTo(0, y); bg.lineTo(W, y); bg.stroke(); }

    const back2 = eio5(ramp(t, M.agentOut, M.potential - 0.1));
    const into = eo5(ramp(t, M.agent - 0.1, M.agent + 0.9));
    const sc = lerp(lerp(0.86, 0.7, into), 1, back2);
    const tx = lerp(235, 0, back2);
    const ry = lerp(lerp(13, 7, ramp(t, M.agent, M.agentOut)), 0, back2);
    const rx = lerp(3, 0, back2);
    D.stage.style.transform = `perspective(2600px) translateX(${tx}px) rotateY(${ry}deg) rotateX(${rx}deg) scale(${sc})`;
    D.stage.style.borderRadius = `${lerp(18, 0, back2)}px`;
    D.stage.style.boxShadow = `0 40px 120px rgba(0,0,0,${0.7 * (1 - back2)}), 0 0 0 1px rgba(255,255,255,${0.12 * (1 - back2)})`;

    const out = M.agentOut - 0.3;
    const lines = [
      [M.agent + 0.6, 'Ask in plain', 'English.'],
      [M.agent + 3.0, 'It finds', 'the gaps.'],
      [M.agent + 4.6, 'Reasons over', 'the data.'],
      [M.agent + 6.2, 'And takes', 'you there.'],
    ];
    lines.forEach(([tin, l1, l2], i) => {
      const y = 330 + i * 150;
      const on = t >= tin;
      const a = ramp(t, tin, tin + 0.3) * (1 - ramp(t, out, out + 0.3));
      ctx.fillStyle = RED;
      ctx.globalAlpha = a;
      ctx.fillRect(90, y - 38, 4, 88);
      ctx.globalAlpha = 1;
      label(ctx, `0${i + 1}`, 110, y - 22, { size: 14, color: RED, alpha: a });
      if (on) {
        rise(ctx, l1, 110, y + 16, { t, tin, tout: out, size: 36, weight: 700, by: 'word', stagger: 0.05 });
        rise(ctx, l2, 110, y + 56, { t, tin: tin + 0.1, tout: out, size: 36, weight: 700, by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.7)' });
      }
    });
  }

  // 6: the city it could be, and the score it could reach.
  function potential(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.potential || t > M.ask1) return;
    const out = M.ask1 - 0.6;
    rise(ctx, 'The city we could be', W / 2, 190, { t, tin: M.potentialOn + 0.6, tout: M.score - 0.5, size: 64, weight: 700, align: 'center', by: 'word', stagger: 0.08 });
    if (t < M.score - 0.3) return;
    scrim(ctx, 'left', ramp(t, M.score - 0.3, M.score + 0.3) * (1 - ramp(t, out, out + 0.5)), 0.7);
    const cx = 330, cy = 440, r = 170;
    const a = ramp(t, M.score, M.score + 0.4) * (1 - ramp(t, out, out + 0.4));
    const now = count(0, f.scoreNow, t, M.score + 0.2, 1.6, eio);
    const best = f.best ? f.best.to : f.scoreNow;
    const lift = count(f.scoreNow, best, t, M.lift + 0.3, 1.8, eio);
    const shown = t > M.lift + 0.3 ? lift : now;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    const start = -Math.PI / 2;
    const draw = eio(ramp(t, M.score, M.score + 0.8));
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + Math.PI * 2 * draw); ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + Math.PI * 2 * now / 100); ctx.stroke();
    if (t > M.lift + 0.3) {
      ctx.strokeStyle = '#8fe8ff';
      ctx.shadowColor = '#8fe8ff'; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(cx, cy, r, start + Math.PI * 2 * f.scoreNow / 100, start + Math.PI * 2 * lift / 100); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // Ticks for the rungs of the ladder.
    for (let v = 0; v < 100; v += 5) {
      const ang = start + Math.PI * 2 * v / 100;
      const r0 = r + 16, r1 = r + (v % 25 === 0 ? 30 : 22);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); ctx.stroke();
    }
    ctx.restore();
    font(ctx, 120, 800, SANS, -4);
    ctx.globalAlpha = a;
    ctx.fillStyle = t > M.lift + 0.3 ? '#bff3ff' : INK;
    ctx.textAlign = 'center';
    ctx.fillText(shown.toFixed(1), cx, cy + 40);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    label(ctx, 'OUT OF 100', cx, cy + 90, { size: 16, color: INK, alpha: a * 0.6, align: 'center' });
    label(ctx, 'NETWORKS · JOURNEY SCORE', cx, cy - r - 60, { size: 18, alpha: a, align: 'center' });

    // Not writing more; using what is written.
    const x = 110;
    rise(ctx, 'Not writing more.', x, 790, { t, tin: M.score + 4.2, tout: out, size: 64, weight: 700, by: 'word', stagger: 0.07, alpha: t > M.lift ? 0.4 : 1 });
    const strike = eio(ramp(t, M.lift - 0.6, M.lift - 0.1)) * (1 - ramp(t, out, out + 0.3));
    if (strike > 0) {
      ctx.fillStyle = RED;
      ctx.fillRect(x - 6, 768, 540 * strike, 6);
    }
    rise(ctx, 'Using what is written.', x, 880, { t, tin: M.lift + 0.1, tout: out, size: 64, weight: 800, by: 'word', stagger: 0.07, color: '#bff3ff' });
    if (f.best) {
      typed(ctx, `+${(f.best.to - f.scoreNow).toFixed(1)} · ONE SOURCING EVENT THROUGH EVERY LIVE BLUEPRINT`, x, 940, t, M.lift + 0.9, { size: 18, color: '#8fe8ff', tout: out, per: 0.018 });
    }
  }

  // 7: the four asks, one per cut.
  function asks(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.ask1 || t > M.finale) return;
    const at = [M.ask1, M.ask2, M.ask3, M.ask4, M.finale];
    for (let i = 0; i < 4; i++) {
      const tin = at[i], tout = at[i + 1] - 0.3;
      if (t < tin || t > at[i + 1]) continue;
      const a = f.asks[i] || { ask: '', to: null };
      scrim(ctx, 'bottom', ramp(t, tin, tin + 0.2) * (1 - ramp(t, tout, tout + 0.3)), 0.7);
      scrim(ctx, 'left', ramp(t, tin, tin + 0.2) * (1 - ramp(t, tout, tout + 0.3)) * 0.7, 0.6);
      // The big outlined number.
      const k = eo5(ramp(t, tin, tin + 0.5)) * (1 - ei(ramp(t, tout, tout + 0.3)));
      ctx.save();
      font(ctx, 300, 800, SANS, -10);
      ctx.globalAlpha = k;
      ctx.lineWidth = 3;
      ctx.strokeStyle = RED;
      ctx.strokeText(`0${i + 1}`, 96 - (1 - k) * 60, 520);
      ctx.restore();
      // The ask, broken over two lines at the word nearest the middle.
      const words = a.ask.replace(/\.$/, '').split(' ');
      let best = 1, bestD = 1e9;
      for (let j = 1; j < words.length; j++) {
        const d = Math.abs(words.slice(0, j).join(' ').length - words.slice(j).join(' ').length);
        if (d < bestD) { bestD = d; best = j; }
      }
      const l1 = words.slice(0, best).join(' '), l2 = words.slice(best).join(' ') + '.';
      rise(ctx, l1, 110, 700, { t, tin: tin + 0.15, tout, size: 76, weight: 800, by: 'word', stagger: 0.05, ls: -2 });
      rise(ctx, l2, 110, 790, { t, tin: tin + 0.25, tout, size: 76, weight: 800, by: 'word', stagger: 0.05, ls: -2 });
      if (a.to !== null) {
        const v = count(f.scoreNow, a.to, t, tin + 0.6, 1.2);
        typed(ctx, `NETWORKS  ${f.scoreNow.toFixed(1)}  →  ${v.toFixed(1)}`, 114, 868, t, tin + 0.5, { size: 26, color: a.best ? '#8fe8ff' : INK, tout, per: 0.02 });
        if (a.best) typed(ctx, 'THE BIGGEST SINGLE STEP', 114, 910, t, tin + 1.0, { size: 18, tout });
      }
      flash(ctx, t, tin, i === 0 ? 0 : 0.4);
    }
  }

  // 8: the sign-off.
  function finale(ctx, t) {
    const M = D.M;
    if (t < M.finale) return;
    const out = M.end - 0.35;
    scrim(ctx, 'center', ramp(t, M.finale + 0.1, M.finale + 0.6) * (1 - ramp(t, out, out + 0.4)) * 0.8);
    rise(ctx, 'Blueprints today.', W / 2, 500, { t, tin: M.finale + 0.25, tout: out, size: 120, weight: 800, align: 'center', by: 'word', stagger: 0.12, ls: -3, dur: 0.8 });
    rise(ctx, 'Smart procurement tomorrow.', W / 2, 640, { t, tin: M.finale + 1.5, tout: out, size: 120, weight: 800, align: 'center', by: 'word', stagger: 0.12, ls: -3, dur: 0.8, color: RED });

    // The end card.
    if (t < M.end - 0.2) return;
    const m = eio(ramp(t, M.end - 0.2, M.end + 0.4));
    ctx.save();
    ctx.globalAlpha = m;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.55);
    g.addColorStop(0, 'rgba(230,0,0,0.20)');
    g.addColorStop(1, 'rgba(230,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const s = back(ramp(t, M.end + 0.1, M.end + 0.7));
    const sz = 150 * s;
    if (sz > 0) {
      ctx.save();
      ctx.globalAlpha = ramp(t, M.end + 0.1, M.end + 0.3);
      ctx.drawImage(D.mark, W / 2 - sz / 2, 380 - sz / 2, sz, sz);
      ctx.restore();
    }
    rise(ctx, 'NW Digital City', W / 2, 600, { t, tin: M.end + 0.45, size: 104, weight: 800, align: 'center', ls: -3, stagger: 0.03 });
    rise(ctx, 'Find it on the Agent Marketplace', W / 2, 670, { t, tin: M.end + 0.9, size: 34, weight: 500, align: 'center', by: 'word', color: 'rgba(255,255,255,0.75)' });
    const line = eio(ramp(t, M.end + 1.1, M.end + 1.8));
    ctx.fillStyle = RED;
    ctx.fillRect(W / 2 - 140 * line, 712, 280 * line, 3);
    const fade = ramp(t, 119.1, 120);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------- the frame
  D.frame = function frame(t) {
    D.now = t;
    const M = D.M;
    runEvents(t);
    // Nothing of the city is visible under the cold open's matte.
    R.skip = D.ff || t < M.reveal - 0.1;
    if (D.mode === 'cine') placeCamera(t);
    if (D.sky) {
      D.sky.visible = D.mode === 'cine';
      D.sky.position.copy(D.cam.position);
      // The sky follows the city's mood: darker with the lights out, cold
      // blue for the city it could be.
      const night = ramp(t, M.lightsOff, M.lightsOff + 0.2) * (1 - ramp(t, M.gap - 0.1, M.gap));
      const blue = ramp(t, M.potentialOn, M.potentialOn + 1.5) * (1 - ramp(t, M.ask1 - 0.1, M.ask1));
      const u = D.sky.material.uniforms;
      u.mid.value.setRGB(lerp(lerp(0.114, 0.035, night), 0.03, blue), lerp(lerp(0.133, 0.04, night), 0.11, blue), lerp(lerp(0.188, 0.06, night), 0.18, blue));
      u.glowAmt.value = lerp(lerp(0.35, 0.15, night), 0.1, blue);
    }
    else if (t < M.potential) placeCamera(M.gapWide + 0.01); // keep a sane camera for the projection

    // Depth: the city softens behind type that needs to be read.
    const canvas = R.renderer && R.renderer.domElement;
    if (canvas) {
      let blur = 0;
      blur = Math.max(blur, 3.5 * ramp(t, M.title - 0.2, M.title + 0.8) * (1 - ramp(t, M.grammar - 0.8, M.grammar - 0.2)));
      blur = Math.max(blur, 6 * ramp(t, M.end - 0.6, M.end));
      const grade = D.mode === 'cine' ? 'contrast(1.08) saturate(1.12)' : '';
      canvas.style.filter = `${blur > 0.05 ? `blur(${blur.toFixed(2)}px) ` : ''}${grade}`;
    }

    const ctx = D.ctx;
    ctx.clearRect(0, 0, W, H);
    agent(ctx, D.bg, t);
    grammar(ctx, t);
    adoption(ctx, t);
    gap(ctx, t);
    potential(ctx, t);
    asks(ctx, t);
    finale(ctx, t);
    title(ctx, t);
    coldOpen(ctx, t);
    chrome(ctx, t);
    for (const at of [M.grammar, M.gap, M.agent, M.potential, M.ask1, M.finale]) wipe(ctx, t, at);
    for (const at of [M.tower, M.hotel, M.roof]) flash(ctx, t, at, 0.35);
    flash(ctx, t, M.reveal, 0.25, '230,0,0');
    finish(ctx, t);
  };
})();
