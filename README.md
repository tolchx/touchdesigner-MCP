# MCP TouchDesigner

**El servidor MCP más completo para TouchDesigner.**  
92 herramientas, modo offline, tutoriales integrados, workflows reutilizables, dashboard Nexus, y más.

Conecta Inteligencia Artificial con TouchDesigner usando el Model Context Protocol. Controla operadores, ejecuta scripts y construye redes completas con lenguaje natural.

---

## 🏆 Por qué este MCP

| Característica | Este MCP | iflow-mcp | 8beeeaaat | twozero |
|---|---|---|---|---|
|| **Tools** | **92** | 21 | 12 | 36 |
| **Modo offline** (sin TD) | ✅ | ❌ | ❌ | ❌ |
| **Tutoriales** | **15** | 14 | ❌ | Sí |
| **Workflows** | **32** | 32 | ❌ | Sí |
| **API Classes documentadas** | **609** | 69 | ❌ | ❌ |
| **Base conocimiento local** | 630+ ops | ❌ | ❌ | ❌ |
| **Git-diff export** | ✅ | ❌ | ❌ | ❌ |
| **Historial undo** | ✅ | ❌ | ❌ | ❌ |
| **Monitoreo performance** | ✅ | ❌ | ❌ | ❌ |
| **Web UI dashboard** | ✅ | ❌ | ❌ | ✅ |
| **VS Code extension** | ✅ | ❌ | ❌ | ❌ |
| **Auto-generación .tox** | ✅ | ❌ | ❌ | ❌ |
| **Bundle .mcpb** | ✅ | ❌ | ✅ | ❌ |

---

## ✨ Características

### 🔌 Conexión con TouchDesigner
- Ejecuta Python en TD vía HTTP.
- Crea, elimina, conecta y copia operadores (incluyendo soporte completo para POPs, COMPs y MATs).
- Lee y escribe parámetros (con auto-mapeo para Particle Operators y páginas personalizadas en COMPs).
- Validación de conexiones cruzadas (cross-family validation) para evitar bugs de conexión incompatibles.
- Generación de redes multicapa y autolayout determinista (`td_auto_layout`).
- Inspecciona redes, errores en tiempo real y rendimiento de operadores.
- Navegación del editor de red de TD y captura de screenshots automáticas.

### 📚 Base de conocimiento local (sin TD)
- **630+ operadores** TOP, CHOP, SOP, DAT, POP documentados localmente.
- Búsqueda fuzzy con scoring inteligente (exacto, prefijo, substring, levenshtein) para sugerir operadores.
- Mapeo preciso y referencia de parámetros POP validados contra TD real.
- **609 clases de la API de Python** documentadas offline.
- **1000+ unit tests offline** nativos de Node.js que garantizan que el MCP se ejecute de forma robusta e independiente de TD.

### 🎓 Contenido educativo
- **15 tutoriales interactivos** — desde beginner hasta nivel experto.
- **32 workflows reutilizables** — efectos, transformaciones, composites y redes de partículas (POPs).
- **Prompts maestros** parametrizables con variables para agilizar el desarrollo.

### 🛠️ Tools avanzados
- `td_watch` — monitoreo de performance en tiempo real y detección de cuellos de botella.
- `td_export_network` — exporta redes a código Python compatible, diff o JSON (TDN).
- `td_history_list/undo/clear` — historial de cambios local con snapshots para control de cambios e historial tipo Git.
- `td_run_test` — ejecuta tests legacy y suites de integración directamente.
- `td_compare_mcps` — compara la funcionalidad de distintos servidores MCP de TouchDesigner.
- `td_run_prompt` — ejecuta prompts maestros avanzados.

