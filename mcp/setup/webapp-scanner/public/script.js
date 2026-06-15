// ================================================================
// TD Project Browser — Client
// ================================================================

const STATE = {
  allTags: [],
  projects: [],
  activeTags: [],
  viewMode: 'grid',
  searchTimeout: null,
  detailProject: null,
  loading: false,
};

// ---- DOM refs ----
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const searchInput = $('#searchInput');
const clearBtn = $('#clearBtn');
const typeFilter = $('#typeFilter');
const tagsList = $('#tagsList');
const tagDistList = $('#tagDistList');
const tagDistSection = $('#tagDistSection');
const resultsList = $('#resultsList');
const resultsSection = $('#resultsSection');
const detailPanel = $('#detailPanel');
const detailContent = $('#detailContent');
const loading = $('#loading');
const loadMore = $('#loadMore');
const loadMoreBtn = $('#loadMoreBtn');
const resultCount = $('#resultCount');
const resultTime = $('#resultTime');
const viewGrid = $('#viewGrid');
const viewList = $('#viewList');
const statsModal = $('#statsModal');
const statsBody = $('#statsBody');
const closeStats = $('#closeStats');
const statsBtn = $('#statsBtn');

// Filter elements
const filterGlsl = $('#filterGlsl');
const filterPython = $('#filterPython');
const filterBig = $('#filterBig');
const filterToc = $('#filterToc');
const minNetworks = $('#minNetworks');
const minScripts = $('#minScripts');

// ---- State elements ----
const statsTotal = $('#statsTotal');
const statToe = $('#statToe');
const statTox = $('#statTox');
const statSize = $('#statSize');
const statExpanded = $('#statExpanded');
const statTags = $('#statTags');

// ---- Init ----
async function init() {
  showLoading(true);
  try {
    // Load stats
    const statsRes = await fetch('/api/stats');
    if (!statsRes.ok) throw new Error('index.json no encontrado');
    const stats = await statsRes.json();

    statsTotal.textContent = stats.totalProjects;
    statToe.textContent = stats.byType.toe;
    statTox.textContent = stats.byType.tox;
    statSize.textContent = stats.totalSizeFormatted;
    statExpanded.textContent = stats.totalExpandedFormatted;
    statTags.textContent = stats.byTag.length;

    // Load tags
    const tagsRes = await fetch('/api/tags');
    STATE.allTags = await tagsRes.json();
    renderTags(STATE.allTags);

    // Initial search
    await doSearch();
  } catch (e) {
    resultsSection.classList.remove('hidden');
    resultsList.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-secondary)">
        ❌ Error cargando índice.<br>
        <span style="font-size:12px">Ejecuta primero: <code>node generate-index.js</code></span>
      </div>`;
  }
  showLoading(false);
}

// ---- Render Tags ----
function renderTags(tags) {
  tagsList.innerHTML = tags.map(({ tag, count }) => {
    const active = STATE.activeTags.includes(tag) ? 'active' : '';
    return `<span class="tag ${active}" data-tag="${tag}">${tag} <span class="tag-count">${count}</span></span>`;
  }).join('');

  // Click handlers
  tagsList.querySelectorAll('.tag').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      const idx = STATE.activeTags.indexOf(tag);
      if (idx >= 0) STATE.activeTags.splice(idx, 1);
      else STATE.activeTags.push(tag);
      renderTags(STATE.allTags);
      debouncedSearch();
    });
  });
}

// ---- Render Tag Distribution ----
function renderTagDistribution(dist) {
  if (!dist || dist.length === 0) {
    tagDistSection.classList.add('hidden');
    return;
  }
  tagDistSection.classList.remove('hidden');
  tagDistList.innerHTML = dist.map(({ tag, count }) =>
    `<span class="tag-dist">${tag} ${count}</span>`
  ).join('');
}

// ---- Search ----
async function doSearch(append = false) {
  const params = new URLSearchParams();
  if (searchInput.value) params.set('q', searchInput.value);
  if (STATE.activeTags.length) params.set('tags', STATE.activeTags.join(','));
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (filterGlsl.checked) params.set('glsl', 'true');
  if (filterPython.checked) params.set('python', 'true');
  if (filterBig.checked) params.set('big', 'true');
  if (filterToc.checked) params.set('hasToc', 'true');
  if (minNetworks.value) params.set('minNetworks', minNetworks.value);
  if (minScripts.value) params.set('minScripts', minScripts.value);

  if (append) {
    params.set('offset', resultsList.children.length);
  }
  params.set('limit', '50');

  const startTime = performance.now();
  try {
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) throw new Error('Error en búsqueda');
    const data = await res.json();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    if (append) {
      // Append to existing results
      renderProjectCards(data.results, true);
    } else {
      renderProjectCards(data.results);
    }

    // Tag distribution
    renderTagDistribution(data.tagDistribution);

    // Count
    resultCount.textContent = `${data.total} resultados`;
    resultTime.textContent = `en ${elapsed}s`;

    // Load more
    const totalDisplayed = append ? resultsList.children.length : data.results.length;
    if (totalDisplayed < data.total) {
      loadMore.classList.remove('hidden');
    } else {
      loadMore.classList.add('hidden');
    }

    resultsSection.classList.remove('hidden');
  } catch (e) {
    resultsList.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--red)">Error: ${e.message}</div>`;
  }
}

