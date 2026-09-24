# TWOZERO (Discord) → qué copiar y qué evitar en TD-MCP

**Fecha:** 2026-09-24 · **Fuente:** servidor Discord TWOZERO (`1489238980942757908`) · **Método:** lectura directa del cliente web con sesión propia (tolch.x), canal por canal, con verificación de solapamiento de la lista virtualizada.
**Cobertura:** 486 mensajes de texto en 5 canales con contenido (`#questions-and-support` 236, `#general` 130, `#show-your-work` 70, `#bug-reports` 49, `#announcements` 1). `#feature-requests` y `#rules` están vacíos. Rango: 2026-04-09 → 2026-09-21.
**Límites declarados:** ~10 mensajes son solo imagen adjunta (no leídos); no pude abrir el panel de mensajes fijados; no toqué DMs.
**Raw + transcript:** `transcript.md`, `twH_*.json` (mismo directorio).

> Este documento no es una opinión: cada lección viene con la cita, el autor y la fecha. Las recomendaciones se anclan en herramientas y archivos concretos de este repo.

---

## 0. Resumen ejecutivo

TWOZERO construyó un plugin+MCP para TouchDesigner con una propuesta de valor que los propios usuarios articularon mejor que su marketing (hallazgo B). También acumuló, durante 5 meses y con 496 miembros, un catálogo de fallas de **integración local**: puerto que no bindea, indicador de estado que miente, historial que no carga, búsquedas que cuelgan TD, y una instalación que escribe dentro de la carpeta de TouchDesigner.

Nuestro sistema ya resuelve varias de esas cosas mejor que ellos (ver §9). Las nueve lecciones siguientes son las que **no** tenemos cubiertas o donde podemos endurecer.

| # | Hallazgo | Evidencia | Acción TD-MCP | Prio |
|---|---|---|---|---|
| A | Nunca asumir "conecta una sola vez": el cliente debe reintentar y el estado debe ser real | 6 reportes, 2 sin resolver por semanas | `td_healthchain` + reintento/cooldown en el cliente + estado que no miente | **P0** |
| B | El valor del MCP = contexto estructurado + viewer por OP, no screenshots de escritorio | 3 usuarios establecen el benchmark | Reforzar `td_screenshot` por path de OP y prohibir en el prompt del server el "pedime una captura" | **P0** |
| C | Búsquedas sin scope cuelgan TD | reporte confirmado por el equipo | `td_search`/`td_find`/`td_operators`: scope + presupuesto + timeout + error accionable | **P0** |
| D | El LLM no tiene noción de orden de magnitud (escala de parámetros) | reporte textual de un VJ | `td_measure` / muestreo en la entrada antes de fijar escalares | **P1** |
| E | Instalar tocando `Config/System` de TD rompe todas las sesiones | 3 usuarios, fix manual con `.toox` | Regla dura de instalación + auditoría de qué escribe nuestro instalador | **P0** |
| F | Error inofensivo y ruidoso genera desconfianza; falta el reporte con evidencia | textport AttributeError + "do you have logs anywhere?" | Envelope de error con contexto + `td_report_bug` | **P1** |
| G | Estado real ≠ "conectado": TD minimizado / cooking off / frozen | explicación técnica del equipo | Estado enriquecido `cooking` / `paused` / `minimized` | **P1** |
| H | Conocimiento destilado (MD) > RAG crudo, y pesa más que el modelo | usuario con RAG propio: "ahora es perfecto incluso con sonnet" | Priorizar recetas/pitfalls cortos y verificados por familia | **P1** |
| I | Actualización/versión invisibles; onboarding confuso | pregunta sin responder 3 días en el canal oficial | `td_get_info` con versiones + `td_check_updates` + quickstart de 1 pantalla | **P2** |

---

## 1. Hallazgo A — "Conecta una sola vez" es la falla raíz

**Lo que pasó.** El mismo síntoma durante 5 meses y 4 versiones de plugin: *el puerto 40404 nunca bindea*.

