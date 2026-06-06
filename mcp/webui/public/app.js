/* ── State ───────────────────────────────────────────────────────────────── */

// Catch unhandled errors silently (Chrome extension noise)
window.addEventListener('error', (e) => {
  if (e.message.includes('message port closed') || e.message.includes('Unexpected end of input')) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
});
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
});

const state = {
  connected: false,
  tools: [],
  toolNames: [],
  toolData: [],
  logCount: 0,
  logFilter: 'all',
  currentPage: 'dashboard',
  mcpConnected: false,
};

/* ── DOM refs ────────────────────────────────────────────────────────────── */

const $ = id => document.getElementById(id);
const statusDot = $('statusDot');
const statusText = $('statusText');
const footerStatusText = $('footerStatusText');

/* ── Navigation ──────────────────────────────────────────────────────────── */

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const page = tab.dataset.page;
    navigateTo(page);
  });
});

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-tab[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = $(`page-${page}`);
  if (target) target.classList.add('active');

  // Page-specific rendering
  if (page === 'tools') renderTools();
  if (page === 'commands') renderCommands();
  if (page === 'tutorials') renderTutorials('tutorials');
}

/* ── Status polling ─────────────────────────────────────────────────────── */

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.mcpConnected = data.connected;
    state.toolData = data.toolNames || [];
    state.tools = data.tools || 0;
    updateUI();
  } catch {
    state.mcpConnected = false;
    updateUI();
  }
}

function updateUI() {
  const connected = state.mcpConnected;
  statusDot.className = 'status-dot' + (connected ? ' connected' : '');
  statusText.textContent = connected ? 'Conectado' : 'Desconectado';
  footerStatusText.textContent = connected ? 'Conectado' : 'Desconectado';
  $('footerStatus').style.color = connected ? 'var(--green)' : 'var(--red)';

  // Dashboard stats
  $('statTools').textContent = state.tools || '--';
  $('statOnline').textContent = connected ? 'Conectado' : 'Desconectado';
  $('statOnline').className = 'stat-value ' + (connected ? 'connected' : 'disconnected');

  // Calculate offline vs online tools
  const knownOffline = ['td_pops_query','td_ops_query','td_templates_query','td_alias_resolve','td_get_param_help','td_get_tutorial','td_list_tutorials','td_get_workflow','td_list_workflows','td_get_td_classes','td_get_module_help','td_compare_mcps','td_run_prompt','tool_batch','td_history_list','td_history_undo','td_history_clear'];
  const online = state.toolData.filter(t => !knownOffline.includes(t)).length;
  const offline = state.toolData.filter(t => knownOffline.includes(t)).length;
  $('statsOnline').textContent = online;
  $('statsOffline').textContent = offline;

  // Progress bar
  const pct = state.tools > 0 ? Math.round((offline / state.tools) * 100) : 0;
  const progressFill = $('toolsProgress');
  if (progressFill) progressFill.style.width = pct + '%';
  const lbl = $('toolsProgressLabel');
  if (lbl) lbl.textContent = `${pct}% son offline (sin TD)`;

  // Monitor
  $('monMCP').textContent = connected ? 'Conectado' : 'Detenido';
  $('monMCP').className = 'tag ' + (connected ? 'tag-green' : 'tag-red');
  $('monTD').textContent = connected ? 'Disponible' : 'Esperando conexión';
  $('monTD').className = 'tag ' + (connected ? 'tag-green' : 'tag-yellow');
  $('monTools').textContent = state.tools + ' tools';
}

/* ── WebSocket ──────────────────────────────────────────────────────────── */

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws;
  try {
    ws = new WebSocket(`${protocol}//${location.host}/ws`);
  } catch(e) {
    console.log('[WS] Connection failed:', e.message);
    setTimeout(connectWS, 3000);
    return;
  }

  ws.onopen = () => console.log('[WS] Connected');
  ws.onmessage = (event) => {
    // Only parse text messages, ignore binary
    if (typeof event.data !== 'string') return;
    // Skip if too short to be a valid JSON object
    const trimmed = event.data.trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return;
    try {
      handleWSMessage(JSON.parse(trimmed));
    } catch (e) {
      console.warn('[WS] Parse error:', trimmed.substring(0, 100));
    }
  };
  ws.onclose = () => { console.log('[WS] Reconnecting...'); setTimeout(connectWS, 3000); };
  ws.onerror = () => { if (ws) ws.close(); };
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'status':
      state.mcpConnected = data.connected;
      state.tools = data.tools || 0;
      state.toolData = data.toolNames || [];
      updateUI();
      break;
    case 'log':
      addLogEntry(data.entry);
      break;
  }
}

