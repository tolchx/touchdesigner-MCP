// 10 Bases: Feedback-aware displacement (glslPOP + feedbackPOP)
// Variable: GLSL_FEEDBACK
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 05: Feedback-aware displacement
// feedbackPOP.inputmul controls temporal blending
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float drift = sin(u_time * 0.4 + pos.x * 2.0 + pos.z * 1.5) * 0.06;
    float drift2 = cos(u_time * 0.3 + pos.y * 1.8 + pos.x * 2.2) * 0.05;
    pos.x += drift; pos.z += drift2;
    pos.y += sin(u_time * 0.2 + id * 0.003) * 0.03;
    P[id] = pos;
}
