# TouchDesigner Plugin for Agents

A plugin that enables AI-assisted TouchDesigner network creation and manipulation via MCP (Model Context Protocol). **v3.0 — 24+ MCP tools, 507 operators indexed, 98 POPs documented, 16 skills, professional project planning system.**

## Features

### Core Capabilities
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
- **Knowledge Base** — Query 507+ documented operators (TOP/CHOP/SOP/DAT) + 98 POPs
- **Skill-based Guidance** — 16 built-in patterns for rendering, POPs, performance, etc.

### NEW in v3.0: Professional Project Planning
- **Mandatory Pre-Generation Flow** — Every project starts with a root COMP container
- **Anti-Collision Layout Algorithm** — AABB intersection testing prevents node overlap
- **Left-to-Right / Top-to-Bottom Flow** — Consistent visual organization
- **Role-Based Node Ordering** — Source → Bridge → Modifier → Solver → Output
- **Color Coding System** — Blue=source, Green=process, Orange=output, Purple=control
- **Verification Checklist** — Automated validation after network generation

### NEW in v3.0: Knowledge Integration
- **Obsidian Vault Sync** — Continuous knowledge import from vault
- **Toe_Expand Analysis** — Pattern extraction from 96+ decompressed .toe projects
- **507 Operator Database** — Complete documentation for all TD operators
- **98 POP Database** — Full POP operator reference with parameters
- **373 Template Files** — Reusable patterns from real-world projects

## Tools

| Tool | Description |
|------|-------------|
| `td_execute` | Run Python code in TouchDesigner |
| `td_pane` | Get current network editor state |
| `td_selection` | Get selected operators |
| `td_operators` | List operators at a path |
| `td_pops_query` | Search the POPs knowledge base (98 operators) |
| `td_ops_query` | Search operator knowledge base (507+ TOP/CHOP/SOP/DAT) |
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

**Total: 24 MCP tools**

## Skills

| Skill | Description |
|-------|-------------|
| `td-project-planner` | **NEW** Professional pre-generation planning system |
| `td-complex-systems` | **NEW** Complex system generation (flocking, fluids, fractals) |
| `td-guide` | Reference documentation for operator families |
| `td-fundamentals` | TouchDesigner fundamentals and common patterns |
| `td-core-discipline` | Mandatory layout, color coding, error checking rules |
| `td-build-2025` | New operators in TD 2025.32820+ |
| `td-integration` | POP/SOP/TOP/CHOP/DAT integration patterns |
| `td-performance` | Performance optimization guidelines |
| `td-project-architecture` | Project structure and organization |
| `td-robust-systems` | Building stable, production-ready systems |
| `td-pops-advanced` | Advanced POP network design |
| `td-pops-glsl` | GLSL programming for POPs (v3.0) |
| `td-pops-utility` | Production: DMX, rendering, sensors |
| `td-pop-expert` | POP particle system expert |
| `td-pops-research` | POP research patterns |
| `prompt-enhancer` | Prompt optimization for TD |

## Knowledge Base

### Operators (data/ops/)
- **507 operators** indexed across TOP/CHOP/SOP/DAT families
  - CHOP: 171 | TOP: 148 | SOP: 114 | DAT: 73
- **Detailed JSON files** with parameters, inputs, outputs, and descriptions
- Generated from Derivative wiki

### POPs (data/pops/)
- **98 POP operators** indexed and documented
- 98 detailed JSON files with analysis from Derivative docs

### Toe_Expand
- 373+ example projects from TDSW and community
- Python scripts, node layouts, parameter configs
- Continuous analysis pipeline for pattern extraction

## Project Planning System (NEW)

### Mandatory Pre-Generation Flow
Every project MUST follow this flow:

1. **Create Root Container** — `baseCOMP` as project root
2. **Create In/Out Ports** — `inPOP`/`outPOP` for container I/O
3. **Plan Layout** — Anti-collision positioning with AABB testing
4. **Create Nodes** — Role-based ordering (Source→Process→Output)
5. **Apply Color Coding** — Blue/Green/Orange/Purple by role
6. **Connect Nodes** — Left-to-right wiring
7. **Verify** — `td_healthcheck` + `td_get_errors`

### Anti-Collision Algorithm
```
1. Calculate ideal position: (chain * V_SPACING, index * H_SPACING)
2. Create AABB bounds for new node
3. Test intersection with ALL placed nodes
4. If collision: shift right by H_SPACING until clear
5. Place node and record bounds
```

### Layout Constants
- Horizontal spacing: 300px
- Vertical spacing: 250px
- Node width: 130px
- Node height: 90px

## Architecture

```
Host (Agent CLI / MCP Client)
  │
  ├── stdio ──► MCP Server (touchdesigner/mcp/src/index.ts)
  │                │
  │                ├── Knowledge DBs (507 ops + 98 POPs)
  │                │   data/ops/ (JSON per operator)
  │                │   data/pops/ (JSON per POP)
  │                │
  │                ├── Templates (373 Toe_Expand docs)
  │                │   Toe_Expand/*.md
  │                │
  │                └── Skills (16 patterns)
  │                    skills/td-*/SKILL.md
  │
  └── HTTP ──► TD API Client (touchdesigner/api/src/index.ts)
                   │
                   └── HTTP ──► TouchDesigner WebServer DAT (port 44444)
                                    │
                                    └── TouchDesignerAPI.py
```

## Installation

### Prerequisites
- TouchDesigner 2025.32820+ (with POPs support)
- Node.js 18+
- MCP Client (Claude Desktop, Cursor, Codebuff)

### Setup
1. Clone this repository
2. Install dependencies: `cd touchdesigner && npm install`
3. Load `TouchDesignerAPI.py` as WebServer DAT in TD (port 44444)
4. Configure MCP server in your client:

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

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/sync_vault_knowledge.py` | Sync Obsidian vault to MCP Docs |
| `scripts/extract_patterns.py` | Extract patterns from Toe_Expand projects |

## Changelog

### v3.0 (2026-06-05)
- **Professional Project Planning System** with mandatory pre-generation flow
- **Anti-Collision Layout Algorithm** (AABB intersection testing)
- **507 operators** indexed (from 630+ original, unified from claude-touchdesigner)
- **98 POPs** indexed and documented
- **16 skills** (added td-project-planner, td-complex-systems, 4 new from expert system)
- **Obsidian Vault Integration** with continuous sync pipeline
- **Toe_Expand Analysis Framework** for pattern extraction from 96+ projects
- **373 template files** from decompressed .toe projects
- **Layout Engine** (Python) with anti-collision positioning
- **Project Initialization Template** for standardized project setup
