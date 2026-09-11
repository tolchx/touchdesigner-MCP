// Suite L1: Basic glslPOP displacement
// Variable: GLSL_L1_DISPLACEMENT
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 1: Basic glslPOP displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(u_time * 0.8 + pos.x * 3.0 + pos.y * 2.0) * 0.15;
    P[id] = pos + vec3(wave, wave * 0.5, 0.0);
}
