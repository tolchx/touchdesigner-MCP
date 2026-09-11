# GLSL Test Coverage Summary — July 30, 2026

## Executive Summary

**Total Tests Executed:** 19
**Total Checks:** 1,605
**Pass Rate:** 100% (0 failures)
**GLSL Shaders Exported:** 62 individual .glsl files (60 from test files + 2 legacy)
**Skills Created:** 3 (td-glslpop-create, td-glslpop-shaders, td-glslpop-debug)

---

## Test Results by File

| # | Test File | Description | Checks | Status |
|---|-----------|-------------|--------|--------|
| 1 | `test_pop_integration.py` | POP Chain Standard | 34/34 | PASS |
| 2 | `test_live_td_pop_params.py` | POP Params Read-Back | 45/45 | PASS |
| 3 | `test_live_td_auto_layout.py` | Auto-Layout POP | 24/24 | PASS |
| 4 | `test_live_td_sphere_transform_trail.py` | Sphere+Transform+Trail POP | 49/49 | PASS |
| 5 | `test_live_td_batch_simple.py` | Batch Endpoint | 8/8 | PASS |
| 6 | `test_live_td_comprehensive.py` | Comprehensive 7 Families | 104/104 | PASS |
| 7 | `test_live_td_pop_glslcopy_feedback.py` | GLSLcopy+Feedback POP | 65/65 | PASS |
| 8 | `test_live_td_pop_advanced2.py` | Advanced POP 2 | 75/75 | PASS |
| 9 | `test_live_td_smart_connect.py` | Smart Connect | 46/46 | PASS |
| 10 | `test_live_td_document_pop.py` | Document POP Network | 146/146 | PASS |
| 11 | `test_live_td_glsl_advanced.py` | GLSL Advanced TOP | 109/109 | PASS |
| 12 | `test_live_td_glsl_extreme.py` | GLSL Extreme | 83/83 | PASS |
| 13 | `test_live_td_pingpong_feedback.py` | GLSL Ping-Pong Feedback | 78/78 | PASS |
| 14 | `test_live_td_glsl_npasses.py` | GLSL NPasses | 82/82 | PASS |
| 15 | `test_live_td_glslpop_suite.py` | GLSL POP Suite (7 levels) | 177/177 | PASS |
| 16 | `test_live_td_glsl_vertex_shader.py` | GLSL Vertex Shader | 92/92 | PASS |
| 17 | `test_live_td_glslpop_10bases.py` | GLSL POP 10 Bases | 159/159 | PASS |
| 18 | `test_live_td_glslpop_webshaders.py` | GLSL POP Web Shaders | 77/77 | PASS |
| 19 | `test_live_td_glslpop_tutorials.py` | GLSL POP Tutorials | 152/152 | PASS |
| **Total** | | | **1,605** | **100%** |

---

## Coverage by TD Operator Family

### GLSL POP Operators (glslPOP, glsladvancedPOP, glslcopyPOP)

| Operator | Test Coverage | Shaders | Status |
|----------|---------------|---------|--------|
| **glslPOP** | 15 tests | 45 shaders | FULL |
| **glsladvancedPOP** | 8 tests | 12 shaders | FULL |
| **glslcopyPOP** | 2 tests | 1 shader | FULL |

**Key Features Tested:**
- ✅ Basic position displacement (P attribute)
- ✅ Color output (Cd attribute)
- ✅ Multiple attribute output (P + Cd + custom)
- ✅ Custom uniforms via const params (u_strength, u_morph, etc.)
- ✅ Noise functions (TDSimplexNoise)
- ✅ Feedback loops (feedbackPOP)
- ✅ GLSL copy with ptcomputedat
- ✅ Extra output attributes (glsladvancedPOP)
- ✅ Sequence parameters (extraout, pulse/button)

### GLSL TOP Operators (glslTOP)

| Feature | Test Coverage | Shaders | Status |
|---------|---------------|---------|--------|
| **Fragment shaders** | 6 tests | 12 shaders | FULL |
| **Vertex shaders** | 1 test | 5 shaders | FULL |
| **Multi-pass (npasses)** | 1 test | 4 shaders | FULL |
| **Ping-pong feedback** | 1 test | 2 shaders | FULL |

