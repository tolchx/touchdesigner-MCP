// Tutorials: Magnetic field displacement - dipole field lines (glslPOP)
// Variable: GLSL_MAGNETIC
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 02: Magnetic Field Displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 pole1 = vec3(sin(u_time * 0.7) * 1.5, 0.0, 0.0);
    vec3 pole2 = vec3(-sin(u_time * 0.7) * 1.5, 0.0, 0.0);
    vec3 field = vec3(0.0);
    vec3 d1 = pos - pole1;
    float r1 = max(length(d1), 0.1);
    field += d1 / (r1 * r1 * r1) * 0.5;
    vec3 d2 = pos - pole2;
    float r2 = max(length(d2), 0.1);
    field -= d2 / (r2 * r2 * r2) * 0.5;
    P[id] = pos + normalize(field) * 0.02;
}
