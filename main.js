/* =====================================================================
   THE MOUNTAIN TRAIL — main.js  (PHASE 1 + 2 + 3)
   Phase 3: sprite THẬT, tường vô hình giới hạn đường mòn, âm thanh
            (BGM loop + SFX tương tác), polish UI.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1) CẤU HÌNH CHUNG
   ------------------------------------------------------------------- */
const CONFIG = {
  // --- Bản đồ tile (addLevel) ---
  TILE: 64,                    // kích thước 1 ô hiển thị (px)
  COLS: 15,                    // 15 * 64 = 960
  ROWS: 66,                    // 66 * 64 = 4224
  TILESET_COLS: 12,            // nature-tileset: 1536x1024 -> 12x8 (tile 128px)
  TILESET_ROWS: 8,
  TILE_GRASS: 25,              // frame cỏ sạch
  TILE_DIRT: 38,               // frame đường đất
  TREE_FRAME: 0,               // frame cây trong environment-props (5x3)

  WORLD_W: 960,                // = COLS*TILE
  WORLD_H: 4224,               // = ROWS*TILE
  MAX_ELEV: 2031,

  ZONES: [
    { name: "Base Camp", elev: 0,    color: [58, 74, 51] },
    { name: "Valley",    elev: 850,  color: [74, 96, 66] },
    { name: "Forest",    elev: 1350, color: [96, 116, 92] },
    { name: "Summit",    elev: 2031, color: [190, 205, 214] },
  ],

  PLAYER_SPEED: 220,
  PLAYER_SCALE: 0.13,          // sprite gốc 512px/frame -> ~66px
  CAM_LERP: 6,
  INTERACT_RANGE: 90,

  // Đường dẫn asset.
  PATHS: {
    ha:      "assets/images/ha-spritesheet.png",
    turtle:  "assets/images/turtle.png",
    tent:    "assets/images/tent.png",
    journal: "assets/images/journal.png",
    camera:  "assets/images/camera.png",
    letter:  "assets/images/letter.png",
    tiles:   "assets/images/nature-tileset.png",
    trees:   "assets/images/environment-props.png",
    bgm:     "assets/audio/bgm.mp3",
    sfx:     "assets/audio/interact.mp3",
  },
};

/* ---------------------------------------------------------------------
   2) DỮ LIỆU PORTFOLIO (mỗi vật thể 1 vùng)
   `scale` chuẩn hoá kích thước hiển thị theo từng file PNG thật.
   ------------------------------------------------------------------- */
const PORTFOLIO = {
  tent: {
    sprite: "tent", elev: 130, x: 150, scale: 0.16,
    title: "About Me",
    text:
      "Hi, I'm Hà, a student from Hanoi. My journey began in my grandmother's " +
      "small garden, where I learned to notice the quiet life of plants and the " +
      "patience it takes to help something grow.",
    images: [
      "assets/images/portfolio/about-garden.jpg",
    ],
  },
  journal: {
    sprite: "journal", elev: 960, x: -160, scale: 0.12,
    title: "Plant Journal",
    text:
      "Sketching plants helps me slow down. I keep a journal of leaves, roots and " +
      "little observations — Đinh Lăng, Ráy, Trinh Nữ — learning each plant by " +
      "drawing it and writing down what makes it quietly remarkable.",
    images: [
      "assets/images/portfolio/journal-dinhlang.jpg",
      "assets/images/portfolio/journal-ray.jpg",
      "assets/images/portfolio/journal-trinhnu.jpg",
    ],
  },
  tiktok: {
    sprite: "camera", elev: 1480, x: 165, scale: 0.122,
    title: "TikTok / DIY",
    text:
      "I turn everyday leftovers into small, useful things and share the how-to on " +
      "TikTok — a box from orange peels, recycled milk cartons, a floral lantern " +
      "from used tea bags — hoping to make caring for the planet feel playful.",
    images: [
      "assets/images/portfolio/tiktok-orange-peels.jpg",
      "assets/images/portfolio/tiktok-milk-cartons.jpg",
      "assets/images/portfolio/tiktok-floral-lantern.jpg",
    ],
  },
  letter: {
    sprite: "letter", elev: 1990, x: 0, scale: 0.22,
    title: "The Summit",
    text:
      "I'm still not sure where this trail will take me... So, this isn't really the " +
      "summit — just a place to stop and see where I might go next.",
    finish: true,
  },
};

