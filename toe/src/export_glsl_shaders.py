#!/usr/bin/env python3
"""
Export all GLSL shaders from test files into individual .glsl files in glsl_files/.
Covers: 10 Bases (10), Tutorials (10), Suite (7), Advanced TOP (6), Extreme (4),
        Vertex (5), Glslcopy (1), Snippets (5), Shaders (8), NPasses (4)
Total: 62 shaders
"""
import os
import sys

GLSL_DIR = os.path.join(os.path.dirname(__file__), "..", "glsl_files")

# All shaders as tuples: (filename, description, variable_name, source_file, shader_code)
SHADERS = [
    # ═══════════════════════════════════════════════════════════════════════════
    # Category 1: 10 Bases (test_live_td_glslpop_10bases.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("pop_01_wave.glsl", "Sinusoidal wave displacement on Y axis",
     "GLSL_WAVE", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float t = float(id) / float(TDNumElements() - 1);\n"
        "    p.y = sin(t * 10.0 + u_time) * 0.5;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_02_color_pos.glsl", "Map XYZ position to RGB color",
     "GLSL_COLOR_POS", "test_live_td_glslpop_10bases.py", (
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 pos = TDIn_P(0, id);\n"
        "    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);\n"
        "}\n"
    )),
    ("pop_03_spiral.glsl", "Spiral distribution with HSB coloring",
     "GLSL_SPIRAL", "test_live_td_glslpop_10bases.py", (
        "#define PI 3.14159265359\n"
        "#define TAU 6.28318530718\n"
        "uniform float u_time;\n"
        "vec3 hsb2rgb(vec3 c) {\n"
        "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
        "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
        "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements() - 1);\n"
        "    float angle = t * 5.0 * TAU + u_time;\n"
        "    float radius = t * 2.0 + sin(t * 30.0 + u_time * 2.0) * 0.1;\n"
        "    vec3 pos = vec3(cos(angle) * radius, sin(angle) * radius, t * 2.0 - 1.0);\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(hsb2rgb(vec3(t, 0.7, 0.9)), 1.0);\n"
        "}\n"
    )),
    ("pop_04_noise_displacement.glsl", "Noise-based particle displacement",
     "GLSL_NOISE_DISP", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec4 noise = TDSimplexNoise(vec4(p * 2.0, u_time * 0.5));\n"
        "    p += noise.xyz * 0.3;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_05_feedback_morph.glsl", "Feedback-based morphing between two shapes",
     "GLSL_FEEDBACK_MORPH", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "uniform float u_morph;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float t = u_time * 0.5;\n"
        "    vec3 target = vec3(\n"
        "        sin(p.x * 3.0 + t),\n"
        "        cos(p.y * 3.0 + t),\n"
        "        sin(p.z * 3.0 + t)\n"
        "    ) * length(p);\n"
        "    p = mix(p, target, u_morph);\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_06_multipass_noise.glsl", "Multi-pass noise accumulation",
     "GLSL_MULTIPASS_NOISE", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    for (int i = 0; i < 3; i++) {\n"
        "        vec4 n = TDSimplexNoise(vec4(p * 1.5, u_time + float(i) * 0.1));\n"
        "        p += n.xyz * 0.1;\n"
        "    }\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_07_fractal_displacement.glsl", "Julia set fractal on particle positions",
     "GLSL_FRACTAL", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "vec3 hsb2rgb(vec3 c) {\n"
        "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
        "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
        "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 pos = TDIn_P(0, id);\n"
        "    vec2 c = pos.xy * 1.5;\n"
        "    vec2 z = vec2(0.0);\n"
        "    vec2 juliaC = vec2(-0.7 + sin(u_time * 0.2) * 0.1, 0.27015 + cos(u_time * 0.3) * 0.1);\n"
        "    float iter = 0.0;\n"
        "    for (int i = 0; i < 20; i++) {\n"
        "        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + juliaC;\n"
        "        if (dot(z, z) > 4.0) break;\n"
        "        iter += 1.0;\n"
        "    }\n"
        "    float t = iter / 20.0;\n"
        "    pos.z += t * 2.0 - 1.0;\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9)), 1.0);\n"
        "}\n"
    )),
    ("pop_08_attractor.glsl", "Strange attractor force field",
     "GLSL_ATTRACTOR", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "uniform float u_strength;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec3 center = vec3(0.0, sin(u_time * 0.5) * 0.5, 0.0);\n"
        "    vec3 dir = center - p;\n"
        "    float dist = length(dir);\n"
        "    float force = u_strength / (dist * dist + 0.5);\n"
        "    p += normalize(dir) * force * 0.05;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_09_ripple.glsl", "Radial ripple from center",
     "GLSL_RIPPLE", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float dist = length(p.xz);\n"
        "    float wave = sin(dist * 5.0 - u_time * 3.0) * 0.3;\n"
        "    p.y += wave * exp(-dist * 0.5);\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("pop_10_color_cycle.glsl", "Rainbow color cycling over time",
     "GLSL_COLORCYCLE", "test_live_td_glslpop_10bases.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    P[id] = p;\n"
        "    float hue = fract(float(id) / float(TDNumElements()) + u_time * 0.1);\n"
        "    vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);\n"
        "    Cd[id] = vec4(rgb, 1.0);\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 2: Tutorials (test_live_td_glslpop_tutorials.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("tut_01_phyllotaxis.glsl", "Phyllotaxis spiral pattern (golden angle)",
     "GLSL_PHYLL", "test_live_td_glslpop_tutorials.py", (
        "#define PHI 1.618033988749895\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float n = float(id);\n"
        "    float angle = n * 2.39996323;\n"
        "    float r = sqrt(n) * 0.1;\n"
        "    vec3 pos = vec3(cos(angle) * r, sin(angle) * r, 0.0);\n"
        "    P[id] = pos;\n"
        "}\n"
    )),
    ("tut_02_magnetic.glsl", "Magnetic field line deformation",
     "GLSL_MAGNETIC", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float field = sin(p.x * 2.0 + u_time) * cos(p.z * 2.0 + u_time);\n"
        "    p.y += field * 0.5;\n"
        "    p.x += cos(p.z * 3.0 + u_time) * 0.1;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("tut_03_domain_warp.glsl", "Domain warping with FBM noise",
     "GLSL_DOMAINWARP", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "float fbm(vec2 p) {\n"
        "    float f = 0.0;\n"
        "    for (int i = 0; i < 4; i++) {\n"
        "        f += 0.5 * TDSimplexNoise(vec4(p, 0.0, 0.0)).x;\n"
        "        p *= 2.0;\n"
        "    }\n"
        "    return f;\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec2 warped = p.xy + vec2(fbm(p.xy + u_time), fbm(p.xy + 100.0));\n"
        "    p.z += fbm(warped) * 0.5;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("tut_04_interference.glsl", "Interference pattern from multiple wave sources",
     "GLSL_INTERFERENCE", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec3 s1 = vec3(1.0, 0.0, 0.0);\n"
        "    vec3 s2 = vec3(-1.0, 0.0, 0.0);\n"
        "    float d1 = length(p - s1);\n"
        "    float d2 = length(p - s2);\n"
        "    float wave = sin(d1 * 5.0 - u_time * 3.0) + sin(d2 * 5.0 - u_time * 3.0);\n"
        "    p.y += wave * 0.2;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("tut_05_lissajous.glsl", "Lissajous curve distribution",
     "GLSL_LISSAJOUS", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements()) * 6.2831853;\n"
        "    vec3 pos = vec3(\n"
        "        sin(3.0 * t + u_time),\n"
        "        sin(2.0 * t + u_time * 0.7),\n"
        "        sin(5.0 * t + u_time * 0.3)\n"
        "    );\n"
        "    P[id] = pos;\n"
        "}\n"
    )),
    ("tut_06_spring.glsl", "Spring coil deformation",
     "GLSL_SPRING", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements());\n"
        "    float angle = t * 20.0 + u_time;\n"
        "    float radius = 0.3 + sin(u_time * 2.0) * 0.1;\n"
        "    vec3 pos = vec3(\n"
        "        cos(angle) * radius,\n"
        "        t * 4.0 - 2.0,\n"
        "        sin(angle) * radius\n"
        "    );\n"
        "    P[id] = pos;\n"
        "}\n"
    )),
    ("tut_07_lifecycle.glsl", "Particle lifecycle: birth, age, death",
     "GLSL_LIFECYCLE", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float life = fract(float(id) / float(TDNumElements()) + u_time * 0.2);\n"
        "    float scale = sin(life * 3.14159);\n"
        "    p *= scale;\n"
        "    p.y += life * 2.0 - 1.0;\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(scale, 1.0 - life, life, 1.0);\n"
        "}\n"
    )),
    ("tut_08_quaternion.glsl", "Quaternion rotation of particle positions",
     "GLSL_QUAT", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "vec4 quatMul(vec4 a, vec4 b) {\n"
        "    return vec4(\n"
        "        a.w*b.xyz + b.w*a.xyz + cross(a.xyz, b.xyz),\n"
        "        a.w*b.w - dot(a.xyz, b.xyz)\n"
        "    );\n"
        "}\n"
        "vec3 quatRotate(vec4 q, vec3 v) {\n"
        "    vec4 qv = vec4(v, 0.0);\n"
        "    vec4 conj = vec4(-q.xyz, q.w);\n"
        "    return quatMul(quatMul(q, qv), conj).xyz;\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float a = u_time * 0.5;\n"
        "    vec4 q = vec4(sin(a), 0.0, 0.0, cos(a));\n"
        "    p = quatRotate(q, p);\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("tut_09_growth.glsl", "L-system growth pattern",
     "GLSL_GROWTH", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements());\n"
        "    float growth = clamp(u_time * 0.3 - t, 0.0, 1.0);\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    p *= growth;\n"
        "    p.y += sin(p.x * 3.0 + u_time) * 0.2 * growth;\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(growth, 1.0 - t, t * 0.5, 1.0);\n"
        "}\n"
    )),
    ("tut_10_audio_reactive.glsl", "Audio-reactive particle displacement",
     "GLSL_AUDIO", "test_live_td_glslpop_tutorials.py", (
        "uniform float u_time;\n"
        "uniform float u_bass;\n"
        "uniform float u_treble;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float dist = length(p);\n"
        "    p *= 1.0 + u_bass * sin(dist * 3.0 - u_time * 5.0) * 0.3;\n"
        "    p.y += u_treble * cos(p.x * 5.0 + u_time * 3.0) * 0.2;\n"
        "    P[id] = p;\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 3: Suite Levels (test_live_td_glslpop_suite.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("suite_L1_displacement.glsl", "Level 1: Basic position displacement",
     "GLSL_L1", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    p.y += sin(p.x * 3.0 + u_time) * 0.3;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("suite_L2_color.glsl", "Level 2: Color output via Cd",
     "GLSL_L2", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(sin(p.x + u_time) * 0.5 + 0.5, cos(p.z + u_time) * 0.5 + 0.5, 0.8, 1.0);\n"
        "}\n"
    )),
    ("suite_L3_multiple_attrs.glsl", "Level 3: Multiple attribute output (P + Cd + custom)",
     "GLSL_L3", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float wave = sin(p.x * 2.0 + u_time) * 0.3;\n"
        "    p.y += wave;\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(abs(wave) * 3.0, 0.5, 1.0 - abs(wave) * 3.0, 1.0);\n"
        "}\n"
    )),
    ("suite_L4_noise_anim.glsl", "Level 4: Noise-based animation with TDSimplexNoise",
     "GLSL_L4", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec4 n = TDSimplexNoise(vec4(p * 2.0, u_time * 0.5));\n"
        "    p += n.xyz * 0.3;\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(n.xyz * 0.5 + 0.5, 1.0);\n"
        "}\n"
    )),
    ("suite_L5_force_field.glsl", "Level 5: Force field with custom uniform (u_strength)",
     "GLSL_L5", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "uniform float u_strength;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec3 center = vec3(0.0, 0.0, 0.0);\n"
        "    vec3 dir = center - p;\n"
        "    float dist = length(dir);\n"
        "    float force = u_strength / (dist * dist + 0.5);\n"
        "    p += normalize(dir) * force * 0.05;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("suite_L6_multi_source.glsl", "Level 6: Multiple noise sources blended",
     "GLSL_L6", "test_live_td_glslpop_suite.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec4 n1 = TDSimplexNoise(vec4(p * 1.0, u_time * 0.3));\n"
        "    vec4 n2 = TDSimplexNoise(vec4(p * 3.0, u_time * 0.7));\n"
        "    vec3 displacement = n1.xyz * 0.5 + n2.xyz * 0.15;\n"
        "    p += displacement;\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(displacement * 0.5 + 0.5, 1.0);\n"
        "}\n"
    )),
    ("suite_L7_pixel_blur.glsl", "Level 7: Pixel blur pass-through (glslTOP pattern)",
     "GLSL_L7", "test_live_td_glslpop_suite.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 4: Advanced TOP Shaders (test_live_td_glsl_advanced.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("top_threshold.glsl", "Threshold filter: above 0.5 white, below black",
     "GLSL_THRESHOLD", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n"
        "    color.rgb = lum > 0.5 ? vec3(1.0) : vec3(0.0);\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
    ("top_edge_detect.glsl", "Sobel edge detection",
     "GLSL_EDGE", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
        "    vec2 uv = vUV.st;\n"
        "    vec4 tl = texture(sTD2DInputs[0], uv + vec2(-texel.x, -texel.y));\n"
        "    vec4 tc = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y));\n"
        "    vec4 tr = texture(sTD2DInputs[0], uv + vec2(texel.x, -texel.y));\n"
        "    vec4 ml = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0));\n"
        "    vec4 mr = texture(sTD2DInputs[0], uv + vec2(texel.x, 0.0));\n"
        "    vec4 bl = texture(sTD2DInputs[0], uv + vec2(-texel.x, texel.y));\n"
        "    vec4 bc = texture(sTD2DInputs[0], uv + vec2(0.0, texel.y));\n"
        "    vec4 br = texture(sTD2DInputs[0], uv + vec2(texel.x, texel.y));\n"
        "    vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;\n"
        "    vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;\n"
        "    float edge = length(sx) + length(sy);\n"
        "    fragColor = TDOutputSwizzle(vec4(vec3(edge), 1.0));\n"
        "}\n"
    )),
    ("top_invert.glsl", "Color inversion",
     "GLSL_INVERT", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    color.rgb = 1.0 - color.rgb;\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
    ("top_grayscale.glsl", "Grayscale conversion",
     "GLSL_GRAYSCALE", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n"
        "    fragColor = TDOutputSwizzle(vec4(vec3(lum), color.a));\n"
        "}\n"
    )),
    ("top_chromatic_aberration.glsl", "Chromatic aberration effect",
     "GLSL_CHROMAB", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "uniform float u_amount;\n"
        "void main() {\n"
        "    vec2 uv = vUV.st;\n"
        "    vec2 center = vec2(0.5);\n"
        "    vec2 dir = uv - center;\n"
        "    float r = texture(sTD2DInputs[0], uv + dir * u_amount * 0.01).r;\n"
        "    float g = texture(sTD2DInputs[0], uv).g;\n"
        "    float b = texture(sTD2DInputs[0], uv - dir * u_amount * 0.01).b;\n"
        "    fragColor = TDOutputSwizzle(vec4(r, g, b, 1.0));\n"
        "}\n"
    )),
    ("top_soft_glow.glsl", "Soft glow bloom effect",
     "GLSL_GLOW", "test_live_td_glsl_advanced.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
        "    vec2 uv = vUV.st;\n"
        "    vec4 sum = vec4(0.0);\n"
        "    for (int x = -2; x <= 2; x++) {\n"
        "        for (int y = -2; y <= 2; y++) {\n"
        "            sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);\n"
        "        }\n"
        "    }\n"
        "    vec4 blurred = sum / 25.0;\n"
        "    vec4 original = texture(sTD2DInputs[0], uv);\n"
        "    vec4 glow = original + blurred * 0.5;\n"
        "    fragColor = TDOutputSwizzle(clamp(glow, 0.0, 1.0));\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 5: Extreme GLSL (test_live_td_glsl_extreme.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("extreme_prim_compute.glsl", "Primitive compute: index-based position",
     "GLSL_PRIM_COMPUTE", "test_live_td_glsl_extreme.py", (
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("extreme_extraout.glsl", "Extra output attribute (Cd on glsladvancedPOP)",
     "GLSL_EXTRAOUT", "test_live_td_glsl_extreme.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    P[id] = p;\n"
        "    Cd[id] = vec4(sin(u_time) * 0.5 + 0.5, 0.5, 0.8, 1.0);\n"
        "}\n"
    )),
    ("extreme_noise_anim.glsl", "Animated noise with TDSimplexNoise",
     "GLSL_NOISE_ANIM", "test_live_td_glsl_extreme.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    vec4 n = TDSimplexNoise(vec4(p * 2.0, u_time * 0.5));\n"
        "    p += n.xyz * 0.3;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("extreme_spiral_anim.glsl", "Animated spiral with color",
     "GLSL_SPIRAL_ANIM", "test_live_td_glsl_extreme.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements());\n"
        "    float angle = t * 20.0 + u_time;\n"
        "    float radius = t * 1.5;\n"
        "    vec3 pos = vec3(cos(angle) * radius, t * 2.0 - 1.0, sin(angle) * radius);\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(t, sin(u_time + t * 5.0) * 0.5 + 0.5, 1.0 - t, 1.0);\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 6: Vertex Shaders (test_live_td_glsl_vertex_shader.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("vertex_wave.glsl", "Vertex wave deformation (glslTOP vertexdat)",
     "VERT_WAVE", "test_live_td_glsl_vertex_shader.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    vec4 p = TDDeformP(tdPosition[0]);\n"
        "    p.y += sin(p.x * 3.0 + u_time) * 0.2;\n"
        "    TDDeformOut(p);\n"
        "}\n"
    )),
    ("vertex_noise_displace.glsl", "Vertex noise displacement",
     "VERT_NOISE", "test_live_td_glsl_vertex_shader.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    vec4 p = TDDeformP(tdPosition[0]);\n"
        "    vec4 n = TDSimplexNoise(vec4(p.xyz * 2.0, u_time * 0.5));\n"
        "    p.xyz += n.xyz * 0.2;\n"
        "    TDDeformOut(p);\n"
        "}\n"
    )),
    ("vertex_twist.glsl", "Vertex twist deformation around Y axis",
     "VERT_TWIST", "test_live_td_glsl_vertex_shader.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    vec4 p = TDDeformP(tdPosition[0]);\n"
        "    float angle = p.y * 0.5 + u_time;\n"
        "    float ct = cos(angle), st = sin(angle);\n"
        "    vec2 xz = vec2(p.x * ct - p.z * st, p.x * st + p.z * ct);\n"
        "    p.xz = xz;\n"
        "    TDDeformOut(p);\n"
        "}\n"
    )),
    ("vertex_pulse.glsl", "Vertex pulsating scale",
     "VERT_PULSE", "test_live_td_glsl_vertex_shader.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    vec4 p = TDDeformP(tdPosition[0]);\n"
        "    float scale = 1.0 + sin(u_time * 2.0) * 0.2;\n"
        "    p.xyz *= scale;\n"
        "    TDDeformOut(p);\n"
        "}\n"
    )),
    ("vertex_passthrough_pixel.glsl", "Vertex pass-through + pixel shader",
     "VERT_PASSTHROUGH", "test_live_td_glsl_vertex_shader.py", (
        "void main() {\n"
        "    vec4 p = TDDeformP(tdPosition[0]);\n"
        "    TDDeformOut(p);\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 7: Glslcopy (test_live_td_pop_glslcopy_feedback.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("pop_glslcopy_hash.glsl", "Hash-based particle movement (glslcopyPOP)",
     "GLSLCOPY_COMPUTE_SHADER", "test_live_td_pop_glslcopy_feedback.py", (
        "#define G 1.0\n"
        "uniform float u_time;\n"
        "float hash21(vec2 p) {\n"
        "    p = fract(p * vec2(234.34, 435.345));\n"
        "    p += dot(p, p + 19.19);\n"
        "    return fract(p.x * p.y);\n"
        "}\n"
        "void main(){\n"
        "    uint id = TDIndex();\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float n = hash21(p.xy + u_time * 0.1);\n"
        "    P[id] = p + n * 0.1;\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 8: TD Snippets (test_live_td_glsl_snippets.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("snippet_passthrough.glsl", "TD snippet glsl1: Simple pass-through",
     "GLSL_PASSTHROUGH", "test_live_td_glsl_snippets.py", (
        "void main() {\n"
        "    const uint id = TDIndex();\n"
        "    if(id >= TDNumElements())\n"
        "        return;\n"
        "    P[id] = TDIn_P();\n"
        "}\n"
    )),
    ("snippet_sin_wave.glsl", "TD snippet glsl2: Sin wave displacement",
     "GLSL_SIN", "test_live_td_glsl_snippets.py", (
        "void main() {\n"
        "    const uint id = TDIndex();\n"
        "    if(id >= TDNumElements())\n"
        "        return;\n"
        "    vec3 pos = TDIn_P();\n"
        "    pos.y += sin(uTime * 2.0 + pos.x);\n"
        "    P[id] = pos;\n"
        "}\n"
    )),
    ("snippet_sin_color.glsl", "TD snippet glsl3: Sin wave + height-based color",
     "GLSL_SIN_COLOR", "test_live_td_glsl_snippets.py", (
        "void main() {\n"
        "    const uint id = TDIndex();\n"
        "    if(id >= TDNumElements())\n"
        "        return;\n"
        "    vec3 pos = TDIn_P();\n"
        "    pos.y += sin(uTime * 2.0 + pos.x);\n"
        "    P[id] = pos;\n"
        "    vec4 color = vec4(vec3(0.5) + 0.5 * normalize(pos),1.0);\n"
        "    Color[id] = color;\n"
        "}\n"
    )),
    ("snippet_ripple.glsl", "TD snippet glsl7: Ripple intensity as custom attribute",
     "GLSL_RIPPLE_ATTR", "test_live_td_glsl_snippets.py", (
        "void main() {\n"
        "    const uint id = TDIndex();\n"
        "    if(id >= TDNumElements())\n"
        "        return;\n"
        "    vec3 originalPos = TDIn_P();\n"
        "    float pulse = 1.0 + 0.3 * sin(uTime);\n"
        "    vec3 pos = originalPos * pulse;\n"
        "    float wave = 0.2 * sin(uTime * 2.0 + originalPos.x);\n"
        "    pos.y += wave;\n"
        "    P[id] = pos;\n"
        "    float rippleIntensity = abs(wave) * 5.0;\n"
        "    rippleIntensity = clamp(rippleIntensity, 0.0, 1.0);\n"
        "    Ripple[id] = rippleIntensity;\n"
        "    float colorFreq = 5.0 / pulse;\n"
        "    vec4 color = vec4(\n"
        "        0.5 + 0.5 * sin(originalPos.x * colorFreq + uTime),\n"
        "        rippleIntensity,\n"
        "        0.5 + 0.5 * sin(originalPos.z * colorFreq + uTime),\n"
        "        1.0\n"
        "    );\n"
        "    Color[id] = color;\n"
        "}\n"
    )),
    ("snippet_multi_attr.glsl", "TD snippet glsl10: Multi-attribute passthrough",
     "GLSL_MULTI_ATTR", "test_live_td_glsl_snippets.py", (
        "void main() {\n"
        "    const uint id = TDIndex();\n"
        "    if(id >= TDNumElements())\n"
        "        return;\n"
        "    float px = TDIn_P().x;\n"
        "    vec4 c = TDIn_Color();\n"
        "    Color[id] = c;\n"
        "    Thing[id] = px;\n"
        "    P[id] = TDIn_P();\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 9: Shader Showcase (test_live_td_glsl_shaders.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("showcase_sin_wave.glsl", "Showcase: Sinusoidal wave displacement",
     "SHADER_SIN_WAVE", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 pos = TDIn_P(0, id);\n"
        "    float t = float(id) / float(TDNumElements() - 1);\n"
        "    float wave = sin(t * 10.0 + u_time) * 0.5;\n"
        "    wave += sin(t * 20.0 - u_time * 1.5) * 0.15;\n"
        "    wave += sin(t * 5.0 + u_time * 0.7) * 0.25;\n"
        "    pos.y = wave;\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(wave * 0.5 + 0.5, t, 1.0 - t, 1.0);\n"
        "}\n"
    )),
    ("showcase_waves.glsl", "Showcase: Multi-frequency wave with twist",
     "SHADER_WAVES", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float w1 = sin(p.x * 1.5 + u_time * 1.2) * 0.4;\n"
        "    float w2 = cos(p.z * 2.0 + u_time * 0.8) * 0.3;\n"
        "    float w3 = sin((p.x + p.z) * 1.0 + u_time * 2.5) * 0.2;\n"
        "    p.y += w1 + w2 + w3;\n"
        "    float twist = sin(p.y * 0.5 + u_time) * 0.3;\n"
        "    float ct = cos(twist), st = sin(twist);\n"
        "    p.xz = mat2(ct, -st, st, ct) * p.xz;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("showcase_movement.glsl", "Showcase: Orbital movement + breathing",
     "SHADER_MOVEMENT", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float speed = u_time * 0.5;\n"
        "    float angle = atan(p.z, p.x) + speed;\n"
        "    float rad = length(p.xz);\n"
        "    p.x = cos(angle) * rad;\n"
        "    p.z = sin(angle) * rad;\n"
        "    float breathe = 1.0 + sin(u_time * 1.5 + p.y * 0.5) * 0.15;\n"
        "    p *= breathe;\n"
        "    p.y += sin(p.x * 3.0 + u_time * 2.0) * 0.2;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("showcase_explosion.glsl", "Showcase: Radial explosion + spiral",
     "SHADER_EXPLOSION", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 p = TDIn_P(0, id);\n"
        "    float dist = length(p);\n"
        "    float force = sin(u_time * 1.5) * 0.5 + 0.5;\n"
        "    vec3 dir = normalize(p + 0.001);\n"
        "    float push = force * 2.0 + sin(dist * 2.0 - u_time * 3.0) * 0.3;\n"
        "    p += dir * push;\n"
        "    float a = u_time * 0.5 + dist * 0.3;\n"
        "    float ct = cos(a), st = sin(a);\n"
        "    p.xz = mat2(ct, -st, st, ct) * p.xz;\n"
        "    P[id] = p;\n"
        "}\n"
    )),
    ("showcase_fountain.glsl", "Showcase: Particle fountain (generates positions from index)",
     "SHADER_FOUNTAIN", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float a = float(id) * 0.05 + u_time * 2.0;\n"
        "    float r = 0.5 + sin(float(id) * 0.3 + u_time) * 0.3;\n"
        "    float x = cos(a) * r * (1.0 + sin(u_time * 0.7) * 0.3);\n"
        "    float z = sin(a) * r * (1.0 + cos(u_time * 0.5) * 0.3);\n"
        "    float y = 2.0 + sin(float(id) * 0.1 + u_time * 1.5) * 1.5\n"
        "             - abs(sin(u_time * 0.3)) * 3.0;\n"
        "    P[id] = vec3(x, y + 2.0, z);\n"
        "    Cd[id] = vec4(y * 0.2 + 0.5, 0.8, 1.0 - y * 0.15, 1.0);\n"
        "}\n"
    )),
    ("showcase_spiral_points.glsl", "Showcase: Spiral with HSB coloring",
     "SHADER_SPIRAL", "test_live_td_glsl_shaders.py", (
        "#define TAU 6.28318530718\n"
        "uniform float u_time;\n"
        "vec3 hsb2rgb(vec3 c) {\n"
        "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
        "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
        "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    float t = float(id) / float(TDNumElements() - 1);\n"
        "    float turns = 5.0;\n"
        "    float angle = t * turns * TAU + u_time;\n"
        "    float radius = t * 2.0 + sin(t * 30.0 + u_time * 2.0) * 0.1;\n"
        "    vec3 pos = vec3(cos(angle) * radius, sin(angle) * radius, t * 2.0 - 1.0);\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(hsb2rgb(vec3(t, 0.7, 0.9)), 1.0);\n"
        "}\n"
    )),
    ("showcase_color_pos.glsl", "Showcase: Position-to-color mapping",
     "SHADER_COLOR_POS", "test_live_td_glsl_shaders.py", (
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 pos = TDIn_P(0, id);\n"
        "    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);\n"
        "}\n"
    )),
    ("showcase_fractal.glsl", "Showcase: Julia set fractal displacement",
     "SHADER_FRACTAL", "test_live_td_glsl_shaders.py", (
        "uniform float u_time;\n"
        "vec3 hsb2rgb(vec3 c) {\n"
        "    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);\n"
        "    rgb = rgb*rgb*(3.0-2.0*rgb);\n"
        "    return c.z*mix(vec3(1.0),rgb,c.y);\n"
        "}\n"
        "void main() {\n"
        "    uint id = TDIndex();\n"
        "    if (id >= TDNumElements()) return;\n"
        "    vec3 pos = TDIn_P(0, id);\n"
        "    vec2 c = pos.xy * 1.5;\n"
        "    vec2 z = vec2(0.0);\n"
        "    vec2 juliaC = vec2(-0.7 + sin(u_time * 0.2) * 0.1, 0.27015 + cos(u_time * 0.3) * 0.1);\n"
        "    float iter = 0.0;\n"
        "    for (int i = 0; i < 20; i++) {\n"
        "        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + juliaC;\n"
        "        if (dot(z, z) > 4.0) break;\n"
        "        iter += 1.0;\n"
        "    }\n"
        "    float t = iter / 20.0;\n"
        "    pos.z += t * 2.0 - 1.0;\n"
        "    P[id] = pos;\n"
        "    Cd[id] = vec4(hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9)), 1.0);\n"
        "}\n"
    )),

    # ═══════════════════════════════════════════════════════════════════════════
    # Category 10: NPasses Shaders (test_live_td_glsl_npasses.py)
    # ═══════════════════════════════════════════════════════════════════════════
    ("npasses_4pass_blur.glsl", "4-pass progressive blur (glslTOP npasses=4)",
     "GLSL_4PASS_BLUR", "test_live_td_glsl_npasses.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    if (uTDPass > 0) {\n"
        "        vec4 sum = vec4(0.0);\n"
        "        for (int x = -1; x <= 1; x++) {\n"
        "            for (int y = -1; y <= 1; y++) {\n"
        "                vec2 offset = vec2(float(x), float(y)) * texel;\n"
        "                sum += texture(sTD2DInputs[0], vUV.st + offset);\n"
        "            }\n"
        "        }\n"
        "        color = sum / 9.0;\n"
        "    }\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
    ("npasses_3pass_edge_glow.glsl", "3-pass edge detect + glow (glslTOP npasses=3)",
     "GLSL_3PASS_EDGE_GLOW", "test_live_td_glsl_npasses.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec2 texel = 1.0 / uTDOutputInfo.res;\n"
        "    vec2 uv = vUV.st;\n"
        "    vec4 color = texture(sTD2DInputs[0], uv);\n"
        "    if (uTDPass == 0) {\n"
        "        vec4 tl = texture(sTD2DInputs[0], uv + vec2(-texel.x, -texel.y));\n"
        "        vec4 tc = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y));\n"
        "        vec4 tr = texture(sTD2DInputs[0], uv + vec2(texel.x, -texel.y));\n"
        "        vec4 ml = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0));\n"
        "        vec4 mr = texture(sTD2DInputs[0], uv + vec2(texel.x, 0.0));\n"
        "        vec4 bl = texture(sTD2DInputs[0], uv + vec2(-texel.x, texel.y));\n"
        "        vec4 bc = texture(sTD2DInputs[0], uv + vec2(0.0, texel.y));\n"
        "        vec4 br = texture(sTD2DInputs[0], uv + vec2(texel.x, texel.y));\n"
        "        vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;\n"
        "        vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;\n"
        "        float edge = length(sx) + length(sy);\n"
        "        color = vec4(vec3(edge), 1.0);\n"
        "    } else if (uTDPass == 1) {\n"
        "        vec4 sum = vec4(0.0);\n"
        "        for (int x = -1; x <= 1; x++) {\n"
        "            for (int y = -1; y <= 1; y++) {\n"
        "                sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);\n"
        "            }\n"
        "        }\n"
        "        color = sum / 9.0;\n"
        "    } else {\n"
        "        vec4 edges = texture(sTD2DInputs[0], uv);\n"
        "        color = edges * vec4(0.3, 1.0, 0.5, 1.0);\n"
        "    }\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
    ("npasses_2pass_colorgrade.glsl", "2-pass color grading (glslTOP npasses=2)",
     "GLSL_2PASS_COLORGRADE", "test_live_td_glsl_npasses.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec2 uv = vUV.st;\n"
        "    vec4 color = texture(sTD2DInputs[0], uv);\n"
        "    if (uTDPass == 0) {\n"
        "        vec3 lift = vec3(0.05, 0.02, 0.08);\n"
        "        vec3 gamma = vec3(1.2, 1.0, 0.9);\n"
        "        vec3 gain = vec3(1.1, 1.05, 1.0);\n"
        "        vec3 graded = pow(color.rgb + lift, 1.0 / gamma) * gain;\n"
        "        color = vec4(clamp(graded, 0.0, 1.0), color.a);\n"
        "    } else {\n"
        "        vec2 center = uv - vec2(0.5);\n"
        "        float dist = length(center);\n"
        "        float vignette = 1.0 - smoothstep(0.3, 0.8, dist);\n"
        "        color.rgb *= vignette;\n"
        "    }\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
    ("npasses_single_pass.glsl", "Single pass baseline: color invert",
     "GLSL_SINGLE_PASS", "test_live_td_glsl_npasses.py", (
        "out vec4 fragColor;\n"
        "void main() {\n"
        "    vec4 color = texture(sTD2DInputs[0], vUV.st);\n"
        "    color.rgb = 1.0 - color.rgb;\n"
        "    fragColor = TDOutputSwizzle(color);\n"
        "}\n"
    )),
]


# Determine operator type from filename prefix
OP_TYPE_MAP = {
    "pop_": "glslPOP / glsladvancedPOP",
    "tut_": "glslPOP",
    "suite_L": "glslPOP (L1-L6) / glslTOP (L7)",
    "top_": "glslTOP only",
    "extreme_": "glslPOP",
    "vertex_": "glslTOP (vertexdat)",
    "snippet_": "glslPOP",
    "showcase_": "glslPOP",
    "npasses_": "glslTOP only",
}


def _get_op_type(filename):
    for prefix, op_type in OP_TYPE_MAP.items():
        if filename.startswith(prefix):
            return op_type
    return "glslPOP / glslTOP"


def export_all():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    os.makedirs(GLSL_DIR, exist_ok=True)

    count = 0
    categories = {}

    for filename, desc, varname, source_file, code in SHADERS:
        cat = filename.split("_")[0]
        if cat not in categories:
            categories[cat] = 0
        categories[cat] += 1

        op_type = _get_op_type(filename)
        header = (
            f"// {desc}\n"
            f"// Variable: {varname}\n"
            f"// Source: {source_file}\n"
            f"// Use with: {op_type}\n"
            f"//\n"
            f"// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)\n"
            f"// ========================================================================\n\n"
        )

        filepath = os.path.join(GLSL_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(header + code)

        count += 1
        print(f"  [{count:02d}] {filename}")

    print(f"\nExported {count} GLSL shaders to {GLSL_DIR}")
    print("\nCategories:")
    for cat, n in sorted(categories.items()):
        print(f"  {cat}: {n} shaders")

    return count


if __name__ == "__main__":
    export_all()