**Key Features Tested:**
- ✅ Pixel shaders (sTD2DInputs, vUV.st, fragColor)
- ✅ Vertex shaders (TDDeformP, TDDeformOut, tdPosition)
- ✅ Multi-pass intra-frame (uTDPass, npasses > 1)
- ✅ Progressive blur (4-pass)
- ✅ Edge detection + glow (3-pass)
- ✅ Color grading (2-pass)
- ✅ Ping-pong feedback loops (reaction-diffusion pattern)
- ✅ Const uniforms (const0name/const0value)

### Other Operator Families (Non-GLSL)

| Family | Operators Tested | Tests | Status |
|--------|------------------|-------|--------|
| **POP** | boxPOP, spherePOP, circlePOP, gridPOP, feedbackPOP, transformPOP, nullPOP | 8 tests | FULL |
| **TOP** | noiseTOP, feedbackTOP, compositeTOP, nullTOP | 4 tests | FULL |
| **CHOP** | noiseCHOP, lfoCHOP, timerCHOP, constantCHOP | 2 tests | FULL |
| **SOP** | boxSOP, sphereSOP | 2 tests | FULL |
| **DAT** | textDAT, tableDAT | 5 tests | FULL |
| **MAT** | phongMAT, pbrMAT, glslMAT | 2 tests | FULL |
| **COMP** | baseCOMP, geometryCOMP | 19 tests | FULL |

---

## GLSL Shader Catalog

### Category 1: POP Shaders (glslPOP/glsladvancedPOP)

| File | Description | Uniforms | Output Attrs |
|------|-------------|----------|--------------|
| `pop_01_wave.glsl` | Sinusoidal wave displacement | u_time | P |
| `pop_02_color_pos.glsl` | Position-to-color mapping | none | P Cd |
| `pop_03_spiral.glsl` | Spiral with HSB coloring | u_time | P Cd |
| `pop_04_noise_displacement.glsl` | Noise-based displacement | u_time | P |
| `pop_05_feedback_morph.glsl` | Feedback morphing | u_time, u_morph | P |
| `pop_06_multipass_noise.glsl` | Multi-pass noise accumulation | u_time | P |
| `pop_07_fractal_displacement.glsl` | Julia set fractal | u_time | P Cd |
| `pop_08_attractor.glsl` | Strange attractor field | u_time, u_strength | P |
| `pop_09_ripple.glsl` | Radial ripple from center | u_time | P |
| `pop_10_color_cycle.glsl` | Rainbow color cycling | u_time | P Cd |

### Category 2: Tutorial Shaders

| File | Description | Uniforms | Output Attrs |
|------|-------------|----------|--------------|
| `tut_01_phyllotaxis.glsl` | Phyllotaxis spiral (golden angle) | none | P |
| `tut_02_magnetic.glsl` | Magnetic field deformation | u_time | P |
| `tut_03_domain_warp.glsl` | Domain warping with FBM | u_time | P |
| `tut_04_interference.glsl` | Interference pattern | u_time | P |
| `tut_05_lissajous.glsl` | Lissajous curve | u_time | P |
| `tut_06_spring.glsl` | Spring coil deformation | u_time | P |
| `tut_07_lifecycle.glsl` | Particle lifecycle | u_time | P Cd |
| `tut_08_quaternion.glsl` | Quaternion rotation | u_time | P |
| `tut_09_growth.glsl` | L-system growth | u_time | P Cd |
| `tut_10_audio_reactive.glsl` | Audio-reactive displacement | u_time, u_bass, u_treble | P |

### Category 3: Suite Levels (Complexity Progression)

| File | Level | Description | Features |
|------|-------|-------------|----------|
| `suite_L1_displacement.glsl` | L1 | Basic position displacement | P |
| `suite_L2_color.glsl` | L2 | Color output via Cd | P Cd |
| `suite_L3_multiple_attrs.glsl` | L3 | Multiple attributes | P Cd |
| `suite_L4_noise_anim.glsl` | L4 | Noise animation | TDSimplexNoise |
| `suite_L5_force_field.glsl` | L5 | Force field with uniform | const params |
| `suite_L6_multi_source.glsl` | L6 | Multiple noise sources | Blended noise |
| `suite_L7_pixel_blur.glsl` | L7 | Pixel blur (glslTOP) | Fragment shader |

