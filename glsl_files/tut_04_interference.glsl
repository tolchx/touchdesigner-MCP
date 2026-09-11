// Tutorials: Sine wave interference - multiple point sources (glslPOP)
// Variable: GLSL_INTERFERENCE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 04: Sine Wave Interference Pattern
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 s1 = vec3(2.0, 0.0, 0.0);
    vec3 s2 = vec3(-2.0, 0.0, 0.0);
    vec3 s3 = vec3(0.0, 0.0, 2.0);
    float d1 = length(pos.xz - s1.xz);
    float d2 = length(pos.xz - s2.xz);
    float d3 = length(pos.xz - s3.xz);
    float wave = sin(d1 * 4.0 - u_time * 3.0) * 0.15
              + sin(d2 * 5.0 - u_time * 2.5) * 0.12
              + sin(d3 * 3.5 - u_time * 3.5) * 0.1;
    P[id] = pos + vec3(0.0, wave, 0.0);
}
