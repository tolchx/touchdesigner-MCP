// Suite L6A: Swirl displacement (glslPOP)
// Variable: GLSL_L6A_SWIRL
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 6A: glslPOP swirl displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float angle = u_time * 0.5 + length(pos.xz) * 2.0;
    pos.x += cos(angle) * 0.05;
    pos.z += sin(angle) * 0.05;
    pos.y += sin(u_time + id * 0.1) * 0.08;
    P[id] = pos;
}
