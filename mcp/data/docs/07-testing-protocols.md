# Sistema de validación y testing

Objetivo: asegurar que redes generadas por prompts complejos sean estables, reproducibles y eficientes.

## 1) Validación de sintaxis y formato

- **LLM output (router/CLI)**: debe ser JSON único (sin markdown).
- **Scripts Python**: deben ser idempotentes y usar `from_op`/paths explícitos.
- **Prompts maestros**: validar frontmatter y secciones mínimas con `node touchdesigner/mcp/dist/promptLint.js`.

## 2) Chequeo de dependencias

- TouchDesigner 2025+.
- `TDAPI_PORT` configurado y coincidente con el TOX.
- Ollama (si aplica): `LLM_PROVIDER=ollama` y `OLLAMA_MODEL` instalado.

## 3) Pruebas funcionales (smoke tests)

Ejecutar un bloque `td_execute` de validación que confirme:

- operadores creados (paths)
- conexiones clave (especialmente feedback loops)
- atributos reservados presentes cuando aplica (p.ej. PartVel/PartForce)

## 4) Pruebas de rendimiento

- Conectar `Info CHOP` a operadores críticos (POP, TOP, COMP).
- Medir `cook_time` y `errors/warnings`.
- Aplicar presupuestos explícitos:
  - número de puntos
  - límites de partículas
  - resolución TOP
  - frecuencia de recook

## 5) Reportes de errores y fixes sugeridos

Formato recomendado para reportar fallos:

- Síntoma observable
- Operador/etapa afectada
- Causa probable (con evidencia)
- Fix sugerido (acción concreta)
- Verificación posterior
