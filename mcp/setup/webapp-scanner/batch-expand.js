/**
 * TouchDesigner Batch Expander
 * 
 * Busca recursivamente todos los archivos .toe y .tox en D:\TD,
 * los expande con toeexpand.exe y organiza el resultado en Toe_Expand.
 * 
 * Uso:
 *   node batch-expand.js                        # Procesa todo
 *   node batch-expand.js --dry-run              # Solo muestra qué se procesaría
 *   node batch-expand.js --limit 50             # Procesa solo 50 archivos
 *   node batch-expand.js --source "D:/TD/POPs"  # Fuente personalizada
 *   node batch-expand.js --resume               # Reanuda desde un estado guardado
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const CONFIG = {
  // Rutas fijas
  TOEEXPAND: `"C:\\Program Files\\Derivative\\TouchDesigner\\bin\\toeexpand.exe"`,
  SOURCE_DIR: "D:/TD",
  OUTPUT_DIR: path.resolve(__dirname, "../../../old/mcp_td_v3/Toe_Expand"),

  // Archivo de estado (para --resume)
  STATE_FILE: path.resolve(__dirname, ".batch-expand-state.json"),

  // Archivo de log
  LOG_FILE: path.resolve(__dirname, ".batch-expand-log.txt"),

  // Extensiones a procesar
  EXTENSIONS: [".toe", ".tox"],

  // Límite de archivos (0 = sin límite)
  LIMIT: 0,

  // Modo dry-run (solo listar)
  DRY_RUN: false,

  // Procesamiento paralelo (0 = secuencial, 2+ = paralelo)
  PARALLEL: 3,

  // Intervalo de reporte
  REPORT_EVERY: 50,

  // Prefijo para paths largos en Windows
  WIN_LONG_PATH_PREFIX: "\\\\?\\",
};

// ---------------------------------------------------------------------------
// Parsear argumentos CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--dry-run":
      CONFIG.DRY_RUN = true;
      break;
    case "--limit":
      CONFIG.LIMIT = parseInt(args[++i], 10) || 0;
      break;
    case "--source":
      CONFIG.SOURCE_DIR = args[++i];
      break;
    case "--output":
      CONFIG.OUTPUT_DIR = args[++i];
      break;
    case "--parallel":
      CONFIG.PARALLEL = parseInt(args[++i], 10) || 3;
      break;
    case "--sequential":
      CONFIG.PARALLEL = 0;
      break;
    case "--resume":
      return loadState();
    case "--help":
      printHelp();
      process.exit(0);
  }
  }
  return null;
}

function printHelp() {
  console.log(`
TouchDesigner Batch Expander
=============================
Busca archivos .toe/.tox en D:\\TD y los expande con toeexpand.exe.

Opciones:
  --dry-run         Solo muestra qué archivos se procesarían (no expande)
  --limit N         Procesa solo N archivos
  --source RUTA     Carpeta fuente (default: D:/TD)
  --output RUTA     Carpeta destino (default: ../old/mcp_td_v3/Toe_Expand)
  --parallel N      Procesamiento paralelo (default: 3, 0 = secuencial)
  --sequential      Modo secuencial (1 archivo a la vez)
  --resume          Reanuda desde el último estado guardado
  --help            Muestra esta ayuda
`);
}

// ---------------------------------------------------------------------------
// Estado (para reanudar)
// ---------------------------------------------------------------------------

function saveState(state) {
  try {
    const data = {
      processed: state.processed,
      errors: state.errors,
      skipped: state.skipped,
      total: state.total,
      lastFile: state.currentFile,
      completedFiles: state.completedFiles,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // ignorar errores de estado
  }
}

function loadState() {
  try {
    if (fs.existsSync(CONFIG.STATE_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, "utf-8"));
    }
  } catch (e) {
    // ignorar
  }
  return null;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(message, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] [${type}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(CONFIG.LOG_FILE, line + "\n");
  } catch (e) {
    // ignorar errores de log
  }
}

// ---------------------------------------------------------------------------
// Buscar archivos
// ---------------------------------------------------------------------------

function walkDir(dir, extensions) {
  const results = [];
  const extSet = new Set(extensions.map((e) => e.toLowerCase()));

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Saltar carpetas de salida para evitar loops
        if (fullPath === CONFIG.OUTPUT_DIR) continue;
        // Saltar carpetas .dir (ya expandidas)
        if (entry.name.endsWith(".dir")) continue;
        results.push(...walkDir(fullPath, extensions));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (e) {
    log(`Error leyendo directorio ${dir}: ${e.message}`, "WARN");
  }

  return results;
}

// ---------------------------------------------------------------------------
// Obtener nombre de proyecto limpio
// ---------------------------------------------------------------------------

function getProjectName(filePath) {
  const fileName = path.basename(filePath, path.extname(filePath));
  // Limpiar nombre para usarlo como carpeta
  return fileName
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Obtener ruta de salida para un archivo
// ---------------------------------------------------------------------------

function getOutputPath(filePath) {
  const ext = path.extname(filePath);
  const projectName = getProjectName(filePath);
  const baseName = path.basename(filePath);

  // Calcular subcarpeta relativa dentro de D:/TD
  const relDir = path.relative(CONFIG.SOURCE_DIR, path.dirname(filePath));
  const outputDir = relDir
    ? path.join(CONFIG.OUTPUT_DIR, relDir, projectName)
    : path.join(CONFIG.OUTPUT_DIR, projectName);

  return {
    outputDir,
    projectName,
    baseName,
    ext,
    // Archivos que genera toeexpand.exe
    expandedDir: path.join(
      path.dirname(filePath),
      `${baseName}.dir`
    ),
    expandedToc: path.join(
      path.dirname(filePath),
      `${baseName}.toc`
    ),
  };
}

// ---------------------------------------------------------------------------
// Verificar si ya fue procesado
// ---------------------------------------------------------------------------

function isAlreadyExpanded(outputInfo) {
  const { outputDir, baseName } = outputInfo;
  // Verificar la carpeta .dir en lugar de README.md (más fiable)
  return fs.existsSync(path.join(outputDir, `${baseName}.dir`));
}

// ---------------------------------------------------------------------------
// Utilidad para paths largos en Windows
// ---------------------------------------------------------------------------

function toLongPath(p) {
  // En Node.js en Windows, prefijo \\?\ para paths > 260 chars
  if (process.platform === "win32" && path.isAbsolute(p)) {
    const normalized = path.resolve(p);
    if (normalized.length >= 240) {
      return CONFIG.WIN_LONG_PATH_PREFIX + normalized;
    }
  }
  return p;
}

function existsSafe(p) {
  try {
    return fs.existsSync(toLongPath(p));
  } catch {
    return false;
  }
}

function mkdirSafe(p, opts) {
  try {
    fs.mkdirSync(toLongPath(p), opts || { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}

function renameSafe(src, dest) {
  try {
    fs.renameSync(toLongPath(src), toLongPath(dest));
  } catch (e) {
    if (e.code === "EXDEV") {
      // Cross-device: copiar y borrar original
      log(`Cross-device detected: copiando ${path.basename(src)} en vez de renombrar`, "WARN");
      fs.cpSync(toLongPath(src), toLongPath(dest), { recursive: true, force: true });
      rmSafe(src, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
}

function rmSafe(p, opts) {
  try {
    fs.rmSync(toLongPath(p), opts || { recursive: true, force: true });
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

function copyFileSafe(src, dest) {
  fs.copyFileSync(toLongPath(src), toLongPath(dest));
}

function readdirSafe(p) {
  try {
    return fs.readdirSync(toLongPath(p), { withFileTypes: true });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Ejecutar toeexpand.exe (wrapper con promesa)
// ---------------------------------------------------------------------------

function runToeExpand(filePath) {
  return new Promise((resolve, reject) => {
    const cmd = CONFIG.TOEEXPAND.replace(/"/g, "");
    const args = [filePath];
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      windowsHide: true,
    });

    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      // toeexpand.exe suele devolver exit code 1 aún en éxito
      resolve({ code, stderr });
    });
    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Expandir un archivo
// ---------------------------------------------------------------------------

async function expandFile(filePath, outputInfo) {
  const { outputDir, baseName, expandedDir, expandedToc } = outputInfo;

  // 1. Ejecutar toeexpand.exe
  const result = await runToeExpand(filePath);

  // 2. Verificar que se haya generado el .dir y .toc
  if (!existsSafe(expandedDir)) {
    // Si falló, dar info extra del stderr
    const extra = result.stderr ? ` stderr: ${result.stderr.slice(0, 200)}` : "";
    throw new Error(
      `toeexpand no generó la carpeta .dir esperada: ${expandedDir}${extra}`
    );
  }
  if (!existsSafe(expandedToc)) {
    log(`Archivo .toc no encontrado para ${baseName} (no crítico)`, "WARN");
  }

  // 3. Crear carpeta de salida
  mkdirSafe(outputDir);

  // 4. Mover/copiar archivos
  const targetDir = path.join(outputDir, `${baseName}.dir`);
  const targetToc = path.join(outputDir, `${baseName}.toc`);
  const targetOriginal = path.join(outputDir, baseName);

  // Mover .dir (borrar si ya existe)
  rmSafe(targetDir);
  renameSafe(expandedDir, targetDir);

  // Mover .toc (si existe)
  if (existsSafe(expandedToc)) {
    rmSafe(targetToc);
    renameSafe(expandedToc, targetToc);
  }

  // Copiar archivo original
  copyFileSafe(filePath, targetOriginal);

  // 5. Generar README.md
  generateReadme(outputInfo.outputDir, outputInfo.projectName, targetDir);

  return { targetDir, targetToc, targetOriginal };
}

// ---------------------------------------------------------------------------
// Generar README
// ---------------------------------------------------------------------------

function generateReadme(outputDir, projectName, expandedDir) {
  let componentsList = "";
  try {
    if (fs.existsSync(expandedDir)) {
      const items = fs.readdirSync(expandedDir);
      componentsList = items
        .slice(0, 50)
        .map((item) => `- **${item}**`)
        .join("\n");
      if (items.length > 50) {
        componentsList += `\n- *... y ${items.length - 50} archivos más*`;
      }
    }
  } catch (e) {
    componentsList = "*Error al leer la estructura interna*";
  }

  const readme = `# ${projectName}

Proyecto TouchDesigner expandido automáticamente.

## Estructura del Proyecto

${componentsList || "*No se pudo leer la estructura interna.*"}

## Contexto

Proyecto expandido para permitir control de versiones (Git) y análisis de nodos.
Usa \`toecollapse.exe\` apuntando al archivo \`.toc\` para volver a comprimir.

## Archivos

- \`${projectName}.toe\` o \`${projectName}.tox\` — Archivo original
- \`${projectName}.toe.dir/\` o \`${projectName}.tox.dir/\` — Contenido expandido
- \`${projectName}.toe.toc\` o \`${projectName}.tox.toc\` — Tabla de contenido

## Fuente

Expandido desde: \`${outputDir.replace(CONFIG.OUTPUT_DIR, "D:/TD")}\`
Fecha de expansión: ${new Date().toLocaleDateString()}
`;

  fs.writeFileSync(path.join(outputDir, "README.md"), readme, "utf-8");
}

// ---------------------------------------------------------------------------
// Procesamiento secuencial
// ---------------------------------------------------------------------------

async function processSequential(files, state) {
  let completedCount = 0;

  for (const filePath of files) {
    completedCount++;
    state.currentFile = filePath;

    await processOneFile(filePath, completedCount, state);

    // Reporte periódico
    if (completedCount % CONFIG.REPORT_EVERY === 0) {
      const elapsed = ((Date.now() - state.startTime) / 1000 / 60).toFixed(1);
      log(
        `📊 Progreso: ${state.processed} procesados, ${state.errors} errores, ${state.skipped} saltados (${elapsed} min)`,
        "STATS"
      );
      saveState(state);
    }

  }
}

// ---------------------------------------------------------------------------
// Procesamiento paralelo (cola con límite de concurrencia)
// ---------------------------------------------------------------------------

async function processParallel(files, state) {
  const queue = [...files];
  const concurrency = CONFIG.PARALLEL;
  let active = 0;
  let completedCount = 0;
  let queueIndex = 0;

  return new Promise((resolve) => {
    function startNext() {
      while (active < concurrency && queueIndex < queue.length) {
        const filePath = queue[queueIndex++];
        active++;
        const idx = completedCount + 1;
        processOneFile(filePath, idx, state)
          .then(() => {
            completedCount++;
            active--;
            // Reporte periódico
            if (completedCount % CONFIG.REPORT_EVERY === 0) {
              const elapsed = ((Date.now() - state.startTime) / 1000 / 60).toFixed(1);
              log(
                `📊 Progreso: ${state.processed} procesados, ${state.errors} errores, ${state.skipped} saltados (${elapsed} min)`,
                "STATS"
              );
              saveState(state);
            }
            if (completedCount >= queue.length) {
              resolve();
            } else {
              startNext();
            }
          })
          .catch(() => {
            completedCount++;
            active--;
            if (completedCount >= queue.length) {
              resolve();
            } else {
              startNext();
            }
          });
      }
      if (active === 0 && queueIndex >= queue.length) {
        resolve();
      }
    }
    startNext();
  });
}

// ---------------------------------------------------------------------------
// Procesar un solo archivo (dry-run, skip, expandir)
// ---------------------------------------------------------------------------

async function processOneFile(filePath, index, state) {
  const outputInfo = getOutputPath(filePath);
  const fileName = path.basename(filePath);
  const progress = `[${index}/${state.total}]`;

  // Saltar si ya fue procesado
  if (isAlreadyExpanded(outputInfo)) {
    log(`${progress} ⏭️  ${fileName} — ya procesado en Toe_Expand`, "SKIP");
    state.skipped++;
    state.completedFiles.push(filePath);
    return;
  }

  // Modo dry-run
  if (CONFIG.DRY_RUN) {
    console.log(
      `   ${progress} ${fileName} → ${path.relative(
        CONFIG.OUTPUT_DIR,
        outputInfo.outputDir
      )}`
    );
    return;
  }

  // Procesar
  try {
    log(`${progress} 🔄 ${fileName} — expandiendo...`, "INFO");
    const result = await expandFile(filePath, outputInfo);
    log(
      `${progress} ✅ ${fileName} → ${path.relative(
        CONFIG.OUTPUT_DIR,
        outputInfo.outputDir
      )}`,
      "OK"
    );
    state.processed++;
    state.completedFiles.push(filePath);
  } catch (e) {
    log(`${progress} ❌ ${fileName} — ERROR: ${e.message}`, "ERROR");
    state.errors++;
    state.completedFiles.push(filePath);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("  TouchDesigner Batch Expander");
  console.log("=".repeat(60));
  console.log();

  // Leer argumentos
  const savedState = parseArgs();

  console.log(`  Fuente:    ${CONFIG.SOURCE_DIR}`);
  console.log(`  Destino:   ${CONFIG.OUTPUT_DIR}`);
  console.log(`  toexpand:  ${CONFIG.TOEEXPAND}`);
  console.log(`  Dry-run:   ${CONFIG.DRY_RUN ? "SÍ" : "NO"}`);
  console.log(`  Resume:    ${savedState ? "SÍ" : "NO"}`);
  if (CONFIG.LIMIT > 0) console.log(`  Límite:    ${CONFIG.LIMIT} archivos`);
  console.log();

  // Verificar toeexpand.exe
  const toePath = CONFIG.TOEEXPAND.replace(/"/g, "");
  if (!fs.existsSync(toePath)) {
    console.error(`❌ ERROR: No se encuentra toeexpand.exe en:`);
    console.error(`   ${toePath}`);
    console.error(`   Verifica que TouchDesigner esté instalado.`);
    process.exit(1);
  }

  // Verificar directorio fuente
  if (!fs.existsSync(CONFIG.SOURCE_DIR)) {
    console.error(`❌ ERROR: No existe el directorio fuente:`);
    console.error(`   ${CONFIG.SOURCE_DIR}`);
    process.exit(1);
  }

  // Crear directorio de salida
  if (!CONFIG.DRY_RUN) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  // Buscar archivos
  console.log("🔍 Escaneando archivos .toe y .tox...");
  const allFiles = walkDir(CONFIG.SOURCE_DIR, CONFIG.EXTENSIONS);
  console.log(`   Encontrados: ${allFiles.length} archivos`);
  console.log();

  if (allFiles.length === 0) {
    console.log("No se encontraron archivos para procesar.");
    return;
  }

  // Preparar estado
  const state = {
    processed: 0,
    errors: 0,
    skipped: 0,
    total: allFiles.length,
    currentFile: "",
    completedFiles: savedState?.completedFiles || [],
    startTime: Date.now(),
  };

  // Aplicar límite
  const filesToProcess =
    CONFIG.LIMIT > 0 ? allFiles.slice(0, CONFIG.LIMIT) : allFiles;

  // Si hay estado guardado, saltar archivos ya procesados
  let files = filesToProcess;
  if (savedState) {
    const completed = new Set(savedState.completedFiles || []);
    files = filesToProcess.filter((f) => !completed.has(f));
    state.processed = savedState.processed || 0;
    state.errors = savedState.errors || 0;
    state.skipped = savedState.skipped || 0;
    log(
      `Reanudando: ${files.length} archivos restantes de ${savedState.total}`,
      "INFO"
    );
  }

  // -----------------------------------------------------------------------
  // Procesar (con soporte paralelo)
  // -----------------------------------------------------------------------

  let completedCount = 0;
  const totalToProcess = files.length;

  if (CONFIG.PARALLEL > 0 && totalToProcess > 1) {
    log(
      `Modo paralelo: ${CONFIG.PARALLEL} procesos simultáneos para ${totalToProcess} archivos`,
      "INFO"
    );
    await processParallel(files, state);
  } else {
    log(`Modo secuencial para ${totalToProcess} archivos`, "INFO");
    await processSequential(files, state);
  }

  // -----------------------------------------------------------------------
  // Resumen final
  // -----------------------------------------------------------------------

  const elapsed = ((Date.now() - state.startTime) / 1000 / 60).toFixed(1);

  console.log();
  console.log("=".repeat(60));
  console.log("  RESULTADOS");
  console.log("=".repeat(60));
  console.log(`  Total archivos encontrados: ${state.total}`);
  console.log(`  Procesados exitosamente:    ${state.processed}`);
  console.log(`  Errores:                    ${state.errors}`);
  console.log(`  Saltados (ya existentes):   ${state.skipped}`);
  console.log(`  Tiempo total:               ${elapsed} minutos`);
  console.log(`  Dry-run:                    ${CONFIG.DRY_RUN ? "SÍ" : "NO"}`);
  console.log();
  console.log(`  Destino: ${CONFIG.OUTPUT_DIR}`);
  console.log();

  // Limpiar archivo de estado si todo salió bien
  if (state.errors === 0 && !CONFIG.DRY_RUN) {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        fs.rmSync(CONFIG.STATE_FILE, { force: true });
      }
    } catch (e) {
      // ignorar
    }
  } else if (!CONFIG.DRY_RUN) {
    log(
      `Hubo ${state.errors} errores. Estado guardado en ${CONFIG.STATE_FILE}`,
      "WARN"
    );
    log("Usa --resume para reanudar después de corregir los errores.", "WARN");
  }

  // Log final
  log(`=== Proceso completado: ${state.processed} procesados, ${state.errors} errores, ${state.skipped} saltados (${elapsed} min) ===`, "DONE");
}

// ---------------------------------------------------------------------------
// Ejecutar
// ---------------------------------------------------------------------------

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
