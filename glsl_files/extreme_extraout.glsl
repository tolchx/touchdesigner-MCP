// Extreme: glsladvancedPOP extra output (extraout + extraout0name)
// Variable: GLSL_EXTRAOUT_SHADER
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// glsladvancedPOP with extra output - custom velocity attribute
uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    float angle = atan(pos.z, pos.x) + u_time * 0.3;
    float rad = length(pos.xz);
    pos.x = cos(angle) * rad;
    pos.z = sin(angle) * rad;
    pos.y += sin(u_time + id * 0.01) * 0.1;
    P[id] = pos;
    Cd[id] = vec4(pos.y * 0.3 + 0.5, 0.6, 1.0 - pos.y * 0.3, 1.0);
}
