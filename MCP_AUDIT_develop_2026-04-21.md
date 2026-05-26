# Auditoria MCP `develop.toe`

Fecha: 2026-04-21  
Proyecto: `touchdesigner/toe/develop.toe`

## Alcance

- Validacion funcional del MCP HTTP activo en TouchDesigner.
- Pruebas de interpretacion de prompts y planificacion de redes.
- Verificacion de manejo de errores y estabilidad bajo carga.
- Correcciones de arquitectura en la capa Python y TypeScript.
- Preparacion de automatizacion para reorganizar layout y documentacion interna.

## Resumen ejecutivo

- Se corrigio un bug critico de exploracion recursiva en el API Python que hacia que `find`, `connections` y parte de `healthcheck` devolvieran resultados incompletos.
- Se mejoro la robustez del router MCP al parsear JSON devuelto por el LLM incluso si viene envuelto con texto adicional.
- Se optimizo el planner con cache del catalogo y seeds semanticos para mejorar recall en prompts POP.
- Se detecto un warning real de cook dependency loop en `/project1/TouchDesignerAPI/webserver1`.
- Se detecto un fallo critico de estabilidad: bajo rafagas de carga el puerto `44444` deja de escuchar y el servidor queda inaccesible.
- Se dejaron dos scripts listos para ejecutar cuando el server vuelva a estar activo:
  - `touchdesigner/scripts/run_live_audit.mjs`
  - `touchdesigner/scripts/apply_develop_layout.mjs`
- Tras reabrir `develop.toe`, se repitio la auditoria en vivo, el puerto volvio a responder y el layout/documentacion se aplicaron correctamente dentro de `/project1/TouchDesignerAPI`.

## Pruebas ejecutadas

### MCP en vivo

- `getPaneState()`:
  - Resultado: `networkPath = /project1`
- `getSelection()`:
  - Resultado: seleccion activa sobre `/project1/TouchDesignerAPI`
- `getOperators('/project1')`:
  - Resultado: encuentra `TouchDesignerAPI`
- `findOperators({ query: 'api' })`:
  - Antes del fix: `results = []`
  - Despues del fix: devuelve `TouchDesignerAPI` y sus nodos internos
- `getConnections('/project1', true)`:
  - Antes del fix: solo devolvia `/project1`
  - Despues del fix: devuelve toda la jerarquia interna
- `healthcheck('/project1', true)`:
  - Detecta 1 issue real en `webserver1`
- `setParameters(..., transactional:false)`:
  - Resultado: devuelve `missing` sin romper la sesion
- Carga paralela sobre `/find`:
  - Con una rafaga alta, el puerto `44444` termina en `ECONNREFUSED`
  - Tras reabrir `develop.toe`, una rafaga controlada de `20` requests a `/find` termino con `20/20` exitos sin caida del puerto

### Planner de prompts

- Prompt: `crear un sistema POP con particle pop y field pop`
  - Resultado: detecta `Particle POP` y `Field POP`
- Prompt: `haz un sistema de particulas con feedback loop y color`
  - Antes del fix: solo detectaba `Feedback POP`
  - Despues del fix: detecta `Particle POP` y `Feedback POP`
- Prompt ambiguo: `noise top con feedback y null`
  - Resultado: todavia mezcla varias familias
  - Estado: no es un crash, pero sigue siendo un caso ambiguo a resolver con ranking semantico adicional

### Suite automatizada local

- `npm test`
  - Resultado final: `12/12` pasando

### Layout y documentacion interna

- `node .\\scripts\\apply_develop_layout.mjs`
  - Resultado: aplicado correctamente sobre `/project1/TouchDesignerAPI`
- Validacion posterior:
  - se crearon `DOC_Overview`, `DOC_CriticalParameters`, `DOC_Dependencies`, `DOC_Notes`, `doc_builder` y `doc_auto_update`
  - los cuatro DATs contienen documentacion poblada
  - `doc_auto_update` quedo activo

## Hallazgos

### 1. Critico - inestabilidad del servidor bajo carga

- Sintoma:
  - rafagas de requests terminan en `ECONNREFUSED`
  - el puerto `44444` deja de escuchar
- Causa raiz:
  - el `webserverDAT` queda fragil bajo carga y ya existia un warning de cook dependency loop en el mismo componente
- Evidencia:
  - `healthcheck` reporta warning en `/project1/TouchDesignerAPI/webserver1`
  - `Test-NetConnection` posterior devuelve `TcpTestSucceeded: False`
