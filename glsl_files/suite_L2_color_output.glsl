// Suite L2: glsladvancedPOP P + Cd color output
// Variable: GLSL_L2_COLOR_OUTPUT
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 2: glsladvancedPOP P + Cd output
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n = sin(u_time + pos.x * 2.0 + pos.y * 1.5) * 0.1;
    P[id] = pos + vec3(n * 0.5, n, 0.0);
    Cd[id] = vec4(pos.y * 0.3 + 0.5, 0.6, 1.0 - pos.y * 0.3, 1.0);
}
