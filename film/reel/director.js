/* The reel's director. Runs in the page, after clock.js.
 *
 * One function of time, t in seconds from the first frame of the reel, decides
 * everything on screen: where the camera is, which state the city is in, and
 * every piece of motion graphics drawn over it. Nothing is keyed to wall time,
 * so any frame can be rendered on its own and comes out the same every time.
 *
 * The story, in five acts, on the marks in cues.json:
 *
 *   the promise    one plot, then 145, then the plan, then the city
 *   the climb      one street, one take: empty ground, a draft, a connected
 *                  blueprint, one in use with AI, and the one category that
 *                  has made the whole journey
 *   the challenge  where Networks stands: lights out, four of forty-four,
 *                  nineteen out of a hundred
 *   the agent      the product itself, asked a question
 *   the vision     the city it could be, then write it, use it, let AI build
 *
 * The city is untouched. Its public API (window.NWCity) raises it, rebuilds a
 * lot, switches the lights and shows the city it could be; the camera is
 * swapped for a perspective one through the render hook in clock.js; the rest
 * is drawn on a canvas laid over it after each frame is rendered, so the
 * compositing can read the frame it sits on.
 *
 * Figures are never typed in here. They are read from the city's own data
 * when the reel starts.
 */
(() => {
  const R = window.__reel;
  const W = 1920, H = 1080;
  const RED = '#e60000';
  const INK = '#ffffff';
  const BG = '#07080c';
  const CYAN = '#8fe8ff';
  const GOLD = '#ffd27a';
  const SANS = '"Inter Tight", "Liberation Sans", Arial, sans-serif';
  const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';
  const BAR = 138;   // letterbox bar at 2.39:1

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
  const wob = (t, amp, seed = 0) => [
    amp * (Math.sin(t * 0.73 + seed) * 0.6 + Math.sin(t * 1.91 + seed * 2) * 0.4),
    amp * 0.6 * (Math.sin(t * 0.57 + seed * 3) * 0.7 + Math.sin(t * 1.37 + seed) * 0.3),
    amp * (Math.sin(t * 0.61 + seed * 5) * 0.6 + Math.sin(t * 1.53 + seed * 4) * 0.4),
  ];
  // A seeded random stream, so particles fall the same way on every render.
  const rand = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

  // ------------------------------------------------------------- state
  const D = { M: null, facts: null, cam: null, ctx: null, bg: null, stage: null, t0: null, mode: 'cine', events: [] };
  R.director = D;

  // ------------------------------------------------------------- facts
  function readFacts() {
    const N = window.NWCity;
    const city = N.data;
    const lots = new Map();
    for (const b of N.layout.buildings) if (b.category) lots.set(b.category.code, b);
    const cats = city.categories;
    const byCode = new Map(cats.map((c) => [c.code, c]));
    const used = cats.filter((c) => (c.metrics.cbp_used || 0) > 0);
    const asks = [...document.querySelectorAll('#asks .asks-list li')].map((li) => {
      const worth = li.querySelector('.worth');
      return { ask: li.querySelector('.ask').textContent.trim(), to: worth ? parseFloat(worth.querySelector('b').textContent) : null };
    });
    const nowText = (document.querySelector('#asks .worth') || {}).textContent || '';
    const scoreNow = parseFloat((nowText.match(/([\d.]+)\s*→/) || [])[1]) || city.totals.journey.total;
    const top = cats.slice().sort((a, b) => b.journey.total - a.journey.total)[0];
    return {
      totals: city.totals, districts: city.districts, cats, byCode, lots, used, asks, scoreNow, top,
      plots: new Set(cats.map((c) => c.district + '|' + c.plot)).size,
      best: asks.reduce((m, a) => (a.to > (m ? m.to : -1) ? a : m), null),
      // The same stage boundaries the city's journey rail uses.
      stages: [
        { name: 'Traditional', from: 0 }, { name: 'Connected', from: 40 },
        { name: 'Smart', from: 54 }, { name: 'Autonomous', from: 75 },
      ],
    };
  }

  /* The climb: one lot per rung, side by side on one row of Access
   * Radio/Fixed, so a single camera move can pass them in order. Named here;
   * tests/test_reel.py checks that each still stands on the rung it is here
   * for, so a refreshed extract that moves one fails the suite. */
  const CLIMB = ['A306', 'A202', 'A201', 'D506'];

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
      #reelstage { position: fixed; inset: 0; transform-origin: 50% 50%; overflow: hidden; background: #05070d; }
      #reelbg, #reelfx { position: fixed; inset: 0; width: 1920px; height: 1080px; pointer-events: none; }
      #reelbg { z-index: 0; } #reelstage { z-index: 1; } #reelfx { z-index: 2; }
      body { background: ${BG}; }`;
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
    const mk = (id, w = W, h = H) => { const c = document.createElement('canvas'); if (id) c.id = id; c.width = w; c.height = h; return c; };
    const bg = mk('reelbg'), fx = mk('reelfx');
    document.body.insertBefore(bg, stage);
    document.body.appendChild(fx);
    D.stage = stage;
    D.ctx = fx.getContext('2d');
    D.bg = bg.getContext('2d');
    // Scratch surfaces for the compositing, at half and quarter size.
    D.half = mk(null, W / 2, H / 2);
    D.quarter = mk(null, W / 4, H / 4);
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
     * A dome with a gradient gives it one, drawn only in the reel's shots. */
    D.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(0x04060b) }, mid: { value: new THREE.Color(0x1d2230) },
          glow: { value: new THREE.Color(0x5a1216) }, glowAmt: { value: 0.35 },
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
    R.hooks.push((sec) => { if (D.t0 !== null) D.before(sec - D.t0); });
    R.post.push((sec) => { if (D.t0 !== null) D.after(sec - D.t0); });
  };

  // t = 0 falls on the first frame advanced after this.
  D.start = function start(frameMs) { D.t0 = R.now() + frameMs / 1000; };

  // ------------------------------------------------------------- events
  function buildEvents() {
    const M = D.M, N = window.NWCity;
    const on = (at, fn) => D.events.push({ at, fn, done: false });
    on(0, () => { N.night(false); N.potential(false); });
    on(M.reveal - 0.5, () => N.rise());
    // Each lot on the climb is torn down and rebuilt as the camera arrives:
    // focus() starts the rebuild a little over a second after it is called.
    const stops = [M.stop0, M.stop1, M.stop2, M.stop3, M.stop4];
    [...CLIMB, D.facts.top.code].forEach((code, i) => on(stops[i] - 1.05, () => N.focus(code)));
    on(M.lightsOff, () => N.night(true));
    on(M.agent - 1.4, () => { N.night(false); N.reset(); });
    on(M.agent - 0.05, () => enterProduct());
    on(M.agent + 1.3, () => typeQuestion('Which category is doing best?'));
    on(M.potential - 0.05, () => { leaveProduct(); N.reset(); });
    on(M.potentialOn, () => N.potential(true));
    on(M.cta1 - 0.05, () => N.potential(false));
    on(M.cta2 - 0.05, () => N.night(true));
    on(M.finale - 0.05, () => N.night(false));
  }
  function runEvents(t) {
    for (const e of D.events) if (!e.done && t >= e.at) { e.done = true; try { e.fn(); } catch (err) { console.error(err); } }
  }
  function enterProduct() { D.mode = 'product'; document.body.classList.remove('reel-cine'); }
  function leaveProduct() {
    D.mode = 'cine';
    document.body.classList.add('reel-cine');
    D.stage.style.transform = ''; D.stage.style.borderRadius = ''; D.stage.style.boxShadow = '';
  }
  function typeQuestion(text) {
    const input = document.getElementById('askInput');
    const start = D.now, per = 0.055;
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
  const lot = (code) => { const b = D.facts.lots.get(code); return b ? [b.x, b.top, b.z] : [0, 0, 0]; };
  const TOPDOWN = (tt) => { const a = -1.2 + tt * 0.018; return { a, pos: [Math.cos(a) * 8, 300 - tt * 1.5, Math.sin(a) * 8 + 30] }; };

  // Where the camera stands for one lot on the climb: north of the row and
  // low, with the towers of the next row standing behind it.
  function stopPose(code, i) {
    const c = lot(code);
    const h = [4.6, 5.4, 6.8, 9.5][i];
    // The first three stand to the west of the monument on the same row, so
    // they are shot from the west, with it out of the frame.
    const side = i < 3 ? -3.2 : 3.2;
    return { pos: [c[0] + side, h, c[2] - 12 - i * 1.2], look: [c[0], lerp(0.6, 3.2, i / 3), c[2]] };
  }

  function heroPose(tt) {
    const M = D.M;
    const c = lot(D.facts.top.code);
    const k = ramp(tt, M.stop4, M.challenge);
    const a = lerp(-1.85, -0.35, eio(k));
    const up = eio(ramp(tt, M.stop4, M.hero + 1.5));
    return { pos: orbit(c, lerp(22, 30, up), lerp(7, 17, up), a), look: [c[0], lerp(6.5, 7, up), c[2]], fov: 40 };
  }

  function wideAt(tt) {
    const M = D.M;
    const a = 0.72 + (tt - M.challenge) * 0.02;
    const shift = 330 * eio(ramp(tt, M.challenge + 1.8, M.challenge + 3.0));
    return { pos: orbit([0, 0, -4], 205, lerp(165, 150, ramp(tt, M.challenge, M.agent)), a), look: [0, 0, -2], fov: 36, shift };
  }

  function shotAt(t) {
    const M = D.M;
    const S = [];
    // The plan from above, slowly turning; the cold open is drawn over it.
    S.push({ a: 0, b: M.reveal + 1.0, cam(u, tt) {
      const { a, pos } = TOPDOWN(tt);
      return { pos, look: [0, 0, 0], fov: 34, up: [Math.cos(a + 1.57), 0, Math.sin(a + 1.57)] };
    } });
    // The city rises while the camera swings down into it.
    S.push({ a: M.reveal + 1.0, b: M.climb, ease: eio, cam(u) {
      const from = TOPDOWN(M.reveal + 1.0);
      return { pos: spline([from.pos, [70, 210, 140], [135, 95, 120], [118, 50, 96]], u),
               look: mix([0, 0, 0], [-8, 2, -12], u), fov: lerp(34, 36, u), upBlend: u };
    } });
    // Down to the street where the climb starts.
    S.push({ a: M.climb, b: M.stop0, ease: (u) => u, cam(u) {
      const k = eio5(u);
      const to = stopPose(CLIMB[0], 0);
      return { pos: spline([[118, 50, 96], [20, 40, -20], [-30, 12, -72], to.pos], k), look: mix([-8, 2, -12], to.look, eio(k)), fov: lerp(36, 40, k), bars: 1 };
    } });
    // The four stops on the street: a slow push while the lot builds, then a
    // quick move on to the next.
    const stops = [M.stop0, M.stop1, M.stop2, M.stop3];
    for (let i = 0; i < 4; i++) {
      const a = stops[i], b = i < 3 ? stops[i + 1] : M.stop4;
      S.push({ a, b, ease: (u) => u, cam(u, tt) {
        const here = stopPose(CLIMB[i], i);
        const move = i < 3 ? 1.1 : 1.8;
        const hold = ramp(tt, a, b - move);
        const w = wob(tt, 0.05, i);
        const inward = [(here.look[0] - here.pos[0]) * 0.12 * hold, 0.2 * hold, (here.look[2] - here.pos[2]) * 0.12 * hold];
        let pos = here.pos.map((v, k) => v + inward[k] + w[k]);
        let look = here.look;
        const go = eio(ramp(tt, b - move, b));
        if (go > 0) {
          const next = i < 3 ? stopPose(CLIMB[i + 1], i + 1) : heroPose(M.stop4);
          pos = mix(pos, next.pos, go);
          look = mix(look, next.look, go);
          return { pos, look, fov: 40, bars: 1, whip: Math.sin(go * Math.PI) * (i < 3 ? 1 : 0.6) };
        }
        return { pos, look, fov: 40, bars: 1 };
      } });
    }
    // The top: around the one category that has made the whole climb.
    S.push({ a: M.stop4, b: M.challenge, ease: (u) => u, cam(u, tt) {
      return { ...heroPose(tt), bars: 1 - ramp(tt, M.challenge - 0.9, M.challenge - 0.1) };
    } });
    // Where Networks is: the whole city, turning, while the lights go out.
    S.push({ a: M.challenge, b: M.agent, ease: (u) => u, cam(u, tt) { return wideAt(tt); } });
    // The agent: the product's own camera, so nothing here is set.
    S.push({ a: M.agent, b: M.potential, cam() { return null; } });
    // The city it could be.
    S.push({ a: M.potential, b: M.cta1, ease: (u) => u, cam(u, tt) {
      const k = eio(u);
      const shift = 360 * eio(ramp(tt, M.potentialOn + 2.2, M.potentialOn + 3.4));
      return { pos: orbit([0, 0, -4], lerp(95, 175, k), lerp(9, 120, k), lerp(0.35, 1.9, k)), look: [0, lerp(7, 0, k), -4], fov: lerp(42, 38, k), shift };
    } });
    // Write: the cranes over the drafts.
    S.push({ a: M.cta1, b: M.cta2, ease: (u) => u, cam(u) {
      return { pos: orbit([31, 0, 6], lerp(24, 20, u), lerp(10, 7, u), lerp(-0.1, 0.55, eio(u))), look: [31, 2, 6], fov: 40 };
    } });
    // Use: after dark, where the windows are lit.
    S.push({ a: M.cta2, b: M.cta3, ease: (u) => u, cam(u) {
      const c = lot(D.facts.used[D.facts.used.length - 1].code);
      return { pos: orbit(c, lerp(20, 15, u), lerp(8, 10, u), lerp(2.2, 2.9, eio(u))), look: [c[0], 3.5, c[2]], fov: 40 };
    } });
    // AI: the lit rooftops of the tallest row.
    S.push({ a: M.cta3, b: M.finale, ease: (u) => u, cam(u) {
      const c = lot(D.facts.top.code);
      return { pos: orbit([c[0] - 7, 0, c[2]], lerp(26, 34, u), lerp(20, 30, u), lerp(-2.4, -1.7, eio(u))), look: [c[0] - 7, 8, c[2]], fov: 40 };
    } });
    // The finale: from a street corner up to the whole city.
    S.push({ a: M.finale, b: 999, ease: (u) => u, cam(u, tt) {
      const k = eio(ramp(tt, M.finale, M.end + 0.4));
      return { pos: spline([[14, 3.2, 22], [60, 30, 80], [150, 150, 180], [175, 205, 205]], k), look: mix([-4, 7, -14], [0, 0, -6], k), fov: lerp(44, 36, k) };
    } });

    const s = S.find((x) => t >= x.a && t < x.b) || S[S.length - 1];
    return s.cam((s.ease || ((v) => v))(ramp(t, s.a, s.b)), t);
  }

  function placeCamera(t) {
    const s = shotAt(t);
    if (!s) return;
    D.shot = s;
    const cam = D.cam;
    cam.fov = s.fov || 38;
    cam.position.set(...s.pos);
    if (s.up) cam.up.set(...s.up);
    else if (s.upBlend !== undefined) {
      const a = TOPDOWN(D.M.reveal + 1.0).a;
      const from = new THREE.Vector3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57));
      cam.up.copy(from.lerp(new THREE.Vector3(0, 1, 0), eio(clamp(s.upBlend * 1.6))).normalize());
    } else cam.up.set(0, 1, 0);
    cam.lookAt(...s.look);
    // Slide the frame sideways without turning the camera, to leave room
    // for type beside the city.
    const shift = s.shift || 0;
    if (shift) cam.setViewOffset(W, H, -shift, 0, W, H); else cam.clearViewOffset();
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

  // ------------------------------------------------------------- type kit
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

  /* A word that lands: it arrives oversized and soft, snaps to size, and
   * keeps growing a little while it holds. */
  function slam(ctx, text, x, y, o) {
    const { size = 300, weight = 900, color = INK, t, tin, tout = 1e9, ls = -10 } = o;
    if (t < tin || t > tout + 0.35) return 0;
    const k = eo5(ramp(t, tin, tin + 0.28));
    const out = ei(ramp(t, tout, tout + 0.3));
    const scale = lerp(1.45, 1, k) * (1 + 0.04 * ramp(t, tin + 0.28, tout)) * lerp(1, 0.94, out);
    ctx.save();
    font(ctx, size, weight, SANS, ls);
    const w = ctx.measureText(text).width;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = k * (1 - out);
    ctx.filter = k < 1 ? `blur(${((1 - k) * 18).toFixed(1)}px)` : 'none';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return w * scale;
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
    if (a <= 0) return;
    label(ctx, shown, x, y, { ...o, alpha: a * (o.alpha || 1) });
    if (n < text.length && Math.floor(t * 8) % 2 === 0) {
      font(ctx, o.size || 18, 500, MONO, o.ls === undefined ? 3 : o.ls);
      const w = ctx.measureText(shown).width;
      const off = o.align === 'right' ? -w : o.align === 'center' ? -w / 2 : 0;
      ctx.fillStyle = o.color || RED;
      ctx.fillRect(x + off + w + 2, y - (o.size || 18) * 0.8, (o.size || 18) * 0.55, (o.size || 18) * 0.95);
    }
  }

  const count = (from, to, t, t0, dur, ease = eo5) => lerp(from, to, ease(ramp(t, t0, t0 + dur)));

  // Darken one side of the frame so type can sit over a busy city.
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

  // A hard cut marked by a few frames of light.
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
    const r = rand(1337);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ------------------------------------------------------------- compositing
  /* Read the rendered frame back and lay three things over it: a tilt-shift
   * blur at the top and bottom of the frame, which makes a brick city read as
   * the miniature it is; a bloom, which lets the lit windows and reactor beams
   * glow; and, while the camera is moving fast, a smear along the move. */
  function composite(ctx, t) {
    const canvas = R.renderer && R.renderer.domElement;
    if (!canvas || D.mode !== 'cine' || R.skip) return;
    const M = D.M;
    const night = within(t, M.lightsOff, M.agent) || within(t, M.cta2, M.finale);
    const blueprint = within(t, M.potentialOn, M.cta1);
    const tilt = t < M.reveal + 0.8 ? 0 : within(t, M.title - 0.3, M.climb) ? 0.2 : 0.85;
    const bloom = night ? 0.6 : blueprint ? 0.5 : within(t, M.hero - 0.4, M.challenge) ? 0.35 : 0.14;

    if (tilt > 0) {
      const hc = D.half.getContext('2d');
      hc.globalCompositeOperation = 'copy';
      hc.filter = 'contrast(1.08) saturate(1.14) blur(5px)';
      hc.drawImage(canvas, 0, 0, W / 2, H / 2);
      hc.filter = 'none';
      hc.globalCompositeOperation = 'destination-in';
      const g = hc.createLinearGradient(0, 0, 0, H / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.36, 'rgba(0,0,0,0)');
      g.addColorStop(0.66, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      hc.fillStyle = g;
      hc.fillRect(0, 0, W / 2, H / 2);
      hc.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = tilt;
      ctx.drawImage(D.half, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (bloom > 0) {
      const qc = D.quarter.getContext('2d');
      qc.globalCompositeOperation = 'copy';
      qc.filter = 'brightness(0.85) contrast(3.4) blur(7px)';
      qc.drawImage(canvas, 0, 0, W / 4, H / 4);
      qc.filter = 'none';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = bloom * 0.55;
      ctx.drawImage(D.quarter, 0, 0, W, H);
      ctx.restore();
    }
    const whip = (D.shot && D.shot.whip) || 0;
    if (whip > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.16 * whip;
      for (let k = -3; k <= 3; k++) if (k) ctx.drawImage(canvas, k * 26 * whip, 0);
      ctx.restore();
    }
  }

  function finish(ctx, t) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    const f = Math.floor(t * D.fps);
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.globalCompositeOperation = 'overlay';
    const ox = (f * 97) % 256, oy = (f * 61) % 256;
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(D.grain, x, y);
    ctx.restore();
  }

  function letterbox(ctx, k) {
    if (k <= 0) return;
    const h = BAR * eio(k);
    ctx.fillStyle = '#030406';
    ctx.fillRect(0, 0, W, h);
    ctx.fillRect(0, H - h, W, h);
  }

  // Sparks rising off the top of the city, seeded so they fall the same way
  // on every render.
  function sparks(ctx, t, t0, at, n = 170) {
    if (t < t0 || t > t0 + 5) return;
    const r = rand(4242);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const delay = r() * 0.8, life = 2.2 + r() * 2.2;
      const ang = r() * Math.PI * 2, sp = 2 + r() * 9, up = 6 + r() * 10;
      const col = [GOLD, INK, RED, CYAN][Math.floor(r() * 4)];
      const size = 1.5 + r() * 3.5;
      const u = (t - t0 - delay) / life;
      if (u < 0 || u > 1) continue;
      const tt = u * life;
      const p = proj([at[0] + Math.cos(ang) * sp * tt * 0.5, at[1] + up * tt - 1.6 * tt * tt, at[2] + Math.sin(ang) * sp * tt * 0.5]);
      if (p[2] > 1) continue;
      ctx.globalAlpha = (1 - u) * (u < 0.1 ? u * 10 : 1);
      ctx.fillStyle = col;
      ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- chrome
  function chapters() {
    const M = D.M;
    return [
      [M.climb, '01', 'The climb'], [M.challenge, '02', 'Where we are'], [M.agent, '03', 'Ask the city'],
      [M.potential, '04', 'The city we could be'], [M.cta1, '05', 'Your move'], [M.finale, null, null],
    ];
  }

  function chrome(ctx, t) {
    const M = D.M;
    if (t < M.climb - 0.2 || t > M.end) return;
    const a = ramp(t, M.climb, M.climb + 0.6) * (1 - ramp(t, M.end - 0.6, M.end));
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
    const ch = chapters();
    for (let i = 0; i < ch.length - 1; i++) {
      const [at, num, name] = ch[i];
      const next = ch[i + 1][0];
      if (t < at - 0.1 || t >= next) continue;
      typed(ctx, `${num} \u2014 ${name.toUpperCase()}`, 64, 92, t, at + 0.35, { size: 16, color: INK, alpha: 0.6, tout: next - 0.35 });
    }
    label(ctx, 'NETWORKS · CATEGORY ESTATE', W - 64, 57, { color: INK, size: 14, alpha: a * 0.5, align: 'right' });
    // The progress line and timecode give way to the climb's rail.
    if (!within(t, M.climb, M.challenge)) {
      const f = Math.floor(t * D.fps);
      const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}:${String(f % D.fps).padStart(2, '0')}`;
      ctx.globalAlpha = a * 0.18;
      ctx.fillStyle = INK;
      ctx.fillRect(64, H - 46, W - 128, 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = RED;
      ctx.fillRect(64, H - 46, (W - 128) * clamp(t / 120), 2);
      label(ctx, tc, W - 64, H - 62, { color: INK, size: 14, alpha: a * 0.5, align: 'right' });
    }
    ctx.restore();
  }

  /* The stage rail: the four stages of the journey as one bar, 0 to 100, with
   * a marker at the score being talked about. */
  function rail(ctx, x, y, w, score, a, tag) {
    if (a <= 0) return;
    const st = D.facts.stages;
    ctx.save();
    ctx.globalAlpha = a;
    for (let i = 0; i < st.length; i++) {
      const from = st[i].from, to = i + 1 < st.length ? st[i + 1].from : 100;
      const x0 = x + w * from / 100, x1 = x + w * to / 100;
      const reached = score >= from;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x0 + 2, y, Math.max(0, x1 - x0 - 4), 6);
      if (reached) {
        ctx.fillStyle = i === 3 ? GOLD : RED;
        ctx.fillRect(x0 + 2, y, Math.max(0, Math.min(x1, x + w * score / 100) - x0 - 4), 6);
      }
      label(ctx, st[i].name.toUpperCase(), x0 + 4, y + 30, { size: 15, color: INK, alpha: a * (reached ? 0.95 : 0.4), ls: 3 });
    }
    const mx = x + w * score / 100;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(mx, y - 6); ctx.lineTo(mx + 8, y - 16); ctx.lineTo(mx - 8, y - 16);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    label(ctx, tag, mx, y - 24, { size: 15, color: INK, align: 'center', alpha: a });
  }

  // The three parts of one category's score, as three bars that fill.
  function meters(ctx, c, x, y, t, tin, tout) {
    const j = c.journey;
    const parts = [['BLUEPRINT', j.blueprint, 40, RED], ['USAGE', j.usage, 35, RED], ['AI', j.ai, 25, CYAN]];
    const a = ramp(t, tin, tin + 0.3) * (1 - ramp(t, tout, tout + 0.3));
    if (a <= 0) return;
    parts.forEach(([name, v, of, col], i) => {
      const yy = y + i * 40;
      const fill = eo(ramp(t, tin + 0.3 + i * 0.3, tin + 1.1 + i * 0.3));
      label(ctx, name, x, yy, { size: 16, color: INK, alpha: a * 0.8 });
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 140, yy - 11, 300, 9);
      ctx.fillStyle = col;
      ctx.fillRect(x + 140, yy - 11, 300 * fill * v / of, 9);
      ctx.restore();
      label(ctx, `${Math.round(v * fill)} / ${of}`, x + 460, yy, { size: 16, color: INK, alpha: a * (v ? 1 : 0.5) });
    });
  }

  // ------------------------------------------------------------- act 1
  function coldOpen(ctx, t) {
    const M = D.M, f = D.facts;
    if (t > M.reveal + 1.6) return;
    const matte = 1 - eio(ramp(t, M.reveal, M.reveal + 1.3));
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

    // The ground grid, through the camera that will reveal the city.
    const gridA = ramp(t, 0.8, 3) * (1 - ramp(t, M.reveal - 0.6, M.reveal + 0.6)) * 0.2;
    if (gridA > 0) {
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.globalAlpha = gridA;
      for (let i = -9; i <= 9; i++) {
        for (const [a, b] of [[[i * 12, 0, -110], [i * 12, 0, 110]], [[-110, 0, i * 12], [110, 0, i * 12]]]) {
          const p = proj(a), q = proj(b);
          ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
        }
      }
      ctx.restore();
    }

    /* One plot alone in the middle of the frame; then it takes its place in
     * a grid of all 145, which spreads out from it; they size by spend; and
     * each one flies to where it stands on the plan. */
    const cols = 15, gx0 = 1060, gy0 = 300, pitch = 50;
    const one = back(ramp(t, 0.9, 1.4));
    const toGrid = eio5(ramp(t, 4.6, 5.6));
    const maxSpend = Math.max(...f.cats.map((c) => c.metrics.spend_eur || 0));
    const lotsA = 1 - ramp(t, M.reveal + 0.1, M.reveal + 1.0);
    ctx.save();
    f.cats.forEach((c, i) => {
      const b = f.lots.get(c.code);
      const col = i % cols, row = Math.floor(i / cols);
      const gx = gx0 + col * pitch, gy = gy0 + row * pitch;
      let x = gx, y = gy, size = 34, appear;
      if (i === 0) {
        appear = one;
        x = lerp(W / 2, gx, toGrid); y = lerp(H / 2 - 20, gy, toGrid);
        size = lerp(120, 34, toGrid);
      } else {
        const d = Math.hypot(col, row);
        appear = back(ramp(t, 5.0 + d * 0.06, 5.3 + d * 0.06));
      }
      if (appear <= 0) return;
      const spend = c.metrics.spend_eur || 0;
      const bySpend = spend > 0 ? 8 + 34 * Math.sqrt(spend / maxSpend) : 6;
      size = lerp(size, bySpend, eio(ramp(t, 7.6 + col * 0.02, 8.8 + col * 0.02)));
      const di = f.districts.findIndex((x2) => x2.name === c.district);
      const fly = eio5(ramp(t, 9.8 + di * 0.14 + (i % 7) * 0.012, 11.8 + di * 0.14 + (i % 7) * 0.012));
      const half = (b.span || 1) * (b.cell || 3) / 2;
      const pc = proj([b.x, 0, b.z]), pe = proj([b.x + half, 0, b.z]);
      x = lerp(x, pc[0], fly); y = lerp(y, pc[1], fly);
      size = lerp(size, Math.max(4, Math.abs(pe[0] - pc[0]) * 1.5), fly) * appear;
      const bare = c.blueprint_state === 'none';
      ctx.globalAlpha = lotsA * (bare ? 0.55 : 0.92);
      if (i === 0 && toGrid < 0.5) {
        ctx.globalAlpha = lotsA;
        ctx.fillStyle = 'rgba(230,0,0,0.18)';
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.strokeStyle = RED; ctx.lineWidth = 3;
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      } else if (bare) {
        ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      } else {
        ctx.fillStyle = INK;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    });
    ctx.restore();
    typed(ctx, '1 CATEGORY  =  1 PLOT OF LAND', W / 2, H / 2 + 110, t, 1.5, { size: 20, align: 'center', tout: 4.4 });

    const tot = f.totals;
    const txtOut = M.reveal - 1.6;
    typed(ctx, 'VODAFONE NETWORKS · CATEGORY ESTATE', 150, 340, t, 5.0, { size: 20, tout: txtOut });
    const n1 = Math.round(count(0, tot.categories, t, 5.0, 1.8));
    rise(ctx, String(n1), 142, 590, { t, tin: 5.0, tout: 7.1, size: 250, weight: 800, ls: -8, stagger: 0.05 });
    rise(ctx, 'categories', 150, 670, { t, tin: 5.3, tout: 7.1, size: 54, weight: 500, color: 'rgba(255,255,255,0.8)' });
    const n2 = Math.round(count(0, tot.spend_eur / 1e6, t, 7.3, 2.0));
    rise(ctx, `€${n2}M`, 142, 590, { t, tin: 7.3, tout: txtOut, size: 250, weight: 800, ls: -8, stagger: 0.04 });
    rise(ctx, 'of spend, this year', 150, 670, { t, tin: 7.6, tout: txtOut, size: 54, weight: 500, color: 'rgba(255,255,255,0.8)' });
    typed(ctx, `${f.districts.length} DISTRICTS · ${f.plots} PLOTS · ${tot.categories} LOTS`, 150, 740, t, 8.8, { size: 20, color: INK, alpha: 0.6, tout: txtOut });
  }

  function title(ctx, t) {
    const M = D.M;
    const t0 = M.title, t1 = M.climb - 0.8;
    if (t < t0 - 0.5 || t > M.climb) return;
    scrim(ctx, 'center', ramp(t, t0 - 0.4, t0 + 0.4) * (1 - ramp(t, t1, t1 + 0.6)) * 0.9);
    rise(ctx, 'NW DIGITAL CITY', W / 2, 560, { t, tin: t0, tout: t1, size: 168, weight: 800, ls: -4, align: 'center', stagger: 0.035, dur: 0.9 });
    const bar = eio(ramp(t, t0 + 0.6, t0 + 1.4)) * (1 - eio(ramp(t, t1, t1 + 0.5)));
    ctx.fillStyle = RED;
    ctx.fillRect(W / 2 - 330 * bar, 604, 660 * bar, 8);
    rise(ctx, 'Every category. One living city.', W / 2, 676, { t, tin: t0 + 1.1, tout: t1, size: 40, weight: 500, align: 'center', by: 'word', stagger: 0.07, color: 'rgba(255,255,255,0.88)' });
  }

  // ------------------------------------------------------------- act 2
  function climb(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.climb || t > M.challenge) return;
    const codes = [...CLIMB, f.top.code];
    const stops = [M.stop0, M.stop1, M.stop2, M.stop3, M.stop4];
    const railA = ramp(t, M.climb + 0.6, M.climb + 1.2) * (1 - ramp(t, M.challenge - 1.2, M.challenge - 0.6));
    let i = -1;
    for (let k = 0; k < 5; k++) if (t >= stops[k] - 0.2) i = k;
    // The rail climbs with each lot's score as it builds.
    let score = 0;
    for (let k = 0; k <= i; k++) {
      const prev = k ? f.byCode.get(codes[k - 1]).journey.total : 0;
      score = count(prev, f.byCode.get(codes[k]).journey.total, t, stops[k] + 0.6, 1.2, eio);
    }

    // The lot on screen: its code, name, score and the three parts of it.
    if (i >= 0 && i < 4) {
      const c = f.byCode.get(codes[i]);
      const tin = stops[i] + 0.2;
      const tout = stops[i + 1] - 1.2;
      const x = 110, y = 560;
      scrim(ctx, 'left', ramp(t, tin - 0.2, tin + 0.3) * (1 - ramp(t, tout, tout + 0.4)), 0.5);
      typed(ctx, `${c.code} · ${c.district.toUpperCase()}`, x, y - 150, t, tin, { size: 16, color: INK, alpha: 0.8, tout });
      // The lot itself, marked out on the ground.
      {
        const b0 = f.lots.get(c.code);
        const half = (b0.span || 1) * (b0.cell || 3) / 2 + 0.25;
        const k = eo(ramp(t, stops[i] - 0.1, stops[i] + 0.5)) * (1 - ramp(t, tout, tout + 0.3));
        if (k > 0) {
          const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => proj([b0.x + sx * half, 0.75, b0.z + sz * half]));
          if (pts.every((q) => q[2] < 1)) {
            const pulse = 0.6 + 0.4 * Math.sin((t - stops[i]) * 5);
            ctx.save();
            ctx.globalAlpha = k * pulse;
            ctx.strokeStyle = i === 3 ? CYAN : RED;
            ctx.lineWidth = 3;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 16;
            ctx.beginPath();
            pts.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      rise(ctx, c.name, x, y - 92, { t, tin: tin + 0.1, tout, size: 44, weight: 700, by: 'word', stagger: 0.05 });
      const total = count(i ? f.byCode.get(codes[i - 1]).journey.total : 0, c.journey.total, t, tin + 0.4, 1.2, eio);
      const num = `${Math.round(total)}`;
      rise(ctx, num, x - 6, y + 70, { t, tin: tin + 0.2, tout, size: 150, weight: 800, ls: -6 });
      font(ctx, 150, 800, SANS, -6);
      rise(ctx, '/ 100', x + ctx.measureText(num).width + 10, y + 70, { t, tin: tin + 0.3, tout, size: 40, weight: 600, color: 'rgba(255,255,255,0.6)' });
      meters(ctx, c, x, y + 130, t, tin + 0.5, tout);
      // What this rung is, over the lot.
      const b = f.lots.get(c.code);
      const tag = [
        'EMPTY GROUND · NO BLUEPRINT',
        `+${c.journey.blueprint} · BLUEPRINT DRAFTED`,
        `+${c.journey.blueprint} · LIVE IN ${(c.markets || []).length} MARKETS`,
        `+${c.journey.usage} USED · +${c.journey.ai} AI`,
      ][i];
      const p = proj([b.x, Math.max(b.top, 1) + 1.6, b.z]);
      const k = back(ramp(t, stops[i] + 0.9, stops[i] + 1.3)) * (1 - ramp(t, tout, tout + 0.3));
      if (k > 0 && p[2] < 1) {
        font(ctx, 18, 500, MONO, 3);
        const w = ctx.measureText(tag).width + 36;
        ctx.save();
        ctx.globalAlpha = clamp(k);
        ctx.fillStyle = i === 0 ? 'rgba(20,22,28,0.88)' : i === 3 ? '#0d6f86' : RED;
        ctx.fillRect(p[0] - w / 2 * k, p[1] - 40, w * k, 40);
        ctx.restore();
        if (k > 0.8) label(ctx, tag, p[0], p[1] - 13, { size: 18, color: INK, align: 'center', alpha: clamp(k) });
      }
    }

    // The top.
    if (t > M.hero - 0.6) {
      const c = f.top;
      const b = f.lots.get(c.code);
      const out = M.challenge - 1.3;
      sparks(ctx, t, M.hero, [b.x, b.top * 0.9, b.z]);
      flash(ctx, t, M.hero, 0.45, '255,236,200');
      scrim(ctx, 'left', ramp(t, M.hero - 0.4, M.hero) * (1 - ramp(t, out, out + 0.5)) * 0.9, 0.6);
      slam(ctx, '100', 104, 600, { t, tin: M.hero, tout: out, size: 330, weight: 900, color: INK, ls: -14 });
      typed(ctx, 'OUT OF 100 · AUTONOMOUS', 116, 660, t, M.hero + 0.5, { size: 20, color: GOLD, tout: out });
      rise(ctx, c.name, 110, 740, { t, tin: M.hero + 0.7, tout: out, size: 54, weight: 800, by: 'word', stagger: 0.06, ls: -1 });
      typed(ctx, `BLUEPRINT ${c.journey.blueprint}/40 · USED ${c.metrics.cbp_used}× · ${c.metrics.ai_rfps} AI-GENERATED RFPs · LANDMARK EARNED`, 114, 800, t, M.hero + 1.4, { size: 15, color: INK, alpha: 0.75, tout: out, per: 0.016 });
      rise(ctx, 'The only category to make the whole climb.', 110, 870, { t, tin: M.hero + 2.6, tout: out, size: 30, weight: 500, by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.75)' });
    }

    // The letterbox and the rail in it go over everything in the frame.
    letterbox(ctx, Math.min(ramp(t, M.climb, M.climb + 0.8), (D.shot && D.shot.bars) || 0));
    rail(ctx, 360, H - 76, W - 720, score, railA, `${Math.round(score)}`);
    label(ctx, 'JOURNEY SCORE', 330, H - 70, { size: 14, color: INK, alpha: railA * 0.6, align: 'right' });
  }

  // ------------------------------------------------------------- act 3
  function challenge(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.challenge || t > M.agent) return;
    const tot = f.totals;
    const out = M.agent - 0.8;
    scrim(ctx, 'center', ramp(t, M.challenge, M.challenge + 0.4) * (1 - ramp(t, M.blueprints - 0.8, M.blueprints - 0.2)) * 0.8);
    rise(ctx, 'So where is Networks today?', W / 2, 560, { t, tin: M.challenge + 0.3, tout: M.blueprints - 0.75, size: 84, weight: 800, align: 'center', by: 'word', stagger: 0.07, ls: -2 });
    scrim(ctx, 'left', ramp(t, M.challenge + 2.4, M.challenge + 3.0) * (1 - ramp(t, out, out + 0.5)), 0.6);

    /* Every category with a blueprint first, drafts included, which is the
     * figure the city's own top bar shows; then the number rolls down to the
     * ones that are active, because only an active blueprint can be used. */
    const dim = t > M.lightsOff ? 0.35 : 1;
    const n = t < M.active + 0.2
      ? Math.round(count(0, tot.with_blueprint, t, M.blueprints + 0.2, 1.6))
      : Math.round(count(tot.with_blueprint, tot.active, t, M.active + 0.2, 1.0, eio));
    typed(ctx, 'CATEGORIES WITH A BLUEPRINT', 120, 350, t, M.blueprints, { size: 20, tout: M.active - 0.1 });
    typed(ctx, 'ACTIVE BLUEPRINTS', 120, 350, t, M.active + 0.1, { size: 20, tout: M.lightsOff - 0.2 });
    typed(ctx, `+ ${tot.draft_only} STILL IN DRAFT`, 120, 680, t, M.active + 0.9, { size: 20, color: INK, alpha: 0.6, tout: M.lightsOff - 0.2 });
    rise(ctx, String(n), 110, 600, { t, tin: M.blueprints + 0.1, tout: M.four - 0.6, size: 300, weight: 800, ls: -10, alpha: dim });
    flash(ctx, t, M.lightsOff - 0.04, 0.35);
    // The four that stay lit.
    f.used.forEach((c, i) => {
      const b = f.lots.get(c.code);
      const tin = M.lightsOff + 0.5 + i * 0.3;
      const tout = M.score - 0.4;
      if (t < tin || t > tout + 0.4) return;
      const p = proj([b.x, b.top + 1.2, b.z]);
      const k = back(ramp(t, tin, tin + 0.4)) * (1 - ramp(t, tout, tout + 0.4));
      const pulse = ((t - tin) % 1.6) / 1.6;
      const lift = 60 + (i % 2) * 70, side = i % 2 ? -1 : 1;
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.globalAlpha = k;
      ctx.beginPath(); ctx.arc(p[0], p[1], 22 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = k * (1 - pulse);
      ctx.beginPath(); ctx.arc(p[0], p[1], 22 + pulse * 40, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = k;
      ctx.fillStyle = INK;
      ctx.fillRect(p[0], p[1] - 22 - lift * k, 1.5, lift * k);
      ctx.fillRect(p[0], p[1] - 22 - lift * k, 14 * side * k, 1.5);
      ctx.restore();
      const lx = p[0] + side * 22, align = side > 0 ? 'left' : 'right';
      label(ctx, c.code, lx, p[1] - 16 - lift, { size: 16, color: INK, alpha: k, align });
      label(ctx, c.name.toUpperCase().slice(0, 30), lx, p[1] + 4 - lift, { size: 13, color: INK, alpha: k * 0.6, ls: 2, align });
    });
    rise(ctx, String(tot.in_use), 110, 600, { t, tin: M.four, tout: M.score - 0.4, size: 300, weight: 800, ls: -10, color: RED });
    rise(ctx, `of ${tot.active}`, 330, 600, { t, tin: M.four + 0.35, tout: M.score - 0.4, size: 120, weight: 700 });
    typed(ctx, 'ACTIVE BLUEPRINTS EVER USED', 120, 680, t, M.four + 0.7, { size: 24, color: INK, tout: M.score - 0.4 });

    // Networks on the rail: the first rung.
    const s = count(0, f.scoreNow, t, M.score + 0.3, 1.6, eio);
    typed(ctx, 'NETWORKS · JOURNEY SCORE', 116, 370, t, M.score + 0.2, { size: 18, tout: out });
    slam(ctx, f.scoreNow.toFixed(1), 104, 580, { t, tin: M.score, tout: out, size: 240, weight: 900, color: INK, ls: -10 });
    rail(ctx, 116, 700, 820, s, ramp(t, M.score + 0.3, M.score + 0.7) * (1 - ramp(t, out, out + 0.4)), 'NETWORKS TODAY');
    rise(ctx, 'Still the first rung.', 116, 830, { t, tin: M.score + 1.6, tout: out, size: 48, weight: 700, by: 'word', stagger: 0.06, color: 'rgba(255,255,255,0.88)' });
  }

  // ------------------------------------------------------------- act 4
  function agent(ctx, bg, t) {
    const M = D.M;
    bg.clearRect(0, 0, W, H);
    if (t < M.agent - 0.1 || t > M.potential + 0.1) { D.stage.style.transform = ''; return; }
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
    typed(ctx, 'MEET CRANE · THE CITY\'S AGENT', 90, 240, t, M.agent + 0.4, { size: 16, tout: out });
    const lines = [
      [M.agent + 1.4, 'Ask in plain', 'English.'],
      [M.agent + 4.5, 'It finds', 'the answer.'],
      [M.agent + 6.0, 'Reasons over', 'the data.'],
      [M.agent + 7.4, 'And takes', 'you there.'],
    ];
    lines.forEach(([tin, l1, l2], i) => {
      const y = 330 + i * 150;
      const a = ramp(t, tin, tin + 0.3) * (1 - ramp(t, out, out + 0.3));
      ctx.fillStyle = RED;
      ctx.globalAlpha = a;
      ctx.fillRect(90, y - 38, 4, 88);
      ctx.globalAlpha = 1;
      label(ctx, `0${i + 1}`, 110, y - 22, { size: 14, color: RED, alpha: a });
      if (t >= tin) {
        rise(ctx, l1, 110, y + 16, { t, tin, tout: out, size: 36, weight: 700, by: 'word', stagger: 0.05 });
        rise(ctx, l2, 110, y + 56, { t, tin: tin + 0.1, tout: out, size: 36, weight: 700, by: 'word', stagger: 0.05, color: 'rgba(255,255,255,0.7)' });
      }
    });
  }

  // ------------------------------------------------------------- act 5
  function vision(ctx, t) {
    const M = D.M, f = D.facts;
    if (t < M.potential || t > M.cta1) return;
    const out = M.cta1 - 0.6;
    rise(ctx, 'Now imagine every lot built.', W / 2, 200, { t, tin: M.potentialOn - 0.2, tout: M.potentialOn + 2.2, size: 72, weight: 800, align: 'center', by: 'word', stagger: 0.08, ls: -2 });
    const score = M.potentialOn + 2.8;
    if (t < score - 0.3) return;
    scrim(ctx, 'left', ramp(t, score - 0.3, score + 0.3) * (1 - ramp(t, out, out + 0.5)), 0.7);
    const cx = 330, cy = 440, r = 170;
    const a = ramp(t, score, score + 0.4) * (1 - ramp(t, out, out + 0.4));
    const now = count(0, f.scoreNow, t, score + 0.2, 1.2, eio);
    const best = f.best ? f.best.to : f.scoreNow;
    const lift = count(f.scoreNow, best, t, M.lift + 0.3, 1.8, eio);
    const shown = t > M.lift + 0.3 ? lift : now;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    const start = -Math.PI / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + Math.PI * 2 * eio(ramp(t, score, score + 0.8))); ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + Math.PI * 2 * now / 100); ctx.stroke();
    if (t > M.lift + 0.3) {
      ctx.strokeStyle = CYAN; ctx.shadowColor = CYAN; ctx.shadowBlur = 24;
      ctx.beginPath(); ctx.arc(cx, cy, r, start + Math.PI * 2 * f.scoreNow / 100, start + Math.PI * 2 * lift / 100); ctx.stroke();
      ctx.shadowBlur = 0;
    }
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
    const x = 110;
    rise(ctx, 'Not writing more.', x, 790, { t, tin: M.lift - 2.6, tout: out, size: 64, weight: 700, by: 'word', stagger: 0.07, alpha: t > M.lift ? 0.4 : 1 });
    const strike = eio(ramp(t, M.lift - 0.5, M.lift)) * (1 - ramp(t, out, out + 0.3));
    if (strike > 0) { ctx.fillStyle = RED; ctx.fillRect(x - 6, 768, 540 * strike, 6); }
    rise(ctx, 'Using what is written.', x, 880, { t, tin: M.lift + 0.1, tout: out, size: 64, weight: 800, by: 'word', stagger: 0.07, color: '#bff3ff' });
    if (f.best) typed(ctx, `+${(f.best.to - f.scoreNow).toFixed(1)} · ONE SOURCING EVENT THROUGH EVERY LIVE BLUEPRINT`, x, 940, t, M.lift + 0.9, { size: 18, color: CYAN, tout: out, per: 0.018 });
  }

  // Write it. Use it. Let AI build on it.
  function cta(ctx, t) {
    const M = D.M;
    if (t < M.cta1 || t > M.finale) return;
    const beats = [
      [M.cta1, M.cta2, 'WRITE', 'your blueprint.', RED],
      [M.cta2, M.cta3, 'USE', 'it.', INK],
      [M.cta3, M.finale, 'LET AI', 'build on it.', CYAN],
    ];
    beats.forEach(([a, b, big, small, col], i) => {
      if (t < a || t > b) return;
      const tout = b - 0.3;
      const on = ramp(t, a, a + 0.15) * (1 - ramp(t, tout, tout + 0.3));
      scrim(ctx, 'left', on, 0.75);
      scrim(ctx, 'bottom', on * 0.6, 0.5);
      label(ctx, `0${i + 1} / 03`, 116, 400, { size: 18, color: INK, alpha: on * 0.7 });
      slam(ctx, big, 100, 660, { t, tin: a + 0.05, tout, size: 260, weight: 900, color: col, ls: -12 });
      rise(ctx, small, 110, 780, { t, tin: a + 0.35, tout, size: 80, weight: 700, by: 'word', stagger: 0.07, ls: -2 });
      flash(ctx, t, a, i === 0 ? 0 : 0.5);
    });
  }

  function finale(ctx, t) {
    const M = D.M;
    if (t < M.finale) return;
    const out = M.end - 0.35;
    scrim(ctx, 'center', ramp(t, M.finale + 0.1, M.finale + 0.6) * (1 - ramp(t, out, out + 0.4)) * 0.8);
    rise(ctx, 'Blueprints today.', W / 2, 500, { t, tin: M.finale + 0.4, tout: out, size: 120, weight: 800, align: 'center', by: 'word', stagger: 0.12, ls: -3, dur: 0.8 });
    rise(ctx, 'Smart procurement tomorrow.', W / 2, 640, { t, tin: M.finale + 1.5, tout: out, size: 120, weight: 800, align: 'center', by: 'word', stagger: 0.12, ls: -3, dur: 0.8, color: RED });
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
      ctx.drawImage(D.mark, W / 2 - sz / 2, 360 - sz / 2, sz, sz);
      ctx.restore();
    }
    rise(ctx, 'NW Digital City', W / 2, 580, { t, tin: M.end + 0.45, size: 104, weight: 800, align: 'center', ls: -3, stagger: 0.03 });
    rise(ctx, 'Find it on the Agent Marketplace', W / 2, 650, { t, tin: M.end + 0.9, size: 34, weight: 500, align: 'center', by: 'word', color: 'rgba(255,255,255,0.75)' });
    const line = eio(ramp(t, M.end + 1.1, M.end + 1.8));
    ctx.fillStyle = RED;
    ctx.fillRect(W / 2 - 140 * line, 692, 280 * line, 3);
    // The three asks, once more, in the colours they were made in.
    const words = [['WRITE IT', RED], ['USE IT', INK], ['LET AI BUILD ON IT', CYAN]];
    font(ctx, 20, 500, MONO, 4);
    const gap = 60;
    const widths = words.map(([w]) => ctx.measureText(w).width);
    let x = W / 2 - (widths.reduce((s2, v) => s2 + v, 0) + gap * 2) / 2;
    words.forEach(([w, col], i) => { typed(ctx, w, x, 770, t, M.end + 1.6 + i * 0.3, { size: 20, color: col, ls: 4 }); x += widths[i] + gap; });
    const fade = ramp(t, 119.1, 120);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------- the frame
  // Before the frame renders: the city's state, the camera, the sky.
  D.before = function before(t) {
    D.now = t;
    const M = D.M;
    runEvents(t);
    // Nothing of the city is visible under the cold open's matte.
    R.skip = D.ff || t < M.reveal - 0.1;
    if (D.mode === 'cine') placeCamera(t);
    if (D.sky) {
      D.sky.visible = D.mode === 'cine';
      D.sky.position.copy(D.cam.position);
      const night = (ramp(t, M.lightsOff, M.lightsOff + 0.2) * (1 - ramp(t, M.agent - 0.1, M.agent)))
        + (ramp(t, M.cta2 - 0.05, M.cta2) * (1 - ramp(t, M.finale - 0.1, M.finale)));
      const blue = ramp(t, M.potentialOn, M.potentialOn + 1.5) * (1 - ramp(t, M.cta1 - 0.1, M.cta1));
      const u = D.sky.material.uniforms;
      u.mid.value.setRGB(lerp(lerp(0.114, 0.035, night), 0.03, blue), lerp(lerp(0.133, 0.04, night), 0.11, blue), lerp(lerp(0.188, 0.06, night), 0.18, blue));
      u.glowAmt.value = lerp(lerp(0.35, 0.15, night), 0.1, blue);
    }
    const canvas = R.renderer && R.renderer.domElement;
    if (canvas) {
      let blur = 3.5 * ramp(t, M.title - 0.2, M.title + 0.8) * (1 - ramp(t, M.climb - 0.8, M.climb - 0.2));
      blur = Math.max(blur, 6 * ramp(t, M.end - 0.6, M.end));
      const grade = D.mode === 'cine' ? 'contrast(1.08) saturate(1.14)' : '';
      canvas.style.filter = `${blur > 0.05 ? `blur(${blur.toFixed(2)}px) ` : ''}${grade}`;
    }
  };

  // After it renders: everything drawn over it.
  D.after = function after(t) {
    const M = D.M;
    const ctx = D.ctx;
    ctx.clearRect(0, 0, W, H);
    composite(ctx, t);
    agent(ctx, D.bg, t);
    climb(ctx, t);
    challenge(ctx, t);
    vision(ctx, t);
    cta(ctx, t);
    finale(ctx, t);
    title(ctx, t);
    coldOpen(ctx, t);
    chrome(ctx, t);
    for (const at of [M.climb, M.challenge, M.agent, M.potential, M.cta1, M.finale]) wipe(ctx, t, at);
    flash(ctx, t, M.reveal, 0.25, '230,0,0');
    finish(ctx, t);
  };
})();