### 🌐 Interfaces
- **CLI** — servidor MCP stdio listo para usar en Claude Desktop, VS Code, Cursor, Codebuff, etc.
- **VS Code Extension** — comandos integrados para administrar y debuggear el servidor directamente desde tu editor.
- **Web UI Dashboard (Nexus v3)**:
  - WebSocket en tiempo real en puerto 3333.
  - Editor GLSL integrado con bindings automáticos y recarga instantánea.
  - Inspector interactivo del árbol de operadores y editor de parámetros en vivo.
  - Gráficos de rendimiento en tiempo real y visualizador gráfico de la red de nodos.
  - Chat inteligente con IA equipado con autocompletado de comandos, sugerencias y análisis de errores guiado por IA.


---

## 🚀 Quick Start

### 1. Clonar e instalar
```bash
git clone https://github.com/tolchx/touchdesigner-MCP.git
cd touchdesigner-MCP
npm install
npm run build
```

### 2. Preparar TouchDesigner
Opción A — **Auto-generación** (recomendado):
```bash
python mcp/setup/generate_tox.py
# Arrastra TouchDesigner_MCP_Server.tox a tu proyecto TD
```

Opción B — **Manual**: Crea un WebServer DAT en puerto 44444 con el `TouchDesignerAPI.py` de `toe/src/` como extensión.

### 3. Iniciar el MCP server
```bash
node mcp/dist/index.js
```
O con variables de entorno:
```bash
TDAPI_HOST=192.168.x.x TDAPI_PORT=44444 node mcp/dist/index.js
```

### 4. Conectar desde cualquier cliente MCP
Agrega esta configuración a tu cliente MCP (Claude Desktop, VS Code, etc.):
```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["/ruta/a/touchdesigner-MCP/mcp/dist/index.js"],
      "env": {
        "TDAPI_HOST": "localhost",
        "TDAPI_PORT": "44444"
      }
    }
  }
}
```

---

## 🔌 Usar en otro proyecto de TouchDesigner

El MCP se comunica con TD a través del `.tox`. Para usarlo en cualquier proyecto, solo necesitas importar el `.tox` y apuntar el MCP server a la IP/puerto correctos.

### Arquitectura

```
AI Client (Codebuff / Claude)
    ↕ MCP protocol (stdin/stdout)
MCP Server (Node.js)
    ↕ HTTP (localhost:44444)
TouchDesigner (con .tox importado)
```

### Paso 1: Generar el .tox (una sola vez)

```bash
python mcp/setup/generate_tox.py
# → Crea mcp/setup/TouchDesigner_MCP_Server.tox
```

### Paso 2: Importar el .tox en tu proyecto TD

1. Abre tu `.toe` en TouchDesigner
2. **Arrastra** `mcp/setup/TouchDesigner_MCP_Server.tox` al network editor
   - Se crea un Base COMP llamado `mcp_server`
   - Contiene: WebServer DAT (puerto 44444) + extensión Python + Execute DAT
3. Verifica que el WebServer esté activo:
   - Abre `http://localhost:44444/info` en tu navegador
   - Deberías ver un JSON con la info de tu TD

### Paso 3: Configurar el MCP server

El MCP server necesita saber dónde está TD. Configura las variables de entorno:

```bash
# Si TD está en la misma máquina:
TDAPI_HOST=localhost TDAPI_PORT=44444 node mcp/dist/index.js

# Si TD está en otra máquina (ej: otra PC en la red):
TDAPI_HOST=192.168.1.50 TDAPI_PORT=44444 node mcp/dist/index.js
```

### Paso 4: Conectar tu cliente MCP

Configura tu cliente MCP (Claude Desktop, VS Code, Codebuff, etc.) con la ruta al MCP server:

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["C:/Users/TuUsuario/Documents/touchdesigner-MCP/mcp/dist/index.js"],
      "env": {
        "TDAPI_HOST": "localhost",
        "TDAPI_PORT": "44444"
      }
    }
  }
}
```

> **WSL/Linux**: Si usas TD en Windows y el MCP en WSL, `TDAPI_HOST` debe ser la IP de Windows (ej: `172.24.0.1`). Ejecuta `ipconfig` en Windows para obtenerla. En Windows puedes usar `start_freebuff.bat` para lanzar todo automáticamente.

### Verificación

```bash
# Probar que TD responde:
curl http://localhost:44444/info

