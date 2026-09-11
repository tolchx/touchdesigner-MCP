// 10 Bases: Fractal displacement with iterative noise (glslPOP)
// Variable: GLSL_FRACTAL
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 07: Fractal displacement (iterative noise)
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float amp = 0.2; float freq = 1.0;
    vec3 offset = vec3(0.0);
    for (int i = 0; i < 5; i++) {
        float n = TDSimplexNoise(vec4(pos * freq + offset, u_time * 0.3));
        offset += vec3(n * amp, n * amp * 0.5, n * amp * 0.7);
        amp *= 0.5; freq *= 2.0;
    }
    P[id] = pos + offset;
}
