/* ── State ──────────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'canon_v1';
const APPLE_CACHE_PREFIX = 'apple_id_';

let state = {
  activeEra: ERAS[0].id,
  listened: {},
  filters: { phase: null, gateway: false, listened: false },
  search: '',
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.listened = saved.listened || {};
    }
  } catch (e) { /* fresh start */ }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ listened: state.listened }));
  } catch (e) {}
}

/* ── Apple Music ────────────────────────────────────────────────────────── */
async function getAppleMusicUrl(searchTerm, workId) {
  const cacheKey = APPLE_CACHE_PREFIX + workId;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {}

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&limit=3&media=music`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;

    const album = data.results[0];
    const result = {
      musicUrl: `music://music.apple.com/us/album/${album.collectionId}`,
      webUrl: album.collectionViewUrl,
      name: album.collectionName,
    };
    try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch (e) {}
    return result;
  } catch (e) {
    return null;
  }
}

/* ── Filtering ──────────────────────────────────────────────────────────── */
function filteredWorks(eraId) {
  let works = WORKS.filter(w => w.era === eraId);

  if (state.search.length > 1) {
    const q = state.search.toLowerCase();
    works = works.filter(w =>
      w.composer.toLowerCase().includes(q) ||
      w.title.toLowerCase().includes(q) ||
      w.form.toLowerCase().includes(q) ||
      (w.best || '').toLowerCase().includes(q)
    );
  }

  if (state.filters.phase) {
    works = works.filter(w => w.phase === state.filters.phase);
  }

  if (state.filters.gateway) {
    works = works.filter(w => w.gateway);
  }

  if (state.filters.listened) {
    works = works.filter(w => !state.listened[w.id]);
  }

  return works;
}

