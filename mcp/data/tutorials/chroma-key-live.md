---
title: "Chroma Key en Vivo"
category: "keying"
difficulty: "advanced"
keywords: ["chroma key", "green screen", "keying", "live", "composite", "spill", "mask"]
duration: "50 min"
requires_td: true
---

# Chroma Key en Vivo

Técnicas profesionales de chroma key para producción en vivo usando Key TOP, Matte TOP, y composición avanzada en TouchDesigner.

## Requisitos

- TouchDesigner Pro (licencia Comercial o EDU)
- Cámara o video con fondo verde/azul
- Iluminación uniforme del chroma

## Paso 1: Configurar la entrada de video

1. Crea un **Video Device In TOP** para cámara en vivo
2. Nómbralo `camara_vivo`
3. Ajusta:
   - Resolution: `1920x1080` o la resolución de tu cámara
   - Format: `YUV` si está disponible (mejor para keying)
4. Alternativa: usa **Movie File In TOP** para footage pregrabado

## Paso 2: Corrección de color previa al key

1. Conecta un **Level TOP** antes del keyer — nómbralo `pre_key`
2. Ajustes para optimizar el key:
   - Pre: `0.01` (ligero recorte de negros)
   - Post: `0.99` (protege altos)
   - Gamma R: `1.0`
   - Gamma G: `1.1` (a veces ayuda con greenscreen)
   - Gamma B: `1.0`

## Paso 3: Keying con Key TOP

1. Conecta un **Key TOP** después de `pre_key`
2. Nómbralo `chroma_key`
3. Configuración básica:
   - Key Type: `Chroma Key` (o `Luma Key` si el fondo es más brillante)
   - Color: selecciona el color del chroma con el picker
   - Tolerance: `0.15` (ajusta gradualmente)
   - Softness: `0.1` (suaviza bordes)

### Ajuste fino
1. Activa "Show Mask" temporalmente para ver la máscara en blanco y negro
2. Ajusta Tolerance hasta que el fondo sea completamente negro
3. Ajusta Softness hasta que el sujeto sea blanco puro sin huecos
4. Desactiva "Show Mask" cuando esté listo

## Paso 4: Refinamiento de bordes con Matte TOP

1. Conecta un **Matte TOP** a la salida de alpha del Key TOP
2. Nómbralo `refinar_matte`
3. Configura:
   - Erode/Dilate: `1` (dilatar ligeramente para recuperar bordes)
   - Blur: `2` (suavizar bordes)
   - Gamma: `0.8` (endurecer o suavizar la transición)
   - Threshold: ajusta según necesidad

### Técnica de edge light wrap
1. Duplica el matte con un **Chop To**
2. Aplica un blur fuerte (`radius: 20`)
3. Úsalo como máscara para un borde luminoso alrededor del sujeto

## Paso 5: Eliminación de spill (reflejo verde)

1. Conecta un **Spill Suppress TOP** después del key
2. Nómbralo `spill_remove`
3. Configura:
   - Spill Color: el mismo color del chroma
   - Suppress: `0.7` (cantidad de supresión)
   - Range: `0.3` (rango de color afectado)

### Alternativa manual
Usa un **HSV Adjust TOP**:
1. Reduce Saturation en el rango del verde
2. Desplaza Hue ligeramente hacia magenta
3. Combina con Over TOP usando el matte como máscara

## Paso 6: Composición con fondo

1. Conecta el video keyeado a un **Composite TOP**
2. Nómbralo `composicion_final`
3. Configura:
   - Operation: `Over`
   - Source A: video chroma keyeado
   - Source B: fondo (imagen, video, o generativo)
   - Mask: salida del Matte TOP refinado

```
[video camara] → [Key TOP] → [Spill Suppress] → [Composite TOP] → Output
                      ↓                             ↑
              [Matte TOP] → [refinar] ── mask ─────┘
                                               ↑
                                     [Background TOP]
```

## Paso 7: Técnicas avanzadas

### Keying múltiple
1. Crea dos Key TOPs con colores diferentes (verde + azul)
2. Combínalos con un **Over TOP**
3. Útil para objetos con diferentes fondos

### Key + Luma para cabello
1. Key principal para el cuerpo
2. Luma Key adicional para cabello fino
3. Combina ambas máscaras con **Composite TOP (Multiply)**

### Desplazamiento de borde
1. Usa un **Displace TOP** en el borde del matte
2. Tipo: `Directional`
3. Amount: `0.005` (sutil desplazamiento para bordes orgánicos)

## Solución de problemas

| Problema | Solución |
|----------|----------|
| Bordes pixelados | Aumenta Softness en Key TOP y Blur en Matte TOP |
| Huecos en el sujeto | Reduce Tolerance o usa Luma Key complementario |
| Spill verde visible | Aumenta Suppress en Spill Suppress TOP |
| Fondo irregular | Iluminación uniforme; usa Level TOP pre-key |
| Cabello fino perdido | Combina con Luma Key |

## Consejos profesionales

- **Iluminación**: Una buena iluminación del chroma vale más que cualquier ajuste de software
- **Distancia**: Mantén al sujeto al menos 1.5m del fondo chroma
- **Previsualización**: Usa un **NDI In TOP** para recibir señal directa de cámara
- **Renderizado**: Usa **Render Pass TOP** para separar capas si haces keying en producción
- **Live preset**: Guarda todos los parámetros como preset para reutilizar en vivo