- `mykul0rr`, 2026-09-19: *"twozero will not work correctly with TD… loads cleanly in TD 2025.33230 (Textport shows `[loader] loaded /ui/dialogs/bookmark_bar/twozero`, no errors) but **never binds its MCP port**."*
- `mykul0rr`, 2026-09-21 (2 días después, sin respuesta del equipo): *"plugin versions tried: 3.269, 3.332, 3.333, 3.34 (all reproduce). Symptom: Port 40404 never binds, TWOZERO window permanently shows 'disconnected port 40404', despite Settings → MCP → Auto start = Yes, Local only = Yes, Port = 40404."*
- `MetaKan`, 2026-04-13: *"sometimes the server is unreachable. I need to turn off and turn on again the MCP."* → el ritual de reinicio es el workaround de facto.
- `Denne`, 2026-04-13: *"sometimes twozero starts in a different port for no reason and i have to restart it to get back on the default one."*
- `nin`, 2026-09-04: *"MCP logo bugged (keeps doing the animation thing), and **it does not gray out even it is turned off**."*
- `mykul0rr`, 2026-09-19: *"the red logo never turns grey — keeps active and cannot connect."*

**El diagnóstico del propio equipo** (`404.zero`, 2026-07-29) es el oro de todo esto:

> *"The connection issue is most likely just **timing**: Claude connects to the server only once, when the chat starts… [no retry]"* — y el "[✓ CONNECTED] indicator checks config, not live connection."

Y `rosco` (2026-07-28) describe el modo de falla silencioso: *"I am clicking the robot icon to try and launch the MCP server but **no textport output is generated, it just silently fails**."* El equipo responde con la pregunta que todo dev de MCP debería responderse solo: *"do you have logs generated anywhere?"*

**Traducción a TD-MCP.** Tres reglas no negociables para un puente MCP local:

1. **La conexión se re-verifica, no se asume.** Nuestro `api/src/index.ts` ya tiene `connectionTimeout` (3s), `requestTimeout` (30s), transportes `http|websocket|auto` y cooldown de 30s para reintentar el WS — está bien encaminado. Falta lo que sí le falta a twozero: **reintento transparente ante `ECONNREFUSED` en la primera llamada de cada turno**, no solo al construir el cliente.
2. **El estado que ve el humano debe ser el estado real.** Un indicador que lee config y no un ping es peor que no tener indicador: genera falsos positivos y quema horas de soporte.
3. **Una sola llamada que pruebe la cadena entera.** Hoy tenemos piezas sueltas (`td_healthcheck` mira los errores de la red en TD, `td_smoke_test`, `td_run_test`, `td_get_info`), pero ninguna que conteste *"¿puede el agente operar este TD ahora mismo?"* con evidencia. Propuesta:

```
td_healthchain()  →
{
  td_process:   "alive (2025.32460, pid 1234)",
  bridge_http:  "ok (127.0.0.1:44444, 12 ms)",
  tool_roundtrip: "ok (td_get_info 38 ms)",
  cooking:      "paused",            // ver Hallazgo G
  verdict:      "DEGRADED — TD no está cocinando; los cambios no se verán hasta reanudar",
  checked_at:   "2026-09-24T03:51:02-03:00"
}
```

**Cita para el README:** `Denne` (2026-04-13) *"i changed nothing, just sometimes claude tells me that it can't connect, i let it search for the problem and it says that twozero MCP server is currently running on a different port than 40404, if i reset everything turns back to normal."* — Un MCP que obliga a reiniciar el host para recuperarse está roto, haga lo que haga el resto.

---

## 2. Hallazgo B — La propuesta de valor la definieron los usuarios (y es exactamente nuestra tesis)

`thenftking3000` (2026-09-21 17:40) pregunta lo que todos preguntan:

> *"Can anyone explain why there would be any benefits to using twozero when Codex / Claude Code can control TouchDesigner via Desktop? What does twozero do that we can't do directly?"*

Las dos respuestas del hilo son el argumento de venta de cualquier MCP de TD — léelas como criterios de aceptación:

- `Danii`: *"There's **a lot more context in a much more friendly format** via the MCP with **the ability to get screenshots of specific operator viewers directly** versus needing to do whatever screenshot parsing process in the method you mentioned. Plus there's **a lot of data that's just simply not shown on desktop**."*
- `verygeeky`: *"adjusting a single parameter on a single OP is **4-5 screenshots plus the underlying text**. The MCP allows the LLM to interact directly with it, as if TD were 'just software'."* · *"Consumes less tokens for sure"* · *"and orders of magnitude faster."*

