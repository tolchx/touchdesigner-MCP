# Gate de cobertura de tests (backlog item 12)

**Comando:** `npm run ci` (raíz) → `node mcp/scripts/ci.mjs`.

Corre **las dos patas de tests** del repo y **falla (exit 1)** si algún test falla o si la
cobertura de cualquiera de las patas queda por debajo de su piso. La salida es legible a propósito:
una línea por paso con PASS/FAIL y los números medidos, más un veredicto final.

```
════ COVERAGE CI ════
  PASS  [node] typecheck api/tsconfig
  PASS  [node] typecheck mcp/tsconfig
  PASS  [node] node --test (c8) — tests — pass 1351 / fail 0
  PASS  [node] coverage floor lines>=63 branches>=81 functions>=75 — lines 63.17%
  PASS  [py] python -m unittest discover tests — Ran 532 tests
  PASS  [py] coverage floor (product code, .coveragerc fail_under=44) — product coverage 44%
  PASS  thresholds: Node lines>=63 branches>=81 functions>=75 · Python product>=44 (coverage.py)
  verdict: PASS
```

## Qué mide cada pata

| Pata | Comando dentro del gate | Herramienta | Piso |
|---|---|---|---|
| Node/TS | `npx c8 --check-coverage -- node --test test/*.test.js` (en `mcp/`) | **c8** (coverage V8) | líneas 63 · ramas 81 · funciones 75 |
| Python | `python -m coverage run --parallel-mode -m unittest discover tests` + `combine` + `report` | **coverage.py** (ya en la máquina, 7.15.2) | 44% **solo producto** (`fail_under` en `.coveragerc`) |

### Por qué el piso Python mide solo producto

`discover tests` ejecuta tanto tests como código de producto (`mcp_server_stdio.py`, el `w2t_server.py`
de los subprocess, `toe/src/TouchDesignerAPI.py`, el checker del baseline POP). Si el denominador
incluye los propios tests, el total se inflaba a **76%** con tests que se cubren a sí mismos al 85–99%.
El gate mide el subconjunto de producto declarado en `.coveragerc` (`report.include`):

| Archivo de producto | Stmt | Miss | Cobertura medida |
|---|---|---|---|
| `mcp_server_stdio.py` | 185 | 1 | 99% |
| `w2t_codec.py` | 30 | 5 | 83% |
| `scripts/check_pop_matrix_baseline.py` | 118 | 50 | 58% |
| `toe/src/TouchDesignerAPI.py` | 2469 | 1493 | 40% |
| `w2t_server.py` | 278 | 174 | 37% |
| **TOTAL producto** | **3080** | **1723** | **44%** |

Lo bajo de `TouchDesignerAPI.py` y `w2t_server.py` es deuda conocida: los handlers async de
`w2t_server` y las rutas que exigen TD vivo no son ejercitables offline (mismo diagnóstico del
bloque histórico de `run_coverage.ps1`).

### Por qué c8 y no el reporter nativo de Node

En Node v22.17.1 el reporter nativo `node --test --experimental-test-coverage
--test-coverage-lines=99` **reporta** la cobertura pero **no fuerza el exit code**: verificado con un
probe limpio (test verde con una línea sin cubrir → 90.91% < 99 → exit 0, tanto en el reporter spec
como con `--test-reporter=tap`). c8 con `--check-coverage` sí devuelve exit != 0 al pisar el umbral.
La verificación nativa quedó pendiente para versiones futuras de Node; el gate usa c8 (^12, devDep
del workspace `mcp`).

## Umbrales: método

Fijados el **24/09/26 midiendo el árbol real** y redondeando hacia abajo apenas lo justo:
verde hoy, rojo ante cualquier regresión (cualquier línea nueva sin cubrir baja el % y tumba el gate).
Nada de números aspiracionales.

- **Node (medido con c8 sobre la suite completa, 1351 tests):** 63.17% stmts / 63.17% líneas ·
  81.65% ramas · 75.25% funciones → piso **63 / 81 / 75**.
- **Python (medido con coverage.py, 532 tests, subconjunto producto):** 44% → piso **44**.

Los umbrales viven en un solo lugar por pata y hay que mantenerlos sincronizados al subirlos:
- Node: `const THRESHOLDS = { lines: 63, branches: 81, functions: 75 }` en `mcp/scripts/ci.mjs`
  (reutilizado por `cd mcp && npm run coverage`).
- Python: `fail_under = 44` en `.coveragerc`.

## Prueba de FAIL forzado (24/09/26, resultado real)

1. Se editó `THRESHOLDS.lines` a `99` en `mcp/scripts/ci.mjs`.
2. `npm run ci` → exit **1** con:
   ```
     PASS  [node] node --test (c8) — tests — pass 1351 / fail 0
     FAIL  [node] coverage floor lines>=99 branches>=81 functions>=75 — lines 63.17%
     FAIL  thresholds: Node lines>=99 ... · Python product>=44 (coverage.py)
     verdict: FAIL
   ```
   (los tests siguen en PASS y solo el piso tumba el veredicto — es el comportamiento buscado).
3. Se restauró `lines: 63` → `npm run ci` → **exit 0**, `verdict: PASS`.

Para el lado Python el mecanismo es el `--fail-under` nativo de coverage.py: verificado aparte con
`--fail-under=45` sobre el total 44% → `Coverage failure: total of 44 is less than fail-under=45`,
exit 2.

## Límites honestos

- El piso Python (44%) es bajo porque el denominador incluye `TouchDesignerAPI.py` (40%) y
  `w2t_server.py` (37%), cuyo grueso exige TD vivo. El gate frena regresiones, no certifica calidad;
  subirlo de verdad requiere suites offline nuevas sobre esos handlers, no mover un número.
- La pata Node mide lo que `node --test test/*.test.js` ejecuta: `mcp/dist/**` + helpers del repo
  que esos tests importan. No mide los bundles esbuild del raíz ni el `webapp`.
- El gate corre offline por diseño (TD no es requisito de CI); la verificación contra TD vivo sigue
  en el nightly (`td-nightly.yml`) y en las suites `*_live`.
- `npm run ci` reemplaza al runner previo `node mcp/test_ci.mjs` (que solo hacía typecheck + smoke y
  no ejecutaba ninguna de las dos patas reales). El archivo queda para uso manual.
