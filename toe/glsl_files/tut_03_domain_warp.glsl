// Domain warping with FBM noise
// Variable: GLSL_DOMAINWARP
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
float fbm(vec2 p) {
    float f = 0.0;
    for (int i = 0; i < 4; i++) {
        f += 0.5 * TDSimplexNoise(vec4(p, 0.0, 0.0)).x;
        p *= 2.0;
    }
    return f;
}
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    vec2 warped = p.xy + vec2(fbm(p.xy + u_time), fbm(p.xy + 100.0));
    p.z += fbm(warped) * 0.5;
    P[id] = p;
}
