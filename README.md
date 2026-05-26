# TouchDesigner Plugin for Claude Code

A Claude Code plugin that enables AI-assisted TouchDesigner network creation and manipulation via MCP (Model Context Protocol). **v2.0 — 21 MCP tools, 99 POPs indexed, 629+ operators documented, 13 skills.**

## Features

- **Execute Python in TouchDesigner** — Run Python code directly in your TD project
- **Query Editor State** — Get current network path, selection, and operator info
- **Operator Management** — Create, delete, connect, and layout operators with best practices
- **Parameter Control** — Read and set parameters with transactional rollback
- **Error Checking** — Force-cook and validate networks, detect errors/warnings
- **POP Intelligence** — Inspect particle attributes, point counts, and sample data
- **Screenshot** — Capture operator output as base64 images
- **Project Lifecycle** — Save, load, undo, redo, undo blocks
- **Snapshot & Rollback** — Save operator state before destructive changes
- **Network Planning** — Generate TD networks from natural language prompts
- **Semantic Resolution** — Map prompt vocabulary to TD operators and parameters
- **Knowledge Base** — Query 629+ documented operators (TOP/CHOP/SOP/DAT) + 99 POPs
- **Skill-based Guidance** — 13 built-in patterns for rendering, POPs, performance, etc.

## Tools

| Tool | Description |
|------|-------------|
| `td_execute` | Run Python code in TouchDesigner |
| `td_pane` | Get current network editor state |
| `td_selection` | Get selected operators |
| `td_operators` | List operators at a path |
| `td_pops_query` | Search the POPs knowledge base (99 operators) |
| `td_ops_query` | Search operator knowledge base (629+ TOP/CHOP/SOP/DAT) |
| `td_pars_get` | Read operator parameters with values/expressions |
| `td_pars_set` | Set parameters with transactional rollback |
| `td_connections` | Inspect input/output connections |
| `td_find` | Find operators by query/name/family/type |
| `td_templates_query` | Search reusable patterns inside Toe_Expand docs |
| `td_alias_resolve` | Map prompt vocabulary to canonical TD parameters |
| `td_network_plan` | Plan or apply networks from natural language prompts |
| `td_healthcheck` | Force-cook and validate operators/networks |
| `td_create_operator` | Create operators by type with optional name/position |
| `td_delete_operator` | Delete operators by path |
| `td_connect_nodes` | Wire two operators (output→input) |
| `td_get_errors` | Get errors and warnings per operator |
| `td_screenshot` | Capture operator output as base64 PNG |
| `td_get_param_help` | Look up parameters for any operator type |
| `td_set_operator_pars` | Set parameters with cleaner interface |
| `td_pop_inspect` | Read POP data (points, prims, verts, attributes) |
| `td_snapshot_scene` | Save operator state before destructive changes |
| `td_project_lifecycle` | Save/load/undo/redo/undo blocks |

**Total: 24 MCP tools** (13 original + 11 new)

## Skills

The plugin includes skills organized under `touchdesigner/skills/`:

| Skill | Description |
|-------|-------------|
| `td-guide` | Reference documentation for operator families |
| `td-fundamentals` | TouchDesigner fundamentals and common patterns |
| `td-pops-advanced` | Advanced POP network design and Python scripts |
| `td-core-discipline` | Mandatory layout, color coding, error checking, expression rules |
| `td-build-2025` | New operators in TD 2025.32820+ (Trace POP, Triangulate POP, Layer Mix TOP, RTX Video, etc.) |
| `td-integration` | POP/SOP/TOP/CHOP/DAT integration patterns |
| `td-performance` | Performance optimization guidelines |
| `td-project-architecture` | Project structure and organization |
| `td-robust-systems` | Building stable, production-ready systems |
| `.trae/td-pop-architect` | POP particle system architect |
| `.trae/tdsw-pop-techniques` | GPU-native POP techniques from TDSW project |
| `.trae/td-project-analyzer` | Project analysis and documentation generation |

## Knowledge Base

### Operators (data/ops/)
- **630+ operators** indexed across TOP/CHOP/SOP/DAT families
- **Detailed JSON files** with parameters, inputs, outputs, and descriptions
- Generated from Derivative wiki
- Fields: `summary`, `inputs[]`, `parameters[]` (with label, name, description, page), `attributes[]`

### POPs (data/pops/)
- **99 POP operators** indexed and documented
- 99 detailed JSON files with analysis from Derivative docs
- Fields: `pageTitle`, `pageSlug`, `url`, `tdOpTypeGuess`, `localNotes` (multi-source)

### Toe_Expand
- 30+ example projects (.tox files) from TDSW showcase
- Analyzable Python scripts, node layouts, and parameter configs

## Architecture

