// DOM layer: HUD, content panels, title and ending screens.
const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const el = {
    hud: $('#hud'),
    elevSign: $('.elev-sign'),
    elevName: $('.elev-name'),
    trailBtn: $('.hud-trail'),
    trail: $('.hud-trail .trail-list'),
    sound: $('#sound'),
    touch: $('#touch'),
    loading: $('#loading'),
    loadBar: $('.load-bar i'),
    title: $('#title'),
    panel: $('#panel'),
    card: $('.panel-card'),
    panelIcon: $('.panel-icon'),
    panelTitle: $('#panel-title'),
    tabs: $('.tabs'),
    pages: $('.pages'),
    prev: $('.arrow.prev'),
    next: $('.arrow.next'),
    dots: $('.dots'),
    finish: $('.finish'),
    lightbox: $('#lightbox'),
    ending: $('#ending'),
    fade: $('#fade'),
    map: $('#map'),
    mapBg: $('.map-bg'),
    mapNodes: $('.map-nodes'),
    mapProgress: $('.map-progress-list'),
  };

  let onClose = null, onFinish = null, onStart = null, onAgain = null, onTravel = null;
  let tab = 0, page = 0, current = null;

  // fast-travel map node positions, % of assets/sprites/map.webp (1402x1122)
  const MAP_NODES = {
    camp:   { x: 20.0, y: 75.9 },
    valley: { x: 43.5, y: 45.3 },
    forest: { x: 66.5, y: 67.7 },
    summit: { x: 77.0, y: 29.5 },
  };

  // scales the fixed 1280x720 frame to cover the viewport; --safe-x/--safe-y
  // track how much gets cropped so corner-anchored HUD elements stay clear
  function fit() {
    const f = $('#frame');
    const s = Math.max(innerWidth / 1280, innerHeight / 720);
    f.style.transform = `translate(-50%, -50%) scale(${s})`;
    const safeX = Math.max(0, (1280 - innerWidth / s) / 2);
    const safeY = Math.max(0, (720 - innerHeight / s) / 2);
    f.style.setProperty('--safe-x', `${safeX}px`);
    f.style.setProperty('--safe-y', `${safeY}px`);
    const narrow = matchMedia('(hover: none)').matches && innerHeight > innerWidth * 1.1;
    document.body.classList.toggle('portrait', narrow);
  }
  addEventListener('resize', fit);

  /* --- loading ------------------------------------------------------------ */
  const progress = (p) => { el.loadBar.style.width = `${Math.round(p * 100)}%`; };
  const doneLoading = () => { el.loading.hidden = true; };

  /* --- title / ending ----------------------------------------------------- */
  function showTitle() {
    $('#title h1').textContent = TITLE.name;
    $('#title .quote').textContent = `“${TITLE.quote}”`;
    $('#start').textContent = TITLE.start;
    $('#title .hint').textContent = TITLE.hint;
    el.title.hidden = false;
  }
  const hideTitle = () => { el.title.hidden = true; };

  function showEnding() {
    $('#ending .l1').textContent = ENDING.lines[0];
    $('#ending .l2').textContent = ENDING.lines[1];
    $('#again').textContent = ENDING.again;
    el.ending.hidden = false;
  }
  const hideEnding = () => { el.ending.hidden = true; };

  /* --- HUD ---------------------------------------------------------------- */
  function buildTrail() {
    el.trail.innerHTML = '';
    AREAS.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = `${a.name} · ${a.elevation}`;
      li.dataset.id = a.id;
      el.trail.append(li);
    });
  }

  const hideHud = () => { el.hud.hidden = true; };

  let lastIndex = 0, lastVisited = new Set();

  function setArea(area, index, visited) {
    el.hud.hidden = false;
    el.elevSign.src = assetURL(`assets/sprites/${area.elevSprite}.webp`);
    el.elevName.textContent = area.name;
    $$('li', el.trail).forEach((li, i) => {
      li.classList.toggle('here', i === index);
      li.classList.toggle('done', visited.has(AREAS[i].id) && i !== index);
    });
    lastIndex = index;
    lastVisited = visited;
    if (!el.map.hidden) updateMap();
  }

  /* --- fast-travel map ------------------------------------------------- */
  function buildMap() {
    el.mapBg.src = assetURL('assets/sprites/map.webp');
    el.mapNodes.innerHTML = '';
    AREAS.forEach((a, i) => {
      const n = MAP_NODES[a.id];
      if (!n) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-node';
      b.style.left = `${n.x}%`;
      b.style.top = `${n.y}%`;
      b.dataset.index = String(i);
      b.setAttribute('aria-label', `${a.name} · ${a.elevation}`);
      b.addEventListener('click', () => {
        closeMap();
        if (onTravel) onTravel(i);
      });
      el.mapNodes.append(b);
    });
    el.mapProgress.innerHTML = '';
    AREAS.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = `${a.name} · ${a.elevation}`;
      el.mapProgress.append(li);
    });
  }

  function updateMap() {
    $$('.map-node', el.mapNodes).forEach((b, i) => {
      b.classList.toggle('here', i === lastIndex);
    });
    $$('li', el.mapProgress).forEach((li, i) => {
      li.classList.toggle('here', i === lastIndex);
      li.classList.toggle('done', lastVisited.has(AREAS[i].id) && i !== lastIndex);
    });
  }

  function openMap() {
    updateMap();
    el.map.hidden = false;
    el.map.classList.add('in');
    showTouch(false);
    Sound.sfx('open');
  }

  function closeMap() {
    if (el.map.hidden) return;
    el.map.hidden = true;
    el.map.classList.remove('in');
    showTouch(touchWanted);
    Sound.sfx('close');
  }

  const mapOpen = () => !el.map.hidden;

  /* --- content panel ------------------------------------------------------ */
  function photo(src, cls) {
    const box = document.createElement('div');
    box.className = cls;
    const img = document.createElement('img');
    img.src = assetURL(`assets/photos/${src}`);
    img.alt = '';
    img.loading = 'lazy';
    box.append(img);
    box.addEventListener('click', () => {
      $('img', el.lightbox).src = img.src;
      el.lightbox.hidden = false;
    });
    return box;
  }

  function appendInline(el, text) {
    text.split(/\*\*(.+?)\*\*/).forEach((part, i) => {
      if (i % 2 === 0) el.append(part);
      else {
        const span = document.createElement('span');
        span.className = 'accent';
        span.textContent = part;
        el.append(span);
      }
    });
  }

  function renderPage(p) {
    const node = document.createElement('div');
    if (p.layout === 'letter') {
      node.className = 'page letter';
      const paper = document.createElement('div');
      paper.className = 'journal-paper';
      if (p.heading) {
        const h = document.createElement('h3');
        const label = document.createElement('span');
        label.className = 'heading-text';
        appendInline(label, p.heading);
        const sparkle = document.createElement('span');
        sparkle.className = 'sparkle';
        sparkle.textContent = ' ✦';
        h.append(label, sparkle);
        paper.append(h);
      }
      (Array.isArray(p.text) ? p.text : [p.text]).forEach((line) => {
        const para = document.createElement('p');
        appendInline(para, line);
        paper.append(para);
      });
      node.append(paper);
    } else if (p.layout === 'hero') {
      node.className = 'page hero';
      if (p.photos && p.photos[0]) node.append(photo(p.photos[0], 'shot'));
      const words = document.createElement('div');
      words.className = 'words';
      const para = document.createElement('p');
      para.textContent = p.text || '';
      words.append(para);
      node.append(words);
    } else {
      node.className = `page grid ${p.layout}`;
      (p.photos || []).forEach((src) => node.append(photo(src, 'cell')));
    }
    return node;
  }

  function showPage(i) {
    const pages = $$('.page', el.pages);
    page = Math.max(0, Math.min(i, pages.length - 1));
    pages.forEach((n, k) => n.classList.toggle('on', k === page));
    el.prev.disabled = page === 0;
    el.next.disabled = page === pages.length - 1;
    el.dots.innerHTML = '';
    pages.forEach((_, k) => {
      const d = document.createElement('i');
      if (k === page) d.className = 'on';
      el.dots.append(d);
    });
    $('footer', el.card).style.visibility = pages.length > 1 ? 'visible' : 'hidden';
    sizeJournalCard();
  }

  function sizeJournalCard() {
    if (!el.card.classList.contains('journal')) return;
    const host = el.card.parentElement;
    if (!host) return;
    const bw = Math.min(host.clientWidth * 0.94, 1040);
    const bh = Math.min(host.clientHeight * 0.88, 610);
    if (!bw || !bh) return;
    const ratio = 1536 / 1024;
    let w = bw, h = w / ratio;
    if (h > bh) { h = bh; w = h * ratio; }
    el.card.style.width = `${w}px`;
    el.card.style.height = `${h}px`;
    el.card.style.setProperty('--card-w', `${w}px`);
  }
  addEventListener('resize', sizeJournalCard);

  function showTab(i) {
    tab = i;
    const t = current.tabs[i];
    el.pages.innerHTML = '';
    t.pages.forEach((p) => el.pages.append(renderPage(p)));
    $$('button', el.tabs).forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    showPage(0);
  }

  const showTouch = (v) => { el.touch.hidden = !v; };
  let touchWanted = false;

  function openPanel(id, handlers = {}) {
    current = PANELS[id];
    if (!current) return;
    onClose = handlers.onClose || null;
    onFinish = handlers.onFinish || null;

    const journal = id === 'summit';
    el.card.classList.toggle('journal', journal);
    if (!journal) { el.card.style.width = ''; el.card.style.height = ''; }

    el.panelIcon.src = current.icon ? assetURL(`assets/sprites/${current.icon}.webp`) : '';
    el.panelIcon.hidden = !current.icon;
    el.panelTitle.textContent = current.title;

    el.tabs.innerHTML = '';
    el.tabs.hidden = current.tabs.length < 2;
    if (current.tabs.length > 1) {
      current.tabs.forEach((t, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        if (t.icon) {
          const im = document.createElement('img');
          im.src = assetURL(`assets/sprites/${t.icon}.webp`);
          im.alt = '';
          b.append(im);
        }
        b.append(document.createTextNode(t.label));
        b.addEventListener('click', () => { showTab(i); Sound.sfx('prompt'); });
        el.tabs.append(b);
      });
    }

    el.finish.hidden = !current.finish;
    if (current.finish) el.finish.textContent = current.finish;

    showTab(0);
    el.panel.hidden = false;
    el.panel.classList.add('in');
    sizeJournalCard();           // showTab ran while the panel was still hidden (0 clientWidth)
    showTouch(false);           // the walk pads would sit on top of the card
    Sound.sfx('open');
  }

  function closePanel() {
    if (el.panel.hidden) return;
    el.panel.hidden = true;
    el.panel.classList.remove('in');
    showTouch(touchWanted);
    Sound.sfx('close');
    if (onClose) onClose();
  }

  const panelOpen = () => !el.panel.hidden || !el.lightbox.hidden;

  /* --- fades -------------------------------------------------------------- */
  function fadeOut() {
    el.fade.classList.add('on');
    return new Promise((r) => setTimeout(r, 440));
  }
  function fadeIn() {
    el.fade.classList.remove('on');
    return new Promise((r) => setTimeout(r, 440));
  }

  /* --- wiring ------------------------------------------------------------- */
  $('.close', el.card).addEventListener('click', closePanel);
  el.prev.addEventListener('click', () => { showPage(page - 1); Sound.sfx('prompt'); });
  el.next.addEventListener('click', () => { showPage(page + 1); Sound.sfx('prompt'); });
  el.finish.addEventListener('click', () => { if (onFinish) onFinish(); });
  $('.close', el.lightbox).addEventListener('click', () => { el.lightbox.hidden = true; });
  el.lightbox.addEventListener('click', (e) => {
    if (e.target === el.lightbox) el.lightbox.hidden = true;
  });
  el.panel.addEventListener('click', (e) => { if (e.target === el.panel) closePanel(); });

  el.trailBtn.addEventListener('click', () => { if (el.panel.hidden) openMap(); });
  $('.close', $('.map-card')).addEventListener('click', closeMap);
  el.map.addEventListener('click', (e) => { if (e.target === el.map) closeMap(); });

  el.sound.addEventListener('click', () => {
    const on = Sound.toggle();
    el.sound.setAttribute('aria-pressed', String(on));
    $('.lbl', el.sound).textContent = on ? 'Sound on' : 'Sound off';
  });

  $('#start').addEventListener('click', () => { if (onStart) onStart(); });
  $('#again').addEventListener('click', () => { if (onAgain) onAgain(); });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.lightbox.hidden) el.lightbox.hidden = true;
      else if (!el.map.hidden) closeMap();
      else closePanel();
    }
    if (!el.panel.hidden && el.lightbox.hidden) {
      if (e.key === 'ArrowRight') showPage(page + 1);
      if (e.key === 'ArrowLeft') showPage(page - 1);
    }
  });

  buildTrail();
  buildMap();
  fit();

  return {
    fit, progress, doneLoading,
    showTitle, hideTitle, showEnding, hideEnding,
    setArea, hideHud, openPanel, closePanel,
    panelOpen: () => panelOpen() || mapOpen(),
    fadeOut, fadeIn,
    showTouch: (v) => { touchWanted = v; showTouch(v); },
    onStart: (fn) => { onStart = fn; },
    onAgain: (fn) => { onAgain = fn; },
    onTravel: (fn) => { onTravel = fn; },
  };
})();
