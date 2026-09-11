// 10 Bases: Multi-pass iterative displacement (glslPOP, npasses=4)
// Variable: GLSL_MULTIPASS
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 06: Multi-pass iterative displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float amp = 0.12 / float(uTDPass + 1);
    float wave = sin(pos.x * 5.0 + pos.z * 3.0 + u_time + float(uTDPass) * 1.5) * amp;
    pos.y += wave;
    pos.x += cos(pos.z * 4.0 + u_time * 0.8 + float(uTDPass) * 1.2) * amp * 0.5;
    P[id] = pos;
}