```
Host (Claude Code CLI / MCP Client)
  │
  ├── stdio ──► MCP Server (touchdesigner/mcp/src/index.ts)
  │                │                           │
  │                ├── Knowledge DBs            ├── Skills
  │                │   data/ops/                 │   skills/td-*/
  │                │   data/pops/                │
  │                │   data/templates/            │
  │                │
  └── HTTP ──► TD API Client (touchdesigner/api/src/index.ts)
                   │
                   └── HTTP ──► TouchDesigner WebServer DAT (port 44444)
                                    │
                                    └── TouchDesignerAPI.py
                                         │
                                         ├── POST /execute
                                         ├── POST /execute_async
                                         ├── GET /task_status
                                         ├── GET /editor/pane
                                         ├── GET /editor/selection
                                         ├── GET /operators
                                         ├── GET /parameters
                                         ├── POST /parameters/set
                                         ├── GET /connections
                                         ├── GET /find
                                         └── GET /healthcheck
```

## Installation

### 1. Install the Claude Code Plugin

```bash
# Add marketplace
/plugin marketplace add satoruhiga/claude-touchdesigner

# Install plugin
/plugin install touchdesigner@satoruhiga-claude-touchdesigner
```

### 2. Load the TOX in TouchDesigner

1. Open your TouchDesigner project
2. Drag and drop `toe/src/TouchDesignerAPI.tox` anywhere in your project
3. The MCP server will start automatically on port `44444`

### 3. Verify Connection

In Claude Code, try:

```bash
# Test the connection
td_execute(code='print(op("/").children)')
```

## MCP Server Configuration

### For Claude Code (stdio mode)

The `.mcp.json` file configures the MCP server:

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/dist/index.js"]
    }
  }
}
```

### For other MCP clients (VS Code, Claude Desktop, Cursor)

Configure the MCP server in your client's settings:

```json
{
  "mcpServers": {
    "touchdesigner": {
      "command": "node",
      "args": ["path/to/touchdesigner/mcp/dist/index.js"]
    }
  }
}
```

## Configuration

### Port Settings

By default, the MCP server connects to TouchDesigner on port `44444`. You can change this using the `TDAPI_PORT` environment variable.

**macOS / Linux:**
```bash
TDAPI_PORT=12345 claude
```

**Windows (Command Prompt):**
```cmd
set TDAPI_PORT=12345
claude
```

The port must match the `Port` parameter in the `TouchDesignerAPI.tox` component inside TouchDesigner.

## Requirements

- TouchDesigner 2025 or later
- Claude Code CLI
- Node.js (for MCP server)

## Development

### Build

```bash
cd touchdesigner
npm install
npm run build
```

### Structure

```
claude-touchdesigner/
├── touchdesigner/
│   ├── mcp/src/           # MCP server (TypeScript)
│   │   ├── index.ts       # Tool registration
│   │   ├── popsDb.ts      # POPs knowledge base query
│   │   ├── opsDb.ts       # Operators knowledge base query
│   │   ├── templatesDb.ts # Template query
│   │   ├── semantic.ts    # Semantic alias resolution
│   │   ├── networkPlanner.ts  # Network plan generation
│   │   └── data/          # Knowledge bases
│   │       ├── ops/       # 630+ operator JSON files
│   │       └── pops/      # 99 POP JSON files
│   ├── api/src/           # TD HTTP API client (TypeScript)
│   │   └── index.ts       # TDClient class
│   ├── toe/src/           # TouchDesigner Python side
│   │   ├── TouchDesignerAPI.py  # HTTP API server
│   │   └── td_utils.py    # Utilities
│   └── skills/            # AI guidance skills
│       ├── td-core-discipline/
│       ├── td-build-2025/
│       ├── td-pops-advanced/
│       ├── td-integration/
│       └── ...
├── .trae/skills/          # TRAE AI skills
├── Toe_Expand/            # Example TD projects
└── Docs/                  # System documentation
```

## Comparison with Other TD MCP Servers

| Feature | tolchx/touchdesigner-MCP | iflow-mcp (v2.8.1) | 8beeeaaat | TDPilot DPSK4 |
|---------|-------------------------|---------------------|------------|---------------|
| Tools | **24** | 21 | 21 | 110 |
| Operators in KB | **630+** | 630 | — | — |
| POPs in KB | **99** | — | — | ✓ |
| Skills | **13** | — | — | 3 |
| Python execution | ✓ | ✓ | ✓ | ✓ |
| Create/Delete/Connect | ✓ | ✓ | ✓ | ✓ |
| Error checking | ✓ | ✓ | ✓ | ✓ |
| Network planning | ✓ | — | — | ✓ |
| Semantic resolution | ✓ | — | — | — |
| Memory system | snapshot | — | — | ✓ (8 tools) |
| Project lifecycle | ✓ | — | — | ✓ |
| Screenshot | ✓ | — | — | ✓ |
| POP inspection | ✓ | — | — | ✓ |
| Bundle/one-click install | — | npm | .mcpb | npm + .tox |

## License

MIT
