# GLSL POP — Reglas Verificadas en Vivo

Fuente autoritativa: [Write a GLSL POP — Derivative wiki](https://docs.derivative.ca/Write_a_GLSL_POP).  
Validadas en TouchDesigner 2025.32460. Suite de referencia: `toe/src/test_glsl_pops.py` (14/14).  
Nada de esto es suposición: cada regla se reprodujo contra el build real.

## Regla 1 — La salida no se lee

El atributo de salida `P` es WRITE-ONLY dentro del mismo shader. Escribir y leer `P` en el mismo `main()` da **Compile failed**:

```glsl
// COMPILE FAILED — lee P después de escribirlo
P[id] = P[id] * 1.001;
```

La forma que compila es leer desde la entrada (`TDIn_P`) y escribir en la salida (`P`), sin cruzar:

```glsl
P[id] = TDIn_P(0, id) * 1.001;   // compila
```

Regla general: nunca leer un atributo que también se escribe, salvo que se use `outputaccess='readwrite'` (ver regla 4).

## Regla 2 — Patrón canónico de iteración

Todo shader de GLSL POP debe iterar sobre los puntos con el par `TDIndex()` / `TDNumElements()`:

```glsl
void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    // ... trabajar sobre id ...
}
```

Omitir la guarda `if (id >= TDNumElements()) return;` puede causar acceso fuera de rango en la compilación del shader POP.

## Regla 3 — Attributos nuevos hay que crearlos explícitamente

**`outputattrs` solo selecciona atributos que YA EXISTEN en la entrada.** No sirve para crear uno nuevo.

Para escribir un atributo que no existe (Cd, N, un custom cualquiera), hay que crearlo con la página **Create Attributes** del glslPOP, no poniendo su nombre en `outputattrs` directamente.

Parámetros del nodo para crear un atributo nuevo:

| Parámetro | Valor |
|---|---|
| `attr0name` | `'Custom'` (no el nombre del atributo) |
| `attr0customname` | el nombre real: `'Cd'`, `'N'`, `'masa'`, etc. |
| `attr0numcomps` | número de componentes |

Componentes por atributo (validado contra el build):

| Atributo | Componentes |
|---|---|
| `Cd` | 4 (RGBA) |
| `N` | 3 (normal XYZ) |
| `uv` | 2 |
| float custom | 1 |

**`attr0name='Cd'` NO funciona** para crear Cd — la página espera `'Custom'` + `attr0customname='Cd'`.

## Regla 4 — Los atributos de salida son WRITE-ONLY

Si un shader lee un atributo que también escribe en el mismo `main()`, el compilador reporta:

```
'*' : can't read from writeonly object
```

Para poder leer un atributo que se escribe, usar `outputaccess='readwrite'` en el glslPOP. Ejemplo de patrón donde esto es necesario:

```glsl
void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    masa[id] = length(TDIn_P(0, id)) * 0.1;   // escribe masa
    P[id] = TDIn_P(0, id) * (1.0 + masa[id]); // lee masa → necesita outputaccess='readwrite'
}
```

Sin `outputaccess='readwrite'`, la lectura de `masa[id]` en la línea de `P[id]` falla.

## Regla 5 — El error real de compilación está en el infoDAT

Cuando un glslPOP falla al compilar, `op("...").errors()` solo devuelve **"Compile failed"** — sin el detalle real. El log del compilador está en el infoDAT autogenerado:

```
<nombre_glsl>_info
```

Ejemplo: si el glslPOP se llama `my_shader`, el infoDAT es `my_shader_info`. Leer ese DAT es la única forma de obtener el error real del compilador GLSL.

## Regla 6 — En la API de POP, numPoints / numPrims / bounds / points son MÉTODOS

En la API de Python de TouchDesigner (clase POP), estos son **métodos**, no propiedades:

```python
p.numPoints()   # correcto
p.numPrims()    # correcto
p.bounds()      # correcto
p.points()      # correcto
```

Usarlos como atributos (`p.numPoints`) devuelve un builtin y rompe comparaciones.

---

## Ejemplo completo — P + Cd + atributo custom (validado en vivo)

Este shader compila y produce geometría con color y atributo custom en TD 2025.32460.

Código GLSL:

```glsl
void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    P[id] = p;

    Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);

    customAttr[id] = length(p);
}
```

Parámetros del nodo glslPOP:

| Parámetro | Valor |
|---|---|
| `computedat` | path del DAT que contiene el código |
| `outputattrs` | `'P'` (solo lo que YA existe en la entrada) |
| `outputaccess` | (no necesario aquí — no se lee ningún atributo escrito) |

Create Attributes (página del glslPOP) — uno por atributo nuevo:

| attr0name | attr0customname | attr0numcomps |
|---|---|---|
| `'Custom'` | `'Cd'` | 4 |
| `'Custom'` | `'customAttr'` | 1 |

Setup Python mínimo (ver `toe/src/test_glsl_pops.py`):

```python
src = op('/project1').create(td.boxPOP, 'src')
src.par.sizex = 1
src.par.sizey = 1
src.par.sizez = 1

code = op('/project1').create(td.textDAT, 'shader_code')
code.text = """
void main(){
    const uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    P[id] = p;
    Cd[id] = vec4(1.0, 0.5, 0.0, 1.0);
    customAttr[id] = length(p);
}
"""

glsl = op('/project1').create(td.glslPOP, 'my_shader')
glsl.par.computedat = 'shader_code'
glsl.par.outputattrs = 'P'
glsl.nodeX = 0
glsl.nodeY = 0
```

Verificación en vivo (los tests lo hacen así):

```python
glsl.cook(force=True)
errors = glsl.errors()
num_points = int(glsl.numPoints())
num_prims = int(glsl.numPrims())
```

Si `errors()` está vacío y `numPoints() > 0`, el shader compiló y produce geometría.
