// Showcase: Julia set fractal displacement
// Variable: SHADER_FRACTAL
// Source: test_live_td_glsl_shaders.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    rgb = rgb*rgb*(3.0-2.0*rgb);
    return c.z*mix(vec3(1.0),rgb,c.y);
}
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    vec2 c = pos.xy * 1.5;
    vec2 z = vec2(0.0);
    vec2 juliaC = vec2(-0.7 + sin(u_time * 0.2) * 0.1, 0.27015 + cos(u_time * 0.3) * 0.1);
    float iter = 0.0;
    for (int i = 0; i < 20; i++) {
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + juliaC;
        if (dot(z, z) > 4.0) break;
        iter += 1.0;
    }
    float t = iter / 20.0;
    pos.z += t * 2.0 - 1.0;
    P[id] = pos;
    Cd[id] = vec4(hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9)), 1.0);
}
