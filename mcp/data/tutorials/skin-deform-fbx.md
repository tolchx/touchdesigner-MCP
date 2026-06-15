---
title: "Deformación de Piel con FBX y POPs"
category: "pops"
difficulty: "advanced"
keywords: ["fbx", "skinning", "deform", "skeletal", "animation", "pops", "character", "rigging"]
duration: "40 min"
requires_td: true
---

# Deformación de Piel con FBX y POPs

Importa modelos FBX con esqueleto, aplica skin deformation usando POPs y renderiza personajes animados. Cubre importación FBX, jerarquía esquelética, deformación de piel y blend shapes.

Basado en el patrón SkinDeformPOP.

## Requisitos

- TouchDesigner (licencia con POPs)
- Archivo FBX con esqueleto y skinning
- Conocimientos básicos de POPs

## Arquitectura del sistema

```
fbx1 (COMP) → importselect (mesh, animation, weights)
    → skindeform1 (deformación con esqueleto)
    → blend (blend shapes)
    → geoCOMP → renderTOP
```

## Paso 1: Importar el FBX

1. Crea un **fbx COMP** (nómbralo `fbx1`)
   - File: `personaje.fbx`
   - Esto crea la jerarquía esquelética completa
2. Crea un **text DAT** (`fbx1_callbacks`) para manejar la importación:

```python
# Callbacks de FBX import
def onImportEnd(fbx):
    print(f"FBX imported: {fbx.path}")
    # Listar meshes disponibles
    for child in fbx.children:
        print(f"  - {child.name} ({child.type})")
```

3. Configura un **parent shortcut** (`FBX`) para acceso rápido al FBX

## Paso 2: Extraer geometría del mesh

1. Crea un **importselect POP** (nómbralo `mesh`)
   - Source: `fbx1`
   - Import Target: `mesh` (nombre del mesh en el FBX)
   - Esto extrae la geometría del personaje
2. Crea otro **importselect** (`animation`)
   - Source: `fbx1`
   - Import Target: `animation`
   - Esto extrae los datos de animación

## Paso 3: Jerarquía esquelética

El FBX crea una jerarquía completa de nulls para el esqueleto:

```
Humanoid_Root
├── Hips
│   ├── Spine
│   │   ├── Spine1
│   │   │   ├── Spine2
│   │   │   │   ├── Neck
│   │   │   │   │   └── Head
│   │   │   │   ├── LeftShoulder
│   │   │   │   │   └── LeftArm
│   │   │   │   │       └── LeftForeArm
│   │   │   │   │           └── LeftHand
│   │   │   │   └── RightShoulder
│   │   │   │       └── RightArm
│   │   │   │           └── RightForeArm
│   │   │   │               └── RightHand
│   ├── LeftUpLeg
│   │   └── LeftLeg
│   │       └── LeftFoot
│   └── RightUpLeg
│       └── RightLeg
│           └── RightFoot
```

## Paso 4: Configurar skin deformation

1. Crea un **skindeform POP** (nómbralo `skindeform1`)
   - Skeleton Root Path: `fbx1` (o el shortcut `FBX`)
   - Input 0: `mesh` (geometría del personaje)
   - Esto aplica la deformación de piel basada en los weights del FBX
2. Crea otro **skindeform POP** (`deform`)
   - Skeleton Root Path: `FBX` (shortcut)
   - Para deformación adicional o blend shapes

## Paso 5: Blend shapes

1. Crea un **importselect POP** (`default_weight`)
   - Source: `fbx1`
   - Import Target: `default_weight`
   - Take Type: `BlendShapes`
   - Esto extrae los pesos de blend shapes
2. Crea un **blend POP** (nómbralo `blend1`)
   - Input 0: `skindeform1`
   - Blend Attribute: `P` (posición)
   - Weight: conecta `default_weight`

## Paso 6: Animación

1. La animación viene del **importselect** `animation`
2. Configura:
   - Time Slice: `On` (actualizar cada frame)
   - Take: selecciona la animación del FBX
3. Crea un **timeslice CHOP** para sincronizar:
   - Sample Rate: `60`
   - Method: `Linear`

## Paso 7: Renderizar

1. Crea un **Geometry COMP** (`geo1`)
   - Conecta `blend1` (salida deformada)
2. Crea un **render TOP** (`render1`)
   - Resolution: `1280x720`
3. Crea un **phong MAT** (`phong1`)
   - Color: `(0.8, 0.6, 0.5)` (tono piel)
   - Specular: `0.3`
   - Aplica a `geo1`
4. Crea una **camera** y **light**:
   - Camera: posicionar para ver al personaje
   - Light: Directional, intensity `1.0`

## Paso 8: Debug y visualización

1. Crea un **popViewer** para ver la geometría POP
2. Conecta `skindeform1` al viewer
3. Verifica que los weights estén correctos:
   - Puntos rojos = alta influencia
   - Puntos azules = baja influencia

## Parámetros de deformación

| Parámetro | Efecto | Rango |
|-----------|--------|-------|
| `Skeleton Root Path` | Raíz del esqueleto | Path al fbx COMP |
| `Blend Weight` | Mezcla de blend shapes | 0.0 - 1.0 |
| `Time Slice` | Actualizar cada frame | On/Off |
| `Take` | Animación a reproducir | Nombre del take |

## Pesos de skinning

| Zona del cuerpo | Tipo de influencia | Notas |
|-----------------|-------------------|-------|
| Hips/Spine | Suave | Múltiples huesos |
| Manos/Pies | Firme | 1-2 huesos principales |
| Codos/Rodillas | Media | 2 huesos (flexión) |
| Hombros | Amplia | 3+ huesos |

## Solución de problemas

- **Mesh no aparece**: Verifica que el nombre del mesh en `importselect` coincida con el FBX
- **Deformación incorrecta**: Revisa los weights de skinning en el FBX original
- **Animación no reproduce**: Verifica que `animation` take exista en el FBX
- **Performance lenta**: Reduce polígonos del mesh o simplifica esqueleto

## Consejos

- El FBX debe tener **skinning weights** para que `skindeform` funcione
- Usa **importselect** para extraer datos específicos del FBX
- Los **blend shapes** permiten expresiones faciales
- Para personajes simples, 2000-5000 polígonos es suficiente
- Combina con **noise POP** para efecto de viento en ropa/cabello
- Usa **replicator** si necesitas múltiples instancias del personaje
