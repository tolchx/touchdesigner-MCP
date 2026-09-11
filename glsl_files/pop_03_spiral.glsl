// 10 Bases: Spiral vortex displacement (glsladvancedPOP)
// Variable: GLSL_SPIRAL
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 03: Spiral vortex displacement
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float angle = atan(pos.z, pos.x) + u_time * 0.8;
    float rad = length(pos.xz);
    float spiral = sin(rad * 4.0 - u_time * 3.0) * 0.15;
    pos.x = cos(angle) * rad;
    pos.z = sin(angle) * rad;
    pos.y += spiral;
    P[id] = pos;
    Cd[id] = vec4(sin(angle + u_time) * 0.5 + 0.5, rad * 0.3,
        cos(angle - u_time) * 0.5 + 0.5, 1.0);
}
