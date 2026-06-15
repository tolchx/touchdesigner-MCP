/**
 * Toe_Expand Index Generator
 * 
 * Escanea recursivamente Toe_Expand, extrae metadatos de cada proyecto
 * y genera un index.json central con todos los proyectos expandidos.
 * 
 * Uso:
 *   node generate-index.js                     # Escanea y genera index.json
 *   node generate-index.js --pretty            # JSON formateado (legible)
 *   node generate-index.js --output index.json # Ruta personalizada
 *   node generate-index.js --stats-only        # Solo muestra estadísticas
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const CONFIG = {
  // Directorio raíz de proyectos expandidos
  TOE_EXPAND: path.resolve(__dirname, "../../../old/mcp_td_v3/Toe_Expand"),

  // Archivo de salida
  OUTPUT: path.resolve(__dirname, "../../../old/mcp_td_v3/Toe_Expand/index.json"),

  // Directorios del sistema a ignorar dentro de .dir
  SYSTEM_DIRS: new Set([".application", ".build", ".grps", ".root"]),

  // Extensiones de TouchDesigner conocidas
  TD_EXTENSIONS: new Set([
    ".toe", ".tox", ".component", ".macro", ".palette", ".network",
    ".n", ".parm", ".cparm", ".panel", ".py", ".glsl", ".vert", ".frag",
    ".compute", ".hlsl", ".cuda", ".chop", ".sop", ".top", ".dat", ".mat"
  ]),

  // Pretty print
  PRETTY: false,
};

// ---------------------------------------------------------------------------
// Parsear argumentos
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pretty":
        CONFIG.PRETTY = true;
        break;
      case "--output":
        CONFIG.OUTPUT = path.resolve(args[++i]);
        break;
      case "--stats-only":
        CONFIG.STATS_ONLY = true;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
}

function printHelp() {
  console.log(`
Toe_Expand Index Generator
===========================
Escanea Toe_Expand y genera index.json con metadatos de todos los proyectos.

Opciones:
  --pretty          JSON formateado con indentación (legible)
  --output RUTA     Ruta del archivo de salida
  --stats-only      Solo muestra estadísticas, no genera archivo
  --help            Muestra esta ayuda
`);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

// ---------------------------------------------------------------------------
// Long path support for Windows
// ---------------------------------------------------------------------------

function longPath(p) {
  if (process.platform === "win32" && path.isAbsolute(p)) {
    const resolved = path.resolve(p);
    if (resolved.length >= 240) {
      return "\\\\?\\" + resolved;
    }
  }
  return p;
}

function readdirSafe(p) {
  try {
    return fs.readdirSync(longPath(p), { withFileTypes: true });
  } catch {
    return [];
  }
}

function statSafe(p) {
  try {
    return fs.statSync(longPath(p));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Analizar contenido del .dir (solo shallow, eficiente)
// ---------------------------------------------------------------------------

function analyzeDirContents(dirPath) {
  const result = {
    totalFiles: 0,
    totalSize: 0,
    scriptsCount: 0,
    texturesCount: 0,
    networksCount: 0,
    componentsCount: 0,
    hasGLSL: false,
    hasPython: false,
  };

  const entries = readdirSafe(dirPath);

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fp = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Solo contar archivos de subdirectorios sin walk profundo
      const subEntries = readdirSafe(fp);
      for (const sub of subEntries) {
        if (sub.isFile() && !sub.name.startsWith(".")) {
          result.totalFiles++;
          const st = statSafe(path.join(fp, sub.name));
          if (st) result.totalSize += st.size;
        }
      }
    } else if (entry.isFile()) {
      result.totalFiles++;
      const st = statSafe(fp);
      if (st) result.totalSize += st.size;

      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".py") { result.hasPython = true; result.scriptsCount++; }
      else if ([ ".glsl", ".vert", ".frag", ".hlsl", ".compute" ].includes(ext)) { result.hasGLSL = true; result.scriptsCount++; }
      else if ([ ".png", ".jpg", ".jpeg", ".tga", ".exr", ".dds", ".bmp", ".gif" ].includes(ext)) result.texturesCount++;
      else if (ext === ".n") result.networksCount++;
      else if (ext === ".parm" || ext === ".cparm") result.componentsCount++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Leer metadatos del README
// ---------------------------------------------------------------------------

function readReadmeMetadata(readmePath) {
  const metadata = {
    source: null,
    date: null,
    description: null,
  };

  try {
    const content = fs.readFileSync(readmePath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      // Buscar fuente
      const sourceMatch = line.match(/Expandido desde: `(.+)`/);
      if (sourceMatch) {
        const src = sourceMatch[1].trim();
        if (src.startsWith("D:/TD")) {
          metadata.source = "D:/TD";
        } else if (src.startsWith("C:/")) {
          metadata.source = "WebToe";
        } else {
          metadata.source = src;
        }
      }

      // Buscar fecha
      const dateMatch = line.match(/Fecha de expansión:\s*(.+)/);
      if (dateMatch) {
        metadata.date = dateMatch[1].trim();
      }

      // Buscar descripción (primera línea después del título)
      if (!metadata.description && line.trim() && !line.startsWith("#") && !line.startsWith("##")) {
        metadata.description = line.trim().substring(0, 200);
      }
    }
  } catch (e) {
    // ignorar
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// Determinar tags basados en el contenido
// ---------------------------------------------------------------------------

function detectTags(projectName, relPath, analysis) {
  const tags = new Set();
  const lower = projectName.toLowerCase();
  const pathLower = relPath.toLowerCase();
  const name = projectName;

  // Categorías por nombre (con word boundaries para evitar falsos positivos)
  if (/\b(audio|sound|music|beat|osc|freq|spectrum)\b/i.test(name)) tags.add("audio");
  if (/\b(visualizer|viz|visual|particle|particula)\b/i.test(name)) tags.add("visualizer");
  if (/\b(glsl|shader|compute|hlsl)\b/i.test(name)) tags.add("shader");
  if (/\b(sop|geo|mesh|blend|morph|deform|skin)\b/i.test(name)) tags.add("geometry");
  if (/\b(pop|particle|instanc|copy|sprite)\b/i.test(name)) tags.add("particles");
  if (/\b(chop|channel|wave|noise|math|filter)\b/i.test(name)) tags.add("chop");
  if (/\b(top|texture|render|camera|light|bloom|glow)\b/i.test(name)) tags.add("rendering");
  if (/\b(dat|table|database|json|xml|csv)\b/i.test(name)) tags.add("data");
  if (/\b(mapping|map|project|calibrat|led|pixel)\b/i.test(name)) tags.add("mapping");
  if (/\b(kinect|depth|sensor|lidar|touch|leap)\b/i.test(name)) tags.add("interactive");
  if (/\b(video|movie|stream|syphon|spout)\b/i.test(name)) tags.add("video");
  if (/\b(midi|dmx|artnet|osc|control)\b/i.test(name)) tags.add("control");
  if (/\b(3d|stereo|pointcloud|cloud)\b/i.test(name)) tags.add("3d");
  if (/\b(color|chroma|hue|luma|keying)\b/i.test(name)) tags.add("color");
  if (/\b(blur|motion|trail|feedback|delay)\b/i.test(name)) tags.add("effects");
  if (/\b(pathtracer|raytrace|bounce|gi)\b/i.test(name)) tags.add("pathtracer");
  if (/\b(tutorial|example|demo|basic|guide)\b/i.test(name)) tags.add("tutorial");
  if (/\b(ui|interface|panel|button|slider|widget)\b/i.test(name)) tags.add("ui");

  // Tags por contenido analizado (usando counts booleanos en vez de listas)
  if (analysis.hasGLSL) tags.add("glsl");
  if (analysis.hasPython) tags.add("python");
  if (analysis.texturesCount > 0) tags.add("textures");
  if (analysis.networksCount > 5) tags.add("complex-network");
  if (analysis.componentsCount > 20) tags.add("many-components");

  // Tags por ruta
  if (/backup/i.test(pathLower)) tags.add("backup");
  if (analysis.totalSize > 10 * 1024 * 1024) tags.add("large-project");

  return [...tags].sort();
}

// ---------------------------------------------------------------------------
// Escanear proyectos
// ---------------------------------------------------------------------------

function scanProjects() {
  const projects = [];
  const errors = [];

  console.log(`Escaneando: ${CONFIG.TOE_EXPAND}`);

  function walk(dir, depth) {
    if (depth > 6) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fp = path.join(dir, entry.name);

      if (!entry.isDirectory()) continue;

      // Si encontramos una carpeta .dir, es un proyecto expandido
      if (entry.name.endsWith(".dir")) {
        const projectDir = path.dirname(fp);
        const projectName = path.basename(projectDir);
        const relPath = path.relative(CONFIG.TOE_EXPAND, projectDir);

        // Determinar archivo fuente (.toe o .tox)
        const baseName = entry.name.replace(/\.(toe|tox)\.dir$/, ".$1");
        const ext = path.extname(baseName).toLowerCase();
        const sourceFile = path.join(projectDir, baseName);
        const tocFile = path.join(projectDir, baseName + ".toc");
        const readmeFile = path.join(projectDir, "README.md");

        // Verificar que existe el archivo fuente
        if (!fs.existsSync(sourceFile)) {
          errors.push({ path: relPath, error: "Archivo fuente no encontrado" });
          continue;
        }

        try {
          const sourceStat = fs.statSync(sourceFile);
          const readmeMetadata = readReadmeMetadata(readmeFile);
          const analysis = analyzeDirContents(fp);

          // Inferir source de la estructura de ruta
          let source = readmeMetadata.source;
          if (!source || source === "D:/TD") {
            // Distinguir por subcarpeta: si el path empieza con año o POPs, es D:/TD
            if (/^\d{4}/.test(relPath) || /^POPs/i.test(relPath)) {
              source = "D:/TD";
            } else if (relPath.includes("/") || fs.existsSync(path.join(CONFIG.TOE_EXPAND, relPath, baseName))) {
              source = "WebToe";
            } else {
              source = "D:/TD";
            }
          }

          const project = {
            name: projectName,
            sourceFile: baseName,
            type: ext === ".tox" ? "tox" : "toe",
            path: relPath.replace(/\\/g, "/"),
            slug: slugify(projectName),
            size: sourceStat.size,
            sizeFormatted: formatSize(sourceStat.size),
            hasToc: fs.existsSync(tocFile),
            source,
            date: readmeMetadata.date,
            expandedDir: {
              totalFiles: analysis.totalFiles,
              totalSize: analysis.totalSize,
              totalSizeFormatted: formatSize(analysis.totalSize),
              networks: analysis.networksCount,
              components: analysis.componentsCount,
              scripts: analysis.scriptsCount,
              textures: analysis.texturesCount,
              hasGLSL: analysis.hasGLSL,
              hasPython: analysis.hasPython,
            },
            tags: detectTags(projectName, relPath, analysis),
          };

          projects.push(project);
        } catch (e) {
          errors.push({ path: relPath, error: e.message });
        }

        continue;
      }

      // No entrar a subcarpetas de proyectos ya identificados
      // (solo seguimos si no hay carpeta .dir en este nivel)
      walk(fp, depth + 1);
    }
  }

  walk(CONFIG.TOE_EXPAND, 0);

  return { projects, errors };
}

// ---------------------------------------------------------------------------
// Generar estadísticas
// ---------------------------------------------------------------------------

function generateStats(projects, errors) {
  const typeCount = { toe: 0, tox: 0 };
  const sourceCount = {};
  const tagCount = {};
  let totalSize = 0;
  let totalExpandedSize = 0;

  for (const p of projects) {
    typeCount[p.type]++;
    sourceCount[p.source] = (sourceCount[p.source] || 0) + 1;
    totalSize += p.size;
    totalExpandedSize += p.expandedDir.totalSize;

    for (const tag of p.tags) {
      tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
  }

  const sortedTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  return {
    totalProjects: projects.length,
    totalErrors: errors.length,
    totalSize: totalSize,
    totalSizeFormatted: formatSize(totalSize),
    totalExpandedSize: totalExpandedSize,
    totalExpandedFormatted: formatSize(totalExpandedSize),
    byType: typeCount,
    bySource: sourceCount,
    byTag: sortedTags,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  parseArgs();

  console.log("=".repeat(60));
  console.log("  Toe_Expand Index Generator");
  console.log("=".repeat(60));
  console.log();

  // Verificar que existe el directorio
  if (!fs.existsSync(CONFIG.TOE_EXPAND)) {
    console.error(`ERROR: No existe el directorio: ${CONFIG.TOE_EXPAND}`);
    process.exit(1);
  }

  // Escanear proyectos
  console.log("Escaneando proyectos...");
  const startTime = Date.now();
  const { projects, errors } = scanProjects();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Ordenar alfabéticamente
  projects.sort((a, b) => a.path.localeCompare(b.path));

  // Estadísticas
  const stats = generateStats(projects, errors);

  console.log(`  Proyectos encontrados: ${projects.length}`);
  console.log(`  Errores:               ${errors.length}`);
  console.log(`  Tiempo de escaneo:     ${elapsed}s`);
  console.log();

  // Mostrar estadísticas
  console.log("Estadísticas:");
  console.log(`  .toe: ${stats.byType.toe} proyectos`);
  console.log(`  .tox: ${stats.byType.tox} componentes`);
  console.log(`  Tamaño total original:  ${stats.totalSizeFormatted}`);
  console.log(`  Tamaño total expandido: ${stats.totalExpandedFormatted}`);
  console.log();

  if (stats.bySource && Object.keys(stats.bySource).length > 0) {
    console.log("Por origen:");
    for (const [source, count] of Object.entries(stats.bySource)) {
      console.log(`  ${source}: ${count} proyectos`);
    }
    console.log();
  }

  console.log("Top 10 tags:");
  for (const { tag, count } of stats.byTag.slice(0, 10)) {
    console.log(`  ${tag}: ${count}`);
  }
  console.log();

  // Mostrar errores
  if (errors.length > 0) {
    console.log(`Errores (${errors.length}):`);
    for (const err of errors.slice(0, 5)) {
      console.log(`  ${err.path}: ${err.error}`);
    }
    if (errors.length > 5) {
      console.log(`  ... y ${errors.length - 5} más`);
    }
    console.log();
  }

  // Solo estadísticas?
  if (CONFIG.STATS_ONLY) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  // Generar index
  const index = {
    meta: stats,
    projects: projects,
    errors: errors.length > 0 ? errors : undefined,
  };

  const json = CONFIG.PRETTY
    ? JSON.stringify(index, null, 2)
    : JSON.stringify(index);

  fs.writeFileSync(CONFIG.OUTPUT, json, "utf-8");

  const fileSize = fs.statSync(CONFIG.OUTPUT).size;

  console.log(`Index generado:`);
  console.log(`  Archivo: ${CONFIG.OUTPUT}`);
  console.log(`  Tamaño:  ${formatSize(fileSize)}`);
  console.log(`  Modo:    ${CONFIG.PRETTY ? "formateado (legible)" : "comprimido (eficiente)"}`);
  console.log();
  console.log("Listo!");
}

main();
