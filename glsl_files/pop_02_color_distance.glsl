// 10 Bases: Color by distance (glsladvancedPOP)
// Variable: GLSL_COLOR_DISTANCE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 02: Color by distance from origin
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float d = length(pos);
    P[id] = pos;
    Cd[id] = vec4(
        sin(d * 2.0 + u_time) * 0.5 + 0.5,
        cos(d * 1.5 + u_time * 0.7) * 0.5 + 0.5,
        1.0 - d * 0.3, 1.0);
}
