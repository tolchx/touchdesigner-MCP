# Changelog

## 2026-09-12 — GLSL POP offline docs + tests (commit `b98c7d2`)

- `tests/test_glsl_pop_offline.py`: reescrito desde cero, un solo bloque `GLSLSyntaxChecker`, 19 tests offline (OK).
- `docs/GLSL_POP_RULES.md`: 6 reglas verificadas en vivo en TD 2025.32460 + ejemplo completo P+Cd+custom con parámetros del nodo, citando la wiki oficial y `toe/src/test_glsl_pops.py`.

Las 3 reglas que requieren TD (compile real, infoDAT, component counts reales) quedan como documentación + verificación en vivo, no como tests offline. El checker offline es una ayuda de análisis, no un compilador.
