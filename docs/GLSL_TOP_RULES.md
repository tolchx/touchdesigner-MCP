# Reglas GLSL TOP — verificadas en vivo

> **Fuente de verdad**: probes ejecutados en vivo el **2026-09-17** contra
> **TouchDesigner 2025.31760** (build `099` en `/info`) con el bridge del MCP en
> `127.0.0.1:44444`. Cada regla cita la evidencia que la funda. Reglas del vecino
> POP en `docs/GLSL_POP_RULES.md` (muchas NO trasladan: ver 4.3).
>
> Probes reproducibles: `toe/src/probe_glsl_top.py` (rondas A–F),
> `toe/src/probe_glsl_top2.py` (G–I), `toe/src/probe_glsl_top3.py` (J–L) + sondas
> ad-hoc M–Z del 17/09 (registro en el resumen de la sesión). Para re-verificar:
> `python toe/src/probe_glsl_top.py` con TD abierto.

## Regla 1 — Declaración de salida explícita

El pixel shader **no declara `out vec4 fragColor` automáticamente**: se escribe
completa en el código (o se usa el template que el propio glslTOP genera en su
DAT `*_pixel`).

```glsl
layout(location = 0) out vec4 fragColor;
void main(){ fragColor = vec4(vUV.st, 0.0, 1.0); }
```

- **Evidencia (A)**: shader con `layout(location = 0) out vec4 fragColor;` compila
  limpio. El infoDAT `probe_top_min_pixel` (template generado) lo usa igual.
- Sin la declaración: TD agrega automáticamente un output en glslTOP moderno,
  pero el patrón canónico seguro para código generado es declararla siempre.

## Regla 2 — `vUV` se swizzlea con `.st` o `.xy`, NUNCA con `.uv`

- **Evidencia (G)**: `vUV.st` ✓ compila · `vUV.xy` ✓ compila ·
  `vUV.uv` ✗ `'uv' : unknown swizzle selection` ·
  `vUV.uv1` ✗ `unknown swizzle selection` ·
  `vUV.texcoord` ✗ `'texcoord' : vector swizzle too long`.
- `vUV` es un `TDOutputSwizzle` de 4 componentes; `.st` y `.xy` son swizzles
  genéricos de vec4, no miembros nombrados. El hábito `vUV.uv` (frecuente en
  ejemplos de la web) **no compila** en el pixel shader del glslTOP.

## Regla 3 — Coordenadas y orientación (medidas con numpyArray)

- **Evidencia (A+B)**: shader `fragColor = vec4(vUV.st, 0, 1)` leído con
  `numpyArray()` dio R=0.698 en `first_row_left` y `last_row_right`, B=0.698 en
  `first_row_right` y `last_row_left`. Es decir: **fila 0 del array (numpy) ↔
  uv.y = 0**; R crece con uv.x hacia la derecha.
- `vUV.st` va de **0 a 1** en toda la imagen (256×256 → right_edge con u_scale=1
  ≈ 0.996 en 8-bit).

## Regla 4 — Diferencias con GLSL POP (no trasladar hábitos)

1. **El código va en DATs separados por stage**: `par.pixeldat` (pixel shader) y
   `par.vertexdat` (vertex shader) — **no existe `par.computedat`** en glslTOP
   (eso es del glslPOP). El glslTOP crea 3 infoDATs automáticamente:
   `<nombre>_info` (log de compilación), `<nombre>_pixel` (template del pixel
   shader), `<nombre>_compute` (template de compute shader). Evidencia (A): los
   tres presentes tras crear el nodo.
2. **No existe `outputattrs`** en glslTOP (listado real de pars con
   uniform/output/pixel/input/dat/access/format/resolution: `clearoutputs`,
   `computedat`... **falso**: ese listado inicial era del glslPOP; el listado real
   del glslTOP es `pixeldat`, `vertexdat`, `outputaccess`, `outputresolution`,
   `resolutionw/h`, `outputaspect`, `format`, `inputextenduv/w`,
   `inputfiltertype`, `inputmapping`, `loaduniformnames`, `clearvalue*`). Los
   outputs de un TOP son píxeles: `fragColor` siempre, sin creación de atributos.
