---
title: "Corrección de Color Avanzada"
category: "color"
difficulty: "intermediate"
keywords: ["color", "correction", "grade", "lookup", "lut", "level", "hsv", "curves"]
duration: "45 min"
requires_td: true
---

# Corrección de Color Avanzada

Domina técnicas profesionales de corrección y gradación de color usando Level TOP, Lookup TOP, HSV Adjust TOP y Grade TOP en TouchDesigner.

## Requisitos

- TouchDesigner (cualquier licencia)
- Conocimientos básicos de TOPs
- Imagen o video de referencia

## Paso 1: Corrección primaria con Level TOP

1. Crea un **Movie In TOP** con tu footage
2. Conecta un **Level TOP** y nómbralo `level_correccion`
3. Configura para corrección primaria:
   - Pre: `0.02` (recortar negros, eliminar ruido de base)
   - Post: `0.98` (recortar blancos, evitar clipping)
   - Gamma: `1.0` (dejar neutro por ahora)
   - Gain R/G/B individual: ajusta según balance de blancos de tu footage

### Lectura del histograma
1. Conecta un **Analyze TOP** después de `level_correccion`
2. Modo: `Histogram`
3. Analiza si hay picos en sombras, medios tonos o altos
4. Ajusta Pre/Post para distribuir el rango uniformemente

## Paso 2: Ajuste con HSV Adjust TOP

1. Conecta un **HSV Adjust TOP** después del Level TOP
2. Nómbralo `hsv_ajuste`
3. Parámetros creativos:
   - Hue Shift: `0` (neutro, o anima con LFO)
   - Saturation: `1.2` (saturación ligera)
   - Value: `1.0` (brillo general)
   - Contrast: `1.15` (contraste adicional)
4. Activa "Preserve Luma" para mantener el brillo al saturar

## Paso 3: Curvas de color con Lookup TOP

1. Conecta un **Lookup TOP** después de HSV
2. Nómbralo `lookup_curvas`
3. Opciones de LUT:
   - Usa LUTs incorporados de TouchDesigner
   - Carga tu propio archivo .cube (3D LUT)
   - Intensity: `0.7` para mezcla suave
4. Para LUTs creativos:
   - Prueba "Night" para escenas oscuras
   - "Bleach Bypass" para look cinematográfico
   - "Warm" / "Cool" para temperatura de color

## Paso 4: Gradación final con Grade TOP

1. Conecta un **Grade TOP** al final de la cadena
2. Nómbralo `grade_final`
3. Ajustes profesionales:
   - Lift (sombras): `(0.02, 0.01, 0.03)` — tinte sutil en sombras
   - Gamma (medios): `(1.0, 0.95, 1.05)` — corrección de medios tonos
   - Gain (altos): `(1.0, 1.0, 1.0)` — balance de blancos
   - Offset: `(0, 0, 0)` — brillo general
4. Usa valores pequeños — la gradación profesional es sutil

## Paso 5: Máscaras selectivas

Para corregir áreas específicas:

1. Crea un segundo Level TOP para máscara
2. Usa un **Over TOP** o **Composite TOP** con Blend Mode
3. Técnica de máscara:
   ```
   [Source] → [Level (mascara)] → [Composite (Multiply)] → [Output]
                 ↓
         [Lookup (color warm)]
   ```
4. Ajusta solo el cielo, piel o fondos específicos

## Paso 6: Animación de color

1. Conecta un **LFO CHOP** al Hue Shift de HSV Adjust
2. Frecuencia: `0.05` (cambio lento)
3. Rango: `-0.1` a `0.1` (sutil desplazamiento)

## Cadena completa recomendada

```
[Source] → [Level TOP] → [HSV Adjust TOP] → [Lookup TOP] → [Grade TOP] → [Output]
              ↑                                              ↑
        Corrección primaria                          Gradación final
```

## Consejos profesionales

- **Look reference**: Ten una imagen de referencia al lado mientras gradas
- **Scopes**: Usa Analyze TOP en modo Vectorscope/Waveform para precisión
- **Subtlety**: La buena gradación es casi imperceptible
- **Presets**: Crea tu propia colección de LUTs .cube
- **Log footage**: Si usas footage Log, aplica un LUT de conversión primero
- **False color**: Usa un Level TOP con modo "False Color" para exponer correctamente
