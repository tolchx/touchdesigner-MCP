---
title: "Validación de Errores Post-Modificación"
category: "validation"
difficulty: "intermediate"
keywords: ["healthcheck", "errors", "validation", "debugging", "cooking"]
duration: "10 min"
requires_td: true
---

# Validación de Errores Post-Modificación

Mecanismo permanente para detectar y corregir errores automáticamente después de cada modificación en TouchDesigner.

## Flujo de validación

```
Modificar TD → Force Cook → Healthcheck → ¿Errores? → Fix → Re-check
```

## Script de validación rápida

Ejecuta esto después de CUALQUIER modificación vía MCP:

```python
import json

def validate_td(path="/project1", recurse=True):
    """Valida una red TD y reporta errores."""
    results = {"ok": True, "errors": [], "warnings": []}
    
    target = op(path)
    if target is None:
        return {"ok": False, "error": f"Path not found: {path}"}
    
    # Force cook para detectar errores
    def check_node(node, depth=0):
        if node is None or depth > 20:
            return
        try:
            node.cook(force=True)
        except:
            pass
        
        try:
            errors = node.errors(recurse=False)
            if errors:
                results["errors"].append({
                    "path": node.path,
                    "type": node.OPType,
                    "error": str(errors)[:200]
                })
                results["ok"] = False
        except:
            pass
        
        try:
            warnings = node.warnings(recurse=False)
            if warnings:
                results["warnings"].append({
                    "path": node.path,
                    "warning": str(warnings)[:200]
                })
        except:
            pass
        
        try:
            for child in node.children:
                check_node(child, depth + 1)
        except:
            pass
    
    check_node(target)
    return results

# Ejecutar validación
result = validate_td("/project1", recurse=True)
print(json.dumps(result, indent=2))
```

## Errores comunes y soluciones

### 1. `NameError: name 'sin' is not defined`
**Causa:** Usar `sin()` en vez de `math.sin()` en expresiones TD.
**Fix:** Reemplazar `sin(x)` → `math.sin(x)`, `cos(x)` → `math.cos(x)`

### 2. `AttributeError: 'X' object has no attribute 'Y'`
**Causa:** Parámetro incorrecto para el tipo de operador.
**Fix:** Verificar parámetros con `td_pars_get` antes de modificar.

### 3. `Cook dependency loop`
**Causa:** Operadores dependiendo de sí mismos directa o indirectamente.
**Fix:** Revisar conexiones, evitar loops de feedback sin `Feedback TOP/CHOP`.

### 4. `GLSL compilation error`
**Causa:** Error de sintaxis en shader GLSL.
**Fix:** Revisar `glsl1_info` para el mensaje de error exacto.

## Validación automática post-modificación

### Paso 1: Modificar
```python
# Tu modificación aquí
op('/project1/some_node').par.someparam = value
```

### Paso 2: Forzar cook
```python
op('/project1/some_node').cook(force=True)
```

### Paso 3: Validar
```python
result = validate_td("/project1/some_node")
if not result["ok"]:
    print("ERRORES:", json.dumps(result["errors"], indent=2))
else:
    print("OK - sin errores")
```

### Paso 4: Si hay errores, fix automático
```python
# Fix común: sin -> math.sin
node = op('/project1/problematic_node')
for par in node.pars():
    if par.expr and 'sin(' in par.expr and 'math.sin' not in par.expr:
        par.expr = par.expr.replace('sin(', 'math.sin(')
```

## Checklist de validación

Antes de confirmar cualquier cambio:
- [ ] `validate_td(path)` retorna `"ok": true`
- [ ] GLSL compila (`glsl1_info` dice "Compiled Successfully")
- [ ] Sin cook dependency loops en healthcheck
- [ ] Conexiones correctas (no inputs faltantes)
- [ ] Parámetros con valores válidos (no NaN, no undefined)

## Tips

- **Siempre** ejecutar `cook(force=True)` antes de leer errores
- Los errores pueden estar cacheados — forzar cook los limpia
- `healthcheck` con `recurse=true` cubre toda la red
- Para debugging específico, usar `td_get_errors` tool del MCP
