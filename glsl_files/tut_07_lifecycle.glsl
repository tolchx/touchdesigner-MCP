// Tutorials: Particle lifecycle - birth to decay (glsladvancedPOP)
// Variable: GLSL_LIFECYCLE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 07: Particle Age/Lifecycle
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float phase = float(id) * 0.13;
    float age = fract(u_time * 0.15 + phase);
    float scale;
    if (age < 0.2) scale = age / 0.2;
    else if (age < 0.5) scale = 1.0;
    else if (age < 0.8) scale = 1.0;
    else scale = (1.0 - age) / 0.2;
    float angle = age * 6.283 + phase;
    float radius = scale * 1.5;
    P[id] = vec3(cos(angle) * radius, age * 2.0 - 1.0, sin(angle) * radius);
    Cd[id] = vec4(scale, 1.0 - age, age * 0.5, 1.0);
}
