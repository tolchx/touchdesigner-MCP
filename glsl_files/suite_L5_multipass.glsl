// Suite L5: Multi-pass glslPOP (npasses=3)
// Variable: GLSL_L5_MULTIPASS
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 5: Multi-pass iterative displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 3.0 + pos.z * 2.1 + u_time) * 0.1;
    pos.y += wave;
    P[id] = pos;
}
