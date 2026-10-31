// Canvas rendering, movement, area transitions.
// Flat areas: walk line. Summit: polyline climb (see AREAS[].path).

const W = 1280, H = 720;
const VIEW_W = 1340;      // wider than canvas, so the view can drift
const DRIFT = VIEW_W - W;
const STEP_FPS = 80;
const REACH = 135;        // marker interact distance, painting px
const EDGE = 70;           // walk bounds inset

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const img = {};          // name -> HTMLImageElement
let scenes = null, hero = null, heroUp = null;

const state = {
  mode: 'load',          // load | title | walk | transit | ending
  area: 0,
  x: 200,                // painting x, or — for a `path` area — distance along the path
  dir: 1,
  moving: false,
  phase: 0,              // ground covered, in canvas px — drives the walk cycle
  lastStep: 0,
  time: 0,
  dust: [],
  visited: new Set(),
  read: new Set(),
  mood: null,             // floating caption/effect beat — see triggerMood()
  tap: null,              // brief ring at the last click/tap — see setTarget()
  input: { left: false, right: false, up: false, down: false, pos: false, neg: false },
  target: null,           // painting-x (or path progress) walked toward on click/tap
};

/* --- loading --------------------------------------------------------------- */

function load(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = assetURL(src);
  });
}

async function boot() {
  scenes = await assetJSON('assets/scenes/scenes.json');
  hero = await assetJSON('assets/sprites/haa.json');
  heroUp = await assetJSON('assets/sprites/haa_up.json');

  const jobs = AREAS.map((a) => [a.id, `assets/scenes/${a.id}.webp`]);
  jobs.push(['walk', 'assets/sprites/haa_walk.webp']);
  jobs.push(['idle', 'assets/sprites/haa_idle.webp']);
  jobs.push(['walkUp', 'assets/sprites/haa_up_walk.webp']);
  jobs.push(['idleUp', 'assets/sprites/haa_up_idle.webp']);
  const props = new Set();
  AREAS.forEach((a) => a.hotspots.forEach((h) =>
    (h.props || []).forEach((p) => props.add(p.name))));
  props.forEach((p) => jobs.push([p, `assets/sprites/${p}.webp`]));

  let done = 0;
  await Promise.all(jobs.map(async ([name, src]) => {
    img[name] = await load(src);
    UI.progress(++done / jobs.length);
  }));

  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* optional */ } }

  AREAS.forEach((a) => {
    const s = scenes[a.id];
    a.view = view(s);
    a.hero = a.path ? heroUp : hero;
    if (a.path) {
      a.pathLen = pathLength(a.path);
      a.minX = EDGE;
      a.maxX = a.pathLen;         // she's meant to arrive right at the top, no edge margin there
    } else {
      a.minX = EDGE;
      a.maxX = s.w - EDGE;
    }
    a.pxPerFrame = a.hero.pxPerFrame / a.view.scale;
    a.speed = a.pxPerFrame * (a.stepFps || STEP_FPS);
  });

  UI.doneLoading();
  enterTitle();
  requestAnimationFrame(tick);
}

/* --- placing the painting in the canvas ------------------------------------ */

function view(s) {
  const scale = VIEW_W / s.w;
  const dh = Math.round(s.h * scale);
  return {
    scale,
    w: VIEW_W,
    h: dh,
    y: Math.round((H - dh) / 2),         // a few px of sky and foreground spill over
    groundY: Math.round(s.walkY * scale + (H - dh) / 2),
  };
}

function drift(area) {
  if (area.path) return -DRIFT / 2;
  const t = (state.x - area.minX) / (area.maxX - area.minX);
  return -DRIFT * Math.max(0, Math.min(1, t));
}

const toScreen = (area, px) => px * area.view.scale + drift(area);
const toScreenY = (area, py) => py * area.view.scale + area.view.y;

/* --- path areas (climbs) ----------------------------------------------------- */
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return len;
}

