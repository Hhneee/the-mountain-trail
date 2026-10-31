// Procedural lofi score — no audio files, generated live via WebAudio.
// Each area has its own key/tempo/instrumentation. Point BGM_FILE
// (content.js) at a file to use a custom loop instead.

const Sound = (() => {
  let ctx = null, master = null, wet = null, musicGain = null, sfxGain = null;
  let crackle = null, file = null;
  let mood = null, bar = 0, nextTime = 0, timer = null;
  let on = true, started = false;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* --- the instruments ---------------------------------------------------- */

  function voice(t, freq, dur, level, type, attack, detune) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune || 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(musicGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const pluck = (t, f, dur, lv) => {         // nylon-string feel: quick in, slow out
    voice(t, f, dur, lv, 'triangle', 0.006, -4);
    voice(t, f * 2.01, dur * 0.4, lv * 0.28, 'sine', 0.004, 5);
  };
  const bell = (t, f, dur, lv) => {
    voice(t, f, dur, lv, 'sine', 0.01);
    voice(t, f * 2.76, dur * 0.35, lv * 0.20, 'sine', 0.008);
  };
  const marimba = (t, f, dur, lv) => {
    voice(t, f, dur, lv, 'triangle', 0.004);
    voice(t, f * 4, dur * 0.18, lv * 0.16, 'sine', 0.003);
  };
  const pad = (t, f, dur, lv) => voice(t, f, dur, lv, 'triangle', dur * 0.35, -6);
  const swell = (t, f, dur, lv) => voice(t, f, dur, lv, 'sine', dur * 0.45, 4);
  const bass = (t, f, dur, lv) => voice(t, f, dur, lv, 'sine', 0.02);

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function hit(t, level, freq, q, dur, dest) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || musicGain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const kick = (t, lv) => { hit(t, lv, 150, 1.1, 0.16); voice(t, 62, 0.18, lv * 1.5, 'sine', 0.004); };
  const rim = (t, lv) => hit(t, lv, 1500, 5, 0.05);
  const shaker = (t, lv) => hit(t, lv, 8200, 0.8, 0.045);
  const tom = (t, lv) => voice(t, 96, 0.4, lv, 'sine', 0.01);

  /* --- the four pieces ----------------------------------------------------- */

  const MOODS = {
    camp: {
      root: 53, bpm: 78, air: 0.24,
      chords: [[0, 4, 7, 11], [-3, 0, 4, 9], [-5, 0, 3, 7], [2, 5, 9, 12]],
      play(t, beat, ch, root) {
        bass(t, mtof(root - 12 + ch[0]), beat * 3.0, 0.11);
        for (let i = 0; i < 8; i++) {
          const n = ch[[0, 1, 2, 3, 2, 1, 3, 2][i]];
          pluck(t + i * beat * 0.5, mtof(root + 12 + n), beat * 1.1, 0.055);
        }
        for (let b = 0; b < 4; b++) {
          if (b % 2 === 0) kick(t + b * beat, 0.05);
          else rim(t + b * beat, 0.034);
          shaker(t + (b + 0.5) * beat, 0.014);
        }
        if (bar % 2 === 1) bell(t + beat * 3, mtof(root + 24 + pick(ch)), beat * 1.6, 0.045);
        else bell(t + beat * 1.5, mtof(root + 24 + pick(ch)), beat * 1.2, 0.032);
      },
    },

    valley: {
      root: 55, bpm: 96, air: 0.2,
      chords: [[0, 4, 7, 11], [2, 5, 9, 12], [-3, 0, 4, 7], [-1, 2, 5, 9]],
      play(t, beat, ch, root) {
        const walk = [ch[0], ch[2], ch[1], ch[2]];
        for (let b = 0; b < 4; b++) {
          bass(t + b * beat, mtof(root - 12 + walk[b]), beat * 0.85, 0.09);
          shaker(t + b * beat, 0.03);
          shaker(t + (b + 0.5) * beat, 0.02);
          if (b === 0 || b === 2) kick(t + b * beat, 0.04);
          else rim(t + b * beat, 0.026);
        }
        const run = [0, 2, 4, 7, 9, 7, 4, 2];
        for (let i = 0; i < 8; i++) {
          if (Math.random() > 0.55) continue;
          bell(t + i * beat * 0.5, mtof(root + 24 + ch[0] + run[i]), beat * 0.7, 0.045);
        }
        ch.forEach((n, i) => pad(t, mtof(root + 12 + n), beat * 3.6, 0.024, i));
      },
    },

    forest: {
      root: 50, bpm: 64, air: 0.42,
      chords: [[0, 3, 7, 10], [-2, 2, 5, 9], [-4, 0, 3, 7], [-5, -1, 2, 7]],
      play(t, beat, ch, root) {
        voice(t, mtof(root - 24), beat * 4.2, 0.065, 'sine', beat * 0.5);
        voice(t, mtof(root - 24) * 1.005, beat * 4.2, 0.045, 'sine', beat * 0.6);
        ch.forEach((n, i) => pad(t + i * 0.14, mtof(root + 12 + n), beat * 3.8, 0.028));
        bass(t, mtof(root - 12 + ch[0]), beat * 2.0, 0.05);
        bass(t + beat * 2, mtof(root - 12 + ch[2]), beat * 2.0, 0.045);
        for (let b = 0; b < 4; b++) rim(t + b * beat, 0.017);
        [0.5, 1.5, 2.25, 3.5].forEach((b) => {
          if (Math.random() > 0.42) return;
          marimba(t + b * beat, mtof(root + 24 + pick(ch)), beat * 1.3, 0.055);
        });
        tom(t + (bar % 2) * beat * 2, 0.055);
      },
    },

    summit: {
      root: 51, bpm: 60, air: 0.44,
      chords: [[0, 4, 7, 11], [-5, 0, 4, 7], [-3, 2, 5, 9], [-7, -3, 0, 4]],
      play(t, beat, ch, root) {
        ch.forEach((n, i) => swell(t + i * 0.25, mtof(root + 12 + n), beat * 4.4, 0.038));
        bass(t, mtof(root - 12 + ch[0]), beat * 2.0, 0.075);
        for (let b = 0; b < 4; b++) {
          if (b % 2 === 0) kick(t + b * beat, 0.032);
          else rim(t + b * beat, 0.022);
        }
        if (bar % 2 === 0) {
          [0, 2, 4, 7, 9, 12].forEach((n, i) => marimba(
            t + i * beat * 0.4, mtof(root + 24 + ch[0] + n), beat * 0.9, 0.04));
        } else if (Math.random() < 0.6) {
          bell(t + beat * pick([1, 2, 2.5]), mtof(root + 36 + pick(ch)), beat * 2.4, 0.036);
        }
      },
    },

    title: {
      root: 53, bpm: 72, air: 0.3,
      chords: [[0, 4, 7, 11], [-5, 0, 4, 9], [-3, 0, 4, 7], [-7, -3, 0, 5]],
      play(t, beat, ch, root) {
        ch.forEach((n, i) => pad(t + i * 0.2, mtof(root + 12 + n), beat * 3.8, 0.036));
        bass(t, mtof(root - 12 + ch[0]), beat * 3.4, 0.078);
        for (let b = 0; b < 4; b += 2) rim(t + b * beat, 0.02);
        if (Math.random() < 0.65) pluck(t + beat * 2, mtof(root + 24 + pick(ch)), beat * 1.4, 0.036);
      },
    },
  };

  /* --- engine -------------------------------------------------------------- */

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    wet = ctx.createGain();
    wet.gain.value = 0.34;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2100;
    [0.19, 0.31].forEach((d) => {
      const dl = ctx.createDelay(1.0);
      dl.delayTime.value = d;
      const fb = ctx.createGain();
      fb.gain.value = 0.42;
      wet.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(lp);
    });
    lp.connect(master);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    musicGain.connect(wet);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.6;
    sfxGain.connect(master);
    sfxGain.connect(wet);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3200;
    hp.Q.value = 0.6;
    crackle = ctx.createGain();
    crackle.gain.value = 0.012;
    src.connect(hp); hp.connect(crackle); crackle.connect(master);
    src.start();

    mood = MOODS.title;
    return true;
  }

  function pump() {
    if (!ctx || file || !mood) return;
    const beat = 60 / mood.bpm;
    while (nextTime < ctx.currentTime + 1.4) {
      if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.1;
      mood.play(nextTime, beat, mood.chords[bar % mood.chords.length], mood.root);
      bar += 1;
      nextTime += beat * 4;
    }
  }

  function start() {
    if (started) return;
    if (!build()) return;
    started = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    if (typeof BGM_FILE === 'string' && BGM_FILE) {
      const el = new Audio(BGM_FILE);
      el.loop = true;
      el.volume = 0.45;
      el.addEventListener('canplaythrough', () => {
        file = el;
        if (on) el.play().catch(() => { file = null; });
      }, { once: true });
      el.addEventListener('error', () => { file = null; }, { once: true });
    }

    nextTime = ctx.currentTime + 0.08;
    timer = setInterval(pump, 220);
    pump();
  }

  function setArea(id) {
    const m = MOODS[id] || MOODS.title;
    if (!ctx) { mood = m; return; }
    if (m === mood) return;
    mood = m;
    bar = 0;
    wet.gain.setTargetAtTime(m.air, ctx.currentTime, 1.0);
  }

  function toggle() {
    on = !on;
    if (!started && on) start();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx) musicGain.gain.setTargetAtTime(on ? 0.5 : 0.0, ctx.currentTime, 0.25);
    if (crackle) crackle.gain.setTargetAtTime(on ? 0.012 : 0, ctx.currentTime, 0.25);
    if (file) { on ? file.play().catch(() => {}) : file.pause(); }
    return on;
  }

  const enabled = () => on;

  function sfx(name) {
    if (!ctx || !on) return;
    const t = ctx.currentTime + 0.01;
    if (name === 'step') hit(t, 0.05, 480 + Math.random() * 260, 1.6, 0.07, sfxGain);
    else if (name === 'open') [0, 7].forEach((iv, i) => bell(t + i * 0.05, mtof(84 + iv), 0.5, 0.05));
    else if (name === 'close') bell(t, mtof(72), 0.4, 0.045);
    else if (name === 'prompt') bell(t, mtof(88), 0.16, 0.03);
    else if (name === 'area') [0, 4, 7, 12].forEach((iv, i) => pluck(t + i * 0.09, mtof(72 + iv), 0.7, 0.05));
  }

  return { start, setArea, toggle, enabled, sfx };
})();
