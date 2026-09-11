// Tutorials: Lissajous curve attractor - parametric 3D (glsladvancedPOP)
// Variable: GLSL_LISSAJOUS
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 05: Lissajous Curve Attractor
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float a = 3.0, b = 2.0, c = 5.0;
    float phase = float(id) * 0.05;
    float t = u_time * 0.8 + phase;
    vec3 target = vec3(sin(a * t + 1.57) * 1.5, sin(b * t) * 1.5, sin(c * t + 0.78) * 1.5);
    P[id] = mix(pos, target, 0.08);
    Cd[id] = vec4(sin(t) * 0.5 + 0.5, sin(t + 2.09) * 0.5 + 0.5, sin(t + 4.19) * 0.5 + 0.5, 1.0);
}