/* ---------------------------------------------------------------------
   3) KHỞI TẠO KAPLAY
   ------------------------------------------------------------------- */
const k = kaplay({
  global: false,
  width: window.innerWidth,
  height: window.innerHeight,
  letterbox: false,
  background: [12, 21, 18],
  pixelDensity: window.devicePixelRatio || 1,
  crisp: true,
});
k.setGravity(0); // top-down: không trọng lực

const state = {
  player: null,
  near: null,
  paused: false,
};

// Cờ audio: chỉ bật tính năng nếu file tồn tại (game vẫn chạy khi thiếu mp3).
const audio = { bgm: false, sfx: false, bgmStarted: false };

/* Chuyển elevation (m) -> y trong world. */
const elevToY = (e) => CONFIG.WORLD_H * (1 - e / CONFIG.MAX_ELEV);

/* Kiểm tra 1 asset (dùng cho audio) có tồn tại không -> tránh crash loader. */
async function assetExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------------
   4) SCENE GAME
   ------------------------------------------------------------------- */
function setupGame() {
  renderLevel();       // bản đồ tile procedural (cỏ/đất/tường/cây)
  drawZoneOverlay();   // lớp phủ màu 4 vùng + nhãn (cảm giác độ cao)

  // Nhân vật Hà — sprite thật + body() để va chạm với tường/cây tĩnh.
  const player = k.add([
    k.sprite("ha", { anim: "idle-up" }),
    k.pos(CONFIG.WORLD_W / 2, CONFIG.WORLD_H - 140),
    k.anchor("center"),
    k.scale(CONFIG.PLAYER_SCALE),
    k.area({ scale: 0.4 }),
    k.body(),
    k.z(100),
    "player",
    { dir: "up", moving: false },
  ]);
  state.player = player;

  spawnProps();
  spawnNPC();
  setupMovement(player);
  setupCamera(player);
  setupElevationHUD(player);
  setupInteraction();

  const hint = document.getElementById("hint");
  k.wait(6, () => hint && hint.classList.add("hidden"));
}

/* ---- Xây mảng bản đồ dọc (Summit trên -> Base Camp dưới) ----
   Ký tự:  '=' tường vô hình biên | '#' cây (đặc) | ' ' đường đất | '.' cỏ
   Đường đất uốn lượn theo hình sin để trông tự nhiên. */
function buildMapLayout() {
  const { COLS, ROWS } = CONFIG;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const center = 7 + Math.round(3 * Math.sin(r * 0.28)); // tâm đường mòn
    let s = "";
    for (let c = 0; c < COLS; c++) {
      if (c === 0 || c === COLS - 1)        s += "=";      // biên trái/phải
      else if (c === 1 || c === COLS - 2)   s += "#";      // hàng cây viền rừng
      else if (Math.abs(c - center) <= 1)   s += " ";      // đường mòn (rộng 3)
      else                                  s += ".";      // cỏ
    }
    rows.push(s);
  }
  return rows;
}

/* ---- Render bản đồ ----
   addLevel() lo phần NỀN (cỏ/đất). Cây + tường collision được thêm
   TOP-LEVEL (không lồng trong level) vì body tĩnh lồng cấp không chặn
   được player — quan sát thực tế trên Kaplay v3001. */
function renderLevel() {
  const T = CONFIG.TILE;
  const map = buildMapLayout();
  const ground = (frame) => () => [ k.sprite("tiles", { frame }), k.scale(T / 128), k.z(-10) ];

  // Lớp nền: mọi ô đều có cỏ, riêng ' ' là đường đất.
  k.addLevel(map, {
    tileWidth: T, tileHeight: T,
    tiles: {
      ".": ground(CONFIG.TILE_GRASS),
      "=": ground(CONFIG.TILE_GRASS),
      "#": ground(CONFIG.TILE_GRASS),
      " ": ground(CONFIG.TILE_DIRT),
    },
  });

  // Lớp cây (hình) + collision đặc (top-level).
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const ch = map[r][c];
      const x = c * T, y = r * T;

      if (ch === "=") {
        // Tường vô hình biên bản đồ.
        k.add([ k.rect(T, T), k.pos(x, y), k.opacity(0), k.area(), k.body({ isStatic: true }), k.z(-5), "wall" ]);
      } else if (ch === "#") {
        // Cây: sprite hiển thị (neo đáy để gốc nằm trong ô, tán trồi lên).
        k.add([
          k.sprite("trees", { frame: CONFIG.TREE_FRAME }),
          k.pos(x + T / 2, y + T), k.anchor("bot"), k.scale(T / 409 * 1.6),
          k.z(20), "treeVis",
        ]);
        // Hitbox đặc riêng (top-level) cho collision.
        k.add([
          k.rect(T * 0.7, T * 0.7), k.pos(x + T * 0.15, y + T * 0.15),
          k.opacity(0), k.area(), k.body({ isStatic: true }), k.z(19), "tree",
        ]);
      }
    }
  }
}

