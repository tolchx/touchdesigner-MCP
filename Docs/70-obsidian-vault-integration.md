# Obsidian Vault Integration for MCP

## Overview

The MCP integrates knowledge from the Obsidian vault at `E:\obsidian-vault\🎯 TouchDesigner` to enhance its understanding of TouchDesigner operators, patterns, and best practices.

## Vault Structure

```
🎯 TouchDesigner/
├── conceptos/          # Core concepts (POP, GPU, Render Pipeline)
├── extras/             # Community resources, GLSL intro, hardware
├── guias-tecnicas/     # Technical guides (MCP patterns, GLSL, node patterns)
├── investigaciones/    # Research (flocking, fluids, fractals, ML)
├── pops-md/            # POPs curriculum (basico/intermedio/avanzado)
├── scripts-youtube/    # Video scripts
└── tutoriales/         # Step-by-step tutorials
```

## Key Knowledge Files for MCP

### MCP-Specific (guias-tecnicas/)
- `mcp-architecture-patterns.md` - Server architecture, 24 tools, connection patterns
- `mcp-tool-examples.md` - Tool usage examples and workflows
- `mcp-semantic-aliases.md` - Semantic alias resolution documentation
- `mcp-integration-guide.md` - Complete integration guide
- `mcp-pop-systems-deep-dive.md` - POP systems deep reference

### Node Patterns (guias-tecnicas/)
- `patrones-nodos-toe-expand.md` - 17 node patterns from Toe_Expand analysis
- `patrones-glsl-pops.md` - GLSL shader patterns for POPs
- `arquitecturas-sistemas-complejos.md` - Complex system architectures

### Core Concepts (conceptos/)
- `Particle-POP.md` - Particle POP deep reference
- `Noise-POP.md` - Noise POP types and usage
- `GPU-Compute.md` - GPU computing in TD
- `render-pipeline.md` - Render pipeline architecture

### Advanced (pops-md/avanzado/)
- `avanzado-1-programacion-glsl-avanzada.md` - Advanced GLSL
- `avanzado-2-optimizacion-gpu-vs-cpu.md` - GPU vs CPU optimization

## MCP Query Examples

### Query POPs Knowledge
```
td_pops_query(search: "particle")
→ Returns: Particle POP documentation, parameters, usage
```

### Query Operators
```
td_ops_query(search: "noise", family: "TOP")
→ Returns: Noise TOP documentation, parameters
```

### Query Templates
```
td_templates_query(search: "flocking")
→ Returns: Flocking system templates from Toe_Expand
```

### Resolve Semantics
```
td_alias_resolve(text: "partículas con ruido orgánico")
→ Returns: Particle POP, Noise POP, POP family hints
```

## Continuous Learning Pipeline

1. **Toe_Expand Analysis**: New .toe projects are decompressed and analyzed
2. **Pattern Extraction**: Node connections, parameter defaults, GLSL shaders extracted
3. **Knowledge Base Update**: Patterns added to templates/ and docs/
4. **MCP Queryable**: New knowledge immediately available via td_templates_query

## Integration Points

- **Semantic Resolution**: Vault concepts mapped to operator aliases
- **Network Planner**: Patterns used for network generation
- **Skill Loading**: SKILL.md files provide contextual guidance
- **Template Search**: Toe_Expand markdown files searched for patterns
