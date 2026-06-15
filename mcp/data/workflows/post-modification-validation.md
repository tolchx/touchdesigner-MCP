---
title: "Validación Post-Modificación"
category: "validation"
difficulty: "intermediate"
keywords: ["healthcheck", "validation", "debugging", "error-fix", "automation"]
duration: "3 min"
requires_td: true
---

# Validación Post-Modificación

Workflow automático para detectar y corregir errores después de cada cambio en TD.

## Red de validación

```
[Modify] → [Force Cook] → [Healthcheck] → [¿OK?] → [Done]
                                │              │
                                ▼              ▼
                          [Collect Errors]  [Report Success]
                                │
                                ▼
                          [Auto-Fix Common Issues]
                                │
                                ▼
                          [Re-Validate]
```

## Script rápido (ejecutar después de cada cambio)

```python
import json

def quick_validate(path):
    t = op(path)
    if t is None: return {"ok": False, "error": "not found"}
    t.cook(force=True)
    errs = t.errors(recurse=False) if hasattr(t, 'errors') else ''
    warns = t.warnings(recurse=False) if hasattr(t, 'warnings') else ''
    return {"ok": not bool(errs), "errors": str(errs)[:300], "warnings": str(warns)[:200]}

def auto_fix_sin(node_path):
    """Fix sin() -> math.sin() in all expressions."""
    node = op(node_path)
    fixed = []
    for par in node.pars():
        if par.expr and 'sin(' in par.expr and 'math.sin' not in par.expr:
            par.expr = par.expr.replace('sin(', 'math.sin(')
            fixed.append(par.name)
        if par.expr and 'cos(' in par.expr and 'math.cos' not in par.expr:
            par.expr = par.expr.replace('cos(', 'math.cos(')
            fixed.append(par.name)
    return fixed

# Usage
result = quick_validate("/project1/animated_torus/anim_box")
print(json.dumps(result))
```

## Errores auto-fixeables

| Error | Fix automático |
|-------|---------------|
| `sin()` not defined | → `math.sin()` |
| `cos()` not defined | → `math.cos()` |
| `tan()` not defined | → `math.tan()` |
| `sqrt()` not defined | → `math.sqrt()` |
| `pow()` not defined | → `math.pow()` |

## Errores que requieren intervención manual

| Error | Acción |
|-------|--------|
| Cook dependency loop | Revisar conexiones circulares |
| GLSL compile error | Revisar shader en glsl1_info |
| Missing input | Conectar operador faltante |
| Invalid parameter | Verificar nombre y tipo del par |