- Solucion tecnica propuesta:
  - aislar `webserver1` de cualquier loop de cook
  - agregar rate limiting o cola de peticiones
  - mover trabajo pesado fuera del callback HTTP
  - añadir health-restart automatizado del componente servidor

### 2. Alto - exploracion recursiva rota en el API Python

- Sintoma:
  - `find`, `connections` y `healthcheck` no recorrían correctamente el arbol
- Causa raiz:
  - dependencia en `findChildren(depth=99)` sin una enumeracion manual estable
- Solucion aplicada:
  - se implemento `_iter_descendants()` con recursion por `children` y deduplicacion
- Impacto:
  - ahora las tools ven la red real y no solo el contenedor raiz

### 3. Alto - planner demasiado literal para prompts POP

- Sintoma:
  - prompts conceptuales de particulas resolvian solo una parte del sistema
- Causa raiz:
  - matching lineal por texto y escasa expansion semantica
- Solucion aplicada:
  - cache del catalogo
  - frases semanticas derivadas de alias y conceptos
  - seeds para `Particle POP` y `Feedback POP`
- Impacto:
  - mejora visible del recall para prompts POP frecuentes

### 4. Medio - validacion HTTP insuficiente en `/find`

- Sintoma:
  - `limit=bad` devolvia `500`
- Causa raiz:
  - uso directo de `int(...)` sin validacion
- Solucion aplicada:
  - helper `_parse_positive_int()` y respuesta `400 Bad Request`

### 5. Medio - rollback parcial en `parameters/set`

- Sintoma:
  - rollback transaccional podia no restaurar bien expression/value
- Causa raiz:
  - restauracion incompleta del estado del parametro
- Solucion aplicada:
  - captura mas completa del estado y restauracion de `expr`/`value`

### 6. Medio - parser JSON fragil en el router MCP

- Sintoma:
  - si el modelo devolvia texto extra alrededor del JSON, el router podia fallar
- Causa raiz:
  - extraccion basada en primer `{` y ultimo `}`
- Solucion aplicada:
  - parser incremental por balance de llaves con soporte de strings escapados

### 7. Bajo - test demasiado rigido sobre la base POP

- Sintoma:
  - el test esperaba `parameters.length > 0` para `Particle_POP`
- Causa raiz:
  - algunos docs actuales se enriquecen por `localNotes` mas que por parametros parseados
- Solucion aplicada:
  - el test ahora valida contenido estructurado real, no solo parametros

## Cambios aplicados

- API TouchDesigner:
  - `touchdesigner/toe/src/TouchDesignerAPI.py`
- Planner MCP:
  - `touchdesigner/mcp/src/networkPlanner.ts`
- Resolucion semantica:
  - `touchdesigner/mcp/src/semantic.ts`
- Router MCP:
  - `touchdesigner/mcp/src/commandRunner.ts`
- Tests:
  - `touchdesigner/mcp/test/commandRunner.test.js`
  - `touchdesigner/mcp/test/popsQuery.test.js`
- Scripts operativos:
  - `touchdesigner/scripts/run_live_audit.mjs`
  - `touchdesigner/scripts/apply_develop_layout.mjs`

## Estado de layout y documentacion interna

- Estado actual:
  - script aplicado en vivo sobre `/project1/TouchDesignerAPI`
- Script listo:
  - `touchdesigner/scripts/apply_develop_layout.mjs`
- Lo que hara al ejecutarse:
  - reorganiza los nodos internos de `TouchDesignerAPI`
  - crea DATs `DOC_Overview`, `DOC_CriticalParameters`, `DOC_Dependencies`, `DOC_Notes`
  - crea `doc_builder` y `doc_auto_update`
  - actualiza automaticamente la documentacion cuando cambian hijos o parametros criticos

## Estado final validado

- `find`, `connections`, `parameters`, `healthcheck` y el planner MCP quedan funcionales en la sesion reabierta.
- La red interna de `TouchDesignerAPI` ya tiene layout jerarquico y agrupacion documental.
- Las cajas informativas autoactualizables quedaron creadas y verificadas en vivo.
- Permanece 1 issue operativo pendiente:
  - warning de cook dependency loop en `/project1/TouchDesignerAPI/webserver1`

## Proximo paso recomendado

1. Corregir el cook dependency loop de `/project1/TouchDesignerAPI/webserver1`.
2. Repetir:

```bash
node .\scripts\run_live_audit.mjs
```

3. Confirmar con `healthcheck` que `issueCount = 0` y aumentar gradualmente la carga para validar estabilidad sostenida.
