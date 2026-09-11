// Extreme: glsladvancedPOP primitive compute (glsladvancedPOP)
// Variable: GLSL_PRIM_SHADER
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// glsladvancedPOP primitive compute - color by normal direction
uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    float wave = sin(u_time + pos.x * 3.0 + pos.y * 2.0) * 0.1;
    P[id] = pos + vec3(0.0, wave, 0.0);
    vec3 n = normalize(pos + vec3(0.001));
    Cd[id] = vec4(n * 0.5 + 0.5, 1.0);
}