**Traducción a TD-MCP.**
- Nuestro `td_screenshot` ya acepta `path` de operador con default "current active pane" (`mcp/src/tools/ui.ts:21`): eso es exactamente el "specific operator viewer" que piden. **Hay que venderlo y forzarlo**: el server debe instruir explícitamente al LLM *"no pidas capturas de pantalla del escritorio; pedí el viewer del OP X"*. `404.zero` tuvo que corregir en el canal a un usuario por lo contrario: *"Latest twozero should not advice claude to make screenshots unless user is asking for."*
- **Test de aceptación** (medible, no opinable): para "cambiá el `gain` de `noise1` de 0.3 a 1.2", nuestra cadena debe resolverlo **sin ninguna imagen**. Si hace falta un screenshot para un `pars_set`, tenemos un agujero de contexto.

---

## 3. Hallazgo C — Búsquedas sin scope cuelgan el host

`verygeeky` (2026-04-27), reporte más citado del servidor:

> *"**td_search (or whatever the tool is called) will hang TD on a sufficiently large network.**"*

Confirmado por el equipo (`twozero-ai`, 2026-05-11): *"Confirmed, thanks for the report. td_search struggles on large networks. We push improvements daily but can't get to everything at once. **This is on the list.**"*

Y el workaround del usuario es un parche de documentación, no de código: *"claude.md additions **cautioning that unscoped td_search tool use with large networks may hang TD** is all it required. my workflow keeps me in the first 30-40% of the context window. i just save every time i /reset."*

**Traducción a TD-MCP.** Nosotros tenemos aún más superficie donde repetir este error: `td_search`, `td_find`, `td_operators`, `td_explore_project`, `td_snapshot_scene`, `td_compare_networks`, `td_knowledge_query`, `td_ops_query`, `td_pops_query`, `td_tdn_export`. Reglas:

1. **Scope obligatorio o default seguro:** sin `path`, la búsqueda arranca en `/project1` con profundidad acotada — nunca "todo el proyecto".
2. **Presupuesto duro:** `limit` + `max_nodes` + wall-clock (`AbortSignal`). Si se agota, **devolver lo que encontró + `truncated: true` + el mensaje accionable** (`"812 de 4000 nodos recorridos. Acotá con path='/project1/inst'."`). Nunca `null`, nunca cuelgue.
3. **Timeout que no dependa del host:** si TD no contesta en N ms, es error del bridge, no una espera del LLM.
4. Esto merece un test de regresión con una red grande sintética — es un caso de "no vuelve a pasar", no de "funciona".

---

## 4. Hallazgo D — "El LLM no tiene noción de orden de magnitud"

El mejor aporte técnico de todo el servidor, de `verygeeky` (2026-04-09), hablando de la limitación #1 de su flujo:

> *"the biggest problem has been **scale**. the llm has no sense of even an order of magnitude for some things. i've helped it by asking it to **sample at the input before determining scalars** for sliders/parameters exposed for a given OP… but it's still the main 'go fix' issue i've had."*

**Traducción a TD-MCP.** Los valores de TD no son genéricos: un `speed` de 0.01 y uno de 500 son ambos "válidos" y uno de los dos te da una pared negra. Tenemos `td_read_chop`, `td_get_perf`, `td_spatial_context`, `td_pop_inspect` — el patrón que falta es **una llamada de sondeo previa al dimensionamiento**:

```
td_measure(paths=[".../noise1"], sample="1s") →
{ "gain":  {"units":"unitless","observed":[0.28,0.31],"suggest":"0.0–1.0"},
  "speed": {"units":"cycles/sec","observed":0.02,"suggest":"≤0.05"},
  "res":   {"observed":[1920,1080]} }
```

Esto convierte "adiviná el número" en "medí y después fijá", que es literalmente el consejo del usuario que más horas le puso al plugin. Es un diferenciador real: ninguno de los dos MCP que la gente menciona (twozero, el de 8beeeaaat) lo tiene.

---

## 5. Hallazgo E — La instalación tocó la carpeta de TouchDesigner y rompió todo