# Probar el MCP server:
cd touchdesigner-MCP && node mcp/dist/index.js
```

### ¿Qué archivos necesito?

| Archivo | ¿Necesario? | Para qué |
|---------|-------------|----------|
| `mcp/setup/TouchDesigner_MCP_Server.tox` | ✅ Sí | Se importa en tu `.toe` |
| `mcp/dist/index.js` | ✅ Sí | El MCP server (Node.js) |
| `mcp/data/` | ✅ Sí | Base de conocimiento (ops, pops, tutorials) |
| `mcp/templates/` | ✅ Sí | Templates de redes reutilizables |
| `api/` + `node_modules/` | ✅ Sí | Se generan automáticamente con `npm install && npm run build` |
| `.mcp.json` | ⚙️ Opcional | Configuración del cliente MCP |
| `toe/` | ❌ No | Solo fuente del .tox, no necesario después |
| `test_*` | ❌ No | Tests del MCP |
| `webui/` | ❌ No | Dashboard web (opcional) |

### Resumen rápido

```
1. python mcp/setup/generate_tox.py     → genera .tox
2. Arrastra .tox a tu .toe              → instala API en TD
3. TDAPI_HOST=localhost node mcp/dist/index.js → lanza MCP server
4. Configura tu cliente MCP             → conecta IA con TD
```

Listo. Desde tu cliente MCP puedes crear operadores, ejecutar Python, construir redes completas, y más — todo sobre tu proyecto TD.

### 📁 Git: Versionado de redes TD (TDN)

El MCP incluye herramientas para exportar redes TD a formato `.tdn` (TouchDesigner Network) — un JSON legible que se puede versionar con git. El textconv driver de git stripa headers volátiles (build, timestamp, versión TD) para que `git diff` muestre solo cambios semánticos.

**Setup automático (recomendado):**

Desde tu cliente MCP, ejecuta:
```
td_tdn_git_setup
```

Esto genera automáticamente:
- `.gitattributes` con `*.tdn diff=tdn`
- `git config diff.tdn.textconv` apuntando al textconv driver

O manualmente:

```bash
# 1. Crear .gitattributes
echo '*.tdn diff=tdn' >> .gitattributes

# 2. Configurar textconv driver (verificar que textconv.py existe)
git config diff.tdn.textconv 'python3 "mcp/src/tdn/textconv.py"'
```

> **Windows**: Usa `python` en lugar de `python3`. El tool `td_tdn_git_setup` detecta la plataforma automáticamente.
>
> **Nota**: Los archivos `.tdn` deben ser **tracked** por git (no ignorados). El textconv driver es el que hace los diffs limpios.

**Flujo de trabajo TDN:**

```bash
# Exportar una red desde TD (via MCP tool td_tdn_export)
# → Crea networks/mySystem.tdn

# Agregar al commit
git add networks/mySystem.tdn

# Ahora git diff muestra solo cambios de red (no timestamps)
git diff networks/mySystem.tdn