/* ---- Lớp phủ màu 4 vùng (bán trong suốt, đè lên tile) + nhãn ---- */
function drawZoneOverlay() {
  const { WORLD_W, MAX_ELEV, ZONES } = CONFIG;
  for (let i = 0; i < ZONES.length; i++) {
    const cur = ZONES[i];
    const nextElev = (i < ZONES.length - 1) ? ZONES[i + 1].elev : MAX_ELEV;
    const yTop = elevToY(nextElev);
    const yBottom = elevToY(cur.elev);
    k.add([
      k.rect(WORLD_W, yBottom - yTop), k.pos(0, yTop),
      k.color(...cur.color), k.opacity(0.28), k.z(-6),
    ]);
    k.add([
      k.text(cur.name.toUpperCase(), { size: 40, font: "monospace" }),
      k.pos(WORLD_W / 2, (yTop + yBottom) / 2),
      k.anchor("center"), k.color(255, 255, 255), k.opacity(0.10), k.z(-5),
    ]);
  }
}

/* ---- Vật thể portfolio + prompt "[ Space ]" ---- */
function spawnProps() {
  for (const data of Object.values(PORTFOLIO)) {
    const prop = k.add([
      k.sprite(data.sprite),
      k.pos(CONFIG.WORLD_W / 2 + data.x, elevToY(data.elev)),
      k.anchor("center"),
      k.scale(data.scale),
      k.area(),
      k.z(50),
      "interactable",
      { data },
    ]);

    // Chiều cao hiển thị thực tế (sprite gốc * scale) để đặt bóng & prompt.
    const dh = prop.height * data.scale;

    // Bóng đổ (circle bẹt) dưới chân vật thể.
    k.add([
      k.circle(14), k.pos(prop.pos.x, prop.pos.y + dh / 2 - 2),
      k.anchor("center"), k.scale(k.vec2(1.4, 0.4)),
      k.color(0, 0, 0), k.opacity(0.22), k.z(49),
    ]);

    // Prompt nổi phía trên (object riêng để không bị scale nhỏ theo prop).
    prop.promptRef = k.add([
      k.text("[ Space ]", { size: 16, font: "monospace" }),
      k.pos(prop.pos.x, prop.pos.y - dh / 2 - 16),
      k.anchor("center"),
      k.color(226, 112, 58),
      k.opacity(0),
      k.z(60),
    ]);
  }
}

/* ---- NPC rùa: sprite thật + anim walk, tuần tra trái-phải ---- */
function spawnNPC() {
  const startX = CONFIG.WORLD_W / 2 - 150;
  const turtle = k.add([
    k.sprite("turtle", { anim: "walk" }),
    k.pos(startX, elevToY(1300)),
    k.anchor("center"),
    k.scale(0.12),
    k.z(40),
    "npc",
    { dirX: 1, originX: startX, rangeX: 100 },
  ]);

  turtle.onUpdate(() => {
    if (state.paused) return;
    turtle.move(turtle.dirX * 26, 0);
    if (turtle.pos.x > turtle.originX + turtle.rangeX) turtle.dirX = -1;
    if (turtle.pos.x < turtle.originX - turtle.rangeX) turtle.dirX = 1;
    turtle.flipX = turtle.dirX < 0;
  });
}

