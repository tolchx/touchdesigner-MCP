// 10 Bases: Sinusoidal wave displacement (glslPOP)
// Variable: GLSL_WAVE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 01: Sinusoidal wave displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 3.0 + pos.z * 2.0 + u_time * 1.5) * 0.15;
    float wave2 = cos(pos.z * 2.5 + pos.x * 1.8 + u_time * 1.2) * 0.1;
    P[id] = pos + vec3(wave2, wave, wave * 0.5);
}