3. **`outputaccess` existe pero su semántica difiere** (TOP: lectura del output
   en compute; verificar con compute antes de documentar más).

## Regla 5 — Uniforms: el mecanismo del glslTOP es `vec0*` / `const0*` / `matrix0*` / arrays CHOP

**NO existe `uniform0name`/`uniform0value`** en glslTOP (eso es del glslPOP).
- **Evidencia (D)**: `g.par.uniform0name = "u_scale"` →
  `tdAttributeError: 'td.ParCollection' object has no attribute 'uniform0name'`.
- Mecanismo real (dump de pars con uniform/value/const del nodo vivo):
  - `vec0name` + `vec0valuex/y/z/w` → `uniform vecN u_nombre`
  - `const0name` + `const0value` → `uniform float u_nombre`
    **CORRECCIÓN v1.2 (verificada en vivo 2026-09-17, `scripts/live/uniform_cross.py`):
    bajo creación scripteada `const0name/const0value` NO bindea** — el uniform
    `float` llega con valor 0 (círculo SDF degradado a pantalla blanca).
    Usar SIEMPRE la familia `vec0*` aunque el shader declare `uniform float`:
    el tipo del par mapea al uniform por NOMBRE y funciona
    (`float_via_vec0`: blancos 23–232 ≈ 0.42×256 exacto; `float_via_const0`:
    negros). `vec0name2/vec0valuex2` para un segundo uniform.
  - `matrix0value` → `uniform mat4 u_nombre`
  - `ac0name/ac0initvalue/ac0singlevalue/ac0chopvalue` → uniform alimentado por CHOP
  - `loaduniformnames` (pulse): reescanea el shader; **no crea pars nuevos**
    (E: `new_pars_after_pulse: []`).
- **Evidencia numérica (J)**: shader `uniform float u_scale;` +
  `vec0name="u_scale"`, `vec0valuex=0.5` → `right_edge_R = 0.498` (esperado 0.5),
  `left_edge_R = 0.0`. El uniform llegó al shader con el valor correcto.
- El `vec0valuex` inicial default es 0.5 (no 0.0) — no asumir ceros.

## Regla 6 — Resolución de salida

- **Evidencia (E)**: menú real de `outputresolution`:
  `["useinput", "eighth", "quarter", "half", "2x", "4x", "8x", "fit", "limit", "custom", "parpanel"]`.
  Con `custom` + `resolutionw=256, resolutionh=192` → `g.width/height = 256×192`
  exactos tras `cook(force=True)`.
- **Sin input**, el glslTOP arranca a **256×256** (A). **Con `useinput`** y la
  red animando, la salida sigue la resolución del input (N: al cambiar el noise a
  512×384 en vivo, la salida era 128×128 en la corrida M–N con timeline
  semi-pausada — la actualización de `useinput` depende de frames; con `custom`
  el tamaño es determinista inmediato).

## Regla 7 — Aspect-correct: usar `uTD2DInfos[0].res.zw` (o `.xy`)

- **Evidencia (C)**: `vec2 res = uTD2DInfos[0].res.zw;` compila y ejecuta
  (multiplicar el color por `res.x/256.0` produjo el valor esperado en el píxel
  central).
- **Evidencia (I)**: círculo aspect-correct sobre noise 320×240 con
  `p.x *= aspect` midió `white_span_horiz == white_span_vert` (164 px vs 164 px
  en la salida 256×192): el truco estándar `p.x *= res.x/res.y` funciona.
- Para el aspect de la **salida** (no del input), usar `uTDOutputInfo.res.zw`.

## Regla 8 — Inputs: `sTD2DInputs[i]` con `inputmapping`

- **Evidencia (C)**: `texture(sTD2DInputs[0], vUV.st)` compila y lee el noiseTOP
  conectado (center_pixel reflejó el contenido escalado del input).
- El mapeo input→sTD2DInputs[i] lo controla `inputmapping` (default
  "Inputs 0-3"); extenderlo si se usan más de 4 inputs (par presente en el
  listado de la Regla 4.2).
- Clamp en los bordes controlado por `inputextenduv` (`inputextendw` para la
  componente w).

## Regla 9 — El error real de compilación está en `<nombre_glsl>_info`

