// Showcase: Sinusoidal wave displacement
// Variable: SHADER_SIN_WAVE
// Source: test_live_td_glsl_shaders.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    float t = float(id) / float(TDNumElements() - 1);
    float wave = sin(t * 10.0 + u_time) * 0.5;
    wave += sin(t * 20.0 - u_time * 1.5) * 0.15;
    wave += sin(t * 5.0 + u_time * 0.7) * 0.25;
    pos.y = wave;
    P[id] = pos;
    Cd[id] = vec4(wave * 0.5 + 0.5, t, 1.0 - t, 1.0);
}
