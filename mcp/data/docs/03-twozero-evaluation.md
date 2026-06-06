# Evaluación de mejoras inspiradas en TWOZERO

TWOZERO se describe como un toolkit nativo para TouchDesigner con:

- Generación por IA
- Librería curada de componentes
- Sincronización en la nube
- Herramientas de producción
- Integración en UI y sin "wrappers" externos

## Qué se puede integrar en este MCP (sin depender de TWOZERO)

- **Librería curada de patrones (component library)**  
  Crear un catálogo de "recetas" reproducibles (render, instancing, feedback loops, POP sims, GLSL) como:
  - skills en Markdown (`touchdesigner/skills/*`)
  - prompts maestros (`docs/06-master-prompts.md` o carpeta `prompts/`)
  - scripts Python idempotentes (crear/actualizar redes sin duplicar)

- **No ensuciar el proyecto (non-invasive)**  
  Convenciones sistemáticas:
  - encapsular sistemas en `baseCOMP`/`geoCOMP`
  - nodos "I/O estándar" (`in*`, `out*`, `null*`)
  - layout determinístico (`nodeX/nodeY`)
  - nombres consistentes y prefijos por dominio (`pop_`, `top_`, `chop_`)

- **Validación y calidad (production tools)**  
  Protocolos para:
  - verificar existencia de OPs creados
  - detectar cooks costosos (Info CHOP / cookTime)
  - validar atributos esperados en POP sims (PartVel/PartForce/…)
  - reportar errores con causas probables + fixes sugeridos

- **Sync/portabilidad**  
  En este contexto, "cloud sync" se reemplaza por:
  - base de conocimiento versionada (JSON + Markdown)
  - scripts reproducibles (sin estado oculto)

## Qué no se integra directamente

- UI embebida y herramientas propietarias de TWOZERO.
- Sincronización en la nube "integrada" (solo se replica el enfoque de versionado y reproducibilidad).
