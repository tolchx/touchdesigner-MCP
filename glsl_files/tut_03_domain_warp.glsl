// Tutorials: Domain warped turbulence - Inigo Quilez FBM (glslPOP)
// Variable: GLSL_DOMAIN_WARP
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 03: Domain Warped Turbulence
// Noise of noise - domain warping creates organic flow
uniform float u_time;
float fbm(vec3 p) {
    float f = 0.0; float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        f += amp * TDSimplexNoise(vec4(p, u_time * 0.1));
        p *= 2.1; amp *= 0.5;
    }
    return f;
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 q = vec3(fbm(pos), fbm(pos + vec3(5.2, 1.3, 0.0)), fbm(pos));
    vec3 r = vec3(fbm(pos + 4.0*q + vec3(1.7, 9.2, 0.0)),
        fbm(pos + 4.0*q + vec3(8.3, 2.8, 0.0)), fbm(pos + 4.0*q));
    float f = fbm(pos + 4.0 * r);
    P[id] = pos + vec3(f * 0.3, f * 0.2, f * 0.15);
}