/* ── Progress ────────────────────────────────────────────────────────────── */
function updateProgress() {
  const total = WORKS.length;
  const done = WORKS.filter(w => state.listened[w.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-label').textContent = `${done} of ${total} listened`;
}

/* ── Rendering ───────────────────────────────────────────────────────────── */
function renderEra(eraId) {
  const era = ERAS.find(e => e.id === eraId);
  if (!era) return;

  // Update CSS variables for this era
  document.documentElement.style.setProperty('--era-bg', era.bg);
  document.documentElement.style.setProperty('--era-fg', era.fg);
  document.documentElement.style.setProperty('--era-accent', era.accent);
  document.documentElement.style.setProperty('--era-mid', era.mid);

  const section = document.getElementById('era-' + eraId);
  const list = section.querySelector('.works-list');
  const works = filteredWorks(eraId);

  list.innerHTML = '';

  if (works.length === 0) {
    list.innerHTML = '<div class="empty-state">No works match the current filters.</div>';
    return;
  }

  works.forEach(work => {
    const listened = !!state.listened[work.id];
    const row = document.createElement('div');
    row.className = 'work-row' + (listened ? ' listened' : '');
    row.dataset.id = work.id;

    row.innerHTML = `
      <div class="work-summary" role="button" tabindex="0" aria-expanded="false">
        <div class="work-badges">
          <div class="phase-badge p${work.phase}" title="Phase ${work.phase}">${work.phase}</div>
          ${work.gateway ? '<div class="gateway-star" title="Gateway work">★</div>' : ''}
        </div>
        <div class="work-meta">
          <div class="work-composer">${escHtml(work.composer)}</div>
          <div class="work-title">${escHtml(work.title)}</div>
          <div class="work-detail-line">${escHtml(work.form)} · ${escHtml(work.duration)}</div>
        </div>
        <svg class="work-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="work-detail" role="region" aria-label="${escHtml(work.title)} details">
        <div class="detail-label">Why listen</div>
        <div class="detail-text">${escHtml(work.why)}</div>
        <div class="detail-label">Context</div>
        <div class="detail-text">${escHtml(work.context)}</div>
        <div class="detail-label">Recommended recording</div>
        <div class="detail-recording">${escHtml(work.best)}</div>
        ${work.alt ? `<div class="detail-alt">Also: ${escHtml(work.alt)}</div>` : ''}
        <div class="detail-actions">
          ${work.apple ? `<button class="btn-listen" data-id="${work.id}" data-apple="${escAttr(work.apple)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
            Open in Apple Music
          </button>` : ''}
          <button class="btn-check${listened ? ' checked' : ''}" data-id="${work.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              ${listened ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<circle cx="12" cy="12" r="9"></circle>'}
            </svg>
            ${listened ? 'Listened' : 'Mark as listened'}
          </button>
        </div>
      </div>
    `;

    list.appendChild(row);
  });
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

function renderAll() {
  ERAS.forEach(era => renderEra(era.id));
  updateProgress();
}

/* ── Era switching ───────────────────────────────────────────────────────── */
function switchEra(eraId) {
  state.activeEra = eraId;

  document.querySelectorAll('.era-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.era === eraId);
  });

  document.querySelectorAll('.era-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === 'era-' + eraId);
  });

  const era = ERAS.find(e => e.id === eraId);
  if (era) {
    document.documentElement.style.setProperty('--era-bg', era.bg);
    document.documentElement.style.setProperty('--era-fg', era.fg);
    document.documentElement.style.setProperty('--era-accent', era.accent);
    document.documentElement.style.setProperty('--era-mid', era.mid);

    // Update search border accent
    const search = document.getElementById('search-input');
    if (search === document.activeElement) {
      search.style.borderColor = era.accent;
    }
  }

  // Scroll active tab into view
  const activeTab = document.querySelector(`.era-tab[data-era="${eraId}"]`);
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  // Scroll content to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Event delegation ────────────────────────────────────────────────────── */
document.addEventListener('click', async (e) => {
  // Era tab
  const tab = e.target.closest('.era-tab');
  if (tab) { switchEra(tab.dataset.era); return; }

  // Work summary toggle
  const summary = e.target.closest('.work-summary');
  if (summary && !e.target.closest('.btn-listen, .btn-check')) {
    const row = summary.closest('.work-row');
    const wasOpen = row.classList.contains('open');
    // Close all open rows in this era
    document.querySelectorAll('.work-row.open').forEach(r => {
      r.classList.remove('open');
      r.querySelector('.work-summary').setAttribute('aria-expanded', 'false');
    });
    if (!wasOpen) {
      row.classList.add('open');
      summary.setAttribute('aria-expanded', 'true');
    }
    return;
  }

  // Apple Music button
  const listenBtn = e.target.closest('.btn-listen');
  if (listenBtn) {
    e.stopPropagation();
    const workId = listenBtn.dataset.id;
    const searchTerm = listenBtn.dataset.apple;
    listenBtn.classList.add('loading');
    listenBtn.textContent = 'Finding…';

    const result = await getAppleMusicUrl(searchTerm, workId);
    listenBtn.classList.remove('loading');

    if (result) {
      // Try music:// first, fall back to https
      const a = document.createElement('a');
      a.href = result.musicUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // After a short delay, if still here, offer web link
      setTimeout(() => {
        listenBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg> Open in Apple Music`;
      }, 800);
    } else {
      listenBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg> Open in Apple Music`;
      alert('Could not reach the iTunes Search API. Check your connection.');
    }
    return;
  }

  // Mark listened button
  const checkBtn = e.target.closest('.btn-check');
  if (checkBtn) {
    e.stopPropagation();
    const workId = checkBtn.dataset.id;
    const nowListened = !state.listened[workId];
    if (nowListened) {
      state.listened[workId] = true;
    } else {
      delete state.listened[workId];
    }
    saveState();
    renderAll();

    // Re-open the row that was open
    const newRow = document.querySelector(`.work-row[data-id="${workId}"]`);
    if (newRow) {
      newRow.classList.add('open');
      const sum = newRow.querySelector('.work-summary');
      if (sum) sum.setAttribute('aria-expanded', 'true');
    }
    return;
  }
});

// Keyboard support for work rows
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const summary = e.target.closest('.work-summary');
    if (summary) {
      e.preventDefault();
      summary.click();
    }
  }
});

/* ── Init + filter wiring (single DOMContentLoaded) ─────────────────────── */
function init() {
  loadState();

  const nav = document.getElementById('era-nav-inner');
  const main = document.getElementById('main');

  // Build era tabs and sections
  ERAS.forEach((era, i) => {
    const btn = document.createElement('button');
    btn.className = 'era-tab' + (i === 0 ? ' active' : '');
    btn.dataset.era = era.id;
    btn.innerHTML = `
      <span class="era-tab-name">${era.name}</span>
      <span class="era-tab-period">${era.period}</span>
    `;
    nav.appendChild(btn);

    const section = document.createElement('section');
    section.className = 'era-section' + (i === 0 ? ' active' : '');
    section.id = 'era-' + era.id;
    section.innerHTML = `
      <div class="era-header" data-name="${era.name}">
        <div class="era-header-inner">
          <h2 class="era-name">${era.name}</h2>
          <div class="era-period">${era.period}</div>
          <p class="era-desc">${escHtml(era.desc)}</p>
        </div>
      </div>
      <div class="works-list"></div>
    `;
    main.appendChild(section);
  });

  // Wire filter buttons (they exist in static HTML, safe to query now)
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filter;
      const val = btn.dataset.value;

      if (type === 'phase') {
        const newPhase = parseInt(val, 10);
        if (state.filters.phase === newPhase) {
          state.filters.phase = null;
          btn.classList.remove('active');
        } else {
          state.filters.phase = newPhase;
          filterBtns.forEach(b => { if (b.dataset.filter === 'phase') b.classList.remove('active'); });
          btn.classList.add('active');
        }
      } else if (type === 'gateway') {
        state.filters.gateway = !state.filters.gateway;
        btn.classList.toggle('active', state.filters.gateway);
      } else if (type === 'unlistened') {
        state.filters.listened = !state.filters.listened;
        btn.classList.toggle('active', state.filters.listened);
      }

      renderAll();
    });
  });

  // Wire search
  const searchInput = document.getElementById('search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      renderAll();
    }, 180);
  });

  renderAll();
  switchEra(ERAS[0].id);
}

// With defer, scripts run after HTML is parsed (readyState = 'interactive' or
// 'complete'). Either way the DOM is ready — call init() immediately.
// Fallback: if somehow still loading, wait for DOMContentLoaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init(); // 'interactive' or 'complete' — DOM is ready
}
