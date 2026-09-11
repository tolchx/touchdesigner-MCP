// 10 Bases: Radial ripple wave from center (glslPOP)
// Variable: GLSL_RIPPLE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 09: Radial ripple wave from center
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float dist = length(pos.xz);
    float ripple1 = sin(dist * 8.0 - u_time * 4.0) * 0.08;
    float ripple2 = cos(dist * 5.0 + u_time * 2.5) * 0.05;
    float falloff = exp(-dist * 0.5);
    pos.y += (ripple1 + ripple2) * falloff;
    float pulse = sin(u_time * 1.5) * 0.1 * falloff;
    pos.xz *= 1.0 + pulse;
    P[id] = pos;
}