El incidente más grave registrado en el servidor (2026-04-10 → 2026-07-16), y el único que provocó desinstalaciones:

- `Denne`: *"if i install the twozero **all my OP disappear**… i had to uninstall twozero"* y *"i installed twozero while i had functionstore tools active and now the ui of function store is bricked and glitched **in every project i open even if i dont have neither twozero and function store installed**, even if i open a blank file, i had to reinstall TD completely."*
- `vacuum`: *"Second this, looks like FunctionStoreTools get cached in **system UI component**? It breaks UI for any project that does not have it inside"* · *"yup, they update core ui tox for whole Touch installation"* → enlace a `twozero.ai/docs/admin-access`.
- `LumaLux`, 2026-07-16, con el mecanismo exacto: *"**the install step also writes a patched ui.tox into Config/System/ inside the TD program install**. On the next TD launch, that persisted patched file…"*
- `CodeNoctis` tuvo que arreglarlo a mano: *"go to the top most level of your project, right click → display → expose hidden OPs, save as new ui.toox and **replace it in `Program Files\Derivative\TouchDesigner.2025.32820\Config\System`**."*

**Traducción a TD-MCP.** Regla dura, escrita en `AGENTS.md` y verificable en CI:

> **Prohibido escribir en `Config/System` de la instalación de TouchDesigner, en `ui.tox`/`ui.toox` globales o en cualquier estado compartido entre proyectos.** Todo lo que instalamos es por proyecto, declarado y reversible; el desinstalador deja el host **byte-idéntico** a antes.

Nuestro lado TD es un `.tox` (`toe/TouchDesignerAPI.tox`, `mcp/setup/TouchDesigner_MCP_Server.tox`) — mucho más limpio que el approach de twozero (que metió un bookmark bar en `ui/dialogs`). **Auditar y documentar** qué escribe nuestro instalador, y agregar un test que verifique que después de instalar/desinstalar no cambia nada fuera del `.toe` del proyecto. Esta es la lección que más caro le costó a twozero en reputación: `thenftking3000` y `rosco` llegaron al punto de preguntar si era un virus (*"Has anyone had any issues with viruses?"*, *"how do we know you are not a virus?"*).

---

## 6. Hallazgo F — Error ruidoso e inofensivo + falta de evidencia en el reporte

Dos cosas separadas, ambas de `#bug-reports`:

**(a) El error que asusta y no es nada.** `meyg` y `rosco` reportaron un traceback en textport: `AttributeError: 'NoneType' object has no attribute…` en `kill_pending_quit()`. Respuesta del equipo: *"**it's a harmless leftover check, unrelated to the MCP server**"*. El usuario perdió días persiguiendo un fantasma. Un log debe distinguir `benign:` de `error:`.