# Comparar live vs guardado (via MCP tool td_tdn_diff)
# → Detecta ops añadidos/eliminados, params cambiados, conexiones rotas
```

| Tool TDN | Descripción |
|----------|-------------|
| `td_tdn_export` | Exportar red a archivo `.tdn` JSON |
| `td_tdn_import` | Importar `.tdn` de vuelta a TD |
| `td_tdn_diff` | Comparar red live vs archivo `.tdn` |
| `td_tdn_git_setup` | Auto-configurar git para `.tdn` |

---

## 📋 Tools disponibles (92)

### 🔌 Requiere conexión TD (modo online)

| Tool | Descripción |
|------|-------------|
| `td_create_operator` | Crear operador |
| `td_delete_operator` | Eliminar operador |
| `td_connect_nodes` | Conectar dos operadores |
| `td_disconnect` | Desconectar input |
| `td_copy_node` | Duplicar operador |
| `td_pars_get` | Leer parámetros |
| `td_pars_set` | Setear parámetros |
| `td_set_operator_pars` | Set parámetros (interfaz limpia) |
| `td_pulse_param` | Pulsar un parámetro (búsqueda fuzzy) |
| `td_custom_parameters` | Crear páginas custom en COMPs |
| `td_execute` | Ejecutar Python en TD |
| `td_network_plan` | Planificar y aplicar redes desde prompt |
| `td_pane` | Estado del panel del network editor |
| `td_selection` | Operadores seleccionados |
| `td_operators` | Listar hijos de un path |
| `td_find` | Buscar operadores |
| `td_connections` | Inspeccionar conexiones |
| `td_get_errors` | Errores y warnings |
| `td_healthcheck` | Validar red |
| `td_get_node_detail` | Info detallada de operador |
| `td_get_hints` | Sugerencias de conexión |
| `td_get_build_compatibility` | Verificar opType |
| `td_get_release_delta` | Cambios entre builds |
| `td_get_info` | Información del entorno TD |
| `td_get_focus` | Foco actual del usuario |
| `td_get_perf` | Performance (FPS, operadores lentos) |
| `td_screenshot` | Screenshot de operador |
| `td_get_screenshots` | Screenshots batch |
| `td_navigate_to` | Navegar a un operador |
| `td_read_textport` | Leer consola de TD |
| `td_clear_textport` | Limpiar consola |
| `td_search` | Buscar en código/expresiones |
| `td_reinit_extension` | Reinicializar extensión |
| `td_read_dat` | Leer contenido de DAT |
| `td_write_dat` | Escribir/patch un DAT |
| `td_read_chop` | Leer canales de un CHOP |
| `td_project_lifecycle` | Save/load/undo/redo |
| `td_snapshot_scene` | Snapshot de estado |
| `td_memory_save` | Guardar entrada en memoria |
| `td_memory_recall` | Buscar en memoria |
| `td_search_official_docs` | Buscar en ayuda offline |
| `td_pop_inspect` | Leer datos de un POP |
| `td_export_network` | Exportar red (Python/diff/JSON) |
| `td_watch` | Monitoreo de performance en tiempo real |

### 📚 Solo base de conocimiento local (modo offline)

| Tool | Descripción |
|------|-------------|
| `td_pops_query` | Buscar en base de POPs |
| `td_ops_query` | Buscar en TOP/CHOP/SOP/DAT |
| `td_templates_query` | Buscar templates en Toe_Expand |
| `td_alias_resolve` | Resolver vocabulario a parámetros |
| `td_get_param_help` | Ayuda de parámetros (OPs + POPs) |
| `td_get_tutorial` | Obtener tutorial interactivo |
| `td_list_tutorials` | Listar tutoriales (15 disponibles) |
| `td_get_workflow` | Obtener workflow reutilizable |
| `td_list_workflows` | Listar workflows (32 disponibles) |
| `td_get_td_classes` | Listar clases Python por familia |
| `td_get_module_help` | Documentación detallada de operador |
| `td_compare_mcps` | Comparar servidores MCP |
| `td_run_prompt` | Ejecutar prompt maestro |
| `tool_batch` | Ejecutar hasta 8 tools en batch |

### ↩️ Historial

| Tool | Descripción |
|------|-------------|
| `td_history_list` | Listar últimos cambios |
| `td_history_undo` | Revertir el último cambio |
| `td_history_clear` | Limpiar historial |

### 🧪 Testing

| Tool | Descripción |
|------|-------------|
| `td_run_test` | Ejecutar test legacy |

---

## 🌐 Interfaces adicionales

### VS Code Extension
```bash
# Abre la carpeta touchdesigner-MCP en VS Code
# Presiona F5 para iniciar debugging de la extensión
# Usa Ctrl+Shift+P → "MCP-TD: Start Server"
```

### Web UI Dashboard
```bash
cd mcp/webui
npm install
node server.js
# Abre http://localhost:3333
```

---

## 🧪 Tests

### Node.js — Offline tests
```bash
# Suite de unit/integration tests offline (1000+ tests nativos)
node --test mcp/test/*.test.js

# Smoke test offline (tools locales)
node mcp/test_smoke.mjs

# Smoke test con TD
TDAPI_HOST=192.168.x.x node mcp/test_smoke.mjs

# Pruebas avanzadas (requiere TD)
TDAPI_HOST=192.168.x.x node mcp/test_advanced.mjs

# Compatibilidad multi-cliente (30 tests)
npm run compat

# CI completo
npm run ci
```

### Python — Unit tests + Integration tests
```bash
# Ejecutar TODOS los tests Python unitarios + integración
python -m unittest discover tests -v

# Solo tests unitarios MCP
python -m unittest tests.test_mcp_server_stdio -v

# Solo tests integración MCP
python -m unittest tests.test_mcp_server_stdio_integration -v

# Solo tests unitarios W2T (WebSocket server)
python -m unittest tests.test_w2t_server_unit -v

# Solo tests integración W2T
python -m unittest tests.test_w2t_server_integration -v
```

---

## 📊 Code Coverage

![mcp_server_stdio](https://img.shields.io/badge/mcp_server_stdio-99%25-brightgreen?style=flat-square)
![w2t_server](https://img.shields.io/badge/w2t_server-48%25-red?style=flat-square)

Cobertura combinada de los servidores Python del proyecto, medida con [`coverage.py`](https://coverage.readthedocs.io/).

### Requisitos
```bash
pip install coverage
```

### Ejecutar coverage completo (218 tests)

1. **Limpiar datos anteriores**
   ```bash
   del .coverage*
   ```

2. **Ejecutar cada suite con `COVERAGE_RUN=1`**  
   (Las suites deben ejecutarse por separado para evitar conflictos de puerto entre servidores)

   ```bash
   set COVERAGE_RUN=1

   REM Suite MCP (unit + integración)
   python -m coverage run --parallel-mode --rcfile=.coveragerc ^
       -m unittest tests.test_mcp_server_stdio
   python -m coverage run --parallel-mode --rcfile=.coveragerc ^
       -m unittest tests.test_mcp_server_stdio_integration.TestMcpStdioIntegration

   REM Suite W2T (unit + integración)
   python -m coverage run --parallel-mode --rcfile=.coveragerc ^
       -m unittest tests.test_w2t_server_unit
   python -m coverage run --parallel-mode --rcfile=.coveragerc ^
       -m unittest tests.test_w2t_server_integration
   ```

3. **Combinar y generar reportes**
   ```bash
   python -m coverage combine --rcfile=.coveragerc
   python -m coverage report -m --rcfile=.coveragerc
   python -m coverage html --rcfile=.coveragerc -d coverage_html
   ```

4. **Ver el reporte HTML**  
   Abre `coverage_html/index.html` en tu navegador.

> **Nota:** Los porcentajes del badge son estáticos. Ejecuta `run_coverage.ps1` para regenerarlos localmente.

### Script de ejecución rápida (PowerShell)
También puedes usar el script `run_coverage.ps1`:

```powershell
# run_coverage.ps1
$env:COVERAGE_RUN = "1"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "=== MCP Unit Tests ==="
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_mcp_server_stdio

Write-Host "=== MCP Integration Tests ==="
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_mcp_server_stdio_integration.TestMcpStdioIntegration

Start-Sleep -Seconds 3

Write-Host "=== W2T Unit Tests ==="
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_w2t_server_unit

Start-Sleep -Seconds 3

Write-Host "=== W2T Integration Tests ==="
python -m coverage run --parallel-mode --rcfile=.coveragerc -m unittest tests.test_w2t_server_integration

Write-Host "=== Combining & Reporting ==="
python -m coverage combine --rcfile=.coveragerc
python -m coverage report --rcfile=.coveragerc --include=mcp_server_stdio.py,w2t_server.py
```

### Arquitectura de coverage

```
Tests (unittest)
  ├── tests/test_mcp_server_stdio.py          → mcp_server_stdio.py  (87 tests)
  ├── tests/test_mcp_server_stdio_integration → mcp_server_stdio.py  (23 integ tests)
  ├── tests/test_w2t_server_unit.py           → w2t_server.py        (92 tests)
  └── tests/test_w2t_server_integration       → w2t_server.py        (16 integ tests)
                                               ─────────────────────────────
                                               Total: 218 tests

COVERAGE_RUN=1 → coverage run --parallel-mode (by test_helpers.coverage_cmd)
                      ↓
          .coverage.* (parallel data files)
                      ↓
          coverage combine
                      ↓
          coverage report / coverage html
```

> **Nota:** La cobertura de `w2t_server.py` (48%) es menor porque los manejadores asyncio (`handle_ws`, `handle_client`, `main`) requieren una conexión TouchDesigner real para ser ejercitados. Las funciones puras (WS frame parsing, HTTP parsing, MCP code generation) tienen cobertura completa.

---

## 📁 Estructura del proyecto

```
touchdesigner-MCP/
├── api/                  # TDClient (librería HTTP)
│   └── src/index.ts
├── mcp/                  # MCP Server
│   ├── src/
│   │   ├── server.ts     # Entry point
│   │   ├── networkPlanner.ts
│   │   ├── templatesDb.ts
│   │   ├── tdn/           # TDN v1.4: export/import/diff para git
│   │   │   ├── schema.ts      # Tipos TDN (TdnDocument, TdnOperator)
│   │   │   └── textconv.py    # Git textconv driver (stripa headers)
│   │   └── tools/        # 13 módulos de tools
│   ├── data/
│   │   ├── ops/          # 507 operadores TOP/CHOP/SOP/DAT
│   │   ├── pops/         # 102 operadores POP
│   │   ├── tutorials/    # 15 tutoriales
│   │   ├── workflows/    # 32 workflows
│   │   ├── reference/    # 609 API classes + parámetros POP
│   │   └── docs/         # Documentación técnica
│   ├── setup/            # .tox generator, auto-setup, marketplace
│   │   ├── generate_tox.py       # Genera el .tox automáticamente
│   │   ├── TouchDesigner_MCP_Server.tox  # .tox pre-generado
│   │   ├── tox_instructions.md   # Guía manual del .tox
│   │   └── README_SETUP.md       # Guía de configuración
│   ├── webui/            # Dashboard web (puerto 3333)
│   ├── scripts/          # Publicación npm, demo guide
│   └── docs/             # Documentación interactiva HTML
├── toe/                  # Fuente del servidor TD
│   ├── TouchDesignerAPI.tox      # .tox alternativo (desarrollo)
│   └── src/
│       ├── TouchDesignerAPI.py   # Extensión Python principal
│       └── td_utils.py           # Utilidades layout + async
├── .vscode/mcp-td/       # VS Code Extension
├── docs/                 # Landing page GitHub Pages
└── .github/workflows/    # CI/CD a GitHub Pages
```

---

## 📄 Licencia

MIT License — ver [LICENSE](LICENSE)

---

## 🤝 Contribuir

1. Fork el repositorio
2. Crea tu branch (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Abre un Pull Request

---

## 🔗 Enlaces

- [Documentación interactiva](https://tolchx.github.io/touchdesigner-MCP/)
- [GitHub](https://github.com/tolchx/touchdesigner-MCP)
- [npm](https://www.npmjs.com/package/@tolchx/touchdesigner-mcp)
- [MCP Marketplace](https://github.com/modelcontextprotocol/servers)
- [TD Academy](https://tolchx.com/td-edu/subjects/touchdesigner/mcp.html)