const debouncedSearch = () => {
  clearTimeout(STATE.searchTimeout);
  STATE.searchTimeout = setTimeout(() => doSearch(false), 200);
};

// ---- Render Project Cards ----
function renderProjectCards(projects, append = false) {
  if (!append) resultsList.innerHTML = '';

  for (const p of projects) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.path = p.path;

    const tagsHtml = (p.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('');
    const glslBadge = p.expandedDir?.hasGLSL ? '<span class="card-badge glsl">GLSL</span>' : '';
    const pyBadge = p.expandedDir?.hasPython ? '<span class="card-badge python">Py</span>' : '';
    const simScore = p.similarityScore != null
      ? `<span class="card-tag" style="color:var(--accent)">${(p.similarityScore * 100).toFixed(0)}% sim</span>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-name">${escapeHtml(p.name)}</div>
        <span class="card-type ${p.type}">${p.type}</span>
      </div>
      <div class="card-meta">
        <span>📦 ${p.sizeFormatted}</span>
        <span>📁 ${p.expandedDir?.totalFiles || 0} files</span>
        <span>🔗 ${p.expandedDir?.networks || 0} nets</span>
        <span>🧩 ${p.expandedDir?.components || 0} comps</span>
        ${glslBadge} ${pyBadge} ${simScore}
      </div>
      <div class="card-tags">${tagsHtml}</div>
    `;

    card.addEventListener('click', () => showDetail(p.path));
    resultsList.appendChild(card);
  }
}

