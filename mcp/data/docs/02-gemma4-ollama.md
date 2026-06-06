# Gemma 4 vía Ollama — configuración y validación

El paquete `touchdesigner/mcp` incluye un proveedor LLM para Ollama (HTTP `POST /api/chat`) configurable por variables de entorno:

- `LLM_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434` (por defecto)
- `OLLAMA_MODEL=gemma4:e4b` (ejemplo; usa el nombre exacto instalado en tu Ollama)
- Alternativa: `OLLAMA_MODELS=model1,model2,...` para fallback

## Prueba rápida (sin TouchDesigner)

En `touchdesigner/`:

```powershell
npm install
npm test
```

La prueba `ollamaProvider.test.js` verifica que:

- El cliente lee `LLM_PROVIDER=ollama` y `OLLAMA_MODEL`.
- Se hace una llamada a `/api/chat`.
- Se acepta una respuesta JSON.

## Uso con TouchDesigner (CLI)

Ejecuta comandos en lenguaje natural y rutea a una herramienta:

```powershell
$env:TDAPI_PORT="44444"
$env:LLM_PROVIDER="ollama"
$env:OLLAMA_MODEL="gemma4:e4b"
node .\mcp\dist\chat.js "Lista los operadores en /"
```

Para ejecutar Python directo (sin LLM):

```powershell
$env:TDAPI_PORT="44444"
node .\mcp\dist\chat.js --py "op('/project1').create('null', 'ok')"
```

## Recomendaciones para Gemma (robustez)

- Preferir prompts con salida JSON estricta (sin markdown).
- Ajustar reintentos con:
  - `LLM_RETRY_MAX`
  - `LLM_RETRY_BASE_MS`
  - `LLM_RETRY_MAX_MS`
- Usar `OLLAMA_MODELS` para fallback si un modelo produce JSON inválido.