**(b) El reporte sin evidencia.** El equipo tuvo que pedir **cinco veces** los mismos datos: *"Which td and twozero versions?"* · *"do you have logs generated anywhere?"* · *"Is it reproducible on the latest?"*. En el repo público (issue #4) los usuarios avanzados ya lo hacen bien: pegan versión de TD, versión del plugin, OS, y un log del cliente donde se ve `td_list_instances → success (6ms)`, `td_get_hints → success (50ms)`, `td_get_hints → HTTP connection dropped`. **El archivo de log del cliente es lo que convirtió un "no funciona" en un bug accionable.**

**Traducción a TD-MCP.**

1. **Envelope de error con contexto automático** en toda respuesta de error:
```
{ error: "bridge_unreachable",
  td: "2025.32460 (pid 1234)", mcp: "3.0.0", bridge: "127.0.0.1:44444",
  last_ok_call: "td_get_info @ 2026-09-24T03:44:11-03:00", benign: false,
  hint: "TD está abierto pero el puerto no responde: revisá Settings → MCP y el watchdog." }
```
2. **`td_report_bug`** — el patrón que `404.zero` construyó y que es genuinamente bueno: *"ask claude at the end of the bad session: 'bug report twozero about [describe what was unsuccessful, ask to attach any assets if required]'. **Claude will collect the logs**."* Nosotros ya tenemos `td_get_errors`, `td_history`, `td_get_info`, `td_snapshot_scene`, `td_perf_budget`: todo listo para empaquetar un ZIP con evidencia (versión, red, últimos N comandos, errores, log del bridge) y devolver el path.
3. **Log del cliente en archivo**, rotado, con las últimas 200 llamadas (tool, ms, resultado). Es lo que permitió el mejor bug report del servidor.

---

## 7. Hallazgo G — "Conectado" no es "operativo"

La explicación técnica de `404.zero` (2026-04-13) describe un estado que nuestro sistema tampoco modela:

> *"This usually means that your TD is completely stopped but MCP (that is running in a separate Engine process) is working and responding that TD is not cooking anything: for example **TD window is minimized**, **global cooking off** ([O|I] button), **TD froze**. But should not happen when TD is paused…"*

El usuario venía de un "no me conecta". El problema real era que TD no estaba cocinando. Nuestro `td_get_perf` devuelve FPS y cook budget, pero **un FPS de 0 con TD minimizado no es un dato, es una trampa** para un LLM que va a concluir "la red está rota y hay que reconstruirla".

**Traducción:** que `td_healthchain` / `td_get_info` devuelvan el motivo del estado, no solo el número:
`cooking: "off (TD minimizado)"` / `"paused (timeline detenido)"` / `"on"`. Y que el `hint` del LLM sea *"no edites la red: reanudá el cooking"*.

---

## 8. Hallazgos H e I — Conocimiento, versiones y onboarding

**H. Destilado > RAG.** `Denne` construyó su propio RAG de GLSL/TD y reportó: *"before using my rag system Claude couldn't create a refractive glsl MAT, **now it's perfect even with sonnet rather than opus**."* La respuesta del equipo es la tesis a favor de lo que ya hacemos: *"there are concerns about RAG in general. It seems **well structured and distilled mds work more efficiently and precisely**"* (`404.zero`). Y agrega el porqué del problema de fondo: *"Td and glsl is a kind of 'territory of uncertainty' which requires from Claude to solve unfamiliar puzzles."*

→ Nuestro `builderRecipes.ts` / `glslTopRecipes.ts`, con `GOTCHA:` por receta (ej. *"audiospectrumCHOP.timeslice MUST be True for real-time"*, *"particlesupdatepop es un parámetro POP, no una conexión"*), es exactamente el artefacto correcto. **Prioridad: más recetas cortas y verificadas por familia** (POP, GLSL TOP/MAT, DMX, POPs→GEO), no más documentación cruda. Un usuario llegó a decir que dos días alimentando transcripts de tutoriales le cambiaron el resultado (`Emu!`), y otro que combina "skills" para ahorrar tokens (`Ki.`: *"churning through my limits very quickly"*).

**I. Versionado y onboarding visibles.** `Ki.` (2026-08-11): *"is there a way to update if you've already installed or do you just need to download the tox again?"* → le contestó otro usuario recién 3 días después (*"Settings → Check updates. No need to re-download the tox"*), en el canal oficial de soporte. Y `in.hu.ma.ne` resume el caos de onboarding: *"so i installed tox, connected claude (pro) mcp, got the email code and all — **how do i test this?** make a folder create and save empty TD file and open claude code from that folder to chat? or keep td open and use claude cowork along windows mcp, or just chat with claude, **really confused**."* Pedidos de tutoriales en video: `Dean_LJ`, `daniel.b9938`, `escala_7_7` (tres, en 3 semanas).

→ `td_get_info` debe contestar en una sola llamada: versión del MCP, versión del `.tox`/bridge, build de TD, y compatibilidad (`td_get_build_compatibility` / `td_get_release_delta` ya existen). Más un quickstart de una pantalla con **el comando exacto de verificación** ("preguntá: *¿qué ves en mi TD?*") — el test que `thenftking3000` hizo por su cuenta y que le falló sin explicación: *"I've done all the steps and 'verified' yet when I ask Claude Code 'What do you see in my TD?' it doesn't / can't see anything and asks for screenshot."*

---

## 9. Lo que ya hacemos mejor (no romper)

Para no "arreglar" lo que está bien, lo verificado en nuestro repo:

| Área | Estado |
|---|---|
| Host del bridge | Normalizado a `127.0.0.1` con agente keep-alive, evita el stall IPv6 de `localhost` en Windows (`api/src/index.ts`) — exactamente el tipo de bug que twozero dejó suelto durante meses |
| Transporte | `http` / `websocket` / `auto` con cooldown de 30s para reintentar el WS |
| Timeouts | `connectionTimeout` 3s, `requestTimeout` 30s |
| Instalación | Componente TD es un `.tox` por proyecto (`toe/TouchDesignerAPI.tox`) — **a verificar formalmente**: no encontré rastro de escritura en `Config/System` ni en `ui.tox` global en una búsqueda parcial, pero el grep no terminó (repo muy grande). Es el punto 4 del P0 |
| Conocimiento | Recetas destiladas con `GOTCHA` por familia — lo que el propio equipo de twozero recomienda sobre RAG |
| Superficie | 105 herramientas, incluyendo `td_healthcheck`, `td_smoke_test`, `td_run_test`, `td_history`/`td_undo`, `td_perf_budget`, `td_verify_wiring`, `td_build_compatibility` |
| Watchdog | Ya existe un watchdog que levanta TD (cron diario) — el "auto-start" que a twozero le falló de forma no determinista |

## 10. Extra, no viene de Discord: inyección de código en el relay web

`w2t_server_async.py` arma código Python por concatenación de strings y lo manda a `/exec`:

```python
code = '... cid="{}"; ctype="{}"; cval="{}" ...'.format(id, type, value, timestamp)
```

Un `value` con `"` rompe el literal y ejecuta lo que venga detrás — y ese string puede originarse en un LLM. **Acción:** serializar con `json.dumps()` (o pasar los datos como payload estructurado) y nunca interpolar texto en código. Es independiente de TWOZERO, pero encaja con el hallazgo E/§6: un MCP local que escribe código en TD necesita el mismo rigor que un servidor web.

---

## 11. Plan propuesto

**P0 — antes de mostrar el sistema a un tercero**
1. `td_healthchain`: una llamada, veredicto único, incluye estado de cooking (§1, §7).
2. Reintento transparente + cooldown en la primera llamada de cada turno; log del cliente en archivo (§1, §6).
3. Scope + presupuesto + timeout + error accionable en las 10 herramientas de exploración; test de regresión con red grande (§3).
4. Auditoría de instalación: verificar que instalar/desinstalar no toca nada fuera del proyecto (§5).

**P1**
5. `td_measure` / muestreo previo al dimensionamiento de escalares (§4).
6. `td_report_bug` con ZIP de evidencia + envelope de error con contexto y flag `benign` (§6).
7. Estado enriquecido (`cooking` / `paused` / `minimized`) expuesto en `td_get_info` y `td_get_perf` (§7).
8. Revisión de recetas GLSL/POP destiladas: subir el conteo de `GOTCHA` verificados (§8).

**P2**
9. `td_get_info` con versiones completas + `td_check_updates`; quickstart de una pantalla con el comando de verificación (§8).
10. Endurecer `w2t_server_async.py` contra inyección (§10).

---

### Apéndice — citas y autores citados

`404.zero` / `twozero` / `twozero-ai` (equipo) · `verygeeky`, `Danii`, `mykul0rr`, `nin`, `MetaKan`, `Denne`, `rosco`, `meyg`, `thenftking3000`, `LumaLux`, `vacuum`, `CodeNoctis`, `Barbosa`, `Ki.`, `Emu!`, `in.hu.ma.ne`, `Dean_LJ`, `dima_znam`, `giorgio`, `javierm4`, `partario`, `disintegrationLoops`, `Brum`, `Fiesta-George`, `Liyieon.`, `Mark W.`, `Eternal_Blue`, `Samu`, `Jim`, `hyperphonic`, `kyphae`, `ABRAN`, `Stonys`, `Robnouss`, `Jordan Glenn`, `escala_7_7`, `ZUZAH`, `Morhaq`, `DRIFTKOP`, `Hesi`, `Karomm`, `niccab`, `CptGummyBearz`, `LumaLux`, `Emu!`.

Fuentes externas usadas: repo público `github.com/404dotzero/twozero-td-mcp` (issues #1, #3, #4) y `twozero.ai/docs/zops`.
