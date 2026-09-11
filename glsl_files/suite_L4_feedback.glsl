// Suite L4: Feedback-aware glslPOP (temporal drift)
// Variable: GLSL_L4_FEEDBACK
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 4: Feedback-aware glslPOP
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float drift = sin(u_time * 0.3 + pos.x * 1.5 + pos.z * 2.0) * 0.08;
    pos.x += drift;
    pos.z += cos(u_time * 0.4 + pos.y * 1.8) * 0.06;
    pos.y += sin(u_time * 0.2 + id * 0.005) * 0.04;
    P[id] = pos;
}
