/* NW Digital City, the renderer.
 *
 * Reads window.NW_CITY (data) and window.NW_CONFIG (which metric drives which
 * visual layer) and builds an isometric brick city. It never fetches anything,
 * so it runs from file:// with no server and no network. That is the on-stage
 * safety net, and it is why the data arrives as a global rather than an import.
 *
 * Geography follows the category tree: L2 is a district, L3 is a plot, L4 is a
 * building. The four measures of the blueprint story are the four things you
 * can see: foundation, height, houses, reactor.
 *
 * Public API (the agent drives the city through this):
 *   NWCity.focus(code)              fly to one category
 *   NWCity.reset()                  back to the whole city
 *   NWCity.setLayerMetric(l, m)     repoint a visual layer at another metric
 */
(function () {
  "use strict";

  const CITY = window.NW_CITY;
  const CONFIG = window.NW_CONFIG;

  // ---------------------------------------------------------------- palette
  // Colour carries meaning in exactly one place: blueprint state, using the
  // reserved status roles. District identity is carried by position and a name
  // plate, never by hue, so nothing here depends on telling eight colours
  // apart on a projector.
  const C = {
    sky: 0x080b12,
    ground: 0x24422c, // Lego grass baseplate
    districtPlate: 0x232a34,
    plotPlate: 0x2f3742,
    bare: 0x7c8794, // muted: absence rather than a status
    draft: 0xfab219, // status: warning
    active: 0x0ca30c, // status: good
    brick: 0xd9d3c6,
    brickAlt: 0xc2bcae,
    stud: 0xe4dfd3,
    house: 0x2e9e4f, // Monopoly green
    hotel: 0xe60000, // Vodafone red
    reactor: 0x7fdcff,
    label: "#e8eaf0",
  };

  // Monopoly property-group colours. Reinforcement only: every district also
  // carries a printed name plate and its own patch of ground, so identity never
  // rests on telling eight hues apart. The measures that must be read exactly
  // status, height, houses and reactor, stay on shape, height and count.
  const DISTRICT_BANDS = [
    "#3987e5", "#d95926", "#199e70", "#c98500",
    "#d55181", "#008300", "#9085e9", "#e66767",
  ];

  // A Lego brick reads as a light face over a saturated body, so each district
  // hue is mixed toward white for the wall and left darker for the banding.
  function brickSet(index) {
    const base = new THREE.Color(DISTRICT_BANDS[index % DISTRICT_BANDS.length]);
    const wall = base.clone().lerp(new THREE.Color(0xffffff), 0.1);
    return {
      main: wall.getHex(),
      alt: wall.clone().lerp(new THREE.Color(0x000000), 0.16).getHex(),
      stud: wall.clone().lerp(new THREE.Color(0xffffff), 0.22).getHex(),
      band: base.getHex(),
    };
  }

  // ------------------------------------------------------------ dimensions
  const CELL = 4.0;        // one building lot
  const FOOT = 2.4;        // building footprint
  const FLOOR_H = 1.15;
  const PER_ROW = 4;       // buildings per row within a plot
  const PLOT_PAD = 1.8;
  const DISTRICT_PAD = 3.2;
  const DISTRICT_MAX_W = 32;
  const WORLD_MAX_W = 132;
  // Floors per height tier. Six entries so any registered metric can drive it.
  const FLOORS = [0, 2, 4, 7, 10, 14];

  // ------------------------------------------------------------------ tiers
  function metricDef(name) {
    return CONFIG.metrics[name];
  }

  function tierIndex(metricName, value) {
    const def = metricDef(metricName);
    if (!def) return 0;
    if (def.kind === "categorical") {
      const i = def.tiers.findIndex((t) => t.value === value);
      return i < 0 ? 0 : i;
    }
    const v = typeof value === "number" ? value : 0;
    for (let i = 0; i < def.tiers.length; i++) {
      const max = def.tiers[i].max;
      if (max === null || max === undefined || v <= max) return i;
    }
    return def.tiers.length - 1;
  }

  function tierOf(metricName, value) {
    return metricDef(metricName).tiers[tierIndex(metricName, value)];
  }

  function layerMetric(layer) {
    return CONFIG.layers[layer].metric;
  }

  function valueFor(category, layer) {
    return category.metrics[layerMetric(layer)];
  }

  // ----------------------------------------------------------------- layout
  // Shelf packing: place boxes left to right, wrap to a new row when the shelf
  // is full. Deterministic, so the city looks identical every run.
  function shelfPack(items, maxWidth, gap) {
    let x = 0, z = 0, rowDepth = 0, width = 0;
    for (const item of items) {
      if (x > 0 && x + item.w > maxWidth) {
        x = 0;
        z += rowDepth + gap;
        rowDepth = 0;
      }
      item.x = x;
      item.z = z;
      x += item.w + gap;
      width = Math.max(width, x - gap);
      rowDepth = Math.max(rowDepth, item.d);
    }
    return { w: width, d: z + rowDepth };
  }

  function buildLayout() {
    const byCode = new Map(CITY.categories.map((c) => [c.code, c]));

    const districts = CITY.districts.map((district, index) => {
      const plots = district.plots.map((plot) => {
        const cols = Math.min(plot.codes.length, PER_ROW);
        const rows = Math.ceil(plot.codes.length / PER_ROW);
        return {
          name: plot.name,
          codes: plot.codes,
          cols,
          rows,
          w: cols * CELL + PLOT_PAD,
          d: rows * CELL + PLOT_PAD,
        };
      });
      const inner = shelfPack(plots, DISTRICT_MAX_W, 1.6);
      return {
        index,
        name: district.name,
        plots,
        totals: district.totals,
        w: inner.w + DISTRICT_PAD * 2,
        d: inner.d + DISTRICT_PAD * 2 + 2.4, // extra depth for the name plate
      };
    });

    // Widest districts first packs more tightly and keeps the skyline balanced.
    const ordered = districts.slice().sort((a, b) => b.w - a.w || a.name.localeCompare(b.name));
    const world = shelfPack(ordered, WORLD_MAX_W, 5.0);

    const buildings = [];
    for (const district of districts) {
      district.cx = district.x - world.w / 2;
      district.cz = district.z - world.d / 2;
      for (const plot of district.plots) {
        plot.cx = district.cx + DISTRICT_PAD + plot.x;
        plot.cz = district.cz + DISTRICT_PAD + 2.4 + plot.z;
        plot.codes.forEach((code, i) => {
          const col = i % PER_ROW;
          const row = Math.floor(i / PER_ROW);
          buildings.push({
            category: byCode.get(code),
            district,
            plot,
            x: plot.cx + PLOT_PAD / 2 + col * CELL + CELL / 2,
            z: plot.cz + PLOT_PAD / 2 + row * CELL + CELL / 2,
          });
        });
      }
    }
    return { districts, buildings, size: world };
  }

  // ------------------------------------------------------------- instancing
  // Thousands of bricks would be thousands of draw calls. Everything of one
  // shape is collected here and drawn as a single InstancedMesh.
  function Bucket() {
    this.items = [];
  }
  Bucket.prototype.add = function (x, y, z, sx, sy, sz, color) {
    this.items.push({ x, y, z, sx, sy, sz, color });
    return this.items.length - 1;
  };
  Bucket.prototype.mesh = function (geometry, material, castShadow, receiveShadow) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, this.items.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    this.items.forEach((item, i) => {
      matrix.makeScale(item.sx, item.sy, item.sz);
      matrix.setPosition(item.x, item.y, item.z);
      mesh.setMatrixAt(i, matrix);
      if (item.color !== undefined && mesh.setColorAt) {
        mesh.setColorAt(i, color.setHex(item.color));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = !!receiveShadow;
    return mesh;
  };

  // ------------------------------------------------------------------ scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.sky);

  const layout = buildLayout();
  const span = Math.max(layout.size.w, layout.size.d);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  const view = { size: span * 0.62, target: new THREE.Vector3(0, 0, 0) };
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  const CAM_DIR = new THREE.Vector3(1, 0.86, 1).normalize();

  function applyCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -view.size * aspect;
    camera.right = view.size * aspect;
    camera.top = view.size;
    camera.bottom = -view.size;
    camera.position.copy(view.target).addScaledVector(CAM_DIR, 400);
    camera.lookAt(view.target);
    camera.updateProjectionMatrix();
  }

  // Frame content by projecting its bounding box onto the camera basis, so the
  // fit is correct at any aspect ratio instead of guessed from a magic number.
  function fitTo(box, margin) {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(CAM_DIR, up).normalize();
    const camUp = new THREE.Vector3().crossVectors(right, CAM_DIR).normalize();
    const centre = box.getCenter(new THREE.Vector3());
    let h = 0, v = 0;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).sub(centre);
          h = Math.max(h, Math.abs(p.dot(right)));
          v = Math.max(v, Math.abs(p.dot(camUp)));
        }
      }
    }
    const aspect = window.innerWidth / window.innerHeight;
    return { size: Math.max(v, h / aspect) * margin, target: centre.setY(0) };
  }

  scene.add(new THREE.HemisphereLight(0xa8c0e8, 0x232830, 0.46));
  scene.add(new THREE.AmbientLight(0xffffff, 0.14));
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.92);
  sun.position.set(span * 0.55, span * 0.9, span * 0.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shade = span * 0.75;
  Object.assign(sun.shadow.camera, {
    left: -shade, right: shade, top: shade, bottom: -shade, near: 1, far: span * 3,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);

  // ------------------------------------------------------------- geometries
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const cone = new THREE.ConeGeometry(0.5, 1, 7);

  const matSolid = new THREE.MeshLambertMaterial();
  const matPlate = new THREE.MeshLambertMaterial();
  const matGhost = new THREE.MeshBasicMaterial({
    color: C.bare, wireframe: true, transparent: true, opacity: 0.3,
  });
  const matGhostSolid = new THREE.MeshLambertMaterial({
    color: C.bare, transparent: true, opacity: 0.07,
  });
  const matReactor = new THREE.MeshBasicMaterial({ color: C.reactor });

  const plates = new Bucket();
  const bricks = new Bucket();
  const studs = new Bucket();
  const houses = new Bucket();
  const ghostBricks = new Bucket();
  const ghostSolid = new Bucket();
  const ghostHouses = new Bucket();
  const reactors = new Bucket();

  // A Lego baseplate is a grid of studs. Cheaper as a repeating texture than as
  // thousands of cylinders, and the plates are few enough to each own one.
  const STUD_TILE = 2.0;
  function studTexture(hex, studHex) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#" + hex.toString(16).padStart(6, "0");
    ctx.fillRect(0, 0, size, size);
    const r = size * 0.27;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2 + size * 0.03, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = "#" + studHex.toString(16).padStart(6, "0");
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  function studdedPlate(x, y, z, w, h, d, hex, studHex) {
    const tex = studTexture(hex, studHex);
    tex.repeat.set(Math.max(1, Math.round(w / STUD_TILE)), Math.max(1, Math.round(d / STUD_TILE)));
    const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // world baseplate
  const baseW = layout.size.w + 10;
  const baseD = layout.size.d + 10;
  studdedPlate(0, -0.6, 0, baseW, 1.2, baseD, C.ground, 0x2c5136);

  const labels = [];
  function makeLabel(text, accent, scale) {
    const pad = 16, fontSize = 40;
    const measure = document.createElement("canvas").getContext("2d");
    measure.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const w = Math.ceil(measure.measureText(text).width) + pad * 2 + 18;
    const h = fontSize + pad * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(10,12,17,0.9)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 10, h);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = C.label;
    ctx.textBaseline = "middle";
    ctx.fillText(text, pad + 12, h / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set((w / h) * scale, scale, 1);
    sprite.userData.base = { w: (w / h) * scale, h: scale };
    sprite.renderOrder = 10;
    return sprite;
  }

  // ---------------------------------------------------------------- build it
  layout.districts.forEach((district, i) => {
    const palette = brickSet(i);
    studdedPlate(
      district.cx + district.w / 2, -0.05, district.cz + district.d / 2,
      district.w, 0.5, district.d, C.districtPlate, 0x39434f
    );
    // The Monopoly property band. It used to run flat down the whole block
    // edge, which at street level read as a canal. Now it is short and raised,
    // so it reads as a marker at the front of the block.
    plates.add(
      district.cx + district.w / 2, 0.42, district.cz + 0.8,
      Math.min(district.w * 0.42, 13), 0.62, 0.7, palette.band
    );
    for (const plot of district.plots) {
      studdedPlate(
        plot.cx + plot.w / 2, 0.22, plot.cz + plot.d / 2,
        plot.w, 0.34, plot.d, C.plotPlate, 0x4a5563
      );
    }
    const label = makeLabel(district.name, DISTRICT_BANDS[i % DISTRICT_BANDS.length], 2.9);
    label.position.set(district.cx + district.w / 2, 6.5, district.cz + 1.4);
    scene.add(label);
    labels.push(label);
  });

  // ---------------------------------------------------------- streetscape
  // The gaps between district blocks were dead grey space. They are streets:
  // asphalt with lane markings, lamp posts along the kerbs, parkland on the
  // leftover ground, and people walking about in it. None of it encodes data.
  // it is there so the city reads as a place rather than as a bar chart with
  // studs, which is what makes an empty lot feel like an empty lot.
  const PAVEMENT_TOP = 0.25;
  const lampHeads = [];
  const walkers = [];
  const vehicles = [];
  const headlights = [];

  function buildStreetscape() {
    const roadBucket = new Bucket();
    const pavementBucket = new Bucket();
    const dashBucket = new Bucket();
    const trunkBucket = new Bucket();
    const canopyBucket = new Bucket();
    const postBucket = new Bucket();
    const headBucket = new Bucket();

    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const d of layout.districts) {
      bounds.minX = Math.min(bounds.minX, d.cx);
      bounds.maxX = Math.max(bounds.maxX, d.cx + d.w);
      bounds.minZ = Math.min(bounds.minZ, d.cz);
      bounds.maxZ = Math.max(bounds.maxZ, d.cz + d.d);
    }

    // Districts were shelf-packed, so their rows and the gaps between them are
    // already a street grid, so it only has to be drawn.
    const rows = new Map();
    for (const d of layout.districts) {
      const key = Math.round(d.z);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(d);
    }
    const rowKeys = [...rows.keys()].sort((a, b) => a - b);

    const ROAD = 4.8;
    const PAVEMENT = 1.15;
    const KERB_H = 0.26;
    const roads = [];
    const road = (x, z, w, d) => roads.push({ x, z, w, d, vertical: d > w });

    const pad = 2.4;
    const minX = bounds.minX - pad, maxX = bounds.maxX + pad;
    const minZ = bounds.minZ - pad, maxZ = bounds.maxZ + pad;
    const spanX = maxX - minX, spanZ = maxZ - minZ;
    road((minX + maxX) / 2, minZ, spanX + ROAD * 2, ROAD);
    road((minX + maxX) / 2, maxZ, spanX + ROAD * 2, ROAD);
    road(minX, (minZ + maxZ) / 2, ROAD, spanZ);
    road(maxX, (minZ + maxZ) / 2, ROAD, spanZ);

    for (let i = 0; i < rowKeys.length - 1; i++) {
      const above = rows.get(rowKeys[i]);
      const below = rows.get(rowKeys[i + 1]);
      const z0 = Math.max(...above.map((d) => d.cz + d.d));
      const z1 = Math.min(...below.map((d) => d.cz));
      road((minX + maxX) / 2, (z0 + z1) / 2, spanX, Math.max(ROAD, z1 - z0));
    }

    for (const key of rowKeys) {
      const row = rows.get(key).slice().sort((a, b) => a.cx - b.cx);
      const z0 = Math.min(...row.map((d) => d.cz)) - 1.2;
      const z1 = Math.max(...row.map((d) => d.cz + d.d)) + 1.2;
      for (let i = 0; i < row.length - 1; i++) {
        const x0 = row[i].cx + row[i].w;
        const x1 = row[i + 1].cx;
        road((x0 + x1) / 2, (z0 + z1) / 2, Math.max(ROAD, x1 - x0), z1 - z0);
      }
    }

    for (const r of roads) {
      roadBucket.add(r.x, 0.02, r.z, r.w, 0.16, r.d, 0x3b414b);

      // Pavements down both sides. People belong on these, not in the road.
      const short = r.vertical ? r.w : r.d;
      const walkway = short / 2 - PAVEMENT / 2;
      for (const side of [-1, 1]) {
        pavementBucket.add(
          r.x + (r.vertical ? side * walkway : 0), 0.12, r.z + (r.vertical ? 0 : side * walkway),
          r.vertical ? PAVEMENT : r.w, KERB_H, r.vertical ? r.d : PAVEMENT,
          0x878e99
        );
      }

      // centre line
      const length = r.vertical ? r.d : r.w;
      const steps = Math.max(1, Math.floor(length / 3.2));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps - 0.5;
        const dx = r.vertical ? 0 : t * r.w;
        const dz = r.vertical ? t * r.d : 0;
        dashBucket.add(
          r.x + dx, 0.11, r.z + dz,
          r.vertical ? 0.16 : 1.1, 0.04, r.vertical ? 1.1 : 0.16,
          0xd6d2c4
        );
      }

      // lamp posts down both kerbs
      const half = (r.vertical ? r.w : r.d) / 2 - PAVEMENT / 2;
      const lampSteps = Math.max(1, Math.floor(length / 11));
      for (let i = 0; i < lampSteps; i++) {
        const t = (i + 0.5) / lampSteps - 0.5;
        for (const side of [-1, 1]) {
          const x = r.x + (r.vertical ? side * half : t * r.w);
          const z = r.z + (r.vertical ? t * r.d : side * half);
          postBucket.add(x, 1.15, z, 0.16, 2.3, 0.16, 0x2b3038);
          headBucket.add(x, 2.42, z, 0.5, 0.24, 0.5, 0xffe6a6);
          lampHeads.push({ x, y: 2.42, z });
        }
      }
    }

    // Parkland on whatever ground the blocks and streets do not use.
    const blocked = (x, z) => {
      for (const d of layout.districts) {
        if (x > d.cx - 1.4 && x < d.cx + d.w + 1.4 && z > d.cz - 1.4 && z < d.cz + d.d + 1.4) return true;
      }
      for (const r of roads) {
        if (Math.abs(x - r.x) < r.w / 2 + 1 && Math.abs(z - r.z) < r.d / 2 + 1) return true;
      }
      return false;
    };

    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let x = -baseW / 2 + 3; x < baseW / 2 - 3; x += 4.6) {
      for (let z = -baseD / 2 + 3; z < baseD / 2 - 3; z += 4.6) {
        const jx = x + (rnd() - 0.5) * 2;
        const jz = z + (rnd() - 0.5) * 2;
        if (blocked(jx, jz) || rnd() > 0.34) continue;
        const scale = 0.8 + rnd() * 0.6;
        trunkBucket.add(jx, 0.45 * scale, jz, 0.22, 0.9 * scale, 0.22, 0x5b4632);
        canopyBucket.add(jx, (0.9 + 0.6) * scale, jz, 1.5 * scale, 1.7 * scale, 1.5 * scale, 0x2f7d46);
        canopyBucket.add(jx, (0.9 + 1.35) * scale, jz, 1.1 * scale, 1.3 * scale, 1.1 * scale, 0x39916f);
      }
    }

    const solid = new THREE.MeshLambertMaterial();
    [
      roadBucket.mesh(box, solid, false, true),
      pavementBucket.mesh(box, solid, false, true),
      dashBucket.mesh(box, solid, false, false),
      trunkBucket.mesh(box, solid, true, false),
      canopyBucket.mesh(cone, solid, true, false),
      postBucket.mesh(box, solid, true, false),
      headBucket.mesh(box, new THREE.MeshLambertMaterial({ emissive: 0x000000 }), false, false),
    ].forEach((mesh) => mesh && scene.add(mesh));

    buildPedestrians(roads, rnd);
    buildTraffic(roads, rnd);
  }

  // People, and a few dogs. Small, slow and never in the way. They exist so
  // the streets are not empty while the room looks at the skyline.
  function buildPedestrians(roads, rnd) {
    const COATS = [0xd94f4f, 0x3f7fd0, 0xe0b53c, 0x46a06a, 0xb35fb0, 0xdd8a3a];
    const group = new THREE.Group();
    const longRoads = roads.filter((r) => Math.max(r.w, r.d) > 14);

    for (let i = 0; i < 34; i++) {
      const r = longRoads[Math.floor(rnd() * longRoads.length)] || roads[0];
      const coat = COATS[Math.floor(rnd() * COATS.length)];
      const person = new THREE.Group();
      const body = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: coat }));
      body.scale.set(0.42, 0.8, 0.36);
      body.position.y = 0.4;
      body.castShadow = true;
      person.add(body);
      const head = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xf3c85c }));
      head.scale.set(0.34, 0.32, 0.32);
      head.position.y = 0.96;
      person.add(head);
      group.add(person);

      let dog = null;
      if (rnd() < 0.28) {
        dog = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0x8a6b4a }));
        dog.scale.set(0.42, 0.28, 0.24);
        dog.position.y = 0.15;
        group.add(dog);
      }

      // On the pavement, on one side or the other, not down the middle of the road.
      const short = r.vertical ? r.w : r.d;
      const side = rnd() < 0.5 ? -1 : 1;
      const lane = side * (short / 2 - 0.6 + (rnd() - 0.5) * 0.5);
      walkers.push({
        person,
        dog,
        road: r,
        lane,
        t: rnd(),
        speed: (0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1),
      });
    }
    scene.add(group);
  }

  // Traffic. Vehicles keep to a lane on their side of the centre line and run
  // the length of a street, which is enough to read as a working city from the
  // isometric camera. The tram is the exception: it gets its own avenue, rails
  // and a fixed route, because a tram is the thing that makes a model city look
  // like somebody planned it.
  function vehicleBody(kind, colour) {
    const group = new THREE.Group();
    const panel = (hex, x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: hex }));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const glass = 0x2b3644;

    if (kind === "bus") {
      panel(colour, 0, 0.62, 0, 3.4, 0.95, 1.15);
      panel(glass, 0, 0.95, 0, 3.2, 0.28, 1.2);
      panel(0x1b1e24, -1.1, 0.16, 0, 0.5, 0.32, 1.25);
      panel(0x1b1e24, 1.1, 0.16, 0, 0.5, 0.32, 1.25);
    } else if (kind === "truck") {
      panel(colour, -1.15, 0.62, 0, 1.2, 0.9, 1.1);
      panel(glass, -1.15, 0.92, 0, 1.0, 0.26, 1.15);
      panel(0xd8d4c8, 0.55, 0.78, 0, 2.2, 1.2, 1.15);
      panel(0x1b1e24, -1.1, 0.16, 0, 0.45, 0.32, 1.2);
      panel(0x1b1e24, 0.9, 0.16, 0, 0.45, 0.32, 1.2);
    } else {
      panel(colour, 0, 0.42, 0, 2.0, 0.5, 0.95);
      panel(glass, 0.05, 0.76, 0, 1.05, 0.34, 0.88);
      panel(0x1b1e24, -0.65, 0.14, 0, 0.4, 0.28, 1.0);
      panel(0x1b1e24, 0.65, 0.14, 0, 0.4, 0.28, 1.0);
    }

    const lamp = panel(0xfff0c0, kind === "bus" ? 1.72 : 1.03, 0.45, 0, 0.12, 0.16, 0.75);
    headlights.push(lamp);
    return group;
  }

  function cycle(colour) {
    const group = new THREE.Group();
    const piece = (hex, x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: hex }));
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
    };
    piece(0x1b1e24, -0.42, 0.22, 0, 0.1, 0.44, 0.44);   // rear wheel
    piece(0x1b1e24, 0.42, 0.22, 0, 0.1, 0.44, 0.44);    // front wheel
    piece(0x9aa3ae, 0, 0.4, 0, 0.95, 0.09, 0.09);       // frame
    piece(colour, -0.05, 0.75, 0, 0.32, 0.55, 0.3);     // rider
    piece(0xf3c85c, -0.05, 1.1, 0, 0.28, 0.26, 0.26);   // head
    return group;
  }

  function buildTraffic(roads, rnd) {
    const PAINT = [0xd94f4f, 0x3f7fd0, 0xe8e4d8, 0x46a06a, 0x2b3038, 0xdd8a3a];
    const group = new THREE.Group();
    const usable = roads.filter((r) => Math.max(r.w, r.d) > 16);

    for (let i = 0; i < 34; i++) {
      const road = usable[Math.floor(rnd() * usable.length)] || roads[0];
      const roll = rnd();
      const kind = roll < 0.62 ? "car" : roll < 0.84 ? "truck" : "bus";
      const forward = rnd() < 0.5;
      const vehicle = vehicleBody(kind, PAINT[Math.floor(rnd() * PAINT.length)]);
      group.add(vehicle);
      vehicles.push({
        object: vehicle,
        road,
        // keep right, so the lane offset follows the direction of travel
        lane: (forward ? 1 : -1) * 0.85,
        t: rnd(),
        speed: (forward ? 1 : -1) * (kind === "bus" ? 0.05 : 0.07 + rnd() * 0.05),
      });
    }

    // A few cyclists, keeping in close to the kerb where a cycle lane would be.
    for (let i = 0; i < 6; i++) {
      const road = usable[Math.floor(rnd() * usable.length)] || roads[0];
      const forward = rnd() < 0.5;
      const short = road.vertical ? road.w : road.d;
      const bike = cycle([0x46a06a, 0xd94f4f, 0x3f7fd0, 0xe0b53c][Math.floor(rnd() * 4)]);
      group.add(bike);
      vehicles.push({
        object: bike,
        road,
        lane: (forward ? 1 : -1) * (short / 2 - 1.55),
        t: rnd(),
        speed: (forward ? 1 : -1) * (0.035 + rnd() * 0.02),
      });
    }

    // The tram takes the longest street in the city and keeps it.
    const avenue = roads.slice().sort(
      (a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d)
    )[0];
    if (avenue) {
      const rails = new Bucket();
      const length = avenue.vertical ? avenue.d : avenue.w;
      for (const side of [-0.62, 0.62]) {
        rails.add(
          avenue.x + (avenue.vertical ? side : 0), 0.13, avenue.z + (avenue.vertical ? 0 : side),
          avenue.vertical ? 0.14 : length, 0.06, avenue.vertical ? length : 0.14,
          0x6d737d
        );
      }
      const railMesh = rails.mesh(box, new THREE.MeshLambertMaterial(), false, false);
      if (railMesh) scene.add(railMesh);

      const tram = new THREE.Group();
      for (let car = 0; car < 3; car++) {
        const unit = new THREE.Group();
        const body = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xe60000 }));
        body.scale.set(2.9, 1.05, 1.25);
        body.position.y = 0.72;
        body.castShadow = true;
        unit.add(body);
        const windows = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: 0xf3f1e8 }));
        windows.scale.set(2.6, 0.34, 1.3);
        windows.position.y = 1.0;
        unit.add(windows);
        unit.userData.offset = (car - 1) * 3.1;
        tram.add(unit);
      }
      group.add(tram);
      vehicles.push({ object: tram, road: avenue, lane: 0, t: 0.2, speed: 0.035, tram: true });
    }

    scene.add(group);
  }

  function updateTraffic(delta) {
    for (const v of vehicles) {
      v.t += v.speed * delta;
      if (v.t > 1) v.t -= 1;
      if (v.t < 0) v.t += 1;
      const r = v.road;
      const length = r.vertical ? r.d : r.w;
      const along = (v.t - 0.5) * length;
      const facing = v.speed > 0 ? 1 : -1;

      if (v.tram) {
        // carriages follow the leader down the same line
        for (const unit of v.object.children) {
          let at = along + unit.userData.offset * facing;
          const half = length / 2;
          if (at > half) at -= length;
          if (at < -half) at += length;
          unit.position.set(
            r.x + (r.vertical ? 0 : at),
            0,
            r.z + (r.vertical ? at : 0)
          );
          unit.rotation.y = r.vertical ? Math.PI / 2 : 0;
        }
        continue;
      }

      v.object.position.set(
        r.x + (r.vertical ? v.lane : along),
        0,
        r.z + (r.vertical ? along : v.lane)
      );
      v.object.rotation.y = (r.vertical ? Math.PI / 2 : 0) + (facing > 0 ? 0 : Math.PI);
    }
  }

  function updateWalkers(now, delta) {
    for (const w of walkers) {
      w.t += w.speed * delta;
      if (w.t > 1) w.t -= 1;
      if (w.t < 0) w.t += 1;
      const r = w.road;
      const along = (w.t - 0.5) * (r.vertical ? r.d : r.w);
      const x = r.x + (r.vertical ? w.lane : along);
      const z = r.z + (r.vertical ? along : w.lane);
      const bob = Math.abs(Math.sin(now * 8 + w.lane)) * 0.06;
      w.person.position.set(x, PAVEMENT_TOP + bob, z);
      w.person.rotation.y = r.vertical ? (w.speed > 0 ? 0 : Math.PI) : (w.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (w.dog) {
        const trail = 0.9 * (w.speed > 0 ? -1 : 1);
        w.dog.position.set(
          x + (r.vertical ? 0.45 : trail),
          PAVEMENT_TOP,
          z + (r.vertical ? trail : 0.45)
        );
        w.dog.rotation.y = w.person.rotation.y;
      }
    }
  }

  buildStreetscape();

  const pickTargets = [];
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false,
  });

  for (const building of layout.buildings) {
    const category = building.category;
    const state = category.blueprint_state;
    const heightTier = tierIndex(layerMetric("height"), valueFor(category, "height"));
    const valueTier = tierOf(layerMetric("value"), valueFor(category, "value"));
    const pieceCount = valueTier.pieces !== undefined
      ? valueTier.pieces
      : tierIndex(layerMetric("value"), valueFor(category, "value"));
    const reactorTier = tierIndex(layerMetric("reactor"), valueFor(category, "reactor"));

    const palette = brickSet(building.district.index);
    const pieces = { foundation: null, floors: [], studs: [], houses: [], ghosts: [], reactor: null };
    building.pieces = pieces;
    const x = building.x, z = building.z;
    const active = state === "active";
    const floors = active ? FLOORS[Math.min(heightTier, FLOORS.length - 1)] : 0;

    // Foundation. Kate's rule: draft claims the plot, active lays foundations.
    const foundationColor = state === "active" ? C.active : state === "draft" ? C.draft : C.bare;
    pieces.foundation = { bucket: "plates", i: plates.add(x, 0.5, z, FOOT + 0.5, 0.24, FOOT + 0.5, foundationColor) };

    let top = 0.62;
    if (floors > 0) {
      for (let f = 0; f < floors; f++) {
        const y = 0.62 + f * FLOOR_H + FLOOR_H / 2;
        pieces.floors.push({ bucket: "bricks", i: bricks.add(x, y, z, FOOT, FLOOR_H - 0.2, FOOT, f % 2 ? palette.alt : palette.main) });
      }
      top = 0.62 + floors * FLOOR_H;
      // studs only on the roof: enough to read as brick, cheap to draw
      for (const dx of [-0.58, 0.58]) {
        for (const dz of [-0.58, 0.58]) {
          pieces.studs.push({ bucket: "studs", i: studs.add(x + dx, top + 0.11, z + dz, 0.62, 0.22, 0.62, palette.stud) });
        }
      }
      if (reactorTier > 0) {
        const glow = 0.32 + reactorTier * 0.16;
        pieces.reactor = { bucket: "reactors", i: reactors.add(x, top + 0.34, z, glow * 2, 0.3, glow * 2) };
      }
    } else {
      // Nothing built: show the outline of what could stand here.
      const ghostFloors = FLOORS[Math.min(Math.max(heightTier, 1), FLOORS.length - 1)];
      const h = ghostFloors * FLOOR_H;
      pieces.ghosts.push({ bucket: "ghostBricks", i: ghostBricks.add(x, 0.62 + h / 2, z, FOOT, h, FOOT) });
      pieces.ghosts.push({ bucket: "ghostSolid", i: ghostSolid.add(x, 0.62 + h / 2, z, FOOT, h, FOOT) });
    }

    // Houses and hotel along the front of the lot. On an undeveloped plot they
    // are ghosted, because the value is real but the development is not.
    if (pieceCount > 0) {
      const hotel = valueTier.id === "hotel";
      const count = hotel ? 1 : pieceCount;
      const size = hotel ? 0.95 : 0.52;
      const step = hotel ? 0 : 0.66;
      const startX = x - ((count - 1) * step) / 2;
      for (let p = 0; p < count; p++) {
        const target = active ? houses : ghostHouses;
        const bucketName = active ? "houses" : "ghostHouses";
        pieces.houses.push({
          bucket: bucketName,
          i: target.add(
            startX + p * step, 0.62 + size / 2, z + FOOT / 2 + 0.75,
            size, size, size, hotel ? C.hotel : C.house
          ),
        });
      }
    }

    const pick = new THREE.Mesh(box, pickMaterial);
    pick.scale.set(CELL - 0.6, Math.max(top + 1.5, 3), CELL - 0.6);
    pick.position.set(x, Math.max(top + 1.5, 3) / 2, z);
    pick.userData.category = category;
    scene.add(pick);
    pickTargets.push(pick);
  }

  const BUCKETS = {
    plates: { bucket: plates, mesh: plates.mesh(box, matPlate, false, true) },
    bricks: { bucket: bricks, mesh: bricks.mesh(box, matSolid, true, true) },
    studs: { bucket: studs, mesh: studs.mesh(cyl, matSolid, true, false) },
    houses: { bucket: houses, mesh: houses.mesh(box, matSolid, true, true) },
    ghostSolid: { bucket: ghostSolid, mesh: ghostSolid.mesh(box, matGhostSolid, false, false) },
    ghostBricks: { bucket: ghostBricks, mesh: ghostBricks.mesh(box, matGhost, false, false) },
    ghostHouses: { bucket: ghostHouses, mesh: ghostHouses.mesh(box, matGhostSolid, false, false) },
    reactors: { bucket: reactors, mesh: reactors.mesh(cyl, matReactor, false, false) },
  };
  Object.values(BUCKETS).forEach((entry) => entry.mesh && scene.add(entry.mesh));

  // --------------------------------------------------------------- the build
  // Pieces are instances inside shared meshes, so "building" a category means
  // rewriting a handful of instance matrices over time. One building can be
  // torn down and reassembled without its neighbours so much as flickering.
  const BUILD_SPEED = Number(new URLSearchParams(location.search).get("speed")) || 1;
  const MATRIX = new THREE.Matrix4();
  const dirty = new Set();
  let scheduled = [];

  function setPiece(ref, progress) {
    const entry = BUCKETS[ref.bucket];
    if (!entry || !entry.mesh) return;
    const item = entry.bucket.items[ref.i];
    if (progress <= 0) {
      MATRIX.makeScale(0, 0, 0);
      MATRIX.setPosition(item.x, item.y, item.z);
    } else {
      const e = 1 - Math.pow(1 - progress, 3);
      const squash = 0.7 + 0.3 * e;
      MATRIX.makeScale(item.sx, item.sy * squash, item.sz);
      MATRIX.setPosition(item.x, item.y + (1 - e) * 6, item.z);
    }
    entry.mesh.setMatrixAt(ref.i, MATRIX);
    dirty.add(entry.mesh);
  }

  function schedule(ref, at, duration) {
    if (!ref) return;
    setPiece(ref, 0);
    scheduled.push({ ref, at, duration });
  }

  // The order is the point: foundation, then height, then value, then reactor.
  // Every build re-teaches the four measures without anyone narrating them.
  function buildSequence(building, t0, rate) {
    const k = 1 / (BUILD_SPEED * rate);
    const p = building.pieces;
    let t = t0;
    schedule(p.foundation, t, 0.34 * k);
    t += 0.3 * k;
    p.ghosts.forEach((g) => schedule(g, t, 0.45 * k));
    p.floors.forEach((f, i) => schedule(f, t + i * 0.1 * k, 0.32 * k));
    t += p.floors.length * 0.1 * k;
    p.studs.forEach((st) => schedule(st, t, 0.24 * k));
    t += 0.18 * k;
    p.houses.forEach((h, i) => schedule(h, t + i * 0.07 * k, 0.28 * k));
    t += (p.houses.length * 0.07 + 0.2) * k;
    if (p.reactor) {
      schedule(p.reactor, t, 0.45 * k);
      t += 0.45 * k;
    }
    return t;
  }

  function clockNow() {
    return performance.now() / 1000;
  }

  // The opening shot: the whole city assembles itself, district by district.
  function cityRise() {
    const t0 = clockNow() + 0.35;
    layout.buildings.forEach((building, i) => {
      buildSequence(building, t0 + building.district.index * 0.16 + i * 0.006, 3.2);
    });
  }

  function rebuild(building) {
    const from = clockNow();
    scheduled = scheduled.filter((s) => !ownsPiece(building, s.ref));
    return buildSequence(building, from, 1);
  }

  function ownsPiece(building, ref) {
    const p = building.pieces;
    if (p.foundation === ref || p.reactor === ref) return true;
    return p.floors.includes(ref) || p.studs.includes(ref)
      || p.houses.includes(ref) || p.ghosts.includes(ref);
  }

  function stepBuild() {
    if (!scheduled.length) return;
    const now = clockNow();
    const still = [];
    for (const entry of scheduled) {
      const progress = (now - entry.at) / entry.duration;
      if (progress < 0) {
        still.push(entry);
        continue;
      }
      setPiece(entry.ref, Math.min(1, progress));
      if (progress < 1) still.push(entry);
    }
    scheduled = still;
    for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
    dirty.clear();
  }

  // ------------------------------------------------------------------- HUD
  const euro = (n) =>
    n >= 1e6 ? `€${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}m`
      : n > 0 ? `€${Math.round(n / 1e3)}k` : "Not recorded";

  function renderStats() {
    const t = CITY.totals;
    const stats = [
      [t.with_blueprint, "developed"],
      [t.empty_lots, "empty lots"],
      [CITY.meta.counts.markets, "markets"],
      [euro(t.spend_eur), "spend"],
    ];
    document.getElementById("stats").innerHTML = stats
      .map(([n, k]) => `<div class="stat"><span class="n">${n}</span><span class="k">${k}</span></div>`)
      .join("");
    document.getElementById("scope").textContent =
      `${CITY.meta.counts.districts} districts · ${CITY.meta.counts.plots} plots · ${CITY.meta.counts.categories} buildings`;
  }

  function renderLegend() {
    const order = ["foundation", "height", "value", "reactor"];
    document.getElementById("measures").innerHTML = order.map((layer, i) => {
      const name = layerMetric(layer);
      const def = metricDef(name);
      let badge = "";
      if (def.sample && CONFIG.disclosure.show_sample_badge) {
        badge = '<span class="badge sample">sample data</span>';
      } else if (def.provisional && CONFIG.disclosure.show_provisional_badge) {
        badge = '<span class="badge provisional">provisional</span>';
      }
      const swatches = def.tiers.map((tier) => {
        const color = swatchFor(layer, tier);
        return `<span class="sw"><i style="background:${color}"></i>${tier.label}</span>`;
      }).join("");
      return `<div class="measure">
        <div class="name">${i + 1}. ${def.label}${badge}</div>
        <div class="by">${CONFIG.layers[layer].caption}</div>
        <div class="swatches">${swatches}</div>
      </div>`;
    }).join("");
  }

  function swatchFor(layer, tier) {
    if (layer === "foundation") {
      return { none: "#898781", draft: "#fab219", active: "#0ca30c" }[tier.value] || "#898781";
    }
    if (layer === "value") {
      if (!tier.pieces) return "#3a3f47";
      return tier.id === "hotel" ? "#e60000" : "#2e9e4f";
    }
    if (layer === "reactor") {
      const steps = ["#3a3f47", "#3f7f96", "#5fbcdc", "#7fdcff"];
      return steps[Math.min(tier.__i || 0, 3)];
    }
    // ordinal ramp, kept above the dark-surface contrast floor
    const steps = ["#3a3f47", "#86b6ef", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
    return steps[Math.min(tier.__i || 0, 5)];
  }

  // stash tier order so swatchFor can shade by rank
  Object.values(CONFIG.metrics).forEach((def) => def.tiers.forEach((t, i) => { t.__i = i; }));

  const inspector = document.getElementById("inspector");
  function showCategory(category) {
    if (!category) {
      inspector.classList.remove("on");
      return;
    }
    const m = category.metrics;
    const heightTier = tierOf(layerMetric("height"), valueFor(category, "height"));
    const valueTier = tierOf(layerMetric("value"), valueFor(category, "value"));
    const stateTier = tierOf("blueprint_state", category.blueprint_state);
    const rows = [
      ["Blueprint", stateTier.label],
      [metricDef(layerMetric("height")).label, `${heightTier.label} (${valueFor(category, "height")})`],
      ["Spend FY26/27", euro(m.spend_eur)],
      ["Property", valueTier.label],
      ["Blueprints", `${m.cbp_active} active · ${m.cbp_draft} draft`],
      ["Markets", category.markets.length ? category.markets.join(", ") : "None yet"],
    ];
    inspector.innerHTML = `
      <button class="panel-toggle" data-collapse data-drag>${category.code}<span class="caret">&#9662;</span></button>
      <h3>${category.name}</h3>
      <div class="panel-body">
        <div class="where">${category.district} &middot; ${category.plot}</div>
        <dl class="rows">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
        ${category.definition ? `<div class="def">${category.definition}</div>` : ""}
      </div>`;
    inspector.classList.add("on");
  }

  renderStats();
  renderLegend();

  // ----------------------------------------------------------- the builder
  // A minifigure in a hard hat, deliberately the same object Gorkem is handing
  // out on the day, so the thing in someone's hand is the thing on the screen.
  const FIGURE_SCALE = 0.72;

  function buildFigure() {
    const group = new THREE.Group();
    const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex });
    const overalls = mat(0xe60000);
    const legs = mat(0x2b3140);
    const skin = mat(0xf3c85c);
    const hat = mat(0xffc21a);

    const part = (material, x, y, z, sx, sy, sz, geometry) => {
      const mesh = new THREE.Mesh(geometry || box, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };

    part(legs, -0.32, 0.55, 0, 0.52, 1.1, 0.68);
    part(legs, 0.32, 0.55, 0, 0.52, 1.1, 0.68);
    part(overalls, 0, 1.6, 0, 1.42, 1.05, 0.78);
    const armL = part(overalls, -0.92, 1.62, 0, 0.38, 0.92, 0.5);
    const armR = part(overalls, 0.92, 1.62, 0, 0.38, 0.92, 0.5);
    part(skin, 0, 2.4, 0, 0.86, 0.66, 0.86, cyl);
    part(hat, 0, 2.79, 0, 0.94, 0.34, 0.94, cyl);
    part(hat, 0, 2.6, 0, 1.34, 0.12, 1.34, cyl);

    group.userData.arms = [armL, armR];
    group.scale.setScalar(FIGURE_SCALE);
    return group;
  }

  const figure = buildFigure();
  scene.add(figure);

  // Where the builder can stand: just in front of each lot, never inside one.
  const standings = layout.buildings.map((b) => new THREE.Vector3(b.x, 0, b.z + CELL * 0.6));

  const walker = {
    mode: "idle",
    from: standings[0].clone(),
    to: standings[0].clone(),
    start: 0,
    duration: 3,
    holdUntil: 0,
    pinned: false,
  };
  figure.position.copy(walker.to);

  function sendFigure(target, mode, duration) {
    walker.from.copy(figure.position).setY(0);
    walker.to.copy(target);
    walker.mode = mode;
    walker.start = clockNow();
    walker.duration = duration;
    walker.holdUntil = 0;
  }

  function wander(now) {
    const next = standings[Math.floor(Math.random() * standings.length)];
    const distance = figure.position.distanceTo(next);
    sendFigure(next, "walk", Math.max(1.4, distance / 9));
    walker.holdUntil = 0;
    return now;
  }

  function updateFigure(now) {
    const t = walker.duration > 0
      ? THREE.MathUtils.clamp((now - walker.start) / walker.duration, 0, 1)
      : 1;
    const ease = t * t * (3 - 2 * t);
    figure.position.lerpVectors(walker.from, walker.to, ease);

    // Flying arcs over the city; walking bobs along the ground.
    if (walker.mode === "fly") {
      figure.position.y = Math.sin(Math.PI * t) * 14;
    } else if (walker.mode === "walk" && t < 1) {
      figure.position.y = Math.abs(Math.sin(now * 7)) * 0.14;
    } else {
      figure.position.y = 0;
    }

    const heading = walker.to.clone().sub(walker.from);
    if (heading.lengthSq() > 0.02) figure.rotation.y = Math.atan2(heading.x, heading.z);

    // Arms swing when moving, and go up when the building lands.
    const moving = t < 1;
    const swing = moving ? Math.sin(now * 9) * 0.7 : 0;
    const cheering = walker.mode === "watch" && now < walker.holdUntil - 1.5;
    figure.userData.arms.forEach((arm, i) => {
      arm.rotation.x = cheering ? -2.2 : swing * (i ? -1 : 1);
    });

    if (t >= 1) {
      if (walker.mode === "fly") {
        walker.mode = "watch";
        walker.holdUntil = now + 3;
      } else if (walker.pinned) {
        // stay with the category until the city is reset
      } else if (walker.mode !== "watch" || now > walker.holdUntil) {
        if (!walker.holdUntil) walker.holdUntil = now + 1.2 + Math.random() * 2.5;
        if (now > walker.holdUntil) wander(now);
      }
    }
  }

  // --------------------------------------------------------------- the voice
  // Deterministic for now. When the model lands it replaces these sentences,
  // but the fallback has to be able to carry the demo on its own.
  function narrate(category) {
    const m = category.metrics;
    const spend = euro(m.spend_eur);
    if (category.blueprint_state === "none") {
      return m.spend_eur > 0
        ? {
            caption: `${spend} of spend. No blueprint. Nothing to build here yet.`,
            bubble: `Empty lot. ${spend} sitting on this ground, and no rules to build with.`,
          }
        : {
            caption: `No blueprint and no recorded spend. This lot is still open ground.`,
            bubble: `Nothing here yet. Someone has to claim this lot.`,
          };
    }
    if (category.blueprint_state === "draft") {
      return {
        caption: `Blueprint drafted but not active. The lot is marked out, no foundations.`,
        bubble: `Someone has claimed this lot. The blueprint is still in draft.`,
      };
    }
    const reach = m.market_reach;
    const markets = `${reach} market${reach === 1 ? "" : "s"}`;
    const tier = tierOf(layerMetric("height"), valueFor(category, "height"));
    return {
      caption: m.spend_eur > 0
        ? `${markets} building on this blueprint. ${spend} of spend.`
        : `${markets} building on this blueprint.`,
      bubble: `${tier.label}. Adopted across ${markets}.`,
    };
  }

  const bubbleEl = document.getElementById("bubble");
  const captionEl = document.getElementById("caption");
  let bubbleText = "";

  function say(category) {
    if (!category) {
      bubbleText = "";
      bubbleEl.classList.remove("on");
      captionEl.classList.remove("on");
      return;
    }
    const lines = narrate(category);
    bubbleText = lines.bubble;
    bubbleEl.textContent = lines.bubble;
    captionEl.firstElementChild.textContent = lines.caption;
    captionEl.classList.add("on");
  }

  function placeBubble() {
    if (!bubbleText) return;
    const head = figure.position.clone();
    head.y += 3.4 * FIGURE_SCALE;
    head.project(camera);
    const x = (head.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-head.y * 0.5 + 0.5) * window.innerHeight - 12;
    const onScreen = head.z < 1 && x > 0 && x < window.innerWidth;
    bubbleEl.style.left = `${x}px`;
    bubbleEl.style.top = `${y}px`;
    bubbleEl.classList.toggle("on", onScreen);
  }

  // -------------------------------------------------------------- controls
  const HOME = fitTo(
    new THREE.Box3(
      new THREE.Vector3(-baseW / 2, 0, -baseD / 2),
      new THREE.Vector3(baseW / 2, 22, baseD / 2)
    ),
    1.04
  );
  view.size = HOME.size;
  view.target.copy(HOME.target);
  let dragging = false, lastX = 0, lastY = 0, moved = 0;
  const FLIGHT = 1.2; // seconds
  const FOCUS_SIZE = CELL * 3.4; // frame the plot, not the building
  const anim = { active: false, start: 0, duration: FLIGHT, fromSize: 0, toSize: 0,
                 from: new THREE.Vector3(), to: new THREE.Vector3() };

  function flyTo(target, size, duration) {
    anim.from.copy(view.target);
    anim.to.copy(target);
    anim.fromSize = view.size;
    anim.toSize = size;
    anim.start = clockNow();
    anim.duration = duration || FLIGHT;
    anim.active = true;
  }

  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    const scale = (view.size * 2) / window.innerHeight;
    // screen-right and screen-up projected onto the ground plane
    const right = new THREE.Vector3().crossVectors(CAM_DIR, new THREE.Vector3(0, 1, 0)).normalize();
    const fwd = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), right).normalize();
    view.target.addScaledVector(right, -dx * scale).addScaledVector(fwd, -dy * scale);
    anim.active = false;
  });
  const endDrag = () => { dragging = false; };
  renderer.domElement.addEventListener("pointerup", endDrag);
  renderer.domElement.addEventListener("pointercancel", endDrag);

  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.size = THREE.MathUtils.clamp(view.size * (e.deltaY > 0 ? 1.1 : 0.9), 6, span * 1.4);
    anim.active = false;
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  renderer.domElement.addEventListener("click", (e) => {
    if (moved > 6) return;
    const pointer = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
    if (hit) {
      const clicked = hit.object.userData.category;
      showCategory(clicked);
      say(clicked);
      flyTo(hit.object.position.clone().setY(0), FOCUS_SIZE);
      sendFigure(
        new THREE.Vector3(hit.object.position.x, 0, hit.object.position.z + CELL * 0.6),
        "fly",
        FLIGHT
      );
      walker.pinned = true;
    } else {
      showCategory(null);
      say(null);
      walker.pinned = false;
    }
  });

  // Panels collapse and can be dragged out of the way. Both behaviours are
  // delegated, because the category card is re-rendered on every question and
  // would otherwise lose its handlers.
  let drag = null;
  let dragEndedAt = 0;

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-collapse]");
    // A drag ends with a click on the handle; do not also collapse the panel.
    if (toggle && performance.now() - dragEndedAt > 250) {
      toggle.closest(".hud").classList.toggle("collapsed");
    }
  });

  document.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest("[data-drag]");
    if (!handle) return;
    const panel = handle.closest(".hud");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    // Panels are anchored by whichever corner suits them; pin to top-left
    // before moving so one set of coordinates governs.
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    drag = { panel, handle, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: 0 };
    handle.setPointerCapture(e.pointerId);
  });

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    // Always leave enough of the panel on screen to grab it again.
    const maxLeft = window.innerWidth - 80;
    const maxTop = window.innerHeight - 44;
    drag.panel.style.left = `${THREE.MathUtils.clamp(drag.left + dx, 80 - drag.panel.offsetWidth, maxLeft)}px`;
    drag.panel.style.top = `${THREE.MathUtils.clamp(drag.top + dy, 0, maxTop)}px`;
  });

  const endDragPanel = () => {
    if (!drag) return;
    if (drag.moved > 5) dragEndedAt = performance.now();
    drag = null;
  };
  document.addEventListener("pointerup", endDragPanel);
  document.addEventListener("pointercancel", endDragPanel);

  window.addEventListener("keydown", (e) => {
    if (e.key === "r" || e.key === "R") {
      showCategory(null);
      flyTo(HOME.target, HOME.size);
    }
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyCamera();
  });

  // ------------------------------------------------------------- public API
  const byCode = new Map(CITY.categories.map((c) => [c.code, c]));
  const positionOf = new Map(layout.buildings.map((b) => [b.category.code, b]));

  window.NWCity = {
    data: CITY,
    config: CONFIG,
    focus(code) {
      const category = byCode.get(String(code || "").toUpperCase());
      if (!category) return false;
      const spot = positionOf.get(category.code);
      showCategory(category);
      const ground = new THREE.Vector3(spot.x, 0, spot.z);
      flyTo(ground, FOCUS_SIZE);
      sendFigure(new THREE.Vector3(spot.x, 0, spot.z + CELL * 0.6), "fly", FLIGHT);
      walker.pinned = true;
      say(category);
      // Fly first, then tear the building down and reassemble it, so the
      // construction lands once the camera has settled on the plot.
      clearTimeout(window.__nwBuildTimer);
      window.__nwBuildTimer = setTimeout(() => rebuild(spot), FLIGHT * 900);
      return true;
    },
    rise() {
      cityRise();
    },
    // Fly to a whole district rather than one lot. Used when the agent is
    // answering about a district or ranking within one.
    focusDistrict(name) {
      const wanted = String(name || "").toLowerCase();
      const district = layout.districts.find((d) => d.name.toLowerCase() === wanted);
      if (!district) return false;
      const cx = district.cx + district.w / 2;
      const cz = district.cz + district.d / 2;
      showCategory(null);
      flyTo(new THREE.Vector3(cx, 0, cz), Math.max(district.w, district.d) * 0.46);
      sendFigure(new THREE.Vector3(cx, 0, cz + district.d * 0.3), "fly", FLIGHT);
      walker.pinned = true;
      return true;
    },
    // Let the agent write its own line rather than using the built-in narrator.
    speak(caption, bubble) {
      if (!caption && !bubble) {
        say(null);
        return;
      }
      bubbleText = bubble || "";
      bubbleEl.textContent = bubbleText;
      if (caption) {
        captionEl.firstElementChild.textContent = caption;
        captionEl.classList.add("on");
      } else {
        captionEl.classList.remove("on");
      }
    },
    categories: CITY.categories,
    // pieces still mid-flight, used by rehearsal checks and tests
    pending() {
      return scheduled.length;
    },
    reset() {
      showCategory(null);
      say(null);
      walker.pinned = false;
      flyTo(HOME.target, HOME.size);
    },
    setLayerMetric(layer, metric) {
      if (!CONFIG.layers[layer] || !CONFIG.metrics[metric]) return false;
      CONFIG.layers[layer].metric = metric;
      window.location.reload();
      return true;
    },
  };

  // ------------------------------------------------------------------ loop
  let ready = false;
  function tick() {
    requestAnimationFrame(tick);
    if (anim.active) {
      const t = Math.min(1, (clockNow() - anim.start) / anim.duration);
      const e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // ease in-out
      view.target.lerpVectors(anim.from, anim.to, e);
      view.size = anim.fromSize + (anim.toSize - anim.fromSize) * e;
      if (t >= 1) anim.active = false;
    }
    const nowSec = clockNow();
    const delta = Math.min(0.1, nowSec - (tick.last || nowSec));
    tick.last = nowSec;
    stepBuild();
    updateWalkers(nowSec, delta);
    updateTraffic(delta);
    updateFigure(nowSec);
    applyCamera();
    placeBubble();
    const zoom = view.size / HOME.size;
    for (const label of labels) {
      const base = label.userData.base;
      label.scale.set(base.w * zoom, base.h * zoom, 1);
      label.material.opacity = THREE.MathUtils.clamp((zoom - 0.28) * 4, 0, 1);
    }
    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      document.body.dataset.ready = "1";
    }
  }

  applyCamera();
  cityRise();
  tick();
})();
