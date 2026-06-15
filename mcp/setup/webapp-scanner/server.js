const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const TOE_EXPAND = path.resolve(__dirname, '../../../old/mcp_td_v3/Toe_Expand');
const INDEX_PATH = path.join(TOE_EXPAND, 'index.json');

let indexCache = null;
let indexMtime = 0;

function loadIndex() {
  try {
    const stat = fs.statSync(INDEX_PATH);
    if (indexCache && stat.mtimeMs === indexMtime) return indexCache;
    indexCache = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    indexMtime = stat.mtimeMs;
    return indexCache;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/index — índice completo
// ---------------------------------------------------------------------------

app.get('/api/index', (req, res) => {
  const idx = loadIndex();
  if (!idx) return res.status(404).json({ error: 'index.json no encontrado. Ejecuta generate-index.js primero.' });
  res.json(idx);
});

// ---------------------------------------------------------------------------
// GET /api/stats — estadísticas rápidas
// ---------------------------------------------------------------------------

app.get('/api/stats', (req, res) => {
  const idx = loadIndex();
  if (!idx) return res.status(404).json({ error: 'index.json no encontrado' });
  res.json(idx.meta);
});

// ---------------------------------------------------------------------------
// GET /api/tags — lista de tags con counts
// ---------------------------------------------------------------------------

app.get('/api/tags', (req, res) => {
  const idx = loadIndex();
  if (!idx) return res.status(404).json({ error: 'index.json no encontrado' });
  res.json(idx.meta.byTag);
});

// ---------------------------------------------------------------------------
// GET /api/search — búsqueda con filtros
// ---------------------------------------------------------------------------

app.get('/api/search', (req, res) => {
  const idx = loadIndex();
  if (!idx) return res.status(404).json({ error: 'index.json no encontrado' });

  const { q, tags, type, source, glsl, python, hasToc, big, 
          minNetworks, maxNetworks, minComps, maxComps,
          minScripts, minFiles, limit, offset, similar } = req.query;

  let results = [...idx.projects];

  // --- Text search ---
  if (q) {
    const query = q.toLowerCase();
    results = results.filter(p =>
      (p.name || '').toLowerCase().includes(query) ||
      (p.path || '').toLowerCase().includes(query)
    );
  }

  // --- Tags (comma-separated, AND mode) ---
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (tagList.length > 0) {
      results = results.filter(p => {
        const projectTags = new Set((p.tags || []).map(t => t.toLowerCase()));
        return tagList.every(t => projectTags.has(t));
      });
    }
  }

  // --- Type ---
  if (type) results = results.filter(p => p.type === type.toLowerCase());

  // --- Source ---
  if (source) results = results.filter(p => (p.source || '').toLowerCase().includes(source.toLowerCase()));

  // --- GLSL ---
  if (glsl === 'true') results = results.filter(p => p.expandedDir?.hasGLSL);
  if (glsl === 'false') results = results.filter(p => !p.expandedDir?.hasGLSL);

  // --- Python ---
  if (python === 'true') results = results.filter(p => p.expandedDir?.hasPython);

  // --- TOC ---
  if (hasToc === 'true') results = results.filter(p => p.hasToc);

  // --- Big ---
  if (big === 'true') results = results.filter(p => (p.size || 0) > 10 * 1024 * 1024);

  // --- Quantitative filters ---
  const minNet = parseInt(minNetworks) || 0;
  const maxNet = parseInt(maxNetworks) || Infinity;
  const minComp = parseInt(minComps) || 0;
  const maxComp = parseInt(maxComps) || Infinity;
  const minScr = parseInt(minScripts) || 0;
  const minFil = parseInt(minFiles) || 0;

  results = results.filter(p => {
    const ed = p.expandedDir || {};
    if (minNet > 0 && (ed.networks || 0) < minNet) return false;
    if (maxNet < Infinity && (ed.networks || 0) > maxNet) return false;
    if (minComp > 0 && (ed.components || 0) < minComp) return false;
    if (maxComp < Infinity && (ed.components || 0) > maxComp) return false;
    if (minScr > 0 && (ed.scripts || 0) < minScr) return false;
    if (minFil > 0 && (ed.totalFiles || 0) < minFil) return false;
    return true;
  });

  // --- Similarity ---
  if (similar) {
    const sourceProj = results.find(p => p.name === similar || p.slug === similar);
    if (sourceProj) {
      const sourceTags = new Set(sourceProj.tags || []);
      const scored = idx.projects
        .filter(p => p.name !== sourceProj.name)
        .map(p => {
          const pTags = new Set(p.tags || []);
          let shared = 0;
          for (const t of sourceTags) if (pTags.has(t)) shared++;
          const total = new Set([...sourceTags, ...pTags]).size;
          return { project: p, score: total > 0 ? shared / total : 0 };
        })
        .filter(s => s.score > 0 || sourceTags.size === 0)
        .sort((a, b) => b.score - a.score);
      results = scored.map(s => ({ ...s.project, similarityScore: s.score }));
    }
  }

  // --- Total before pagination ---
  const total = results.length;

  // --- Pagination ---
  const off = parseInt(offset) || 0;
  const lim = Math.min(parseInt(limit) || 50, 200);
  results = results.slice(off, off + lim);

  // Compute tag distribution for this result set
  const tagDist = {};
  for (const p of results) {
    for (const t of p.tags || []) {
      tagDist[t] = (tagDist[t] || 0) + 1;
    }
  }
  const tagDistribution = Object.entries(tagDist)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  res.json({ results, total, offset: off, limit: lim, tagDistribution });
});

// ---------------------------------------------------------------------------
// GET /api/project/:path — detalle de un proyecto
// ---------------------------------------------------------------------------

app.get('/api/project', (req, res) => {
  const idx = loadIndex();
  if (!idx) return res.status(404).json({ error: 'index.json no encontrado' });

  const projectPath = req.query.path;
  if (!projectPath) return res.status(400).json({ error: 'Se requiere path del proyecto (?path=...)', example: '/api/project?path=006_GlitchShifter' });

  const normalizedPath = projectPath.replace(/\\/g, '/');
  const project = idx.projects.find(p => p.path === normalizedPath);
  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });

  // Leer README si existe
  let readme = null;
  const readmePath = path.join(TOE_EXPAND, project.path, 'README.md');
  try {
    if (fs.existsSync(readmePath)) readme = fs.readFileSync(readmePath, 'utf-8');
  } catch (e) { /* ignore */ }

  // Listar .dir contents
  let dirContents = [];
  const expandedDirName = `${project.sourceFile}.dir`;
  const expandedDirPath = path.join(TOE_EXPAND, project.path, expandedDirName);
  try {
    if (fs.existsSync(expandedDirPath)) {
      dirContents = fs.readdirSync(expandedDirPath).map(name => {
        const fp = path.join(expandedDirPath, name);
        try {
          const stat = fs.statSync(fp);
          return { name, isDirectory: stat.isDirectory(), size: stat.size };
        } catch { return { name, isDirectory: false, size: 0 }; }
      });
    }
  } catch (e) { /* ignore */ }

  // Similar projects
  const sourceTags = new Set(project.tags || []);
  const similar = idx.projects
    .filter(p => p.name !== project.name)
    .map(p => {
      const pTags = new Set(p.tags || []);
      let shared = 0;
      for (const t of sourceTags) if (pTags.has(t)) shared++;
      const total = new Set([...sourceTags, ...pTags]).size;
      return { name: p.name, type: p.type, path: p.path, score: total > 0 ? shared / total : 0 };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  res.json({ project, readme, dirContents, similar, expandedDirName });
});

// ---------------------------------------------------------------------------
// GET /api/explorer/* — abrir carpeta en Explorer
// ---------------------------------------------------------------------------

app.get('/api/explorer', (req, res) => {
  const projectPath = req.query.path;
  if (!projectPath) return res.status(400).json({ error: 'Se requiere path (?path=...)' });
  const fullPath = path.join(TOE_EXPAND, projectPath);
  if (fs.existsSync(fullPath)) {
    try {
      require('child_process').exec(`explorer "${fullPath}"`);
      res.json({ success: true, path: fullPath });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(404).json({ error: 'Ruta no encontrada' });
  }
});

// ---------------------------------------------------------------------------
// Endpoints originales de expansión (preservados)
// ---------------------------------------------------------------------------

const TOEEXPAND_PATH = '"C:\\Program Files\\Derivative\\TouchDesigner\\bin\\toeexpand.exe"';
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

app.get('/api/scan', (req, res) => {
  const dirPath = req.query.path;
  if (!dirPath || !fs.existsSync(dirPath)) {
    return res.status(400).json({ error: 'Directorio inválido o no existe' });
  }
  try {
    const files = fs.readdirSync(dirPath);
    const toeFiles = files
      .filter(f => f.toLowerCase().endsWith('.toe') || f.toLowerCase().endsWith('.tox'))
      .map(f => path.join(dirPath, f));
    res.json({ files: toeFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/process', async (req, res) => {
  const { files, outputDir } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Se requiere lista de archivos' });
  }
  const results = [];
  for (const file of files) {
    const projectName = path.basename(file, path.extname(file));
    try {
      await execPromise(`${TOEEXPAND_PATH} "${file}"`).catch(() => {});
      const generatedDir = `${file}.dir`;
      const generatedToc = `${file}.toc`;
      if (!fs.existsSync(generatedDir)) {
        throw new Error("toeexpand no generó .dir");
      }
      const baseOutDir = outputDir || path.dirname(file);
      const projectWrapperDir = path.join(baseOutDir, projectName);
      fs.mkdirSync(projectWrapperDir, { recursive: true });
      const fileName = path.basename(file);
      const targetDir = path.join(projectWrapperDir, `${fileName}.dir`);
      const targetToc = path.join(projectWrapperDir, `${fileName}.toc`);
      const targetToe = path.join(projectWrapperDir, fileName);
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
      try { fs.renameSync(generatedDir, targetDir); } catch (e) {
        if (e.code === 'EXDEV') {
          fs.cpSync(generatedDir, targetDir, { recursive: true, force: true });
          fs.rmSync(generatedDir, { recursive: true, force: true });
        } else throw e;
      }
      if (fs.existsSync(generatedToc)) {
        try { fs.renameSync(generatedToc, targetToc); } catch { fs.copyFileSync(generatedToc, targetToc); fs.rmSync(generatedToc); }
      }
      fs.copyFileSync(file, targetToe);
      results.push({ file, status: 'success', projectName, dir: projectWrapperDir });
    } catch (error) {
      results.push({ file, status: 'error', error: error.message });
    }
  }
  res.json({ results });
});

// ---------------------------------------------------------------------------
// Servir frontend
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎛️  TD Project Browser iniciado en http://localhost:${PORT}`);
  console.log(`   Index: ${INDEX_PATH}`);
});
