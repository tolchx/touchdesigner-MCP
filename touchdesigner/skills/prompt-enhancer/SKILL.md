---
name: prompt-enhancer
description: "Use WHENEVER the user sends a message. Automatically enhances the user's raw input prompt before it reaches the main Hermes agent. Enriches with project context, recent test results, known bugs, and execution environment state to produce a higher-quality prompt that requires less back-and-forth."
version: 1.0.0
author: Tolch
license: MIT
metadata:
  hermes:
    tags: [prompt, enhancement, context, enrichment, touchdesigner, mcp]
    related_skills: [humanizer, td-core-discipline, td-pop-expert, td-pops-glsl, td-pops-research, td-pops-utility]
---

# Prompt Enhancer — Hermes Input Augmentation

## Overview

This skill automatically enhances the user's raw input before it reaches the main Hermes agent reasoning loop. It injects relevant project context, known constraints, recent debugging findings, and execution environment details so the agent can produce correct output on the first attempt — eliminating the back-and-forth that comes from missing context.

## Trigger

**THIS SKILL IS ALWAYS ACTIVE.** Every user message passes through this enhancer before reaching Hermes. The user does NOT need to explicitly invoke it.

## Enhancement Rules

### 1. Project Context Injection

Prepend this context to every user message involving TouchDesigner MCP operations:

```
PROJECT: touchdesigner-MCP at /mnt/c/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/claude-touchdesigner/
ENV: WSL → Windows TD via 172.24.0.1:44444
TOOLS: 41 MCP tools registered
SKILLS: 13 available (td-pop-expert, td-pops-glsl, td-pops-research, td-pops-utility, td-core-discipline, etc.)
API: TDClient at touchdesigner/api/src/index.ts (compiles with 0 errors)
MCP: touchdesigner/mcp/src/index.ts (41 tools, 0 errors in our code)
TD_BUILD: 2025.32820+
```

### 2. Known Constraints (Always Inject)

When the user's message relates to GLSL POP or TouchDesigner operations, inject these known limitations discovered through live testing:

```
GLSL POP KNOWN LIMITATIONS (TD build 2025.32820+):
- outputattrs="P" is REQUIRED to modify position. Cd is READ-ONLY (cannot write color).
- TDTime(), uTime, absTime DO NOT EXIST as uniforms in POP compute shaders.
- User-defined functions outside main() DO NOT COMPILE.
- sin(P[id].y) as argument FAILS — use float(id) or P[id].x only for sin/cos args.
- P[id].x += 0.01 WORKS. P[id] = vec3(sin(float(id))*0.1) WORKS.
- P[id].z = length(P[id].xy) WORKS.
- Auto-generated compute DAT: <glslPOP_name> + "_compute"
- The default shader uses TDIndex(), TDNumElements(), P[id], snoise()

POP OPERATORS CONFIRMED AVAILABLE: spherePOP, nullPOP, noisePOP, attributePOP, limitPOP, gridPOP, copyPOP, deletePOP, blendPOP, feedbackPOP, cachePOP, mathPOP, glslPOP
POP OPERATORS NOT AVAILABLE: forcePOP, colorPOP, pointGeneratorPOP, dragPOP, glslCreatePOP, glslCopyPOP, glslSelectPOP, cPlusPlusPOP

COMMON BUGS (already fixed):
- n.pars is a METHOD, not property: use n.pars() with parentheses
- ${recurse} in template literals needs: ${recurse ? 'True' : 'False'}
- json.dumps({"success":false}) fails: use {'success':False} (Python bool vs JS bool)
```

### 3. Current Project Structure

When the user references files or asks about project organization:

```
touchdesigner-MCP/
├── touchdesigner/
│   ├── api/src/index.ts       # TDClient (ES module, 0 TS errors)
│   ├── mcp/src/index.ts       # MCP server (41 tools)
│   ├── toe/src/               # TouchDesigner Python side
│   │   ├── TouchDesignerAPI.py  # HTTP server inside TD
│   │   └── td_utils.py        # Utilities
│   ├── skills/
│   │   ├── td-pop-expert/     # 33 modules, 50+ operators
│   │   ├── td-pops-glsl/      # GLSL programming for POPs
│   │   ├── td-pops-research/  # 9 advanced investigations
│   │   ├── td-pops-utility/   # DMX, rendering, interactivity
│   │   ├── td-core-discipline/ # Layout, color, debugging rules
│   │   ├── td-build-2025/     # Build 2025.32820+ features
│   │   └── ... (13 total)
│   ├── mcp/data/
│   │   ├── pops/              # 99 POP operators indexed
│   │   └── ops/               # 630+ TOP/CHOP/SOP/DAT operators
├── test_glsl*.mjs             # GLSL test scripts
└── Docs/
    └── 01-mcp-architecture.md
```

### 4. Testing Best Practices

When the user asks to test something:

```
TESTING RECIPE:
1. Create baseCOMP container for organization
2. Create spherePOP → glslPOP → nullPOP chain
3. Set outputattrs="P" on glslPOP
4. Write shader to auto-generated <name>_compute DAT
5. Use healthcheck() to verify no errors
6. Use getNodeDetail() with recurse=true to inspect children
```

### 5. Environment-Specific Facts

```
WSL WINDOWS IP: 172.24.0.1 (from `ip route`)
TD LISTEN PORT: 44444
BUILD COMMAND: cd touchdesigner/api && npx tsc --project tsconfig.json
TEST COMMAND: TDAPI_HOST=172.24.0.1 TDAPI_PORT=44444 node --input-type=module -e "..."
GIT REMOTE: git@github.com:tolchx/touchdesigner-MCP.git
```

## Enhancement Workflow

When the user sends a message:

1. **Identify intent**: What is the user trying to do? (test GLSL, create nodes, debug, research, etc.)
2. **Inject relevant context**: Add project context, known constraints, and environment facts that are relevant to the intent.
3. **Reference skills if appropriate**: If the user asks about POPs, mention to load td-pop-expert. If GLSL, mention td-pops-glsl.
4. **Suggest the right approach**: If testing, include the testing recipe. If debugging, include known bugs.
5. **Append the enhanced prompt**: The original user message with all relevant context injected.

## Anti-Patterns

- **Do NOT repeat information that's already in the user's message** — only add what's missing.
- **Do NOT inject ALL context every time** — only what's relevant to the current task.
- **Do NOT override the user's explicit instructions** — enhancement adds context, it doesn't change the goal.
- **Do NOT make assumptions about what the user wants** — if unsure, ask for clarification.

## Example Enhancement

**User raw input:**
"crea un glsl pop con noise displacement y testea que funcione"

**Enhanced prompt (what Hermes receives):**
```
[PROJECT CONTEXT]
GLSL POP requires outputattrs="P". TDTime() does NOT exist.
Use float(id) for per-point variation. Write to auto-generated <name>_compute DAT.
Testing recipe: spherePOP → glslPOP → nullPOP, set outputattrs, write shader, healthcheck.

[SKILL REFERENCE]
Load td-pops-glsl for GLSL patterns that work (sin(float(id)), length(), etc.)

[USER REQUEST]
crea un glsl pop con noise displacement y testea que funcione
```
