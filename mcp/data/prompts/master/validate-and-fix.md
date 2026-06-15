---
id: "validate-and-fix"
title: "Validación y corrección automática de errores TD"
project_type: "validacion"
complexity: "basico"
application: "cualquier_proyecto"
touchdesigner_min_version: "2022"
hardware: "cualquier_GPU"
performance: "overhead mínimo"
validation:
  - "validate_td retorna ok:true"
  - "Sin NameError en expresiones"
  - "GLSL compila correctamente"
  - "Sin cook dependency loops"
---

# Prompt maestro: {{title}}

## Objetivo
Después de CUALQUIER modificación a un proyecto TD, ejecutar un pipeline de validación que detecte errores automáticamente y los corrija cuando sea posible.

## Pipeline de validación

### 1) Force Cook
```python
node = op('{{target_path}}')
node.cook(force=True)
```

### 2) Healthcheck
```python
errors = node.errors(recurse=False) if hasattr(node, 'errors') else ''
warnings = node.warnings(recurse=False) if hasattr(node, 'warnings') else ''
```

### 3) Auto-Fix (errores comunes)
```python
# Fix: sin/cos/tan -> math.sin/math.cos/math.tan
for par in node.pars():
    if par.expr:
        for fn in ['sin', 'cos', 'tan', 'sqrt', 'pow', 'abs']:
            old = f'{fn}('
            new = f'math.{fn}('
            if old in par.expr and new not in par.expr:
                par.expr = par.expr.replace(old, new)
```

### 4) Re-validate
```python
node.cook(force=True)
final_errors = node.errors(recurse=False) if hasattr(node, 'errors') else ''
result = {"ok": not bool(final_errors), "errors": str(final_errors)}
```

### 5) GLSL Check (si hay GLSL POPs)
```python
for child in node.children:
    if child.OPType == 'glslPOP':
        info = op(f'{child.path}/glsl1_info')
        if info and 'Error' in info.text:
            result["glsl_errors"].append(info.text[:200])
```

## Checklist de validación

Para cada modificación:
1. [ ] Force cook del operador modificado
2. [ ] Healthcheck recurse
3. [ ] Auto-fix de expresiones con sin/cos sin math.
4. [ ] GLSL compilation check (si aplica)
5. [ ] Conexiones verificadas (no inputs faltantes)
6. [ ] Re-validate después del fix

## Salida esperada
```json
{
  "ok": true,
  "errors_fixed": ["sin -> math.sin in rx"],
  "warnings_remaining": [],
  "glsl_status": "all compiled"
}
```
