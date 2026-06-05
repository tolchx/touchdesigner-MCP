# Informe de instalación y pruebas — claude-touchdesigner

Repositorio: https://github.com/satoruhiga/claude-touchdesigner  


## 1) Resumen ejecutivo

- Se clonó el repositorio y se verificó que el paquete Node (workspaces `api` y `mcp`) compila y ejecuta pruebas locales desde Trae.
- Se añadieron mejoras de compatibilidad en Windows (script `clean`) y se ajustó `td-api` para que pueda importarse desde Node sin depender de bundlers (exportando JS desde `dist`).
- Se implementó un “runner” de comandos en lenguaje natural (`mcp/dist/chat.js`) que usa proveedores de IA configurables por variables de entorno (Anthropic/Claude Opus, Google Gemini, o modo mock), traduce el texto a una llamada de herramienta (`td_execute|td_pane|td_selection|td_operators`) y ejecuta la acción vía la API HTTP de TouchDesigner.
- Se añadieron pruebas automatizadas que validan el cliente HTTP (`TDClient`) y el ruteo LLM→herramienta usando un servidor HTTP simulado.

Limitación: en este entorno no se ejecutó TouchDesigner real ni se hicieron llamadas a APIs reales de Gemini/Anthropic por no disponer de llaves. Se dejó el flujo implementado y listo para medir latencias reales en tu máquina con TouchDesigner abierto.

## 2) Dependencias y requisitos

**Runtime**
- Node.js (recomendado: 18+ por `fetch` global)
- TouchDesigner 2025 o superior

**Paquetes NPM (dev) añadidos**
- `typescript`, `@types/node` para typecheck y build de `td-api`
- `rimraf` para limpieza cross-platform en Windows

## 3) Instalación y build (Trae / local)

Desde `touchdesigner/`:

```bash
npm install
npm run build
```

Notas:
- Se detectaron vulnerabilidades via `npm audit` (7 en el momento de la prueba). No se aplicó `npm audit fix` automáticamente para evitar cambios inesperados.

## 4) Configuración de conexión a TouchDesigner

El TOX `touchdesigner/toe/TouchDesignerAPI.tox` levanta un servidor HTTP dentro de TouchDesigner.

Variables:
- `TDAPI_PORT` (por defecto `44444`). Debe coincidir con el parámetro “Port” dentro del componente `TouchDesignerAPI.tox`.

Ejemplo PowerShell:

```powershell
$env:TDAPI_PORT="44444"
```

## 5) Verificación del servidor MCP (Claude Code / MCP)

El servidor MCP sigue disponible como antes:
- Entrada: `touchdesigner/mcp/dist/index.js`
- Configurado en [touchdesigner/.mcp.json]

Build:
```bash
npm run build
```

## 6) “Comandos desde este chat” con modelos alternativos

Se añadió un ejecutable CLI:
- `touchdesigner/mcp/dist/chat.js`
- `touchdesigner/mcp/dist/bench.js` (benchmark simple P50/P95)

Modo one-shot (recomendado para usarlo desde Trae):

```powershell
$env:TDAPI_PORT="44444"
$env:LLM_PROVIDER="anthropic"
$env:ANTHROPIC_API_KEY="..."
$env:ANTHROPIC_MODEL="claude-3-opus-20240229"
node .\mcp\dist\chat.js "Crea un Grid SOP dentro de /project1 y conéctalo a un Null SOP"
```

Gemini:

```powershell
$env:LLM_PROVIDER="gemini"
$env:GEMINI_API_KEY="..."
$env:GEMINI_MODEL="gemini-1.5-pro"  # o el nombre exacto del modelo que uses (p.ej. gemini-3.1-*)
node .\mcp\dist\chat.js "Lista los operadores en /"
```

Salida:
- El CLI devuelve JSON con:
  - `toolCall`: herramienta elegida + args
  - `llm.latencyMs`: latencia del modelo
  - `tdLatencyMs`: latencia HTTP contra TouchDesigner
  - `tdResult`: respuesta de TouchDesigner

Benchmark (múltiples iteraciones, ideal para comparar modelos):

```powershell
node .\mcp\dist\bench.js -n 30 "Lista los operadores en /" "Dime la selección actual"
```

## 7) Pruebas automatizadas (sin TouchDesigner)

Se añadieron pruebas con servidor HTTP simulado para:
- URLs / payloads de `TDClient`
- Ruteo LLM→tool y ejecución contra el servidor simulado

Ejecutar:

```bash
npm test
```

Log (capturado):

```text
> npm test
> npm run build && node --test

  mcp\dist\lib.js    707.8kb
  mcp\dist\index.js  701.1kb
  mcp\dist\chat.js   128.3kb

✔ runNaturalLanguageCommand: routes to td_pane (32.9991ms)
✔ runNaturalLanguageCommand: routes to td_execute with python code (10.716ms)
✔ TDClient: execute uses /execute and passes from_op when not root (38.2903ms)
✔ TDClient: getPaneState hits /editor/pane (8.2941ms)
✔ TDClient: getSelection hits /editor/selection (4.0358ms)
✔ TDClient: getOperators hits /operators with path param (4.9468ms)
ℹ pass 7
ℹ fail 0
ℹ duration_ms 193.9565
```

Typecheck:

```bash
npm run typecheck
```

## 8) Compatibilidad y errores resueltos

- Windows: `npm run clean` usaba `rm -rf` (no funciona en PowerShell). Se cambió a `rimraf`.
- Node ESM: `td-api` exportaba `./src/index.ts` (Node no ejecuta TS). Se cambió a exportar `./dist/index.js` y se agregó build `tsc` en `td-api`.

## 9) Cómo capturar evidencia (capturas y logs)

**Capturas de pantalla sugeridas**
- TouchDesigner: vista de red con el TOX cargado + red creada por el comando.
- Parámetros del componente `TouchDesignerAPI.tox` mostrando el puerto.
- Consola/TextoDAT donde se vea el resultado de ejecución si aplica.

**Logs**
- Conservar la salida del terminal donde se ejecute `node mcp/dist/chat.js ...`
- El JSON de salida ya incluye latencias (`llm.latencyMs`, `tdLatencyMs`).

**Métricas recomendadas por modelo**
- `llm.latencyMs`: P50/P95 sobre N ejecuciones (p.ej. N=30)
- `tdLatencyMs`: P50/P95 con TD local
- Tasa de error: % de ejecuciones con JSON inválido o tool incorrecta


