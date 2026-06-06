# MCP TouchDesigner

**El servidor MCP más completo para TouchDesigner.**  
63 herramientas, modo offline, tutoriales integrados, workflows reutilizables, y más.

Conecta Inteligencia Artificial con TouchDesigner usando el Model Context Protocol. Controla operadores, ejecuta scripts y construye redes completas con lenguaje natural.

---

## 🏆 Por qué este MCP

| Característica | Este MCP | iflow-mcp | 8beeeaaat | twozero |
|---|---|---|---|---|
| **Tools** | **63** | 21 | 12 | 36 |
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
- Ejecuta Python en TD vía HTTP
- Crea, elimina, conecta y copia operadores
- Lee y escribe parámetros (incluyendo custom pages)
- Inspecciona redes, errores, rendimiento
- Navegación del editor, screenshots

### 📚 Base de conocimiento local (sin TD)
- 630+ operadores TOP, CHOP, SOP, DAT, POP documentados
- Búsqueda fuzzy con scoring (exacto, prefijo, substring, levenshtein)
- Referencia de parámetros POP verificados contra TD real
- 609 clases Python API documentadas

### 🎓 Contenido educativo
- **15 tutoriales** — desde beginner hasta expert
- **32 workflows reutilizables** — effects, transform, composite
- **Prompts maestros** parametrizables con variables

### 🛠️ Tools avanzados
- `td_watch` — monitoreo de performance en tiempo real
- `td_export_network` — exporta redes a Python, diff o JSON
- `td_history_list/undo/clear` — historial de cambios con snapshots
- `td_run_test` — ejecuta tests legacy desde el MCP
- `td_compare_mcps` — compara servidores MCP TouchDesigner
- `td_run_prompt` — ejecuta prompts maestros con variables

### 🌐 Interfaces
- **CLI** — servidor MCP stdio (compatible con Claude Desktop, VS Code, Cursor)
- **VS Code Extension** — 5 comandos integrados en el editor
- **Web UI** — dashboard con WebSocket en tiempo real (puerto 3333)

---

## 🚀 Quick Start

### 1. Clonar e instalar
```bash
git clone https://github.com/tolchx/touchdesigner-MCP.git
cd touchdesigner-MCP
npm install
npx tsc -p api/tsconfig.json
npx tsc -p mcp/tsconfig.json
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

## 📋 Tools disponibles (63)

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

```bash
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
│   │   └── tools/        # 12 módulos de tools
│   ├── data/
│   │   ├── ops/          # 507 operadores TOP/CHOP/SOP/DAT
│   │   ├── pops/         # 102 operadores POP
│   │   ├── tutorials/    # 15 tutoriales
│   │   ├── workflows/    # 32 workflows
│   │   ├── reference/    # 609 API classes + parámetros POP
│   │   └── docs/         # Documentación técnica
│   ├── webui/            # Dashboard web (puerto 3333)
│   ├── setup/            # Auto-tox, marketplace, instalador
│   ├── scripts/          # Publicación npm, demo guide
│   ├── tests/            # 79 tests legacy + 4 tests MCP
│   └── docs/             # Documentación interactiva HTML
├── .vscode/mcp-td/       # VS Code Extension
├── docs/                 # Landing page GitHub Pages
├── toe/                  # Servidor TD (TouchDesignerAPI.py)
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
