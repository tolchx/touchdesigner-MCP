---
title: "Interactive & Immersive HQ Tutorial Series — POP Systems"
category: "pops"
difficulty: "intermediate"
keywords: ["pop", "tutorial", "interactive immersive", "particle system", "instancing", "glsl", "feedback", "attributes", "render pipeline", "noise", "math"]
duration: "60 min"
requires_td: true
---

# Tutorial Systems — Interactive & Immersive HQ Series

Basado en la serie de tutoriales de Interactive & Immersive HQ.
9 sistemas construidos y verificados contra TD 2025.32460.

**Sources:**
- YouTube playlist: https://www.youtube.com/playlist?list=PLpuCjVEMQha9_WchDzqG878GtsJd1uJ5s
- Website: https://interactiveimmersive.io/

---

## Tutorial 201: Particle System Fundamentals
- **Chain:** `spherePOP → noisePOP → feedbackPOP → cachePOP → blendPOP → limitPOP → nullPOP`
- **Params:** noise amp=0.4 per=1.5, feedback preroll=2 inputmul=2, cache 64 frames, blend=add, limit [-1.5,1.5]
- **7 operators, GPU particle system with trail feedback**

## Tutorial 202: Instance Field
- **Chain:** `gridPOP → spherePOP → copyPOP → noisePOP → nullPOP`
- **Params:** copy ncy=5 ty=1.2 sx=0.9, noise amp=0.3 per=2.0
- **5 operators, interactive instancing grid with noise deformation**

## Tutorial 203: GLSL POP Shaders
- **Chain:** `spherePOP → glslPOP → nullPOP`
- **GLSL:** sine wave deformation, TDIn_P() read, P[id] write
- **3 operators, custom compute shader on points**

## Tutorial 204: Copy & Instancing
- **Chain:** `spherePOP → attributePOP → copyPOP → mathPOP → nullPOP`
- **Params:** attr custom "psize"=0.2, copy ncy=8 ty=0.5 sx=0.95 rz=15°, math mult=2
- **5 operators, 8-copy spiral with attribute-driven variation**

## Tutorial 205: Attributes & Data
- **Chain:** `gridPOP → attributePOP → copyPOP → blendPOP → nullPOP`
- **Params:** attr custom "weight"=0.1, copy ncy=4 ty=1.0, blend=add
- **5 operators, attribute-driven data pipeline**

## Tutorial 206: Feedback Loops
- **Chain:** `spherePOP → noisePOP → feedbackPOP → cachePOP → blendPOP → nullPOP`
- **Params:** noise amp=0.5 per=1.0, feedback preroll=3 inputmul=3, cache 128, blend=add weight=0.6
- **6 operators, extended feedback loop with 128-frame cache**

## Tutorial 207: Math & Noise
- **Chain:** `gridPOP → noisePOP → mathPOP → copyPOP → limitPOP → nullPOP`
- **Params:** noise amp=0.6 per=2.0, math mult=1.5 postadd=0.5, copy ncy=3, limit [-2,2]
- **6 operators, math operations on noise-displaced grid**

## Tutorial 208: Rendering Pipeline
- **Chain:** `spherePOP → noisePOP → copyPOP → nullPOP → geometryCOMP → renderTOP → nullTOP`
- **Params:** noise amp=0.4, copy ncy=4 ty=0.8
- **7 operators, full POP-to-render pipeline with geometryCOMP**

## Tutorial 209: Advanced Techniques
- **Chain:** `gridPOP → noisePOP → attributePOP → mathPOP → copyPOP → blendPOP → feedbackPOP → limitPOP → nullPOP`
- **Params:** noise amp=0.5, attr custom "s"=0.2, math mult=2, copy 4x4, blend=add, feedback inputmul=2
- **9 operators, multi-system advanced POP network**

---

**All 9 systems verified: 0 errors each.**