/* ---- Di chuyển 4 hướng ---- */
function setupMovement(player) {
  const KEYS = { up: ["w","up"], down: ["s","down"], left: ["a","left"], right: ["d","right"] };
  const held = (dir) => KEYS[dir].some((key) => k.isKeyDown(key));

  player.onUpdate(() => {
    if (state.paused) return;

    let dx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    let dy = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
    const moving = dx !== 0 || dy !== 0;

    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      player.move((dx / len) * CONFIG.PLAYER_SPEED, (dy / len) * CONFIG.PLAYER_SPEED);
      // Clamp an toàn trong biên map (cây/tường lo chặn tinh; clamp chống
      // "tunneling" khi dt tăng đột biến lúc lag/đổi tab).
      const T = CONFIG.TILE;
      player.pos.x = k.clamp(player.pos.x, T, CONFIG.WORLD_W - T);
      player.pos.y = k.clamp(player.pos.y, 20, CONFIG.WORLD_H - 20);

      let newDir;
      if (dy !== 0) newDir = dy < 0 ? "up" : "down";
      else          newDir = dx < 0 ? "left" : "right";

      if (!player.moving || player.dir !== newDir) {
        player.dir = newDir; player.moving = true;
        player.play("walk-" + newDir);
      }
    } else if (player.moving) {
      player.moving = false;
      player.play("idle-" + player.dir);
    }
  });
}

/* ---- Camera ---- */
function setupCamera(player) {
  k.onUpdate(() => {
    const halfW = k.width() / 2, halfH = k.height() / 2;
    const targetX = k.clamp(player.pos.x, halfW, CONFIG.WORLD_W - halfW);
    const targetY = k.clamp(player.pos.y, halfH, CONFIG.WORLD_H - halfH);
    k.setCamPos(k.getCamPos().lerp(k.vec2(targetX, targetY), CONFIG.CAM_LERP * k.dt()));
  });
}

/* ---- HUD độ cao ---- */
function setupElevationHUD(player) {
  const numEl  = document.getElementById("elevation-number");
  const fillEl = document.getElementById("elevation-fill");
  const zoneEl = document.getElementById("zone-name");
  const zoneFor = (elev) => {
    let name = CONFIG.ZONES[0].name;
    for (const z of CONFIG.ZONES) if (elev >= z.elev) name = z.name;
    return name;
  };
  k.onUpdate(() => {
    const ratio = 1 - player.pos.y / CONFIG.WORLD_H;
    const elev = k.clamp(Math.round(ratio * CONFIG.MAX_ELEV), 0, CONFIG.MAX_ELEV);
    if (numEl)  numEl.textContent = elev;
    if (fillEl) fillEl.style.width = (elev / CONFIG.MAX_ELEV) * 100 + "%";
    if (zoneEl) zoneEl.textContent = zoneFor(elev);
  });
}

/* ---- Proximity + tương tác Space (kèm SFX) ---- */
function setupInteraction() {
  k.onUpdate(() => {
    if (state.paused) return;
    let near = null, best = CONFIG.INTERACT_RANGE;
    for (const p of k.get("interactable")) {
      const d = p.pos.dist(state.player.pos);
      const inRange = d < CONFIG.INTERACT_RANGE;
      if (p.promptRef) p.promptRef.opacity = inRange ? 1 : 0;
      if (inRange && d < best) { best = d; near = p; }
    }
    state.near = near;
  });

  k.onKeyPress("space", () => {
    if (!state.paused && state.near) {
      if (audio.sfx) k.play("sfx", { volume: 0.7 });
      openPopup(state.near.data);
    }
  });
  k.onKeyPress("escape", () => { if (state.paused) closePopup(); });
}

/* ---------------------------------------------------------------------
   5) POPUP (DOM)
   ------------------------------------------------------------------- */
const dom = {
  modal:   document.getElementById("modal"),
  title:   document.getElementById("modal-title"),
  text:    document.getElementById("modal-text"),
  slider:  document.getElementById("modal-slider"),
  img:     document.getElementById("slider-img"),
  count:   document.getElementById("slider-count"),
  prev:    document.getElementById("slider-prev"),
  next:    document.getElementById("slider-next"),
  finish:  document.getElementById("modal-finish"),
  close:   document.getElementById("modal-close"),
  blackout: document.getElementById("blackout"),
};

let sliderImages = [];
let sliderIdx = 0;

function renderSlide() {
  if (!sliderImages.length) return;
  sliderIdx = (sliderIdx + sliderImages.length) % sliderImages.length;
  dom.img.src = sliderImages[sliderIdx];
  dom.count.textContent = `${sliderIdx + 1} / ${sliderImages.length}`;
}

function openPopup(data) {
  state.paused = true;
  if (state.player) { state.player.moving = false; state.player.play("idle-" + state.player.dir); }

  dom.title.textContent = data.title;
  dom.text.textContent = data.text;

  if (Array.isArray(data.images) && data.images.length) {
    sliderImages = data.images; sliderIdx = 0; renderSlide();
    dom.slider.classList.remove("hidden");
  } else {
    sliderImages = [];
    dom.slider.classList.add("hidden");
  }

  dom.finish.classList.toggle("hidden", !data.finish);
  dom.modal.classList.remove("hidden");
}

