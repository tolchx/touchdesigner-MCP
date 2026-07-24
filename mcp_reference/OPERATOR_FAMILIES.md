# TouchDesigner Operator Families — Referencia Completa

> **Actualizado**: 2026-07-24  
> **Autor**: Buffy (Freebuff AI)

TouchDesigner organiza todos sus operadores en **7 familias** (también llamadas familias de operadores). Cada familia procesa un tipo de dato distinto y tiene su propio color y comportamiento.

---

## Las 7 Familias

| Familia | Color | Tipo de Dato | Constante Python | Docs |
|---------|-------|--------------|------------------|------|
| **COMP** | 🔵 Azul | Contenedores de redes | `td.COMP` | [Category:COMPs](https://docs.derivative.ca/Category:COMPs) |
| **TOP** | 🟢 Verde | Imágenes / GPU | `td.TOP` | [Category:TOPs](https://docs.derivative.ca/Category:TOPs) |
| **CHOP** | 🟡 Amarillo | Canales numéricos / audio | `td.CHOP` | [Category:CHOPs](https://docs.derivative.ca/Category:CHOPs) |
| **SOP** | 🟠 Naranja | Geometría 3D (legacy) | `td.SOP` | [Category:SOPs](https://docs.derivative.ca/Category:SOPs) |
| **POP** | 🔴 Rojo | Puntos / partículas / GPU | `td.POP` | [Category:POPs](https://docs.derivative.ca/Category:POPs) |
| **DAT** | 🟣 Violeta | Texto / tablas / datos | `td.DAT` | [Category:DATs](https://docs.derivative.ca/Category:DATs) |
| **MAT** | ⚪ Gris | Materiales / shaders | `td.MAT` | [Category:MATs](https://docs.derivative.ca/Category:MATs) |

---

## COMP (Component) — Contenedores

Los COMPs son contenedores que pueden albergar redes internas de operadores. Se usan para:
- Organizar y agrupar redes complejas
- Crear sistemas 3D (cámaras, luces, geometría)
- Construir interfaces de usuario (paneles)
- Aislar procesos (Engine COMP)
- Importar/exportar assets (FBX COMP, USD COMP)

### Lista completa de COMPs

| tdOpTypeGuess | pageTitle | URL |
|--------------|-----------|-----|
| `actorCOMP` | Actor COMP | [Docs](https://docs.derivative.ca/Actor_COMP) |
| `ambientLightCOMP` | Ambient Light COMP | [Docs](https://docs.derivative.ca/Ambient_Light_COMP) |
| `animationCOMP` | Animation COMP | [Docs](https://docs.derivative.ca/Animation_COMP) |
| `annotateCOMP` | Annotate COMP | [Docs](https://docs.derivative.ca/Annotate_COMP) |
| `baseCOMP` | Base COMP | [Docs](https://docs.derivative.ca/Base_COMP) |
| `blendCOMP` | Blend COMP | [Docs](https://docs.derivative.ca/Blend_COMP) |
| `boneCOMP` | Bone COMP | [Docs](https://docs.derivative.ca/Bone_COMP) |
| `bulletSolverCOMP` | Bullet Solver COMP | [Docs](https://docs.derivative.ca/Bullet_Solver_COMP) |
| `buttonCOMP` | Button COMP | [Docs](https://docs.derivative.ca/Button_COMP) |
| `cameraBlendCOMP` | Camera Blend COMP | [Docs](https://docs.derivative.ca/Camera_Blend_COMP) |
| `cameraCOMP` | Camera COMP | [Docs](https://docs.derivative.ca/Camera_COMP) |
| `constraintCOMP` | Constraint COMP | [Docs](https://docs.derivative.ca/Constraint_COMP) |
| `containerCOMP` | Container COMP | [Docs](https://docs.derivative.ca/Container_COMP) |
| `engineCOMP` | Engine COMP | [Docs](https://docs.derivative.ca/Engine_COMP) |
| `environmentLightCOMP` | Environment Light COMP | [Docs](https://docs.derivative.ca/Environment_Light_COMP) |
| `fbxCOMP` | FBX COMP | [Docs](https://docs.derivative.ca/FBX_COMP) |
| `fieldCOMP` | Field COMP | [Docs](https://docs.derivative.ca/Field_COMP) |
| `forceCOMP` | Force COMP | [Docs](https://docs.derivative.ca/Force_COMP) |
| `geoTextCOMP` | Geo Text COMP | [Docs](https://docs.derivative.ca/Geo_Text_COMP) |
| `geometryCOMP` | Geometry COMP | [Docs](https://docs.derivative.ca/Geometry_COMP) |
| `glslCOMP` | GLSL COMP | [Docs](https://docs.derivative.ca/GLSL_COMP) |
| `gltfInCOMP` | GlTF In COMP | [Docs](https://docs.derivative.ca/GlTF_In_COMP) |
| `gltfOutCOMP` | GlTF Out COMP | [Docs](https://docs.derivative.ca/GlTF_Out_COMP) |
| `handleCOMP` | Handle COMP | [Docs](https://docs.derivative.ca/Handle_COMP) |
| `impulseForceCOMP` | Impulse Force COMP | [Docs](https://docs.derivative.ca/Impulse_Force_COMP) |
| `lightCOMP` | Light COMP | [Docs](https://docs.derivative.ca/Light_COMP) |
| `listCOMP` | List COMP | [Docs](https://docs.derivative.ca/List_COMP) |
| `nullCOMP` | Null COMP | [Docs](https://docs.derivative.ca/Null_COMP) |
| `nVIDIAFlexSolverCOMP` | NVIDIA Flex Solver COMP | [Docs](https://docs.derivative.ca/NVIDIA_Flex_Solver_COMP) |
| `nVIDIAFlowEmitterCOMP` | NVIDIA Flow Emitter COMP | [Docs](https://docs.derivative.ca/NVIDIA_Flow_Emitter_COMP) |
| `oPViewerCOMP` | OP Viewer COMP | [Docs](https://docs.derivative.ca/OP_Viewer_COMP) |
| `parameterCOMP` | Parameter COMP | [Docs](https://docs.derivative.ca/Parameter_COMP) |
| `replicatorCOMP` | Replicator COMP | [Docs](https://docs.derivative.ca/Replicator_COMP) |
| `selectCOMP` | Select COMP | [Docs](https://docs.derivative.ca/Select_COMP) |
| `sharedMemInCOMP` | Shared Mem In COMP | [Docs](https://docs.derivative.ca/Shared_Mem_In_COMP) |
| `sharedMemOutCOMP` | Shared Mem Out COMP | [Docs](https://docs.derivative.ca/Shared_Mem_Out_COMP) |
| `sliderCOMP` | Slider COMP | [Docs](https://docs.derivative.ca/Slider_COMP) |
| `tableCOMP` | Table COMP | [Docs](https://docs.derivative.ca/Table_COMP) |
| `textCOMP` | Text COMP | [Docs](https://docs.derivative.ca/Text_COMP) |
| `timeCOMP` | Time COMP | [Docs](https://docs.derivative.ca/Time_COMP) |
| `usdCOMP` | USD COMP | [Docs](https://docs.derivative.ca/USD_COMP) |
| `widgetCOMP` | Widget COMP | [Docs](https://docs.derivative.ca/Widget_COMP) |
| `windowCOMP` | Window COMP | [Docs](https://docs.derivative.ca/Window_COMP) |

**Total COMPs: 43**

### COMPs más usados en el código del proyecto

| COMP | Uso |
|------|-----|
| `baseCOMP` | Contenedor genérico para organizar redes (sandboxes de tests) |
| `geometryCOMP` | Renderiza geometría 3D con materiales |
| `containerCOMP` | Panel UI container |
| `engineCOMP` | Ejecuta .tox en proceso separado |
| `cameraCOMP` | Cámara 3D para la escena |
| `windowCOMP` | Ventana flotante para output |

---

## MAT (Material) — Materiales

Los MATs definen cómo se renderiza la geometría 3D. Se aplican a la geometría mediante el parámetro "Material" de un Geometry COMP.

### Lista completa de MATs

| tdOpTypeGuess | pageTitle | URL |
|--------------|-----------|-----|
| `constantMAT` | Constant MAT | [Docs](https://docs.derivative.ca/Constant_MAT) |
| `depthMAT` | Depth MAT | [Docs](https://docs.derivative.ca/Depth_MAT) |
| `glslMAT` | GLSL MAT | [Docs](https://docs.derivative.ca/GLSL_MAT) |
| `inMAT` | In MAT | [Docs](https://docs.derivative.ca/In_MAT) |
| `lineMAT` | Line MAT | [Docs](https://docs.derivative.ca/Line_MAT) |
| `nullMAT` | Null MAT | [Docs](https://docs.derivative.ca/Null_MAT) |
| `outMAT` | Out MAT | [Docs](https://docs.derivative.ca/Out_MAT) |
| `pbrMAT` | PBR MAT | [Docs](https://docs.derivative.ca/PBR_MAT) |
| `phongMAT` | Phong MAT | [Docs](https://docs.derivative.ca/Phong_MAT) |
| `pointSpriteMAT` | Point Sprite MAT | [Docs](https://docs.derivative.ca/Point_Sprite_MAT) |
| `selectMAT` | Select MAT | [Docs](https://docs.derivative.ca/Select_MAT) |
| `switchMAT` | Switch MAT | [Docs](https://docs.derivative.ca/Switch_MAT) |
| `wireframeMAT` | Wireframe MAT | [Docs](https://docs.derivative.ca/Wireframe_MAT) |

**Total MATs: 13**

### MATs más usados en el código del proyecto

| MAT | Uso |
|-----|------|
| `phongMAT` | Material estándar con specular, transparencia, rim lights |
| `pbrMAT` | Material físicamente realista (PBR) |
| `glslMAT` | Material con shaders GLSL personalizados |
| `constantMAT` | Color sólido sin iluminación |
| `pointSpriteMAT` | Renderizado de partículas |
| `lineMAT` | Renderizado de alambres/líneas |

---

## TOP (Texture Operator) — Imágenes

Procesamiento de imágenes en GPU. **148 operadores** documentados.

### TOPs clave

| Tipo | Descripción |
|------|-------------|
| `noiseTOP` | Ruido procedural (Perlin, Simplex, etc.) |
| `blurTOP` | Desenfoque gaussiano / box / etc. |
| `levelTOP` | Ajuste de niveles (negros, blancos, gamma) |
| `compositeTOP` | Compositing multicapa (add, multiply, over, etc.) |
| `transformTOP` | Transformaciones 2D (traslación, rotación, escala) |
| `glslTOP` | Shader GLSL personalizado |
| `constantTOP` | Color sólido |
| `nullTOP` | Terminador de red (no procesa) |
| `outTOP` | Output del COMP |
| `inTOP` | Input del COMP |
| `movieFileInTOP` | Carga video/ imagen desde archivo |
| `movieFileOutTOP` | Exporta video/ imagen a archivo |
| `feedbackTOP` | Feedback loop (acumulación de frames) |
| `displaceTOP` | Desplazamiento / warp de imagen |
| `chromaKeyTOP` | Keying por color (green screen) |

**Documentación completa**: [mcp/data/ops/operators/TOP/](https://docs.derivative.ca/Category:TOPs)

---

## CHOP (Channel Operator) — Canales

Datos numéricos, audio, animación, lógica. **171 operadores** documentados.

### CHOPs clave

| Tipo | Descripción |
|------|-------------|
| `noiseCHOP` | Ruido procedural en canales |
| `lfoCHOP` | Oscilador de baja frecuencia |
| `mathCHOP` | Operaciones matemáticas entre canales |
| `audioFileInCHOP` | Carga archivo de audio |
| `audioDeviceInCHOP` | Entrada de micrófono |
| `countCHOP` | Contador de samples |
| `nullCHOP` | Terminador de red |
| `mergeCHOP` | Fusiona múltiples CHOPs |
| `lookupCHOP` | Tabla de consulta |
| `timerCHOP` | Temporizador |
| `clockCHOP` | Reloj / tiempo |

**Documentación completa**: [mcp/data/ops/operators/CHOP/](https://docs.derivative.ca/Category:CHOPs)

---

## SOP (Surface Operator) — Geometría

Geometría 3D tradicional. **114 operadores** documentados.

### SOPs clave

| Tipo | Descripción |
|------|-------------|
| `boxSOP` | Caja / cubo |
| `sphereSOP` | Esfera |
| `circleSOP` | Círculo |
| `gridSOP` | Grid / plano |
| `mergeSOP` | Fusiona geometría |
| `transformSOP` | Transforma geometría |
| `nullSOP` | Terminador de red |
| `textSOP` | Texto 3D |
| `fontSOP` | Fuente para texto |
| `carveSOP` | Corta / recorta curvas |

**Documentación completa**: [mcp/data/ops/operators/SOP/](https://docs.derivative.ca/Category:SOPs)

---

## POP (Point Operator) — Puntos / Partículas

Manipulación de puntos, partículas y primitivas en GPU. **102 operadores** documentados.

### POPs clave

| Tipo | Descripción |
|------|-------------|
| `boxPOP` | Caja de puntos fuente |
| `spherePOP` | Esfera de puntos fuente |
| `circlePOP` | Círculo de puntos fuente |
| `gridPOP` | Grid de puntos fuente |
| `particlePOP` | Sistema de partículas |
| `noisePOP` | Ruido en atributos de puntos |
| `trailPOP` | Estela de partículas |
| `transformPOP` | Transforma puntos |
| `glslPOP` | Shader GLSL para POPs |
| `nullPOP` | Terminador de red |
| `renderPOP` | Renderiza POPs a TOP |
| `sOPtoPOP` | Convierte SOP a POP |
| `tOPtoPOP` | Convierte TOP a POP |

**Documentación completa**: [mcp/data/pops/operators/](https://docs.derivative.ca/Category:POPs)

---

## DAT (Data Operator) — Texto / Datos

Texto, scripts, tablas, JSON, XML. **74 operadores** documentados.

### DATs clave

| Tipo | Descripción |
|------|-------------|
| `textDAT` | Texto / código |
| `tableDAT` | Tabla de datos |
| `executeDAT` | Script ejecutable |
| `scriptDAT` | Script DAT |
| `infoDAT` | Información de un operador |
| `nullDAT` | Terminador de red |
| `inDAT` | Input del COMP |
| `outDAT` | Output del COMP |
| `jsonDAT` | Parseo JSON |
| `webDAT` | Petición web |
| `webSocketDAT` | WebSocket cliente |
| `mergeDAT` | Fusiona DATs |

**Documentación completa**: [mcp/data/ops/operators/DAT/](https://docs.derivative.ca/Category:DATs)

---

## Errores Conocidos y Soluciones

### ❌ `audioinCHOP` no existe
Usar **`audioDeviceInCHOP`** en su lugar.
```python
# MAL:
src = parent.create(td.audioinCHOP, 'audio_in')  # Error!

# BIEN:
src = parent.create(td.audioDeviceInCHOP, 'audio_in')
```

### ❌ `glsl1MAT` no se crea con `create()`
Los materiales GLSL se crean como `glslMAT` (sin número).
```python
# MAL:
mat = parent.create(td.glsl1MAT, 'my_shader')  # Error!

# BIEN:
mat = parent.create(td.glslMAT, 'my_shader')
```

### ❌ Conexiones POP→CHOP fallan
`particlePOP.outputConnectors[0].connect(noiseCHOP)` da error.
**Solución**: Usar `POPtoCHOP` como puente entre familias.
```python
bridge = parent.create(td.pOPtoCHOP, 'pop_to_chop')
bridge.inputConnectors[0].connect(particle)
noiseCHOP.inputConnectors[0].connect(bridge)
```

### ❌ Conexiones POP→TOP fallan
Similar a POP→CHOP, necesitás un `POPtoTOP` como puente.

### ❌ Parámetros con nombres incorrectos
Siempre leer los parámetros con `/parameters` ANTES de setearlos.
```python
# Leer primero:
params = td.get_json(f"/parameters?path={op_path}")
# Luego setear:
td.post_json("/parameters/set", {"path": op_path, "params": {"amp": 0.5}})
```

---

## Reglas para Agentes AI

1. **Nunca adivinar nombres de parámetros** — siempre usar `/parameters` para leerlos
2. **Usar `.outputConnectors[0].connect(dst)`** para conectar (NO `.outputs[0].connect()`)
3. **Conexiones multi-output**: compositeTOP tiene inputs `[0]=top A, [1]=top B, [2]=top C`
4. **Familia MAT**: no se conecta como TOP/SOP/CHOP — se asigna al parámetro `material` del Geometry COMP
5. **COMPs no se conectan como otros operadores** — las conexiones son jerárquicas (contenido interno)
6. **POPs requieren `outputattrs='P'`** para GLSL POP, y `uniform float u_time;` declarado manualmente
7. **Todas las 7 familias** existen: COMP (🔵), TOP (🟢), CHOP (🟡), SOP (🟠), POP (🔴), DAT (🟣), MAT (⚪)
8. **Verificar siempre con `/verify`** después de crear/conectar operadores

---

## Archivos de Datos

| Archivo | Contenido |
|---------|-----------|
| `mcp/data/ops/index.json` | Índice maestro de TOP, CHOP, SOP, DAT, COMP, MAT |
| `mcp/data/pops/index.json` | Índice de POPs |
| `mcp/data/ops/operators/*/` | Detalles individuales por operador (TOP, CHOP, SOP, DAT) |
| `mcp/data/pops/operators/` | Detalles individuales por POP |
| `mcp/data/reference/python-api-classes.json` | Clases Python de la API de TD |
| `mcp/data/reference/pop-parameters.json` | Parámetros de POPs |

> **⚠️ Nota**: COMP y MAT no tienen directorios de datos individuales (`mcp/data/ops/operators/COMP/` o `mcp/data/ops/operators/MAT/`) aún. Solo existen sus entradas en el índice principal. Para documentación detallada, referirse a los links oficiales de Derivative en las tablas de este documento.
