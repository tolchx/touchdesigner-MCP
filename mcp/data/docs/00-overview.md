# Sistema integral de documentación y capacitación — TouchDesigner MCP (Gemma 4 + POPs)

Este repositorio se amplía con un sistema de:

- Documentación técnica del MCP (arquitectura, herramientas, flujo).
- Adaptación operativa para Gemma 4 vía Ollama (configuración y verificación).
- Base de conocimiento estructurada de POPs (derivada de docs oficiales + material local).
- Skills especializados para arquitectura avanzada de proyectos en TouchDesigner.
- Catálogo de prompts maestros con validaciones y criterios de calidad.
- Protocolos de testing/validación para redes generadas.

Carpetas añadidas/propuestas:

- `docs/`: documentación del sistema.
- `touchdesigner/mcp/data/pops/`: base de datos POPs en JSON (index + docs por operador).
- `touchdesigner/mcp/src/popsBuild.ts`: generador de la base POPs (scraping + enriquecimiento opcional vía LLM).
