// 10 Bases: Noise turbulence displacement (glslPOP)
// Variable: GLSL_NOISE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 04: Noise turbulence displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n1 = TDSimplexNoise(vec4(pos * 2.0, u_time * 0.5));
    float n2 = TDSimplexNoise(vec4(pos * 4.0 + 100.0, u_time * 0.3));
    float n3 = TDSimplexNoise(vec4(pos * 8.0 + 200.0, u_time * 0.2));
    float turbulence = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
    P[id] = pos + vec3(n1, n2, n3) * 0.2 * turbulence;
}
