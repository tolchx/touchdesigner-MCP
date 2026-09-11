// Suite L3: Multi-attribute spiral + color (glsladvancedPOP)
// Variable: GLSL_L3_MULTI_ATTR
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 3: Multi-attribute glsladvancedPOP
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float angle = atan(pos.z, pos.x) + u_time * 0.5;
    float rad = length(pos.xz);
    pos.x = cos(angle) * rad; pos.z = sin(angle) * rad;
    pos.y += sin(u_time + id * 0.01) * 0.15;
    P[id] = pos;
    float d = length(pos);
    Cd[id] = vec4(d * 0.2, 0.8 - d * 0.1, 0.5 + d * 0.1, 1.0);
}