function pathPoint(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (s <= acc + seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, Math.max(0, (s - acc) / seg)) : 0;
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { x: last[0], y: last[1] };
}

// inverse of pathPoint: arc-length of the closest point on the polyline to
// (px, py) — turns a click on Summit's climb into a walk target
function nearestPathProgress(pts, px, py) {
  let best = 0, bestDist = Infinity, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const dx = x1 - x0, dy = y1 - y0;
    const segLen2 = dx * dx + dy * dy;
    const t = segLen2 ? Math.min(1, Math.max(0, ((px - x0) * dx + (py - y0) * dy) / segLen2)) : 0;
    const projX = x0 + dx * t, projY = y0 + dy * t;
    const dist = Math.hypot(px - projX, py - projY);
    if (dist < bestDist) { bestDist = dist; best = acc + Math.sqrt(segLen2) * t; }
    acc += Math.sqrt(segLen2);
  }
  return best;
}

function groundScreenPos(area, s) {
  if (area.path) {
    const p = pathPoint(area.path, Math.max(0, Math.min(s, area.pathLen)));
    return { sx: p.x * area.view.scale + drift(area), sy: p.y * area.view.scale + area.view.y };
  }
  return { sx: toScreen(area, s), sy: area.view.groundY };
}

/* --- drawing ---------------------------------------------------------------- */

function drawScene(area) {
  const im = img[area.id];
  if (!im) return;
  const v = area.view;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, Math.round(drift(area)), v.y, v.w, v.h);
  ctx.imageSmoothingEnabled = false;
}