/* ── Quick Tool Call ────────────────────────────────────────────────────── */

async function quickCall(name, args = {}) {
  const box = $('quickResult') || $('cmdResult');
  if (box) box.innerHTML = '⏳ Ejecutando...';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      if (box) box.innerHTML = `<span style="color:var(--red)">Respuesta inesperada del servidor (no JSON): ${text.substring(0, 200)}</span>`;
      return;
    }
    if (box) {
      if (data.success) {
        box.innerHTML = syntaxHighlight(JSON.stringify(data.result, null, 2));
      } else {
        box.innerHTML = `<span style="color:var(--red)">Error: ${data.error}</span>`;
      }
    }
  } catch (err) {
    if (box) box.innerHTML = `<span style="color:var(--red)">Error: ${err.name === 'AbortError' ? 'Timeout (15s)' : err.message}</span>`;
  }
}

function syntaxHighlight(json) {
  return json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span style="color:var(--cyan)">"$1"</span>:')
    .replace(/: "([^"]+)"/g, ': <span style="color:var(--green)">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:var(--orange)">$1</span>')
    .replace(/: (true|false)/g, ': <span style="color:var(--purple)">$1</span>')
    .replace(/: (null)/g, ': <span style="color:var(--text-muted)">$1</span>');
}

/* ── Render Tools ───────────────────────────────────────────────────────── */

