// Showcase: Spiral with HSB coloring
// Variable: SHADER_SPIRAL
// Source: test_live_td_glsl_shaders.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

#define TAU 6.28318530718
uniform float u_time;
vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    rgb = rgb*rgb*(3.0-2.0*rgb);
    return c.z*mix(vec3(1.0),rgb,c.y);
}
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    float t = float(id) / float(TDNumElements() - 1);
    float turns = 5.0;
    float angle = t * turns * TAU + u_time;
    float radius = t * 2.0 + sin(t * 30.0 + u_time * 2.0) * 0.1;
    vec3 pos = vec3(cos(angle) * radius, sin(angle) * radius, t * 2.0 - 1.0);
    P[id] = pos;
    Cd[id] = vec4(hsb2rgb(vec3(t, 0.7, 0.9)), 1.0);
}
