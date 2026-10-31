// Ambient particles drawn over the scene art: embers, motes, fireflies,
// glints. Positions are in painting pixels so they stay anchored on drift.

const Ambient = (() => {
  let pool = [];          // long-lived: motes, fireflies
  let live = [];          // short-lived: embers, glitter
  let acc = {};           // spawn accumulators, per emitter
  let area = null;

  const rnd = (a, b) => a + Math.random() * (b - a);

  function enter(a) {
    area = a;
    pool = [];
    live = [];
    acc = {};
    const cfg = a.ambient;
    if (!cfg) return;

    (cfg.motes || []).forEach((m, i) => {
      for (let n = 0; n < m.count; n++) {
        pool.push({
          kind: 'mote', cfg: m, id: i,
          x: rnd(0, 1680), y: rnd(m.band[0], m.band[1]),
          seed: rnd(0, 6.28), size: m.size || 2,
          sway: rnd(0.5, 1.4),
        });
      }
    });
    (cfg.fireflies || []).forEach((f, i) => {
      for (let n = 0; n < f.count; n++) {
        pool.push({
          kind: 'fly', cfg: f, id: i,
          x: rnd(f.x0, f.x1), y: rnd(f.band[0], f.band[1]),
          seed: rnd(0, 6.28), rate: rnd(0.35, 0.75),
          vx: rnd(-9, 9), vy: rnd(-5, 5),
        });
      }
    });
  }

  function spawn(cfg, key, rate, dt, make) {
    acc[key] = (acc[key] || 0) + rate * dt;
    while (acc[key] >= 1) {
      acc[key] -= 1;
      live.push(make());
    }
  }

  function update(dt, t) {
    if (!area || !area.ambient) return;
    const cfg = area.ambient;

    (cfg.embers || []).forEach((e, i) => {
      spawn(e, `e${i}`, e.rate, dt, () => ({
        kind: 'ember', col: e.color,
        x: e.x + rnd(-7, 7), y: e.y,
        vx: rnd(-5, 5), vy: rnd(-26, -14),
        age: 0, life: rnd(0.9, 1.8), seed: rnd(0, 6.28),
      }));
    });

    (cfg.glitter || []).forEach((g, i) => {
      spawn(g, `g${i}`, g.rate, dt, () => ({
        kind: 'glint', col: g.color,
        x: rnd(g.x0, g.x1), y: rnd(g.band[0], g.band[1]),
        vx: 0, vy: 0, age: 0, life: rnd(0.5, 1.1),
      }));
    });

    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) { live.splice(i, 1); continue; }
      p.x += p.vx * dt + (p.kind === 'ember' ? Math.sin(t * 2 + p.seed) * 6 * dt : 0);
      p.y += p.vy * dt;
      if (p.kind === 'ember') p.vy *= 0.995;
    }

    pool.forEach((p) => {
      if (p.kind === 'mote') {
        p.x += p.cfg.drift * dt;
        p.y += Math.sin(t * p.sway + p.seed) * (p.cfg.flutter || 4) * dt;
        if (p.x < -20) p.x = 1700;
        if (p.x > 1700) p.x = -20;
        if (p.y < p.cfg.band[0]) p.y = p.cfg.band[1];
        if (p.y > p.cfg.band[1]) p.y = p.cfg.band[0];
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (Math.random() < 0.9 * dt) { p.vx = rnd(-11, 11); p.vy = rnd(-6, 6); }
        if (p.x < p.cfg.x0) p.vx = Math.abs(p.vx);
        if (p.x > p.cfg.x1) p.vx = -Math.abs(p.vx);
        if (p.y < p.cfg.band[0]) p.vy = Math.abs(p.vy);
        if (p.y > p.cfg.band[1]) p.vy = -Math.abs(p.vy);
      }
    });
  }

  // layer: 'back' draws behind the hero sprite, 'front' draws over it
  function draw(ctx, a, toScreen, toScreenY, t, layer) {
    if (!a || !a.ambient) return;
    const cfg = a.ambient;
    const sc = a.view.scale;

    if (layer === 'back') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      (cfg.glow || []).forEach((g, i) => {
        const r = (g.r + Math.sin(t * (g.pulse || 5) + i) * g.r * 0.09) * sc;
        const cx = toScreen(a, g.x);
        const cy = toScreenY(a, g.y);
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, g.color);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = g.alpha || 0.35;
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    live.forEach((p) => {
      const front = p.kind === 'ember';
      if ((layer === 'front') !== front) return;
      const fade = p.kind === 'glint'
        ? Math.sin((p.age / p.life) * Math.PI)
        : 1 - p.age / p.life;
      const x = Math.round(toScreen(a, p.x));
      const y = Math.round(toScreenY(a, p.y));
      ctx.fillStyle = p.col;
      if (p.kind === 'glint') {
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillRect(x - 2, y, 5, 1);        // a sparkle on water is a little cross
        ctx.fillRect(x, y - 2, 1, 5);
      } else {
        ctx.globalAlpha = Math.max(0, fade) * 0.9;
        ctx.fillRect(x, y, 2, 2);
      }
    });
    ctx.restore();

    ctx.save();
    pool.forEach((p) => {
      const front = p.cfg.front === true;
      if ((layer === 'front') !== front) return;
      const x = Math.round(toScreen(a, p.x));
      const y = Math.round(toScreenY(a, p.y));
      let alpha = p.cfg.alpha || 0.55;
      ctx.fillStyle = p.cfg.color;
      if (p.kind === 'fly') {
        const blink = Math.max(0, Math.sin(t * p.rate * 1.6 + p.seed));
        if (blink < 0.03) return;
        alpha *= Math.pow(blink, 0.5);
        // a stepped halo: soft enough to read as light, still made of pixels
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.10;
        ctx.fillRect(x - 3, y - 3, 8, 8);
        ctx.globalAlpha = alpha * 0.22;
        ctx.fillRect(x - 2, y - 2, 6, 6);
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillRect(x - 1, y - 1, 4, 4);
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, 2, 2);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, p.size || 2, p.size || 2);
      }
    });
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return { enter, update, draw };
})();