Igual que en POPs (Regla 5 POP): `op.errors()` solo dice
`"Warning: The GLSL Shader has compile errors (Use Info DAT to see details)"`.
El log con línea y columna está en el DAT `<nombre>_info`, con secciones
`Vertex Shader Compile Results` / `Pixel Shader Compile Results`.
- **Evidencia (A)**: `'uv' : unknown swizzle selection` apareció solo en el
  infoDAT, con número de línea del shader (`/project1/probe_top_shader:2`).
- Formato de línea: `ERROR: <ruta_del_DAT_de_codigo>:<linea>: <mensaje>`.

## Regla 10 — Feedback (TOP): el cableado compila pero NO avanza sin frames reales

- **Evidencia (K–Z, 17/09)**: glslTOP → feedbackTOP → glslTOP con shader
  `prev + 0.05` midió **0.051 constante** durante 8 cooks alternados
  (`fb.cook(force=True); g.cook(force=True)`), 6 re-wires, `npasses=1`, `run()`
  con `delayFrames`, hilo de fondo cada 16 ms, blinks de `op.viewer`,
  `local/time.par.play=True` — y **`fb.numpyArray()` dio todo ceros**: el buffer
  del feedbackTOP nunca capturó la salida (el swap del doble buffer no se
  compromete bajo cooking scripteado cuando la UI no renderiza frames).
- **Implicación para el MCP**: una red de feedback generada por script **compila
  y no tiene errores**, pero su contenido de historia queda en ceros hasta que
  TD renderiza frames reales (ventana activa / perform). Para validar feedback
  en suite: verificar wiring + compilación + ausencia de errores, y dejar el
  contenido de acumulación como verificación manual/visual. Alternativa sin
  feedbackTOP: ping-pong con dos glslTOP + selectTOP leyendo el output previo
  (pendiente de verificar en vivo).

## Regla 11 — `loaduniformnames` no crea parámetros (diff con POP)

En glslTOP el pulse `loaduniformnames` reescanea los nombres de uniforms
declarados en el shader pero **no genera parámetros dinámicos** visibles como
páginas nuevas (E: 79 pars totales, `uniform_page_pars: []` antes y después).
Los uniforms se setean por las familias `vec0*/const0*/matrix0*/ac0*` (Regla 5).

## Regla 12 — Lectura de píxeles para tests: `numpyArray()`

- **Evidencia (B)**: `g.numpyArray()` → `shape=(H, W, 4)`, valores float
  0..1 (8-bit normalizado: 0.698 = 178/255).
- Fila 0 ↔ uv.y=0 (Regla 3). Útil para asserts de suite: bordes, centro,
  spans de color (como el círculo aspect-correct de la Regla 7).

---

## Ejemplo completo (validado por partes en A, C, E, I y J)

Shader pixel (`textDAT` apuntado por `par.pixeldat`):

```glsl
// Círculo aspect-correct con uniform de escala (idioms TD verificados)
layout(location = 0) out vec4 fragColor;
uniform float u_scale;        // setear: vec0name='u_scale', vec0valuex=1.0

void main(){
    vec2 res = uTD2DInfos[0].res.zw;   // Regla 7: aspect del input
    vec2 p = vUV.st - 0.5;             // Regla 2: .st / .xy, nunca .uv
    p.x *= res.x / res.y;
    float d = length(p) * u_scale;
    float c = smoothstep(0.45, 0.40, d);
    fragColor = vec4(vec3(c), 1.0);
}
```

Parámetros del nodo (Python, nombres verificados en vivo):

```python
base = op('/project1')
code = base.create(td.textDAT, 'my_shader')
code.text = '<GLSL de arriba>'

g = base.create(td.glslTOP, 'my_glsl_top')
g.par.pixeldat = code.path          # Regla 4.1: pixeldat, NO computedat
g.par.outputresolution = 'custom'   # Regla 6
g.par.resolutionw = 1280
g.par.resolutionh = 720
g.par.vec0name = 'u_scale'          # Regla 5: mecanismo vec0*, NO uniform0name
g.par.vec0valuex = 1.0
g.nodeX = 0; g.nodeY = 0
g.cook(force=True)
print(g.errors())                    # vacío = compiló
# log real de compilación en op('/project1/my_glsl_top_info').text  (Regla 9)
```

