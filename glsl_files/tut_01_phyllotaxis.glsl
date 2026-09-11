// Tutorials: Phyllotaxis spiral layout - golden angle (glsladvancedPOP)
// Variable: GLSL_PHYLLLOTAXIS
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 01: Phyllotaxis Spiral Layout
// Golden angle distribution - each point placed at 137.5 degree increment
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float n = float(id);
    float golden_angle = 2.39996323;
    float phi = n * golden_angle + u_time * 0.5;
    float r = sqrt(n) * 0.08;
    vec3 target = vec3(cos(phi) * r, sin(phi) * r, 0.0);
    float expansion = 1.0 + sin(u_time * 0.3) * 0.3;
    P[id] = mix(pos, target * expansion, 0.15);
}