function closePopup() {
  dom.modal.classList.add("hidden");
  state.paused = false;
}

function finishHike() {
  dom.modal.classList.add("hidden");
  dom.blackout.classList.remove("hidden");
}

function bindPopupEvents() {
  dom.close.addEventListener("click", closePopup);
  dom.prev.addEventListener("click", () => { sliderIdx--; renderSlide(); });
  dom.next.addEventListener("click", () => { sliderIdx++; renderSlide(); });
  dom.finish.addEventListener("click", finishHike);
  dom.modal.addEventListener("click", (e) => { if (e.target === dom.modal) closePopup(); });

  document.addEventListener("keydown", (e) => {
    if (!state.paused) return;
    const modalOpen = !dom.modal.classList.contains("hidden");
    if (e.key === "Escape" && modalOpen) closePopup();
    if (modalOpen && sliderImages.length) {
      if (e.key === "ArrowLeft")  { sliderIdx--; renderSlide(); }
      if (e.key === "ArrowRight") { sliderIdx++; renderSlide(); }
    }
  });
}

/* ---------------------------------------------------------------------
   6) AUDIO — BGM loop (bật ở tương tác đầu để né autoplay policy) + SFX.
   ------------------------------------------------------------------- */
function startBGM() {
  if (audio.bgmStarted || !audio.bgm) return;
  audio.bgmStarted = true;
  k.play("bgm", { loop: true, volume: 0.5 });
}

function setupAudioUnlock() {
  // Bất kỳ tương tác đầu tiên nào (phím/chuột/chạm) đều mở khoá audio.
  const unlock = () => startBGM();
  window.addEventListener("keydown", unlock);
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("touchstart", unlock);
}

/* ---------------------------------------------------------------------
   7) BOOT: nạp sprite thật + audio (nếu có), rồi vào scene.
   ------------------------------------------------------------------- */
async function boot() {
  const P = CONFIG.PATHS;

  // --- Player spritesheet (mapping theo yêu cầu Phase 3) ---
  k.loadSprite("ha", P.ha, {
    sliceX: 4, sliceY: 4,
    anims: {
      "idle-down": 0,  "walk-down":  { from: 0,  to: 3,  loop: true },
      "idle-up": 4,    "walk-up":    { from: 4,  to: 7,  loop: true },
      "idle-left": 8,  "walk-left":  { from: 8,  to: 11, loop: true },
      "idle-right": 12,"walk-right": { from: 12, to: 15, loop: true },
    },
  });

  // --- Vật thể tĩnh ---
  k.loadSprite("tent",    P.tent);
  k.loadSprite("journal", P.journal);
  k.loadSprite("camera",  P.camera);
  k.loadSprite("letter",  P.letter);

  // --- NPC rùa (4x2) ---
  k.loadSprite("turtle", P.turtle, {
    sliceX: 4, sliceY: 2,
    anims: { "walk": { from: 0, to: 3, loop: true } },
  });

  // --- Tileset bản đồ (1536x1024 -> 12x8, tile 128px) ---
  k.loadSprite("tiles", P.tiles, { sliceX: CONFIG.TILESET_COLS, sliceY: CONFIG.TILESET_ROWS });
  // --- Cây/props môi trường (2048x2048, slice 5x3 theo yêu cầu) ---
  k.loadSprite("trees", P.trees, { sliceX: 5, sliceY: 3 });

  // --- Audio (chỉ nạp nếu file tồn tại -> tránh crash loader khi thiếu) ---
  const [hasBgm, hasSfx] = await Promise.all([assetExists(P.bgm), assetExists(P.sfx)]);
  if (hasBgm) { k.loadSound("bgm", P.bgm); audio.bgm = true; }
  if (hasSfx) { k.loadSound("sfx", P.sfx); audio.sfx = true; }
  if (!hasBgm || !hasSfx) {
    console.warn(
      "[Mountain Trail] Thiếu file audio trong assets/audio/ " +
      "(bgm.mp3 / interact.mp3). Game vẫn chạy; thêm file để có âm thanh."
    );
  }

  bindPopupEvents();
  setupAudioUnlock();
  k.scene("game", setupGame);
  k.go("game");
}

boot();
