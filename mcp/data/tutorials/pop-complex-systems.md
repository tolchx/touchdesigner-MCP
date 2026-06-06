---
title: "POP Complex Systems — Session 2"
category: "pops"
difficulty: "advanced"
keywords: ["pop", "render pipeline", "chop", "hierarchical", "particle filter", "attribute instancing", "geometry comp", "complex"]
duration: "30 min"
requires_td: true
---

# POP Systems Log — Session 2

Ocho sistemas POP complejos construidos y verificados contra TD 2025.32460. Incluye pipelines de renderizado, sistemas paralelos, jerarquías y filtros de partículas.

## Systems Built (8 total, all verified OK)

### System 1: Render Pipeline (POP → geometryCOMP → renderTOP)
`spherePOP → noisePOP → nullPOP → geometryCOMP → renderTOP → nullTOP`
- Full pipeline from POP generation to render output
- geometryCOMP accepts POP input directly when internal children are cleared
- renderTOP renders with default camera (warning only, not an error)
- **5 operators, 4 connections**

### System 2: CHOP + POP Parallel (independent chains)
- CHOP chain: `lfoCHOP → nullCHOP` (audio/control signals)
- POP chain: `spherePOP → noisePOP → nullPOP` (particle data)
- Independent chains in same baseCOMP, no cross-family connection needed
- **4 operators, 2 connections**

### System 3: Hierarchical COMPs (nested with inPOP/outPOP)
`inner/baseCOMP → outer/nullPOP`
- Inner system: `spherePOP → noisePOP → nullPOP`
- Nested inside baseCOMP, output accessible via COMP's implicit out connector
- No direct cross-family connection — baseCOMP exposes POP output automatically
- **4 operators, 2 connections** (across 2 levels)

### System 4: Particle Filter (copy + delete + limit + blend)
`spherePOP → copyPOP → noisePOP → deletePOP → limitPOP → blendPOP → nullPOP`
- copyPOP multiplies points
- deletePOP filters by condition
- limitPOP constrains boundaries
- blendPOP blends between passes
- **7 operators, 6 connections**

### System 5: Attribute Instancing (grid + attribute + math + copy)
`gridPOP → attributePOP → mathPOP → copyPOP → nullPOP`
- attributePOP creates custom per-point attributes
- mathPOP operates on attributes (scale, offset)
- copyPOP duplicates with attribute-driven variation
- **5 operators, 4 connections**

## Errors Discovered and Fixed

| Error | Cause | Fix |
|-------|-------|-----|
| `Not enough sources specified` | POP → SOP direct connection | Don't cross families; use compatible chain |
| `No Camera COMP found` | renderTOP without camera | Warning only, not blocking |
| `baseCOMP → nullPOP fails` | COMP can't connect to POP directly | Use inPOP/outPOP or implicit COMP output |
| `noisePOP has no input` | Node created without source connected | Create POP chain linearly |
