/* Runs in the page before anything else loads.
 *
 * Two things the reel needs that the renderer does not offer, taken without
 * touching a line of it:
 *
 * 1. A clock the capture owns. performance.now, Date.now, requestAnimationFrame
 *    and the timers all run on virtual time, advanced one frame at a time by
 *    window.__reel.advance(). A software renderer cannot hold 30 frames a
 *    second at 1080p, so real time would stutter; virtual time never does.
 *
 * 2. The camera. The renderer draws through an isometric orthographic camera.
 *    Every render call is routed through window.__reel.camera(scene, cam),
 *    which may hand back a different camera for that frame.
 */
(() => {
  const realNow = performance.now.bind(performance);
  const realDate = Date.now;
  const epoch = realDate();
  let now = 0;                       // virtual ms since the page opened
  let video = 0;                     // ms of film rendered, which slow motion does not stretch
  let seq = 1;
  const timers = new Map();          // id -> {due, fn, args, every}
  let frames = [];                   // pending rAF callbacks
  let nested = 0;                    // > 0 while a timer callback is running

  /* Randomness the capture owns as well. The city's people and its guide
   * figure wander by Math.random; seeded, every render of a frame puts them in
   * the same place. */
  let seed = 0x9e3779b9;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  performance.now = () => now;
  Date.now = () => epoch + now;
  window.requestAnimationFrame = (fn) => { const id = seq++; frames.push({ id, fn }); return id; };
  window.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
  window.setTimeout = (fn, ms = 0, ...args) => {
    const id = seq++;
    // A browser clamps a timer set from inside another timer to 4 ms. Without
    // the clamp a callback that re-arms itself at 0 ms would run forever in
    // the same instant of virtual time.
    const least = nested ? 4 : 0;
    timers.set(id, { due: now + Math.max(least, +ms || 0), fn, args, every: 0 });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = seq++;
    const every = Math.max(1, +ms || 1);
    timers.set(id, { due: now + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

  function runTimers(until) {
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.due <= until && (!next || t.due < next[1].due)) next = [id, t];
      if (!next) return;
      const [id, t] = next;
      if (t.every) t.due += t.every; else timers.delete(id);
      // Run it at its own time, so whatever it reads or schedules sees that.
      now = Math.max(now, t.due);
      nested++;
      try { typeof t.fn === 'function' ? t.fn(...t.args) : eval(t.fn); } catch (e) { console.error(e); }
      nested--;
    }
  }

  const reel = {
    hooks: [],                 // called with film seconds before the frame renders
    post: [],                  // called with film seconds after it has rendered
    rate: 1,                   // virtual seconds per film second; below 1 is slow motion
    camera: (scene, cam) => cam,
    renderer: null,
    skip: false,               // true while fast-forwarding to a start time
    scene: null,
    now: () => now / 1000,
    video: () => video / 1000,
    // One frame of film. The page's own clock moves by `rate` times as much.
    advance(ms) {
      video += ms;
      const until = now + ms * reel.rate;
      runTimers(until);
      now = until;
      for (const h of reel.hooks) { try { h(video / 1000); } catch (e) { console.error(e); } }
      const batch = frames; frames = [];
      for (const f of batch) { try { f.fn(now); } catch (e) { console.error(e); } }
      // After the frame is drawn, for anything composited from it.
      for (const h of reel.post) { try { h(video / 1000); } catch (e) { console.error(e); } }
      return now;
    },
    realNow,
  };
  window.__reel = reel;

  /* three.min.js is UMD: it assigns an empty object to window.THREE and then
   * fills it. Trap the assignment, then trap WebGLRenderer on that object so
   * every renderer built is one whose render() goes through the reel. */
  let three;
  Object.defineProperty(window, 'THREE', {
    configurable: true,
    get: () => three,
    set(v) {
      three = v;
      let Base;
      Object.defineProperty(v, 'WebGLRenderer', {
        configurable: true, enumerable: true,
        get: () => Base && Base.__reeled,
        set(cls) {
          Base = cls;
          class Reeled extends cls {
            constructor(opts = {}) {
              super({ ...opts, preserveDrawingBuffer: true });
              const render = this.render;
              reel.renderer = this;
              this.render = (scene, cam) => {
                reel.scene = scene;
                if (reel.skip) return undefined;   // fast-forward: advance state, draw nothing
                return render.call(this, scene, reel.camera(scene, cam));
              };
            }
          }
          cls.__reeled = Reeled;
        },
      });
    },
  });
})();
