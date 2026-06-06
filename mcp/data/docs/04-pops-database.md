# Base de datos estructurada de POPs

La base de conocimiento POPs vive en:

- `touchdesigner/mcp/data/pops/index.json`: índice (lista + metadatos).
- `touchdesigner/mcp/data/pops/operators/<PageSlug>.json`: ficha detallada por operador.

## Esquema (alto nivel)

Cada operador incluye:

- Identidad: `pageTitle`, `pageSlug`, `url`, `experimental`, `tdOpTypeGuess`.
- Técnica: `summary`, `inputs[]`, `parameters[]`, `attributes[]`.
- Capacitación: `useCases[]`, `examples[]`, `commonCombinations[]`, `troubleshooting[]`.

## Generación automática (docs oficiales)

El generador:

- Descarga la lista desde `https://docs.derivative.ca/Category:POPs`.
- Para cada operador descarga la página oficial y extrae:
  - resumen
  - inputs
  - parámetros por página
  - atributos (cuando la tabla está presente)

### Construir / actualizar la base

En `touchdesigner/`:

```powershell
npm run build
node .\mcp\dist\popsBuild.js --out .\mcp\data\pops --limit 10 --local-docs ..\Docs
```

Enriquecimiento opcional con LLM (Gemma 4 vía Ollama):

```powershell
$env:LLM_PROVIDER="ollama"
$env:OLLAMA_MODEL="gemma4:e4b"
node .\mcp\dist\popsBuild.js --out .\mcp\data\pops --enrich --local-docs ..\Docs
```

## Consulta desde el MCP

Se expone una herramienta MCP adicional:

- `td_pops_query`:
  - `search`: texto libre
  - `page_slug`: slug exacto (p.ej. `Particle_POP`)
  - `limit`: máximo de resultados

Objetivo: permitir que el asistente consulte documentación técnica antes de generar redes POP complejas.
