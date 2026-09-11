// Tutorials: Spring dynamics - damped harmonic oscillation (glslPOP)
// Variable: GLSL_SPRING
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 06: Spring Dynamics (damped oscillation)
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float freq = sqrt(5.0);
    float amp = exp(-0.5 * u_time * 0.1);
    float osc = sin(freq * u_time + float(id) * 0.1);
    P[id] = pos + vec3(osc * amp * 0.15, cos(osc * 1.3) * amp * 0.1, sin(osc * 0.7) * amp * 0.12);
}
