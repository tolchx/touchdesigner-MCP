// Suite L6B: Color by position (glsladvancedPOP)
// Variable: GLSL_L6B_COLOR
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 6B: glsladvancedPOP color by position
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(u_time * 0.6 + pos.y * 3.0) * 0.08;
    P[id] = pos + vec3(wave, 0.0, wave * 0.5);
    Cd[id] = vec4(sin(pos.x * 2.0 + u_time) * 0.5 + 0.5,
        cos(pos.y * 2.0 + u_time * 0.7) * 0.5 + 0.5,
        sin(pos.z * 2.0 + u_time * 1.3) * 0.5 + 0.5, 1.0);
}