// Ground shadow, drawn rather than baked into the art.
function blot(cx, cy, rx, ry, alpha) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(26,18,10,${alpha})`);
  g.addColorStop(0.62, `rgba(26,18,10,${alpha * 0.88})`);
  g.addColorStop(1, 'rgba(26,18,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShadows(area, sx, sy, scale = 1) {
  const sh = area.shadow || { dx: 0, spread: 1, alpha: 0.3 };
  const h = area.hero;
  const r = h.stepLen * 0.46 * sh.spread * scale;
  blot(sx + sh.dx * scale, sy - 1, r, r * 0.24, sh.alpha);
  // path areas: cat sprite never mirrors, so use a fixed offset
  const catOffset = (h.catX - h.anchorX) * (area.path ? 1 : state.dir) * scale;
  const catAt = sx + catOffset;
  blot(catAt + sh.dx * 0.7 * scale, sy - 1, r * 0.42, r * 0.12, sh.alpha * 0.85);
}

// scale anchors to sy (feet), used by shrinkTo on path areas
function drawHero(area, sx, sy, scale = 1) {
  const h = area.hero;
  const { frameW: fw, frameH: fh, cols, frames, anchorX, anchorY } = h;
  const sheet = area.path
    ? (state.moving ? img.walkUp : img.idleUp)
    : (state.moving ? img.walk : img.idle);
  if (!sheet) return;

  const f = state.moving ? Math.floor(state.phase / h.pxPerFrame) % frames : 0;
  const bob = state.moving ? 0 : Math.round(Math.sin(state.time * 2.2) * 1.5);
  const dw = fw * scale, dh = fh * scale;
  const dx = Math.round(sx - anchorX * scale);
  const dy = Math.round(sy - anchorY * scale + bob * scale);

  ctx.save();
  // no side-view frames on the climb, flip only applies to flat areas
  if (!area.path && state.dir < 0) {
    ctx.translate(Math.round(sx * 2), 0);
    ctx.scale(-1, 1);
  }
  if (state.moving) {
    ctx.drawImage(sheet, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh, dx, dy, dw, dh);
  } else {
    ctx.drawImage(sheet, dx, dy, dw, dh);
  }
  ctx.restore();
}

function badge(x, y, text, accent) {
  ctx.font = '19px "Pixelify Sans", Trebuchet MS, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 26;
  const h = 32;
  const bx = Math.round(x - w / 2), by = Math.round(y - h);
  ctx.fillStyle = 'rgba(30,22,14,.88)';
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(bx + 1.5, by + 1.5, w - 3, h - 3);
  ctx.fillStyle = '#fdf3dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + w / 2, by + h / 2 + 1);
}

function drawHotspots(area) {
  area.hotspots.forEach((h) => {
    const { sx, sy: gy } = groundScreenPos(area, h.x);
    let top = gy - (h.lift || 150);
    let cx = sx, n = 0;

    (h.props || []).forEach((p) => {
      const im = img[p.name];
      if (!im) return;
      const s = p.scale || 0.6;
      const w = im.naturalWidth * s, hh = im.naturalHeight * s;
      const px = sx + (p.dx || 0) * area.view.scale;
      ctx.drawImage(im, Math.round(px - w / 2), Math.round(gy + 4 - hh),
                    Math.round(w), Math.round(hh));
      top = n ? Math.min(top, gy + 4 - hh - 14) : gy + 4 - hh - 14;
      cx = n ? (cx * n + px) / (n + 1) : px;
      n += 1;
    });
    top += Math.sin(state.time * 3 + h.x) * 4;

    if (Math.abs(state.x - h.x) < REACH) badge(cx, top, `E · ${h.label}`, '#e8c078');
    else if (!state.read.has(h.panel)) badge(cx, top, '!', '#e8c078');
  });
}

function emitDust(area) {
  const col = area.dust;
  if (!col) return;
  // camera doesn't pan on path areas, so anchor in screen space
  if (area.path) {
    const g = groundScreenPos(area, state.x);
    for (let i = 0; i < 4; i++) {
      state.dust.push({
        abs: true,
        x: g.sx + (Math.random() - 0.5) * 10,
        y: g.sy - 1 - Math.random() * 3,
        vx: (Math.random() - 0.5) * 16,
        vy: -(14 + Math.random() * 24),
        life: 0.5 + Math.random() * 0.35,
        age: 0,
        size: 2 + Math.round(Math.random()),
        col,
      });
    }
    return;
  }
  for (let i = 0; i < 4; i++) {
    state.dust.push({
      abs: false,
      x: state.x - state.dir * (3 + Math.random() * 9),
      y: -1 - Math.random() * 3,
      vx: -state.dir * (12 + Math.random() * 22),
      vy: -(14 + Math.random() * 24),
      life: 0.5 + Math.random() * 0.35,
      age: 0,
      size: 2 + Math.round(Math.random()),
      col,
    });
  }
}

function stepDust(dt) {
  for (let i = state.dust.length - 1; i >= 0; i--) {
    const p = state.dust[i];
    p.age += dt;
    if (p.age >= p.life) { state.dust.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 46 * dt;
  }
}

function drawDust(area) {
  state.dust.forEach((p) => {
    const t = 1 - p.age / p.life;
    ctx.globalAlpha = t * t * 0.85;
    ctx.fillStyle = p.col;
    const sx = p.abs ? p.x : toScreen(area, p.x);
    const sy = p.abs ? p.y : area.view.groundY + p.y;
    ctx.fillRect(Math.round(sx), Math.round(sy), p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawEdgeHint(area) {
  const t = (state.x - area.minX) / (area.maxX - area.minX);
  const pulse = 0.65 + 0.25 * Math.sin(state.time * 3);
  if (state.area < AREAS.length - 1 && t > 0.55) {
    ctx.globalAlpha = Math.min(1, (t - 0.55) / 0.25) * pulse;
    badge(W - 130, area.view.groundY - 130, `${AREAS[state.area + 1].name} →`, '#a8c47c');
    ctx.globalAlpha = 1;
  }
  if (state.area > 0 && t < 0.45) {
    ctx.globalAlpha = Math.min(1, (0.45 - t) / 0.25) * pulse;
    badge(130, area.view.groundY - 130, `← ${AREAS[state.area - 1].name}`, '#a8c47c');
    ctx.globalAlpha = 1;
  }
}

// floating "mood" caption (see triggerMood): fade in, hold, fade out
function drawMood(sx, sy) {
  if (!state.mood) return;
  if (state.time >= state.mood.until) { state.mood = null; return; }
  const elapsed = 3.6 - (state.mood.until - state.time);
  const remain = state.mood.until - state.time;
  const alpha = Math.max(0, Math.min(1, elapsed / 0.4, remain / 1.0));
  ctx.globalAlpha = alpha;
  badge(sx, sy - 190 + Math.sin(state.time * 1.6) * 4, state.mood.text, '#e8c078');
  ctx.globalAlpha = 1;
}

// ring that flashes where the player last clicked/tapped to walk
function drawTapMark() {
  if (!state.tap) return;
  const remain = state.tap.until - state.time;
  if (remain <= 0) { state.tap = null; return; }
  const t = 1 - remain / 0.45;
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.strokeStyle = '#f6e9cd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.tap.x, state.tap.y, 6 + t * 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function draw() {
  const area = AREAS[state.area];
  ctx.fillStyle = '#0d0a06';
  ctx.fillRect(0, 0, W, H);
  drawScene(area);
  Ambient.draw(ctx, area, toScreen, toScreenY, state.time, 'back');
  if (state.mode === 'walk' || state.mode === 'transit') drawHotspots(area);
  const gp = groundScreenPos(area, state.x);
  const heroScale = area.shrinkTo
    ? 1 - (1 - area.shrinkTo) * Math.max(0, Math.min(1, state.x / area.pathLen))
    : 1;
  drawShadows(area, gp.sx, gp.sy, heroScale);
  drawHero(area, gp.sx, gp.sy, heroScale);
  drawMood(gp.sx, gp.sy);
  drawDust(area);
  Ambient.draw(ctx, area, toScreen, toScreenY, state.time, 'front');
  if (state.mode === 'walk') drawEdgeHint(area);
  drawTapMark();

  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(18,12,6,.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* --- frame ------------------------------------------------------------------ */

let last = 0;

function tick(t) {
  const dt = Math.min((t - last) / 1000 || 0, 0.05);
  last = t;
  state.time += dt;
  const area = AREAS[state.area];

  if (state.mode === 'title') {
    state.moving = true;
    const d = area.speed * 0.7 * dt;
    state.x += d;
    state.phase += d * area.view.scale;
    if (state.x > area.maxX) state.x = area.minX;
  } else if (state.mode === 'walk' && !UI.panelOpen()) {
    // path areas use up/down, flat areas use left/right
    const fwd = area.path ? state.input.up : state.input.right;
    const back = area.path ? state.input.down : state.input.left;
    let dir = (fwd || state.input.pos ? 1 : 0) - (back || state.input.neg ? 1 : 0);

    // no key/stick held: walk toward a clicked/tapped target instead
    if (dir === 0 && state.target !== null) {
      const diff = state.target - state.x;
      if (Math.abs(diff) < 4) state.target = null;
      else dir = diff > 0 ? 1 : -1;
    }

    state.moving = dir !== 0;
    if (dir) {
      state.dir = dir;
      const before = state.x;
      state.x = Math.min(area.maxX, Math.max(area.minX, state.x + dir * area.speed * dt));
      state.phase += Math.abs(state.x - before) * area.view.scale;

      while (state.phase - state.lastStep >= area.hero.stepLen) {
        state.lastStep += area.hero.stepLen;
        Sound.sfx('step');
        emitDust(area);
      }

      if (state.x >= area.maxX) nextArea();
      else if (state.x <= area.minX) prevArea();
    }
  } else {
    state.moving = false;
  }
  stepDust(dt);
  Ambient.update(dt, state.time);

  draw();
  requestAnimationFrame(tick);
}

/* --- flow -------------------------------------------------------------------- */

function enterTitle() {
  state.mode = 'title';
  state.area = 0;
  state.x = AREAS[0].minX;
  state.dir = 1;
  state.dust.length = 0;
  state.mood = null;
  state.target = null;
  Ambient.enter(AREAS[0]);
  state.visited = new Set();
  state.read = new Set();
  Sound.setArea('title');
  updateTouchMode(AREAS[0]);
  UI.showTitle();
}

function startHike() {
  UI.hideTitle();
  Sound.start();
  goToArea(0, AREAS[0].minX + 40);
}

function goToArea(i, x, dir = 1) {
  state.area = i;
  state.x = x;
  state.dir = dir;
  state.dust.length = 0;
  state.mood = null;
  state.target = null;
  Ambient.enter(AREAS[i]);
  state.mode = 'walk';
  state.visited.add(AREAS[i].id);
  Sound.setArea(AREAS[i].id);
  updateTouchMode(AREAS[i]);
  UI.setArea(AREAS[i], i, state.visited);
}

async function nextArea() {
  if (state.area >= AREAS.length - 1) return;
  state.mode = 'transit';
  Sound.sfx('area');
  await UI.fadeOut();
  goToArea(state.area + 1, AREAS[state.area + 1].minX + 20, 1);
  await UI.fadeIn();
}

async function prevArea() {
  if (state.area <= 0) return;
  state.mode = 'transit';
  Sound.sfx('area');
  await UI.fadeOut();
  goToArea(state.area - 1, AREAS[state.area - 1].maxX - 20, -1);
  await UI.fadeIn();
}

async function travelTo(i) {
  if (state.mode !== 'walk' || i === state.area) return;
  state.mode = 'transit';
  Sound.sfx('area');
  await UI.fadeOut();
  goToArea(i, AREAS[i].minX + 20, 1);
  await UI.fadeIn();
}

async function finishHike() {
  UI.closePanel();
  state.mode = 'ending';
  await UI.fadeOut();
  UI.hideHud();
  UI.showEnding();
  await UI.fadeIn();
}

async function restart() {
  await UI.fadeOut();
  UI.hideEnding();
  enterTitle();
  await UI.fadeIn();
}

function interact() {
  if (state.mode !== 'walk' || UI.panelOpen()) return;
  const h = AREAS[state.area].hotspots.find((s) => Math.abs(state.x - s.x) < REACH);
  if (!h) return;
  if (h.mood) { triggerMood(h); return; }
  state.read.add(h.panel);
  UI.openPanel(h.panel, { onFinish: finishHike });
}

// hit-test a click/tap (canvas-space) against a reachable hotspot — same
// badge she'd need E for
function hotspotAt(area, cx, cy) {
  return area.hotspots.find((h) => {
    if (Math.abs(state.x - h.x) >= REACH) return false;
    const { sx, sy } = groundScreenPos(area, h.x);
    const top = sy - (h.lift || 150);
    return Math.hypot(cx - sx, cy - top) < 70;
  });
}

// click/tap-to-walk: target is a point along whatever she can walk —
// painting-x on flat areas, distance-along-path on Summit's climb
function setTarget(area, cx, cy) {
  const worldX = (cx - drift(area)) / area.view.scale;
  if (area.path) {
    const worldY = (cy - area.view.y) / area.view.scale;
    state.target = nearestPathProgress(area.path, worldX, worldY);
  } else {
    state.target = Math.min(area.maxX, Math.max(area.minX, worldX));
  }
  state.tap = { x: cx, y: cy, until: state.time + 0.45 };
}

// a "mood" hotspot is a beat, not a panel page
function triggerMood(h) {
  state.read.add(h.panel);
  if (state.mood && state.time < state.mood.until) return;
  state.mood = { text: h.mood, until: state.time + 3.6 };
  const g = groundScreenPos(AREAS[state.area], h.x);
  for (let i = 0; i < 18; i++) {
    state.dust.push({
      abs: true,
      x: g.sx + (Math.random() - 0.5) * 46,
      y: g.sy - 14 - Math.random() * 30,
      vx: (Math.random() - 0.5) * 16,
      vy: -(10 + Math.random() * 20),
      life: 1.1 + Math.random() * 0.7,
      age: 0,
      size: 2 + Math.round(Math.random() * 2),
      col: '#ffdca0',
    });
  }
}

/* --- input -------------------------------------------------------------------- */

const KEYS_L = ['ArrowLeft', 'a', 'A'];
const KEYS_R = ['ArrowRight', 'd', 'D'];
const KEYS_U = ['ArrowUp', 'w', 'W'];
const KEYS_D = ['ArrowDown', 's', 'S'];

addEventListener('keydown', (e) => {
  if (KEYS_L.includes(e.key)) { state.input.left = true; state.target = null; e.preventDefault(); }
  if (KEYS_R.includes(e.key)) { state.input.right = true; state.target = null; e.preventDefault(); }
  if (KEYS_U.includes(e.key)) { state.input.up = true; state.target = null; e.preventDefault(); }
  if (KEYS_D.includes(e.key)) { state.input.down = true; state.target = null; e.preventDefault(); }
  if (e.key === 'e' || e.key === 'E' || e.key === 'Enter' || e.key === ' ') {
    if (state.mode === 'title') startHike();
    else if (!UI.panelOpen()) { interact(); e.preventDefault(); }
  }
});
addEventListener('keyup', (e) => {
  if (KEYS_L.includes(e.key)) state.input.left = false;
  if (KEYS_R.includes(e.key)) state.input.right = false;
  if (KEYS_U.includes(e.key)) state.input.up = false;
  if (KEYS_D.includes(e.key)) state.input.down = false;
});
addEventListener('blur', () => {
  state.input.left = state.input.right = state.input.up = state.input.down = false;
  state.input.pos = state.input.neg = false;
  state.target = null;
});

// a click/tap on the world: the marker if she's close enough to open it,
// otherwise a walk target
canvas.addEventListener('pointerdown', (e) => {
  if (state.mode === 'title') { startHike(); return; }
  if (state.mode !== 'walk' || UI.panelOpen()) return;
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width * W;
  const cy = (e.clientY - rect.top) / rect.height * H;
  const area = AREAS[state.area];
  if (hotspotAt(area, cx, cy)) { interact(); return; }
  setTarget(area, cx, cy);
});

const coarse = matchMedia('(hover: none)').matches;
UI.showTouch(coarse);

// analog stick; axis read (h or v) depends on the .vpath class
(function joystick() {
  const stick = document.getElementById('joystick');
  const knob = stick.querySelector('.joy-knob');
  let active = null, cx = 0, cy = 0, radius = 1;

  function place(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function release() {
    active = null;
    stick.classList.remove('on');
    place(0, 0);
    state.input.pos = false;
    state.input.neg = false;
  }
  function update(clientX, clientY) {
    const dx = clientX - cx, dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, radius);
    const ang = Math.atan2(dy, dx);
    place(Math.cos(ang) * clamped, Math.sin(ang) * clamped);

    const dead = radius * 0.32;
    const vertical = document.getElementById('touch').classList.contains('vpath');
    const axis = vertical ? dy : dx;
    if (Math.abs(axis) < dead) {
      state.input.pos = false;
      state.input.neg = false;
    } else if (vertical) {
      state.input.pos = axis < 0;   // dragged up = forward/up the climb
      state.input.neg = axis > 0;
    } else {
      state.input.pos = axis > 0;   // dragged right = forward
      state.input.neg = axis < 0;
    }
  }

  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    active = e.pointerId;
    stick.setPointerCapture(active);
    stick.classList.add('on');
    state.target = null;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    radius = r.width * 0.42;
    update(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active) return;
    update(e.clientX, e.clientY);
  });
  ['pointerup', 'pointercancel'].forEach((ev) => stick.addEventListener(ev, (e) => {
    if (e.pointerId !== active) return;
    release();
  }));
})();

function updateTouchMode(area) {
  document.getElementById('touch').classList.toggle('vpath', !!area.path);
}

UI.onStart(startHike);
UI.onAgain(restart);
UI.onTravel(travelTo);

boot();
