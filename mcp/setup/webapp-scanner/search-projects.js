#!/usr/bin/env node
/**
 * TouchDesigner Project Search
 * 
 * Busca proyectos en index.json por tags, nombre, contenido GLSL/Python,
 * tamaño, y encuentra proyectos similares.
 * 
 * Uso:
 *   node search-projects.js --tag audio                 # Por tag
 *   node search-projects.js --tag audio --tag glsl       # Múltiples tags (AND)
 *   node search-projects.js --tag audio,glsl             # Tags combinados
 *   node search-projects.js --name particle              # Por nombre (parcial)
 *   node search-projects.js --glsl                       # Con GLSL
 *   node search-projects.js --python                     # Con Python
 *   node search-projects.js --min-networks 5             # Mínimo redes
 *   node search-projects.js --big                        # Proyectos grandes
 *   node search-projects.js --type tox                   # Solo .tox
 *   node search-projects.js --similar "006_GlitchShifter" # Similares
 *   node search-projects.js --interactive                # Modo interactivo
 *   node search-projects.js --tag audio --json           # Salida JSON
 *   node search-projects.js --list-tags                  # Listar todos los tags
 *   node search-projects.js --stats                      # Estadísticas rápidas
 *   node search-projects.js --tag particles --open       # Abrir carpeta del proyecto
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const CONFIG = {
  INDEX: path.resolve(__dirname, "../../../old/mcp_td_v3/Toe_Expand/index.json"),
  TOE_EXPAND: path.resolve(__dirname, "../../../old/mcp_td_v3/Toe_Expand"),
  MAX_RESULTS: 30,
  INTERACTIVE: false,
  OUTPUT_JSON: false,
  OPEN_FOLDER: false,
};

// ---------------------------------------------------------------------------
// Cargar índice
// ---------------------------------------------------------------------------

let index = null;
function loadIndex() {
  if (!fs.existsSync(CONFIG.INDEX)) {
    console.error(`❌ No se encuentra index.json en:`);
    console.error(`   ${CONFIG.INDEX}`);
    console.error(`   Ejecuta primero: node generate-index.js`);
    process.exit(1);
  }
  index = JSON.parse(fs.readFileSync(CONFIG.INDEX, "utf-8"));
  return index;
}

// ---------------------------------------------------------------------------
// Parsear argumentos CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) return { action: "interactive" };

  const query = {
    tags: [],
    tagsMode: "and", // 'and' | 'or'
    name: null,
    type: null,
    source: null,
    glsl: null,
    python: null,
    minNetworks: null,
    maxNetworks: null,
    minComponents: null,
    maxComponents: null,
    minScripts: null,
    minFiles: null,
    minSize: null,
    maxSize: null,
    big: false,
    hasToc: null,
    similar: null,
    similarProject: null,
    listTags: false,
    stats: false,
    interactive: false,
    limit: CONFIG.MAX_RESULTS,
    json: false,
    open: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--tag":
      case "-t":
        const val = args[++i];
        if (val) {
          val.split(",").forEach((t) => query.tags.push(t.trim().toLowerCase()));
        }
        break;
      case "--or":
        query.tagsMode = "or";
        break;
      case "--name":
      case "-n":
        query.name = args[++i]?.toLowerCase() || null;
        break;
      case "--type":
        query.type = args[++i]?.toLowerCase() || null;
        break;
      case "--source":
      case "-s":
        query.source = args[++i] || null;
        break;
      case "--glsl":
        query.glsl = true;
        break;
      case "--python":
        query.python = true;
        break;
      case "--min-networks":
        query.minNetworks = parseInt(args[++i], 10) || 0;
        break;
      case "--max-networks":
        query.maxNetworks = parseInt(args[++i], 10) || Infinity;
        break;
      case "--min-components":
        query.minComponents = parseInt(args[++i], 10) || 0;
        break;
      case "--min-scripts":
        query.minScripts = parseInt(args[++i], 10) || 0;
        break;
      case "--min-files":
        query.minFiles = parseInt(args[++i], 10) || 0;
        break;
      case "--min-size":
        query.minSize = parseFloat(args[++i]) || 0;
        break;
      case "--max-size":
        query.maxSize = parseFloat(args[++i]) || Infinity;
        break;
      case "--big":
      case "--large":
        query.big = true;
        break;
      case "--has-toc":
        query.hasToc = true;
        break;
      case "--similar":
      case "--like":
        query.similar = true;
        query.similarProject = args[++i];
        break;
      case "--list-tags":
        query.listTags = true;
        break;
      case "--stats":
        query.stats = true;
        break;
      case "--interactive":
      case "-i":
        query.interactive = true;
        break;
      case "--limit":
      case "-l":
        query.limit = parseInt(args[++i], 10) || CONFIG.MAX_RESULTS;
        break;
      case "--json":
      case "-j":
        query.json = true;
        CONFIG.OUTPUT_JSON = true;
        break;
      case "--open":
      case "-o":
        query.open = true;
        CONFIG.OPEN_FOLDER = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }

  return query;
}

function printHelp() {
  console.log(`
TouchDesigner Project Search
=============================
Busca entre ${index ? index.meta.totalProjects : "1,209"} proyectos expandidos de TouchDesigner.

BÚSQUEDA POR TAGS:
  --tag, -t TAG[,TAG]  Buscar por tag (ej: --tag audio,glsl)
  --or                  Combinar tags con OR (default: AND)

BÚSQUEDA POR NOMBRE:
  --name, -n TEXTO      Buscar proyectos por nombre (parcial, sin tilde)

FILTROS POR CONTENIDO:
  --glsl                Solo proyectos con shaders GLSL
  --python              Solo proyectos con scripts Python
  --type TYPE           Filtrar por tipo: toe | tox
  --source ORIGEN       Filtrar por origen: D:/TD | WebToe
  --has-toc             Solo con archivo .toc
  --big                 Proyectos grandes (>10MB)

FILTROS CUANTITATIVOS:
  --min-networks N      Mínimo archivos de red (.n)
  --max-networks N      Máximo archivos de red
  --min-components N    Mínimo componentes (.parm/.cparm)
  --min-scripts N       Mínimo scripts (GLSL/ Python)
  --min-files N         Mínimo archivos totales
  --min-size MB         Tamaño mínimo en MB
  --max-size MB         Tamaño máximo en MB

SIMILITUD:
  --similar, --like NOMBRE  Encuentra proyectos similares por tags

SALIDA:
  --limit, -l N         Máximo resultados (default: 30)
  --json, -j            Salida en JSON (para piping)
  --open, -o            Abrir carpeta del proyecto en Explorer
  --list-tags           Listar todos los tags disponibles
  --stats               Estadísticas rápidas
  --interactive, -i     Modo interactivo
  --help, -h            Esta ayuda

EJEMPLOS:
  node search-projects.js --tag glsl
  node search-projects.js --tag audio --tag glsl
  node search-projects.js --name particle --glsl
  node search-projects.js --similar "047_Plexus"
  node search-projects.js --tag audio --json | jq '.[].name'
  node search-projects.js --big
`);
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

function applyFilters(projects, query) {
  return projects.filter((p) => {
    // Tags
    if (query.tags.length > 0) {
      const projectTags = new Set(p.tags || []);
      if (query.tagsMode === "and") {
        if (!query.tags.every((t) => projectTags.has(t))) return false;
      } else {
        if (!query.tags.some((t) => projectTags.has(t))) return false;
      }
    }

    // Nombre (parcial, case-insensitive)
    if (query.name) {
      const nameLower = (p.name || "").toLowerCase();
      const pathLower = (p.path || "").toLowerCase();
      if (!nameLower.includes(query.name) && !pathLower.includes(query.name)) {
        return false;
      }
    }

    // Tipo
    if (query.type && p.type !== query.type) return false;

    // Source
    if (query.source) {
      const src = (p.source || "").toLowerCase();
      if (!src.includes(query.source.toLowerCase())) return false;
    }

    // GLSL
    if (query.glsl === true && !p.expandedDir?.hasGLSL) return false;
    if (query.glsl === false && p.expandedDir?.hasGLSL) return false;

    // Python
    if (query.python === true && !p.expandedDir?.hasPython) return false;

    // Redes
    const networks = p.expandedDir?.networks || 0;
    if (query.minNetworks !== null && networks < query.minNetworks) return false;
    if (query.maxNetworks !== null && networks > query.maxNetworks) return false;

    // Componentes
    const components = p.expandedDir?.components || 0;
    if (query.minComponents !== null && components < query.minComponents) return false;

    // Scripts
    const scripts = p.expandedDir?.scripts || 0;
    if (query.minScripts !== null && scripts < query.minScripts) return false;

    // Archivos totales
    const files = p.expandedDir?.totalFiles || 0;
    if (query.minFiles !== null && files < query.minFiles) return false;

    // Tamaño (MB)
    const sizeMB = (p.size || 0) / (1024 * 1024);
    if (query.minSize !== null && sizeMB < query.minSize) return false;
    if (query.maxSize !== null && sizeMB > query.maxSize) return false;

    // Big projects (>10MB)
    if (query.big && sizeMB < 10) return false;

    // TOC
    if (query.hasToc === true && !p.hasToc) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Similitud por tags
// ---------------------------------------------------------------------------

function findSimilar(projectName, limit = 10) {
  // Encontrar el proyecto origen
  const source = index.projects.find(
    (p) => p.name === projectName || p.slug === projectName || p.path === projectName
  );
  if (!source) {
    console.error(`❌ Proyecto "${projectName}" no encontrado.`);
    console.error(`   Usa --name para buscar proyectos similares por nombre.`);
    return { source: null, similar: [] };
  }

  const sourceTags = new Set(source.tags || []);
  if (sourceTags.size === 0) {
    console.log(`ℹ️  El proyecto "${source.name}" no tiene tags para comparar.`);
    console.log(`   Mostrando proyectos con el mismo tipo (${source.type}):`);
  }

  // Calcular puntuación de similitud por tags compartidos (Jaccard index)
  const scored = index.projects
    .filter((p) => p.name !== source.name) // Excluir el mismo
    .map((p) => {
      const pTags = new Set(p.tags || []);
      let shared = 0;
      for (const t of sourceTags) if (pTags.has(t)) shared++;
      const total = new Set([...sourceTags, ...pTags]).size;
      const score = total > 0 ? shared / total : 0;
      return { project: p, score, sharedTags: shared };
    })
    .filter((s) => s.score > 0 || sourceTags.size === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { source, similar: scored };
}

// ---------------------------------------------------------------------------
// Formatear salida
// ---------------------------------------------------------------------------

function formatProject(p) {
  const tags = (p.tags || []).join(", ");
  const size = p.sizeFormatted || `${(p.size / 1024).toFixed(1)} KB`;
  const glsl = p.expandedDir?.hasGLSL ? " GLSL" : "";
  const py = p.expandedDir?.hasPython ? " Py" : "";
  const components = p.expandedDir?.components || 0;
  const networks = p.expandedDir?.networks || 0;
  const files = p.expandedDir?.totalFiles || 0;

  return {
    name: p.name,
    type: p.type,
    size,
    path: p.path,
    components,
    networks,
    files,
    tags,
    hasGLSL: p.expandedDir?.hasGLSL || false,
    hasPython: p.expandedDir?.hasPython || false,
    source: p.source,
  };
}

function formatTable(results) {
  // Encabezados
  const lines = [];
  lines.push("  Proyecto                    Tipo     Tamaño    Nets  Comps  Files  Tags");
  lines.push("  " + "─".repeat(90));

  for (const r of results) {
    const name = (r.name || "").padEnd(28).slice(0, 28);
    const type = (r.type || "").padEnd(6);
    const size = (r.size || "").padEnd(9).slice(0, 9);
    const nets = String(r.networks || "").padStart(5);
    const comps = String(r.components || "").padStart(6);
    const files = String(r.files || "").padStart(6);
    const tags = (r.tags || "").slice(0, 30).padEnd(30);

    const glsl = r.hasGLSL ? " 🟣" : "";
    const py = r.hasPython ? " 🟡" : "";

    lines.push(`  ${name} ${type} ${size} ${nets} ${comps} ${files}  ${tags}${glsl}${py}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Mostrar resultados
// ---------------------------------------------------------------------------

function showResults(results, query) {
  if (CONFIG.OUTPUT_JSON) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log("  No se encontraron proyectos con esos criterios.");
    console.log("  Prueba con otros filtros o usa --list-tags para ver tags disponibles.");
    return;
  }

  const total = index.meta.totalProjects;
  const pct = ((results.length / total) * 100).toFixed(1);

  console.log(`\n  📁 ${results.length} proyectos encontrados (${pct}% de ${total})`);
  if (query.tags.length > 0) {
    console.log(`  🏷️  Tags: ${query.tags.join(", ")} (modo: ${query.tagsMode.toUpperCase()})`);
  }
  if (query.name) console.log(`  🔍  Nombre: "${query.name}"`);
  console.log("");

  const formatted = results.map((r) => formatProject(r));
  console.log(formatTable(formatted));

  if (results.length > 0) {
    console.log("\n  💡 Usa --open para abrir un proyecto en Explorer:");
    console.log(`     node search-projects.js --name "${results[0].name}" --open`);
  }
}

function showSimilarResults(result) {
  const { source, similar } = result;

  console.log(`\n  🔍 Proyecto origen: ${source.name} (${source.type})`);
  console.log(`  🏷️  Tags: ${(source.tags || []).join(", ") || "(ninguno)"}`);
  console.log(`  📁 Ruta: ${source.path}`);
  console.log("");

  if (similar.length === 0) {
    console.log("  No se encontraron proyectos similares.");
    return;
  }

  const formatted = similar.map((s) => ({
    ...formatProject(s.project),
    score: s.score,
    similarity: `${(s.score * 100).toFixed(0)}%`,
    shared: s.sharedTags,
  }));

  console.log(`  📊 ${similar.length} proyectos similares:`);
  console.log("");
  console.log("  Similitud  Proyecto                    Tipo     Tags compartidos");
  console.log("  " + "─".repeat(75));

  for (const s of formatted) {
    const sim = (s.similarity || "").padStart(9);
    const name = (s.name || "").padEnd(28).slice(0, 28);
    const type = (s.type || "").padEnd(6);
    const tags = (s.tags || "").slice(0, 22).padEnd(22);
    console.log(`  ${sim}  ${name} ${type} ${tags}`);
  }
}

function showStats() {
  const m = index.meta;
  console.log(`\n📊 Estadísticas de Toe_Expand`);
  console.log(`   ${"─".repeat(40)}`);
  console.log(`   Proyectos totales:   ${m.totalProjects}`);
  console.log(`   Archivos .toe:       ${m.byType.toe}`);
  console.log(`   Archivos .tox:       ${m.byType.tox}`);
  console.log(`   Tamaño original:     ${m.totalSizeFormatted}`);
  console.log(`   Tamaño expandido:    ${m.totalExpandedFormatted}`);
  console.log(`   Errores:             ${m.totalErrors}`);
  console.log(``);

  // Tags más comunes
  console.log(`   🏷️  Tags más comunes:`);
  for (const { tag, count } of m.byTag.slice(0, 10)) {
    const bar = "█".repeat(Math.round((count / m.totalProjects) * 30));
    const pct = ((count / m.totalProjects) * 100).toFixed(1);
    console.log(`      ${tag.padEnd(18)} ${bar} ${count} (${pct}%)`);
  }

  // Orígenes
  console.log(``);
  if (m.bySource) {
    console.log(`   📂 Por origen:`);
    for (const [src, count] of Object.entries(m.bySource)) {
      console.log(`      ${src.padEnd(18)} ${count} proyectos`);
    }
  }
}

function showTags() {
  const m = index.meta;
  console.log(`\n🏷️  Tags disponibles (${m.byTag.length}):`);
  console.log(``);

  // Mostrar en columnas
  const cols = 3;
  const rows = Math.ceil(m.byTag.length / cols);
  for (let r = 0; r < rows; r++) {
    let line = "  ";
    for (let c = 0; c < cols; c++) {
      const i = r + c * rows;
      if (i < m.byTag.length) {
        const { tag, count } = m.byTag[i];
        line += `${tag.padEnd(20)} ${String(count).padStart(4)}  `;
      }
    }
    console.log(line);
  }
  console.log(`\n  Usa: node search-projects.js --tag NOMBRE`);
}

function openInExplorer(project) {
  const folderPath = path.join(CONFIG.TOE_EXPAND, project.path);
  if (fs.existsSync(folderPath)) {
    console.log(`  📂 Abriendo: ${folderPath}`);
    try {
      execSync(`explorer "${folderPath}"`, { stdio: "ignore" });
    } catch {
      console.log(`  No se pudo abrir Explorer. Ruta: ${folderPath}`);
    }
  } else {
    console.log(`  ❌ No existe: ${folderPath}`);
  }
}

// ---------------------------------------------------------------------------
// Modo interactivo
// ---------------------------------------------------------------------------

function interactiveMode() {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "td-search> ",
  });

  console.log(`
🎛️  TouchDesigner Project Search — Modo Interactivo
   Escribe una consulta o "help" para comandos.
   Ej: tag glsl | name particle | similar 047_Plexus | stats
`);

  rl.prompt();

  rl.on("line", (line) => {
    const input = line.trim().toLowerCase();

    if (!input || input === "exit" || input === "quit") {
      rl.close();
      return;
    }

    if (input === "help") {
      console.log(`
  Comandos:
    tag TAG[,TAG]        Buscar por tags (ej: tag glsl,audio)
    name TEXTO           Buscar por nombre parcial
    glsl                 Solo proyectos con GLSL
    python               Solo con Python
    type toe|tox         Filtrar por tipo
    big                  Proyectos grandes
    similar NOMBRE       Proyectos similares
    stats                Estadísticas
    tags                 Listar todos los tags
    clear                Limpiar pantalla
    exit                 Salir
`);
      rl.prompt();
      return;
    }

    if (input === "clear" || input === "cls") {
      console.clear();
      rl.prompt();
      return;
    }

    if (input === "stats") {
      showStats();
      rl.prompt();
      return;
    }

    if (input === "tags") {
      showTags();
      rl.prompt();
      return;
    }

    // Parsear comando simple
    let query = { tags: [], name: null, glsl: null, python: null, type: null, big: false, similar: false, similarProject: null };

    if (input.startsWith("tag ")) {
      query.tags = input.substring(4).split(",").map((t) => t.trim()).filter(Boolean);
    } else if (input.startsWith("name ")) {
      query.name = input.substring(5).trim();
    } else if (input.startsWith("similar ") || input.startsWith("like ")) {
      query.similar = true;
      query.similarProject = input.includes(" ") ? input.substring(input.indexOf(" ") + 1).trim() : null;
    } else if (input === "glsl") {
      query.glsl = true;
    } else if (input === "python") {
      query.python = true;
    } else if (input.startsWith("type ")) {
      query.type = input.substring(5).trim();
    } else if (input === "big") {
      query.big = true;
    } else {
      console.log(`  Comando no reconocido: "${input}". Escribe "help" para ayuda.`);
      rl.prompt();
      return;
    }

    if (query.similar && query.similarProject) {
      const result = findSimilar(query.similarProject);
      if (result.source) showSimilarResults(result);
      rl.prompt();
      return;
    }

    const results = applyFilters(index.projects, query);
    showResults(results, { tags: query.tags, name: query.name, ...query });
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\n  👋 Hasta luego!");
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  loadIndex();
  const query = parseArgs();

  // --- Acciones especiales ---
  if (query.stats) {
    showStats();
    return;
  }

  if (query.listTags) {
    showTags();
    return;
  }

  if (query.interactive || query.action === "interactive") {
    if (!process.stdin.isTTY) {
      console.log("Modo interactivo solo disponible en terminal.");
      process.exit(1);
    }
    interactiveMode();
    return;
  }

  // --- Búsqueda por similitud ---
  if (query.similar && query.similarProject) {
    const result = findSimilar(query.similarProject, query.limit);
    if (result.source) {
      showSimilarResults(result);
      if (query.open) openInExplorer(result.source);
    }
    return;
  }

  // Sin argumentos = modo interactivo
  if (!query.tags.length && !query.name && !query.glsl && !query.python && !query.type && !query.big && !query.hasToc) {
    if (process.stdin.isTTY) {
      interactiveMode();
    } else {
      showStats();
    }
    return;
  }

  // --- Búsqueda con filtros ---
  const results = applyFilters(index.projects, query);
  showResults(results, query);

  // Abrir el primero si --open
  if (query.open && results.length > 0) {
    openInExplorer(results[0]);
  }
}

main();