### Category 4: TOP Shaders (glslTOP)

| File | Description | Features |
|------|-------------|----------|
| `top_threshold.glsl` | Threshold filter | Luminance, step |
| `top_edge_detect.glsl` | Sobel edge detection | 8-neighbor gradient |
| `top_invert.glsl` | Color inversion | 1.0 - color |
| `top_grayscale.glsl` | Grayscale conversion | Luminance weights |
| `top_chromatic_aberration.glsl` | Chromatic aberration | RGB offset |
| `top_soft_glow.glsl` | Soft glow bloom | 5x5 blur + composite |

### Category 5: Extreme GLSL

| File | Description | Features |
|------|-------------|----------|
| `extreme_prim_compute.glsl` | Primitive compute | Index-based position |
| `extreme_extraout.glsl` | Extra output attribute | Cd on glsladvancedPOP |
| `extreme_noise_anim.glsl` | Animated noise | TDSimplexNoise |
| `extreme_spiral_anim.glsl` | Animated spiral | Spiral + color |

### Category 6: Vertex Shaders (glslTOP vertexdat)

| File | Description | TD Functions |
|------|-------------|--------------|
| `vertex_wave.glsl` | Vertex wave deformation | TDDeformP, TDDeformOut |
| `vertex_noise_displace.glsl` | Vertex noise displacement | TDSimplexNoise |
| `vertex_twist.glsl` | Vertex twist deformation | Rotation matrix |
| `vertex_pulse.glsl` | Vertex pulsating scale | Scale transform |
| `vertex_passthrough_pixel.glsl` | Vertex pass-through | TDDeformP, TDDeformOut |

### Category 7: Glslcopy

| File | Description | Features |
|------|-------------|----------|
| `pop_glslcopy_hash.glsl` | Hash-based particle movement | glslcopyPOP, ptcomputedat |

### Category 8: TD Snippets

| File | Description | Features |
|------|-------------|----------|
| `snippet_passthrough.glsl` | Simple pass-through | TDIn_P() |
| `snippet_sin_wave.glsl` | Sin wave displacement | uTime |
| `snippet_sin_color.glsl` | Sin wave + color | Color[id] |
| `snippet_ripple.glsl` | Ripple custom attribute | Ripple[id] |
| `snippet_multi_attr.glsl` | Multi-attribute passthrough | Color, Thing |

### Category 9: Showcase Shaders

| File | Description | Features |
|------|-------------|----------|
| `showcase_sin_wave.glsl` | Sinusoidal wave | Multi-frequency |
| `showcase_waves.glsl` | Multi-frequency wave | Twist matrix |
| `showcase_movement.glsl` | Orbital movement | Breathing scale |
| `showcase_explosion.glsl` | Radial explosion | Spiral rotation |
| `showcase_fountain.glsl` | Particle fountain | Index-based positions |
| `showcase_spiral_points.glsl` | Spiral with HSB | HSB to RGB |
| `showcase_color_pos.glsl` | Position-to-color | Mapping |
| `showcase_fractal.glsl` | Julia set fractal | Iteration |

### Category 10: NPasses (glslTOP multi-pass)

| File | Description | npasses |
|------|-------------|---------|
| `npasses_4pass_blur.glsl` | Progressive blur | 4 |
| `npasses_3pass_edge_glow.glsl` | Edge detect + glow | 3 |
| `npasses_2pass_colorgrade.glsl` | Color grading | 2 |
| `npasses_single_pass.glsl` | Single pass baseline | 1 |

---

## Critical Fixes Applied Today

### Fix 1: TDIn_P Compilation Error

**Problem:** `TDIn_P` : no matching overloaded function found
**Root Cause:** `computedat` set BEFORE source POP was wired
**Solution:** Changed build order to wire connections FIRST, then set computedat

**Files Fixed:**
- `test_live_td_glslpop_tutorials.py`
- `test_live_td_glslpop_10bases.py`
- `test_live_td_pop_glslcopy_feedback.py`

**Rule Added:** Section 18 in `docs/glsl_pop_shader_guide.md`

### Fix 2: #version 400 Error

