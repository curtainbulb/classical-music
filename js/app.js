(() => {
  'use strict';

  const ERA_BY_ID = Object.fromEntries(ERAS.map(e => [e.id, e]));
  const eraOrder = ERAS.map(e => e.id);
  WORKS.sort((a, b) => eraOrder.indexOf(a.era) - eraOrder.indexOf(b.era));

  const state = {
    mode: 'all',       // 'all' | 'gateway'
    query: '',
    activeEra: ERAS[0].id,
    paletteIndex: 0,
    paletteResults: [],
    resolved: {},      // populated from data/apple-music-resolved.json, if present
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Apple Music resolution ---------- */
  function appleMusicFor(work) {
    const resolved = state.resolved[work.id];
    if (resolved && resolved.status === 'resolved' && resolved.url) {
      return { url: resolved.url, verified: true };
    }
    if (work.appleUrl) {
      return { url: work.appleUrl, verified: !!work.appleVerified };
    }
    const term = encodeURIComponent(work.apple || `${work.composer} ${work.title}`);
    return { url: `https://music.apple.com/us/search?term=${term}`, verified: false };
  }

  /* ---------- Rendering ---------- */
  function renderWorkRow(work, indexInEra) {
    const li = document.createElement('div');
    li.className = 'work';
    li.dataset.id = work.id;
    li.dataset.composer = work.composer.toLowerCase();
    li.dataset.title = work.title.toLowerCase();
    li.dataset.gateway = work.gateway ? '1' : '0';
    li.dataset.era = work.era;

    const rowId = `work-${work.id}`;
    const panelId = `panel-${work.id}`;

    li.innerHTML = `
      <button class="work-row" id="${rowId}" aria-expanded="false" aria-controls="${panelId}">
        <span class="work-num">${String(indexInEra + 1).padStart(2, '0')}</span>
        <span class="work-titling">
          <span class="work-composer">${escapeHtml(work.composer)}</span>
          <span class="work-title">${escapeHtml(work.title)}</span>
        </span>
        <span class="work-meta">
          ${work.gateway ? '<span class="gateway-mark" title="Gateway work — a good starting point"></span>' : ''}
          <span>${escapeHtml(work.duration.split('—')[0].split(',')[0].trim())}</span>
          <span class="chev" aria-hidden="true">›</span>
        </span>
      </button>
      <div class="work-detail" id="${panelId}" role="region" aria-labelledby="${rowId}">
        <div class="work-detail-inner">
          <div class="work-detail-content"></div>
        </div>
      </div>
    `;

    li.querySelector('.work-row').addEventListener('click', () => toggleWork(li, work));
    return li;
  }

  function buildDetail(work) {
    const apple = appleMusicFor(work);
    const era = ERA_BY_ID[work.era];
    const lifespan = work.died ? `${work.born}–${work.died}` : `b. ${work.born}`;

    return `
      <div class="work-facts">
        <span><b>${escapeHtml(work.form)}</b></span>
        <span>${escapeHtml(work.duration)}</span>
        <span>${escapeHtml(work.when)}</span>
        <span>${escapeHtml(work.nationality)} · ${lifespan}</span>
      </div>

      <div>
        <span class="field-label">Why it matters</span>
        <p>${escapeHtml(work.why)}</p>
      </div>

      <div class="context">
        <span class="field-label">Context</span>
        <p>${escapeHtml(work.context)}</p>
      </div>

      <div class="listening-block">
        ${work.best ? `<div class="rec-col">
          <div class="rec-label">Recommended recording</div>
          <div class="rec-name">${escapeHtml(work.best)}</div>
        </div>` : ''}
        ${work.alt ? `<div class="rec-col">
          <div class="rec-label">Also worth hearing</div>
          <div class="rec-name">${escapeHtml(work.alt)}</div>
        </div>` : ''}
        <div>
          <a class="apple-link ${apple.verified ? '' : 'unverified'}" href="${apple.url}" target="_blank" rel="noopener noreferrer">
            ${appleGlyph()}
            ${apple.verified ? 'Listen on Apple Music' : 'Find on Apple Music'}
          </a>
          ${apple.verified ? '' : '<div class="verify-note">Destination not individually confirmed — this opens an Apple Music search for the recording above rather than a guessed link.</div>'}
        </div>
      </div>
    `;
  }

  function appleGlyph() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 7.7c-.03.03-1.6.94-1.58 2.8.02 2.23 1.96 2.97 1.98 2.98-.02.06-.31 1.06-1.02 2.09-.62.9-1.27 1.79-2.29 1.81-1 .02-1.32-.59-2.47-.59-1.15 0-1.5.57-2.45.61-.98.04-1.72-.97-2.35-1.86-1.28-1.84-2.26-5.21-.94-7.48.65-1.13 1.82-1.84 3.09-1.86.97-.02 1.87.65 2.47.65.59 0 1.7-.8 2.86-.68.49.02 1.85.2 2.72 1.5-.07.04-1.62.94-1.6 2.03z"/></svg>`;
  }

  function toggleWork(li, work, forceOpen) {
    const content = li.querySelector('.work-detail-content');
    const row = li.querySelector('.work-row');
    const willOpen = forceOpen !== undefined ? forceOpen : !li.classList.contains('open');

    if (willOpen) {
      if (!content.dataset.built) {
        content.innerHTML = buildDetail(work);
        content.dataset.built = '1';
      }
      li.classList.add('open');
      row.classList.add('expanded');
      row.setAttribute('aria-expanded', 'true');
    } else {
      li.classList.remove('open');
      row.classList.remove('expanded');
      row.setAttribute('aria-expanded', 'false');
    }
  }

  function renderAll() {
    const main = $('#works-stream');
    main.innerHTML = '';
    ERAS.forEach(era => {
      const works = WORKS.filter(w => w.era === era.id);
      const section = document.createElement('section');
      section.className = 'era-section';
      section.id = `era-${era.id}`;
      section.dataset.era = era.id;
      section.style.setProperty('--section-accent', era.accent);
      section.innerHTML = `
        <div class="era-head">
          <div class="era-period">${escapeHtml(era.period)}</div>
          <h2>${escapeHtml(era.name)}</h2>
          <p>${escapeHtml(era.desc)}</p>
        </div>
        <div class="era-works"></div>
      `;
      const list = section.querySelector('.era-works');
      works.forEach((w, i) => list.appendChild(renderWorkRow(w, i)));
      main.appendChild(section);
    });
    buildRail();
    applyFilters();
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Rail ---------- */
  function buildRail() {
    const line = $('#rail-line');
    line.innerHTML = '';
    ERAS.forEach((era, i) => {
      const tick = document.createElement('button');
      tick.className = 'rail-tick';
      tick.style.top = `${(i / (ERAS.length - 1)) * 100}%`;
      tick.dataset.era = era.id;
      tick.setAttribute('aria-label', `Jump to ${era.name}`);
      tick.innerHTML = `<span class="rail-tick-label">${escapeHtml(era.name)}</span>`;
      tick.addEventListener('click', () => {
        $(`#era-${era.id}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      line.appendChild(tick);
    });
  }

  function setEraTheme(eraId, immediate) {
    const era = ERA_BY_ID[eraId];
    if (!era) return;
    state.activeEra = eraId;
    const root = document.documentElement;
    root.style.setProperty('--era-accent', era.accent);
    root.style.setProperty('--era-bg', era.bg);
    root.style.setProperty('--era-mid', era.mid);
    $('#era-readout').textContent = `${era.name} · ${era.period}`;
    $$('.rail-tick').forEach(t => t.classList.toggle('current', t.dataset.era === eraId));
    document.body.classList.add('era-tinted');
  }

  function observeEras() {
    const sections = $$('.era-section');
    const io = new IntersectionObserver((entries) => {
      // pick the entry closest to the top that's intersecting
      let best = null;
      entries.forEach(e => {
        if (e.isIntersecting && (!best || e.boundingClientRect.top < best.boundingClientRect.top)) {
          if (e.boundingClientRect.top < window.innerHeight * 0.6) best = e;
        }
      });
      if (best) setEraTheme(best.target.dataset.era);
      updateMobileBar();
    }, { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.1, 0.5, 1] });
    sections.forEach(s => io.observe(s));
  }

  function updateMobileBar() {
    const fill = $('#mobile-era-bar-fill');
    if (!fill) return;
    const doc = document.documentElement;
    const scrolled = (window.scrollY) / (doc.scrollHeight - window.innerHeight);
    fill.style.width = `${Math.min(100, Math.max(0, scrolled * 100))}%`;
    fill.style.background = 'var(--era-accent)';
  }

  /* ---------- Filters (Start Here / mode) ---------- */
  function applyFilters() {
    const works = $$('.work');
    let visibleCount = 0;
    works.forEach(w => {
      const isGateway = w.dataset.gateway === '1';
      const passesMode = state.mode === 'all' || isGateway;
      w.classList.toggle('filtered-hide', !passesMode);
      if (passesMode) visibleCount++;
    });
    ERAS.forEach(era => {
      const section = $(`#era-${era.id}`);
      if (!section) return;
      const anyVisible = $$('.work', section).some(w => !w.classList.contains('filtered-hide'));
      section.style.display = anyVisible ? '' : 'none';
    });
    $('#hero-stats-count').textContent = visibleCount;
  }

  function setMode(mode) {
    state.mode = mode;
    $('#toggle-gateway').classList.toggle('active', mode === 'gateway');
    applyFilters();
    showToast(mode === 'gateway' ? `Start Here — showing ${WORKS.filter(w=>w.gateway).length} gateway works` : `Showing all ${WORKS.length} works`);
  }

  /* ---------- Command palette ---------- */
  function openPalette() {
    $('#palette-overlay').classList.add('open');
    $('#palette-input').value = '';
    $('#palette-input').focus();
    runPaletteSearch('');
  }
  function closePalette() {
    $('#palette-overlay').classList.remove('open');
  }
  function runPaletteSearch(q) {
    const query = q.trim().toLowerCase();
    let results;
    if (!query) {
      results = WORKS.filter(w => w.gateway).slice(0, 8);
    } else {
      results = WORKS.filter(w =>
        w.composer.toLowerCase().includes(query) ||
        w.title.toLowerCase().includes(query) ||
        w.form.toLowerCase().includes(query) ||
        ERA_BY_ID[w.era].name.toLowerCase().includes(query)
      ).slice(0, 20);
    }
    state.paletteResults = results;
    state.paletteIndex = 0;
    renderPaletteResults(query);
  }
  function renderPaletteResults(query) {
    const box = $('#palette-results');
    const empty = $('#palette-empty');
    if (state.paletteResults.length === 0) {
      box.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = query ? `No works match "${query}".` : 'Start typing to search composers, titles, or forms.';
      return;
    }
    empty.style.display = 'none';
    box.innerHTML = state.paletteResults.map((w, i) => `
      <button class="palette-item ${i === state.paletteIndex ? 'active' : ''}" data-id="${w.id}">
        <span>
          <span class="pi-composer">${escapeHtml(w.composer)}</span><br>
          <span class="pi-title">${escapeHtml(w.title)}</span>
        </span>
        <span class="pi-composer">${escapeHtml(ERA_BY_ID[w.era].name)}</span>
      </button>
    `).join('');
    $$('.palette-item', box).forEach(btn => {
      btn.addEventListener('click', () => selectPaletteResult(btn.dataset.id));
    });
  }
  function selectPaletteResult(id) {
    closePalette();
    jumpToWork(id);
  }
  function jumpToWork(id) {
    if (state.mode === 'gateway') setMode('all');
    const li = document.querySelector(`.work[data-id="${id}"]`);
    if (!li) return;
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const work = WORKS.find(w => w.id === id);
    setTimeout(() => toggleWork(li, work, true), 250);
    li.style.transition = 'background 0.15s';
    li.style.background = 'var(--bg-raised-2)';
    setTimeout(() => { li.style.background = ''; }, 900);
  }

  function surpriseMe() {
    const pool = state.mode === 'gateway' ? WORKS.filter(w => w.gateway) : WORKS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    jumpToWork(pick.id);
    showToast(`${pick.composer} — ${pick.title}`);
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ---------- Keyboard ---------- */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const paletteOpen = $('#palette-overlay').classList.contains('open');
      if (e.key === '/' && !paletteOpen && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        openPalette();
        return;
      }
      if (!paletteOpen) return;
      if (e.key === 'Escape') { closePalette(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.paletteIndex = Math.min(state.paletteIndex + 1, state.paletteResults.length - 1);
        renderPaletteResults($('#palette-input').value.trim().toLowerCase());
        scrollActiveIntoView();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.paletteIndex = Math.max(state.paletteIndex - 1, 0);
        renderPaletteResults($('#palette-input').value.trim().toLowerCase());
        scrollActiveIntoView();
      }
      if (e.key === 'Enter') {
        const w = state.paletteResults[state.paletteIndex];
        if (w) selectPaletteResult(w.id);
      }
    });
  }
  function scrollActiveIntoView() {
    const active = $('.palette-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Init ---------- */
  async function loadResolvedAppleMusic() {
    try {
      const res = await fetch('data/apple-music-resolved.json', { cache: 'no-store' });
      if (res.ok) state.resolved = await res.json();
    } catch {
      // No resolved-links file yet (or offline) — static/fallback links still work fine.
    }
  }

  async function init() {
    await loadResolvedAppleMusic();
    renderAll();
    setEraTheme(ERAS[0].id);
    observeEras();
    bindKeys();

    $('#hero-stats-total').textContent = WORKS.length;
    $('#hero-stats-composers').textContent = new Set(WORKS.map(w => w.composer)).size;

    $('#search-trigger').addEventListener('click', openPalette);
    $('#palette-overlay').addEventListener('click', (e) => { if (e.target.id === 'palette-overlay') closePalette(); });
    $('#palette-close')?.addEventListener('click', closePalette);
    $('#palette-input').addEventListener('input', (e) => runPaletteSearch(e.target.value));

    $('#toggle-gateway').addEventListener('click', () => setMode(state.mode === 'gateway' ? 'all' : 'gateway'));
    $('#surprise-btn').addEventListener('click', surpriseMe);
    $('#hero-start').addEventListener('click', () => { setMode('gateway'); $(`#era-${ERAS[0].id}`).scrollIntoView({behavior:'smooth'}); });
    $('#hero-search').addEventListener('click', openPalette);

    window.addEventListener('scroll', updateMobileBar, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
