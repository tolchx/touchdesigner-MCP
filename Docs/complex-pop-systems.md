# POP Systems Log — Session 2

## Systems Built (8 total, all verified OK)

### 6. Render Pipeline (POP → geometryCOMP → renderTOP)
`spherePOP → noisePOP → nullPOP → geometryCOMP → renderTOP → nullTOP`
- Full pipeline from POP generation to render output
- geometryCOMP accepts POP input directly when internal children are cleared
- renderTOP renders with default camera (warning only, not an error)
- **5 operators, 4 connections**

### 7. CHOP + POP Parallel (independent chains)
- CHOP chain: `lfoCHOP → nullCHOP` (audio/control signals)
- POP chain: `spherePOP → noisePOP → nullPOP` (particle data)
- Independent chains in same baseCOMP, no cross-family connection needed
- **4 operators, 2 connections**

### 8. Hierarchical COMPs (nested with inPOP/outPOP)
`inner/baseCOMP → outer/nullPOP`
- Inner system: `spherePOP → noisePOP → nullPOP` 
- Nested inside baseCOMP, output accessible via COMP's implicit out connector
- No direct cross-family connection — baseCOMP exposes POP output automatically
- **4 operators, 2 connections** (across 2 levels)

### 9. Particle Filter (copy + delete + limit + blend)
`spherePOP → copyPOP → noisePOP → deletePOP → limitPOP → blendPOP → nullPOP`
- copyPOP multiplies points
- deletePOP filters by condition
- limitPOP constrains boundaries
- blendPOP blends between passes
- **7 operators, 6 connections**

### 10. Attribute Instancing (grid + attribute + math + copy)
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