**Problem:** `#version` must occur first in shader
**Root Cause:** TD manages its own version directive
**Solution:** Removed `#version 400` from shader text

**File Fixed:** `test_live_td_pop_glslcopy_feedback.py`

### Fix 3: Uniform Initializer Warning

**Problem:** `Ignoring initializer for uniform`
**Root Cause:** GLSL uniforms in TD can't have initializers
**Solution:** Removed `= 0.5` from uniform declarations, added const params

**File Fixed:** `test_live_td_glslpop_10bases.py`

---

## Documentation Created

| File | Description |
|------|-------------|
| `docs/glsl_pop_shader_guide.md` | Comprehensive GLSL POP guide (19 sections) |
| `docs/TD_PARAMETER_CHEATSHEET.md` | Parameter reference for all 7 families |
| `docs/GLSL_TEST_COVERAGE_SUMMARY.md` | This document |

### Skills Created

| Skill | Description | File |
|-------|-------------|------|
| `td-glslpop-create` | Create GLSL POP operators | `.agents/skills/td-glslpop-create.md` |
| `td-glslpop-shaders` | 12 GLSL shader patterns | `.agents/skills/td-glslpop-shaders.md` |
| `td-glslpop-debug` | Debug GLSL errors | `.agents/skills/td-glslpop-debug.md` |

---

## Coverage Matrix: Shader Features × Operator Types

| Feature | glslPOP | glsladvancedPOP | glslcopyPOP | glslTOP | glslTOP (vertex) | Test File(s) |
|---------|---------|-----------------|-------------|---------|------------------|--------------|
| Position (P) | ✅ | ✅ | ✅ | N/A | ✅ | 10bases, tutorials, suite, extreme |
| Color (Cd) | ✅ | ✅ | ❌ | N/A | ❌ | 10bases, tutorials, suite, snippets |
| Custom attrs | ❌ | ✅ | ❌ | N/A | ❌ | snippets (Ripple, Thing) |
| u_time | ✅ | ✅ | ✅ | ✅ | ✅ | all GLSL tests |
| Custom uniforms | ✅ | ✅ | ❌ | ✅ | ✅ | 10bases (u_strength), advanced (u_amount) |
| TDSimplexNoise | ✅ | ✅ | ❌ | ❌ | ✅ | 10bases, tutorials, suite, extreme |
| Feedback loops | ✅ | ❌ | ❌ | ✅ | ❌ | glslcopy_feedback, pingpong_feedback |
| Multi-pass | N/A | N/A | N/A | ✅ | N/A | npasses (4-pass, 3-pass, 2-pass) |
| Vertex shaders | N/A | N/A | N/A | ✅ | ✅ | vertex_shader (5 shaders) |
| const params | ✅ | ✅ | ❌ | ✅ | ✅ | 10bases, suite_L5, npasses |

---

## Test Infrastructure

### Orchestrator (`test_orchestrator_massive.py`)

Runs all 19 tests sequentially with:
- Auto-detection of `--keep` flag support
- Fallback to run without flags if `--keep` fails
- Unicode-safe output handling
- Container UUID tracking for cleanup
- PASS/FAIL/SKIP reporting per test

### Test Pattern

Each GLSL test follows:
1. **Build phase:** Create sandbox → Create nodes → Write DAT text → Wire connections → Set params
2. **Verify phase:** Inspect operators → Check errors → Verify params → Check connections → Async re-check
3. **Cleanup phase:** Destroy sandbox container

### Verification Checks

- Zero immediate errors
- Zero async errors (post-cook re-check)
- Parameter readback verification
- Connection integrity
- `/verify` endpoint health check

---

## Key Learnings

1. **BUILD ORDER MATTERS:** Wire connections BEFORE setting computedat
2. **No Uniform Initializers:** TD GLSL doesn't support `uniform float x = 0.5;`
3. **TD Manages #version:** Never include `#version` in shader text
4. **const Params Work on POP:** const0name/const0value work on glslPOP and glsladvancedPOP
5. **Async Error Detection:** Force cook + 2s wait + re-check catches delayed errors
6. **Sequence Params Reset:** extraout, reset, etc. are pulse/button params that auto-reset

---

*Generated by Buffy | Freebuff MCP Server*
*Date: July 30, 2026*
