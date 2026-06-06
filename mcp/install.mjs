#!/usr/bin/env node

/**
 * TouchDesigner MCP — Instalador interactivo
 *
 * Verifica requisitos, compila, configura y guía al usuario
 * para conectar TouchDesigner MCP con Claude Desktop.
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Helpers ────────────────────────────────────────────────────────────────

function ask(query) {
  const rl = createInterface({ input: stdin, output: stdout });
  return rl.question(query).finally(() => rl.close());
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function check(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function print(msg) {
  console.log(`\n  ${msg}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════╗
║      TouchDesigner MCP — Instalador          ║
╚══════════════════════════════════════════════╝
`);

  // 1. Verificar Node.js
  print("🔍 Verificando Node.js…");
  if (!check("node --version")) {
    console.error("\n  ❌ Node.js no está instalado.");
    console.error("  → Descárgalo desde https://nodejs.org (v18 o superior)");
    exit(1);
  }
  const nodeVer = execSync("node --version").toString().trim();
  print(`✅ Node.js ${nodeVer} detectado`);

  if (!check("npm --version")) {
    console.error("\n  ❌ npm no está disponible.");
    exit(1);
  }
  const npmVer = execSync("npm --version").toString().trim();
  print(`✅ npm ${npmVer} detectado`);

  // 2. Instalar dependencias
  print("📦 Instalando dependencias…");
  run("npm install");
  print("✅ Dependencias instaladas");

  // 3. Compilar TypeScript
  print("🔨 Compilando TypeScript…");
  run("npx tsc");
  print("✅ Compilación exitosa");

  // 4. Preguntar IP de TouchDesigner
  print("🔌 Configuración de conexión a TouchDesigner");

  let host = (await ask("  IP de TouchDesigner (Enter = localhost): ")).trim();
  if (!host) host = "localhost";

  let port = (await ask("  Puerto (Enter = 44444): ")).trim();
  if (!port) port = "44444";

  // 5. Crear .env
  const envPath = resolve(__dirname, ".env");
  const envContent = `# TouchDesigner MCP
TDAPI_HOST=${host}
TDAPI_PORT=${port}
`;
  writeFileSync(envPath, envContent);
  print(`✅ .env creado en ${envPath}`);

  // 6. Ofrecer systemd (solo Linux/WSL)
  const isLinux = process.platform === "linux";
  if (isLinux) {
    const ans = (
      await ask("  ¿Instalar como servicio systemd? (s/N): ")
    ).trim();
    if (ans.toLowerCase() === "s" || ans.toLowerCase() === "y") {
      await installSystemdService(host, port);
    }
  } else {
    print("ℹ️  systemd solo disponible en Linux/WSL — se omite");
  }

  // 7. Instrucciones finales
  print(`
╔══════════════════════════════════════════════╗
║          ✅ Instalación completa              ║
╚══════════════════════════════════════════════╝

📋 Para conectar Claude Desktop:

  1. Abre Claude Desktop → Settings → Developer
  2. En "MCP Servers", agrega:

     {
       "mcpServers": {
         "touchdesigner": {
           "command": "node",
           "args": ["${resolve(__dirname, "dist/index.js")}"]
         }
       }
     }

  3. (Alternativa) Haz doble clic en mcp-bundle.json
     para instalación one-click desde la web.

  4. Asegúrate de que TouchDesigner esté ejecutando
     el archivo .toe con TouchDesignerAPI activo.

  5. Listo. La IA podrá controlar TouchDesigner.

  Variables de entorno configuradas:
    TDAPI_HOST=${host}
    TDAPI_PORT=${port}
`);
}

// ── Systemd service ────────────────────────────────────────────────────────

async function installSystemdService(host, port) {
  const svcContent = `[Unit]
Description=TouchDesigner MCP Server
After=network.target

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=TDAPI_HOST=${host}
Environment=TDAPI_PORT=${port}
WorkingDirectory=${ROOT}
ExecStart=${process.execPath} ${resolve(__dirname, "dist/index.js")}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;

  const svcPath = resolve(
    process.env.HOME || "/home/user",
    ".config/systemd/user/td-mcp.service"
  );

  // Ensure directory exists
  execSync(`mkdir -p ${dirname(svcPath)}`, { stdio: "pipe" });
  writeFileSync(svcPath, svcContent);

  try {
    execSync("systemctl --user daemon-reload", { stdio: "pipe" });
    execSync(`systemctl --user enable td-mcp.service`, { stdio: "pipe" });
    execSync(`systemctl --user start td-mcp.service`, { stdio: "pipe" });
    print(`✅ Servicio systemd instalado: ${svcPath}`);
    print("   → Se inició automáticamente");
    print("   → Comandos útiles:");
    print("     systemctl --user status td-mcp.service");
    print("     journalctl --user -u td-mcp.service -f");
  } catch (e) {
    print(`⚠️  No se pudo iniciar el servicio systemd:`);
    print(`   ${e.message}`);
    print(`   El archivo .service quedó en: ${svcPath}`);
  }
}

// ── Ejecutar ───────────────────────────────────────────────────────────────

main().catch((e) => {
  console.error("Error durante la instalación:", e);
  exit(1);
});