## Fuentes y referencia

- Wiki oficial Derivative — *Write a GLSL POP / GLSL TOP*:
  https://docs.derivative.ca/Write_a_GLSL_POP · https://docs.derivative.ca/GLSL_TOP
  (la clase del nodo y su página de parámetros es la referencia canónica de
  `vec0*/const0*/matrix0*/ac0*`, `inputmapping`, `outputresolution`).
- *The Book of Shaders* (es): https://thebookofshaders.com/?lan=es — currículo de
  visuales (formas, noise, fBm, patrones, procesamiento de imágenes); sus shaders
  usan `gl_FragColor` GLSL crudo: traducir a los idioms de este doc (Reglas 1, 2, 7).
- Curriculum propio: https://tolchx.com/td-edu/ (módulo GLSL Shaders y POPs
  Academy) — para ingesta a la KB del MCP.
- Suite de referencia POP: `toe/src/test_glsl_pops.py` (14/14) — modelo para una
  futura suite `test_glsl_tops.py` usando `numpyArray()` (Regla 12) como assert.

## Tooling (MCP)

- **Analizador TOP**: `analyzeGlslTopShader()` / `preValidateTopShader()` en
  `mcp/src/tools/glslValidate.ts` — chequea Reglas TOP 1, 2, 4 (con el código de
  creación), 9 y 10 antes de llegar a TD (puro, sin I/O).
- **Recipes visuales**: `GLSL_TOP_RECIPES` + `buildGlslTopRecipeCode()` en
  `mcp/src/tools/glslTopRecipes.ts` — 7 recetas derivadas de conceptos de Book of
  Shaders (círculo SDF, value noise, fBm, grid, ripple, feedback trails,
  reaction-diffusion) reescritas en los idioms de este doc, con builder de
  Python para un solo `/exec` (creación + uniforms vec0 + cook + recreación
  automática si sale negro + lectura de píxeles). Tests:
  `mcp/test/glslTopRecipes.test.js` (18).
- **Tools MCP** (`mcp/src/tools/glslTopApply.ts`):
  - `td_glsl_top_analyze` — análisis estático + pre-validación TOP sin TD
    (T1/T2/T4/T9, mismo motor que el apply de POPs).
  - `td_glsl_top_recipe` — crea una recipe por id a través de la red de
    seguridad, con auto-recreación v1.1 y reporte de píxeles.
- **Verificación en vivo**: `python scripts/live/run_all.py` (crea y cocina las
  7 redes, guarda `scripts/live/live_reports.json`) y `python
  scripts/live/verify_visuals.py` (asserts a nivel de píxel: spans del círculo,
  transiciones de la grilla, varianza del noise, anillos del ripple, wiring de
  las dos de feedback). Corrida 17/09/26: 7/7 CLEAN + visual ALL OK sobre TD
  2025.31760.

## Historial

- **2026-09-17** — v1: 12 reglas verificadas en vivo (probes A–Z), TD
  2025.31760. Feedback marcado como limitación de cooking scripteado (Regla 10).
- **2026-09-17** — v1.1: analizador TOP + 7 recipes + verificación visual en
  vivo 7/7. Nota empírica nueva: un glslTOP creado por script puede quedar con
  output negro (sin errores de compilación ni de cook) si el shader se escribe
  en el DAT después de crear el nodo con uniforms seteados; al recrear el nodo
  con el DAT ya poblado el mismo shader produce el resultado esperado en el
  primer cook. Síntoma a vigilar en generadores (grupos de ops creados en lote
  seguidos de un cook único).
- **2026-09-17** — v1.2: tools MCP `td_glsl_top_analyze` y
  `td_glsl_top_recipe` (`mcp/src/tools/glslTopApply.ts`). Hallazgo nuevo que
  corrige la Regla 5: `const0name/const0value` NO bindea bajo creación
  scripteada — el builder ahora usa la familia `vec0*` para todos los
  uniforms y aplica auto-recreación (v1.1) si el primer cook sale negro.
  Evidencia: `scripts/live/uniform_cross.py` (float_via_vec0 OK /
  float_via_const0 negro) y aceptación de las 5 recipes estáticas vía el tool
  con píxeles verificados (círculo centro 1.0 / esquina 0.0).