function renderTools() {
  const grid = $('toolsGrid');
  if (!grid) return;
  const search = ($('toolSearch')?.value || '').toLowerCase();
  const filter = $('toolFilter')?.value || 'all';

  const knownOffline = ['td_pops_query','td_ops_query','td_templates_query','td_alias_resolve','td_get_param_help','td_get_tutorial','td_list_tutorials','td_get_workflow','td_list_workflows','td_get_td_classes','td_get_module_help','td_compare_mcps','td_run_prompt','tool_batch','td_history_list','td_history_undo','td_history_clear'];

  let filtered = state.toolData.filter(name => {
    if (search && !name.toLowerCase().includes(search)) return false;
    if (filter === 'online' && knownOffline.includes(name)) return false;
    if (filter === 'offline' && !knownOffline.includes(name)) return false;
    return true;
  });

  $('toolsFoundCount').textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">No se encontraron tools con ese filtro.</div>';
    return;
  }

  grid.innerHTML = filtered.map(name => {
    const isOffline = knownOffline.includes(name);
    const desc = toolDescriptions[name] || `Tool MCP: ${name}`;
    const args = toolArgs[name] || {};
    const argsStr = Object.keys(args).length > 0 ? JSON.stringify(args, null, 2) : '{}';

    return `<div class="tool-card" onclick="this.classList.toggle('expanded')">
      <div class="tool-card-header">
        <span class="tool-card-name">${name}</span>
        <span class="tool-card-badge ${isOffline ? 'offline' : 'online'}">${isOffline ? 'Local' : 'Online'}</span>
      </div>
      <div class="tool-card-desc">${desc}</div>
      <div class="tool-card-expanded">
        <div class="tool-card-schema">Argumentos:\n${argsStr}</div>
        <div class="tool-card-actions">
          <button class="btn-run" onclick="event.stopPropagation();quickCall('${name}', ${argsStr})">▶ Ejecutar</button>
          <button onclick="event.stopPropagation();navigateTo('commands')">📋 Ver comandos</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

$('toolSearch')?.addEventListener('input', renderTools);
$('toolFilter')?.addEventListener('change', renderTools);

/* ── Render Commands ────────────────────────────────────────────────────── */

const COMMANDS = [
  { name: 'td_execute', label: 'Ejecutar Python', desc: 'Ejecutá cualquier código Python en TouchDesigner', args: { code: 'print("Hola desde TD")', from_op: '/' } },
  { name: 'td_create_operator', label: 'Crear Operador', desc: 'Creá un nuevo operador en la red', args: { type: 'noiseTOP', name: 'mi_noise', path: '/project1' } },
  { name: 'td_connect_nodes', label: 'Conectar Nodos', desc: 'Conectá dos operadores', args: { source_path: '/project1/mi_noise', target_path: '/project1/mi_blur' } },
  { name: 'td_pars_get', label: 'Leer Parámetros', desc: 'Leé todos los parámetros de un operador', args: { path: '/project1/mi_noise' } },
  { name: 'td_pars_set', label: 'Setear Parámetro', desc: 'Cambiá el valor de un parámetro', args: { path: '/project1/mi_noise', updates: [{ name: 'Amplitude', value: 0.8 }] } },
  { name: 'td_healthcheck', label: 'Healthcheck', desc: 'Verificá el estado de la red', args: { path: '/', recurse: false } },
  { name: 'td_get_info', label: 'Info TD', desc: 'Información del entorno TouchDesigner', args: {} },
  { name: 'td_get_perf', label: 'Performance', desc: 'Medí FPS y operadores lentos', args: { path: '/project1', top: 10 } },
  { name: 'td_screenshot', label: 'Screenshot', desc: 'Capturá la salida de un operador', args: { path: '/project1' } },
  { name: 'td_search', label: 'Buscar en TD', desc: 'Buscá texto en toda la red', args: { query: 'noise', root: '/project1', scope: 'all' } },
  { name: 'td_network_plan', label: 'Planificar Red', desc: 'Planificá una red desde lenguaje natural', args: { prompt: 'crea un feedback loop con noise y blur', apply: false } },
  { name: 'td_export_network', label: 'Exportar Red', desc: 'Exportá una red a Python o diff', args: { path: '/project1', format: 'python' } },
  { name: 'td_pops_query', label: 'Buscar POPs', desc: 'Buscá en la base de conocimiento de POPs (sin TD)', args: { search: 'particle', limit: 5 } },
  { name: 'td_ops_query', label: 'Buscar Operadores', desc: 'Buscá en TOP/CHOP/SOP/DAT (sin TD)', args: { search: 'noise', family: 'TOP', limit: 5 } },
  { name: 'td_watch', label: 'Monitorear', desc: 'Iniciá monitoreo de performance en tiempo real', args: { path: '/project1', interval: 5, threshold: 50, action: 'start' } },
  { name: 'td_get_param_help', label: 'Ayuda Parámetros', desc: 'Buscá documentación de un operador (sin TD)', args: { type: 'noiseTOP' } },
  { name: 'td_get_tutorial', label: 'Ver Tutorial', desc: 'Obtené el contenido de un tutorial (sin TD)', args: { name: 'bloom-effect' } },
  { name: 'td_get_module_help', label: 'Ayuda Módulo', desc: 'Documentación detallada de un operador (sin TD)', args: { name: 'Noise_TOP' } },
  { name: 'td_alias_resolve', label: 'Resolver Aliases', desc: 'Traducí vocabulario a parámetros TD (sin TD)', args: { text: 'feedback loop' } },
  { name: 'td_list_tutorials', label: 'Listar Tutoriales', desc: 'Mostrá todos los tutoriales disponibles (sin TD)', args: {} },
];

function renderCommands() {
  const grid = $('commandsGrid');
  if (!grid) return;

  grid.innerHTML = COMMANDS.map((cmd, idx) => `
    <div class="cmd-card" data-cmd-idx="${idx}">
      <h4>${cmd.label}</h4>
      <p>${cmd.desc}</p>
      <div class="cmd-args">${JSON.stringify(cmd.args, null, 2)}</div>
      <button class="btn-execute" onclick="executeCommandByIndex(${idx})">▶ ${cmd.label}</button>
    </div>
  `).join('');
}

async function executeCommandByIndex(idx) {
  const cmd = COMMANDS[idx];
  if (!cmd) return;
  await executeCommand(cmd.name, cmd.args);
}

async function executeCommand(name, args) {
  const box = $('cmdResult');
  if (box) box.innerHTML = '⏳ Ejecutando...';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('/api/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, arguments: args }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      if (box) box.innerHTML = `<span style="color:var(--red)">Respuesta inesperada (no JSON): ${text.substring(0, 200)}</span>`;
      return;
    }
    if (box) {
      if (data.success) {
        box.innerHTML = syntaxHighlight(JSON.stringify(data.result, null, 2));
      } else {
        box.innerHTML = `<span style="color:var(--red)">Error: ${data.error}</span>`;
      }
    }
  } catch (err) {
    if (box) box.innerHTML = `<span style="color:var(--red)">Error: ${err.name === 'AbortError' ? 'Timeout (15s)' : err.message}</span>`;
  }
}

/* ── Render Tutorials ───────────────────────────────────────────────────── */

const tutorials = [
  { name: 'audio-reactive', title: '🎵 Sistema Audio-Reactivo', diff: 'intermediate', cat: 'audio', desc: 'Creá visuales que reaccionan al ritmo de la música usando AudioAnalysis CHOP', duration: '45 min' },
  { name: 'bloom-effect', title: '✨ Efecto Bloom', diff: 'beginner', cat: 'glow', desc: 'Efecto bloom brillante con Threshold + Blur + Composite', duration: '30 min' },
  { name: 'feedback-loop', title: '🔄 Feedback Psicodélico', diff: 'intermediate', cat: 'feedback', desc: 'Bucles de retroalimentación visual con colores cambiantes', duration: '40 min' },
  { name: 'particle-system', title: '✨ Sistema de Partículas', diff: 'intermediate', cat: 'particles', desc: 'Sistema completo de partículas con emisión, fuerzas y render', duration: '50 min' },
  { name: 'glsl-shader', title: '🔮 Shaders GLSL', diff: 'advanced', cat: 'shader', desc: 'Creá shaders personalizados con GLSL TOP y GLSL POP', duration: '60 min' },
  { name: 'color-correction', title: '🎨 Corrección de Color', diff: 'intermediate', cat: 'color', desc: 'Corrección de color avanzada con Level, Lookup y LUT', duration: '45 min' },
  { name: 'motion-blur-creative', title: '🌊 Motion Blur Creativo', diff: 'intermediate', cat: 'blur', desc: 'Motion blur artístico con TimeBlur y transformaciones', duration: '40 min' },
  { name: 'chroma-key-live', title: '🎬 Chroma Key en Vivo', diff: 'advanced', cat: 'keying', desc: 'Chroma key profesional para streaming en vivo', duration: '50 min' },
  { name: 'audio-visualizer-pro', title: '📊 Visualizador de Audio Pro', diff: 'advanced', cat: 'audio', desc: 'Visualizador de espectro de audio profesional', duration: '55 min' },
  { name: 'instancing-particles', title: '🌌 Instancing de Partículas', diff: 'advanced', cat: 'particles', desc: 'Instancing masivo de partículas con atributos personalizados', duration: '50 min' },
  { name: 'feedback-creative', title: '🌀 Feedback Creativo', diff: 'expert', cat: 'feedback', desc: 'Técnicas avanzadas de feedback con múltiples capas', duration: '60 min' },
  { name: 'particles-experto-feedback-sim', title: '🧪 Partículas Experto', diff: 'expert', cat: 'particles', desc: 'Sistema experto de partículas con feedback loop y colisiones', duration: '90 min' },
  { name: 'pop-30-systems', title: '📦 30 POP Systems', diff: 'advanced', cat: 'pops', desc: '30 sistemas POP con parámetros optimizados', duration: '120 min' },
  { name: 'pop-complex-systems', title: '🔗 POP Systems Complejos', diff: 'expert', cat: 'pops', desc: 'Sistemas POP complejos con render pipeline y CHOP+POP paralelo', duration: '90 min' },
  { name: 'pop-interactive-hq', title: '🎓 POPs I&I HQ', diff: 'intermediate', cat: 'pops', desc: '9 tutoriales de la serie Interactive & Immersive HQ', duration: '60 min' },
];

const workflows = [
  { name: 'color-correction', title: 'Corrección de Color', cat: 'color', desc: 'Level + Lookup' },
  { name: 'motion-blur', title: 'Motion Blur', cat: 'blur', desc: 'TimeBlur TOP' },
  { name: 'chroma-key', title: 'Chroma Key', cat: 'keying', desc: 'Keying TOP' },
  { name: 'feedback-trail', title: 'Estela Feedback', cat: 'feedback', desc: 'Delay COMP' },
  { name: 'audio-visualizer', title: 'Audio Visualizer', cat: 'audio', desc: 'AudioSpectrum' },
  { name: 'kaleidoscope', title: 'Caleidoscopio', cat: 'transform', desc: 'Kaleidoscope TOP' },
  { name: 'edge-detect', title: 'Detección Bordes', cat: 'analyze', desc: 'Edge TOP' },
  { name: 'depth-of-field', title: 'Desenfoque Profundidad', cat: 'blur', desc: 'Blur + Ramp' },
  { name: 'pixel-sort', title: 'Pixel Sorting', cat: 'effects', desc: 'Glitch con Pixel Sort' },
  { name: 'glow-bloom', title: 'Glow y Bloom', cat: 'effects', desc: 'Glow avanzado' },
  { name: 'chromatic-aberration', title: 'Aberración Cromática', cat: 'effects', desc: 'RGB Split' },
  { name: 'displacement-map', title: 'Displacement Map', cat: 'effects', desc: 'Mapa de desplazamiento' },
  { name: 'vignette-effect', title: 'Efecto Viñeta', cat: 'effects', desc: 'Viñeta con Ramp' },
  { name: 'film-grain', title: 'Grano de Película', cat: 'effects', desc: 'Grain con Noise' },
  { name: 'color-grading', title: 'Color Grading', cat: 'effects', desc: 'Grading profesional' },
  { name: 'glitch-effect', title: 'Efecto Glitch', cat: 'effects', desc: 'Glitch digital' },
  { name: 'zoom-blur', title: 'Zoom Blur', cat: 'transform', desc: 'Blur radial cinemático' },
  { name: 'perspective-tilt', title: 'Perspectiva Tilt-Shift', cat: 'transform', desc: 'Tilt-shift effect' },
  { name: 'mirror-repeat', title: 'Espejo y Repetición', cat: 'transform', desc: 'Mirror + Tile' },
  { name: 'warp-effect', title: 'Warp y Distorsión', cat: 'transform', desc: 'Warp con Ramp' },
  { name: 'ripple-effect', title: 'Efecto Ripple', cat: 'transform', desc: 'Ondas concéntricas' },
  { name: 'rotate-scale', title: 'Rotación y Escala', cat: 'transform', desc: 'Transform animado' },
  { name: 'corner-pin', title: 'Corner Pin', cat: 'transform', desc: 'Perspectiva libre' },
  { name: 'blend-modes', title: 'Modos de Mezcla', cat: 'composite', desc: 'Blend modes avanzados' },
  { name: 'mask-layer', title: 'Máscaras y Layers', cat: 'composite', desc: 'Mask con composites' },
  { name: 'alpha-blend', title: 'Transparencia y Alpha', cat: 'composite', desc: 'Alpha blending' },
  { name: 'multiply-overlay', title: 'Multiply y Overlay', cat: 'composite', desc: 'Mezcla multiply' },
  { name: 'screen-add', title: 'Screen y Add', cat: 'composite', desc: 'Mezcla screen/add' },
  { name: 'difference-blend', title: 'Diferencia y Exclusión', cat: 'composite', desc: 'Diferencia blend' },
  { name: 'matte-blend', title: 'Matte Blending', cat: 'composite', desc: 'Matte y keying' },
  { name: 'pre-multiply', title: 'Pre-multiply Alpha', cat: 'composite', desc: 'Alpha pre-multiplicado' },
  { name: 'kaleidoscope-pro', title: 'Kaleidoscope Pro', cat: 'transform', desc: 'Caleidoscopio avanzado' },
];

document.querySelectorAll('.tut-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tut-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderTutorials(tab.dataset.tut);
  });
});

function renderTutorials(type) {
  const grid = $('tutorialGrid');
  if (!grid) return;
  const data = type === 'tutorials' ? tutorials : workflows;

  if (data.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No hay contenido disponible.</div>';
    return;
  }

  grid.innerHTML = data.map(item => {
    if (type === 'tutorials') {
      const t = item;
      return `<div class="tut-card">
        <span class="tut-difficulty ${t.diff}">${t.diff}</span>
        <h4>${t.title}</h4>
        <p>${t.desc}</p>
        <div class="tut-meta">
          <span>📂 ${t.cat}</span>
          <span>⏱ ${t.duration}</span>
        </div>
      </div>`;
    } else {
      const w = item;
      return `<div class="tut-card">
        <h4>${w.title}</h4>
        <p>${w.desc}</p>
        <div class="tut-meta">
          <span>📂 ${w.cat}</span>
        </div>
      </div>`;
    }
  }).join('');
}

/* ── Logs ───────────────────────────────────────────────────────────────── */

function addLogEntry(entry) {
  const container = $('logEntries');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.dataset.level = entry.level || 'info';

  // Apply filter
  if (state.logFilter !== 'all' && entry.level !== state.logFilter) {
    div.style.display = 'none';
  }

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  const t = new Date(entry.timestamp);
  timeSpan.textContent = t.toLocaleTimeString('en-US', { hour12: false });
  div.appendChild(timeSpan);

  const levelSpan = document.createElement('span');
  levelSpan.className = `log-level ${entry.level}`;
  levelSpan.textContent = entry.level;
  div.appendChild(levelSpan);

  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-message';
  msgSpan.textContent = entry.message;
  if (entry.data) {
    const preview = document.createElement('span');
    preview.className = 'json-preview';
    preview.textContent = JSON.stringify(entry.data).slice(0, 300);
    msgSpan.appendChild(preview);
  }
  div.appendChild(msgSpan);

  container.appendChild(div);
  state.logCount++;
  container.scrollTop = container.scrollHeight;
  const countEl = $('logCount');
  if (countEl) countEl.textContent = state.logCount;

  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }
}

$('clearLogsBtn')?.addEventListener('click', () => {
  $('logEntries').innerHTML = '';
  state.logCount = 0;
  if ($('logCount')) $('logCount').textContent = '0';
});

document.querySelectorAll('.log-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.logFilter = btn.dataset.level;
    const entries = $('logEntries')?.children || [];
    for (const entry of entries) {
      entry.style.display = (state.logFilter === 'all' || entry.dataset.level === state.logFilter) ? '' : 'none';
    }
  });
});

/* ── Tool descriptions for the explorer ─────────────────────────────────── */

const toolDescriptions = {
  td_pops_query: 'Buscar en la base de conocimiento de POPs. No requiere conexión TD.',
  td_ops_query: 'Buscar en TOP/CHOP/SOP/DAT. No requiere conexión TD.',
  td_templates_query: 'Buscar templates en Toe_Expand.',
  td_alias_resolve: 'Resolver vocabulario a parámetros TD.',
  td_get_param_help: 'Ayuda de parámetros para cualquier operador.',
  td_create_operator: 'Crear un nuevo operador en la red.',
  td_connect_nodes: 'Conectar dos operadores.',
  td_pars_get: 'Leer parámetros de un operador.',
  td_pars_set: 'Setear parámetros de un operador.',
  td_execute: 'Ejecutar código Python en TouchDesigner.',
  td_healthcheck: 'Verificar el estado de la red.',
  td_get_info: 'Información del entorno TouchDesigner.',
  td_get_perf: 'Medir performance (FPS, operadores lentos).',
  td_screenshot: 'Capturar screenshot de un operador.',
  td_search: 'Buscar texto en toda la red TD.',
  td_network_plan: 'Planificar y crear redes desde lenguaje natural.',
  td_export_network: 'Exportar red a Python, diff o JSON.',
  td_watch: 'Monitorear performance en tiempo real.',
  td_get_tutorial: 'Obtener contenido de un tutorial.',
  td_list_tutorials: 'Listar tutoriales disponibles.',
  td_get_workflow: 'Obtener contenido de un workflow.',
  td_list_workflows: 'Listar workflows disponibles.',
  td_get_td_classes: 'Listar clases Python de TD por familia.',
  td_get_module_help: 'Documentación detallada de un operador.',
  td_run_test: 'Ejecutar un test legacy.',
  td_compare_mcps: 'Comparar servidores MCP TouchDesigner.',
  td_run_prompt: 'Ejecutar un prompt maestro.',
  tool_batch: 'Ejecutar múltiples tools en batch.',
};

const toolArgs = {
  td_pops_query: { search: '', limit: 5 },
  td_ops_query: { search: '', family: 'TOP', limit: 5 },
  td_create_operator: { type: 'noiseTOP', name: 'mi_op', path: '/project1' },
  td_connect_nodes: { source_path: '/project1/src', target_path: '/project1/dst' },
  td_pars_get: { path: '/project1/mi_op' },
  td_pars_set: { path: '/project1/mi_op', updates: [{ name: 'Amplitude', value: 0.8 }] },
  td_execute: { code: 'print("Hola")', from_op: '/' },
  td_healthcheck: { path: '/', recurse: false },
};

/* ── Init ───────────────────────────────────────────────────────────────── */

fetchStatus();
setInterval(fetchStatus, 3000);
connectWS();

// Load initial page
navigateTo('dashboard');
