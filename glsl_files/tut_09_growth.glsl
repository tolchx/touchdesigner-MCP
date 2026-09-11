// Tutorials: Emergent growth - noise-driven organic (glsladvancedPOP)
// Variable: GLSL_GROWTH
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 09: Emergent Growth Pattern
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float seed = TDSimplexNoise(vec4(pos * 0.5, 0.0, 0.0));
    float growth = smoothstep(-0.3, 0.3, sin(seed * 6.0 + u_time * 0.5));
    float branch = TDSimplexNoise(vec4(pos * 2.0 + seed, u_time * 0.3, 0.0));
    float height = growth * 0.4 + branch * 0.2;
    P[id] = pos + vec3(0.0, height, 0.0);
    Cd[id] = vec4(growth * 0.5, 0.8 - growth * 0.3, branch * 0.5 + 0.3, 1.0);
}
