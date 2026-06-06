---
title: "Efecto Bloom Completo"
category: "glow"
difficulty: "beginner"
keywords: ["bloom", "glow", "brightness", "blur", "composite", "top"]
duration: "15 min"
requires_td: false
---

# Efecto Bloom Completo

El efecto bloom (resplandor) hace que las áreas brillantes de una imagen parezcan irradiar luz. Es un efecto clásico de post-procesamiento.

## Cómo funciona

El bloom se logra:
1. Extrayendo las áreas brillantes (threshold)
2. Desenfocándolas (blur)
3. Combinándolas con la imagen original (composite)

## Paso 1: Imagen de entrada

1. Crea cualquier fuente visual (un **Constant TOP**, **Movie File In TOP**, o **Noise TOP**)
2. Nómbrala `source`

## Paso 2: Extraer brillos

1. Conecta un **Level TOP** a `source`
2. En Pre/Post, establece Pre = `0.7` (esto aísla los píxeles más brillantes que 0.7)
3. Alternativamente usa un **Threshold TOP** con un valor bajo para el threshold

## Paso 3: Desenfocar

1. Conecta un **Blur TOP** al resultado del threshold
2. Configura:
   - Type: `Gaussian`
   - Radius X: 20
   - Radius Y: 20
3. Conecta otro **Blur TOP** (secundario, más pequeño)
   - Radius X: 5
   - Radius Y: 5
4. Mezcla ambos blurs con un **Composite TOP** (método Add) para un bloom más suave

## Paso 4: Componer

1. Conecta un **Composite TOP**
2. Input 0: `source` (la imagen original)
3. Input 1: el bloom (mezcla de blurs)
4. Method: `Add` o `Screen`
5. Ajusta Opacity entre 0.3 y 0.8 para controlar la intensidad

## Parámetros clave para experimentar

| Parámetro | Efecto |
|---|---|
| Pre (Level) | Qué tan brillante debe ser algo para brillar |
| Blur Radius | Qué tan lejos se extiende el resplandor |
| Composite Opacity | Intensidad del bloom |
| Blur Mix (multi-blur) | Suavidad del resplandor |

## Variantes

- **Bloom con color**: Agrega un **HSV Adjust TOP** al bloom antes de componer
- **Bloom animado**: Usa un **LFO CHOP** para animar el threshold
- **Bloom direccional**: Usa **Directional Blur TOP** en lugar de Gaussian

## Tips avanzados

- Para performance, renderiza el bloom a media res usando un **Resolution TOP**
- Combina con **Glow TOP** para un efecto diferente pero relacionado
- Usa **Lookup TOP** para mapear el bloom con curvas de color personalizadas
