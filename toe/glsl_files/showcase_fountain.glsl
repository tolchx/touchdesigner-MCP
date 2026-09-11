// Showcase: Particle fountain (generates positions from index)
// Variable: SHADER_FOUNTAIN
// Source: test_live_td_glsl_shaders.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    float a = float(id) * 0.05 + u_time * 2.0;
    float r = 0.5 + sin(float(id) * 0.3 + u_time) * 0.3;
    float x = cos(a) * r * (1.0 + sin(u_time * 0.7) * 0.3);
    float z = sin(a) * r * (1.0 + cos(u_time * 0.5) * 0.3);
    float y = 2.0 + sin(float(id) * 0.1 + u_time * 1.5) * 1.5
             - abs(sin(u_time * 0.3)) * 3.0;
    P[id] = vec3(x, y + 2.0, z);
    Cd[id] = vec4(y * 0.2 + 0.5, 0.8, 1.0 - y * 0.15, 1.0);
}