// ---- Show Detail ----
async function showDetail(projectPath) {
  showLoading(true);

  // Highlight card
  resultsList.querySelectorAll('.project-card').forEach(c => c.style.borderColor = '');
  const card = resultsList.querySelector(`[data-path="${CSS.escape(projectPath)}"]`);
  if (card) card.style.borderColor = 'var(--accent)';

  try {
    const res = await fetch(`/api/project?path=${encodeURIComponent(projectPath)}`);
    if (!res.ok) throw new Error('Proyecto no encontrado');
    const data = await res.json();
    renderDetail(data);
  } catch (e) {
    detailContent.innerHTML = `<div style="color:var(--red)">Error: ${e.message}</div>`;
    detailPanel.classList.remove('hidden');
  }
  showLoading(false);

  // Scroll to detail
  detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDetail(data) {
  const { project, readme, dirContents, similar, expandedDirName } = data;
  STATE.detailProject = project;

  const tagsHtml = (project.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('');
  const glslBadge = project.expandedDir?.hasGLSL ? '<span class="card-badge glsl">🔮 GLSL</span>' : '';
  const pyBadge = project.expandedDir?.hasPython ? '<span class="card-badge python">🐍 Python</span>' : '';

  const dirHtml = (dirContents || []).slice(0, 30).map(item => {
    const icon = item.isDirectory ? '📁' : '📄';
    const size = item.isDirectory ? '' : ` <span class="dir-size">${formatBytes(item.size)}</span>`;
    return `<div class="dir-item">${icon} ${escapeHtml(item.name)}${size}</div>`;
  }).join('');

  const similarHtml = (similar || []).map(s => {
    const pct = (s.score * 100).toFixed(0);
    return `<span class="similar-chip" onclick="showDetail('${s.path}')">
      ${escapeHtml(s.name)} <span class="sim-score">${pct}%</span>
    </span>`;
  }).join('');

  detailContent.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title">
          <span class="card-type ${project.type}" style="font-size:12px;vertical-align:middle;margin-right:8px">${project.type}</span>
          ${escapeHtml(project.name)}
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
          ${escapeHtml(project.path)} ${glslBadge} ${pyBadge}
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn-secondary" onclick="openExplorer('${project.path}')">📂 Abrir carpeta</button>
        <button class="btn-icon" onclick="closeDetail()">✕</button>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-stat"><div class="ds-value">${project.sizeFormatted}</div><div class="ds-label">Tamaño</div></div>
      <div class="detail-stat"><div class="ds-value">${project.expandedDir?.totalFiles || 0}</div><div class="ds-label">Archivos</div></div>
      <div class="detail-stat"><div class="ds-value">${project.expandedDir?.networks || 0}</div><div class="ds-label">Redes (.n)</div></div>
      <div class="detail-stat"><div class="ds-value">${project.expandedDir?.components || 0}</div><div class="ds-label">Componentes</div></div>
      <div class="detail-stat"><div class="ds-value">${project.expandedDir?.scripts || 0}</div><div class="ds-label">Scripts</div></div>
      <div class="detail-stat"><div class="ds-value">${project.expandedDir?.textures || 0}</div><div class="ds-label">Texturas</div></div>
    </div>

    <div class="detail-section">
      <h4>🏷️ Tags</h4>
      <div style="display:flex;gap:4px;flex-wrap:wrap">${tagsHtml}</div>
    </div>

    ${similarHtml ? `
    <div class="detail-section">
      <h4>🔗 Proyectos similares</h4>
      <div class="similar-list">${similarHtml}</div>
    </div>` : ''}

    <div class="detail-section">
      <h4>📁 Contenido de ${escapeHtml(expandedDirName)}</h4>
      <div class="dir-list">${dirHtml}</div>
      ${(dirContents || []).length > 30 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">... y ${dirContents.length - 30} archivos más</div>` : ''}
    </div>

    ${readme ? `
    <div class="detail-section">
      <h4>📖 README</h4>
      <pre style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.4">${escapeHtml(readme)}</pre>
    </div>` : ''}
  `;

  detailPanel.classList.remove('hidden');
}

function closeDetail() {
  detailPanel.classList.add('hidden');
  resultsList.querySelectorAll('.project-card').forEach(c => c.style.borderColor = '');
  STATE.detailProject = null;
}

// ---- Explorer ----
async function openExplorer(projectPath) {
  try {
    await fetch(`/api/explorer?path=${encodeURIComponent(projectPath)}`);
  } catch {
    // Try direct approach - this won't work from browser
    console.log('Open in Explorer:', projectPath);
  }
}

// ---- Stats Modal ----
async function showStatsModal() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    const tagBars = (stats.byTag || []).slice(0, 15).map(({ tag, count }) => {
      const pct = ((count / stats.totalProjects) * 100).toFixed(1);
      const width = Math.max((count / stats.totalProjects) * 100, 2);
      return `
        <div class="tag-bar-wrap">
          <span class="tag-bar-label">${tag}</span>
          <div class="tag-bar">
            <div class="tag-bar-fill" style="width:${width}%"></div>
          </div>
          <span class="tag-bar-count">${count}</span>
        </div>`;
    }).join('');

    statsBody.innerHTML = `
      <table class="stat-table">
        <tr><td>Proyectos totales</td><td>${stats.totalProjects}</td></tr>
        <tr><td>Archivos .toe</td><td>${stats.byType.toe}</td></tr>
        <tr><td>Archivos .tox</td><td>${stats.byType.tox}</td></tr>
        <tr><td>Tamaño original</td><td>${stats.totalSizeFormatted}</td></tr>
        <tr><td>Tamaño expandido</td><td>${stats.totalExpandedFormatted}</td></tr>
        <tr><td>Errores</td><td style="color:${stats.totalErrors > 0 ? 'var(--red)' : 'var(--green)'}">${stats.totalErrors}</td></tr>
        <tr><td>Tags distintos</td><td>${stats.byTag.length}</td></tr>
        <tr><td>Generado</td><td style="font-size:12px">${new Date(stats.generatedAt).toLocaleString()}</td></tr>
      </table>

      <h4 style="margin-top:20px;font-size:14px">🏷️ Distribución de Tags</h4>
      <div style="margin-top:8px">${tagBars}</div>

      <h4 style="margin-top:20px;font-size:14px">📂 Por origen</h4>
      <table class="stat-table">
        ${Object.entries(stats.bySource || {}).map(([src, count]) =>
          `<tr><td>${src}</td><td>${count}</td></tr>`
        ).join('')}
      </table>
    `;

    statsModal.classList.remove('hidden');
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// ---- Helpers ----
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showLoading(show) {
  STATE.loading = show;
  loading.classList.toggle('hidden', !show);
}

// ---- Event Listeners ----
searchInput.addEventListener('input', debouncedSearch);
clearBtn.addEventListener('click', () => { searchInput.value = ''; debouncedSearch(); });
typeFilter.addEventListener('change', debouncedSearch);

[filterGlsl, filterPython, filterBig, filterToc].forEach(el =>
  el.addEventListener('change', debouncedSearch)
);
[minNetworks, minScripts].forEach(el =>
  el.addEventListener('input', debouncedSearch)
);

viewGrid.addEventListener('click', () => {
  viewGrid.classList.add('active');
  viewList.classList.remove('active');
  resultsList.classList.remove('list-view');
});
viewList.addEventListener('click', () => {
  viewList.classList.add('active');
  viewGrid.classList.remove('active');
  resultsList.classList.add('list-view');
});

loadMoreBtn.addEventListener('click', () => doSearch(true));
statsBtn.addEventListener('click', showStatsModal);
closeStats.addEventListener('click', () => statsModal.classList.add('hidden'));
statsModal.addEventListener('click', (e) => {
  if (e.target === statsModal) statsModal.classList.add('hidden');
});

// Keyboard shortcut
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDetail();
    statsModal.classList.add('hidden');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
  }
});

// ---- Start ----
document.addEventListener('DOMContentLoaded', init);
