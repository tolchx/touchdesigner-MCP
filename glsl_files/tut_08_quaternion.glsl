// Tutorials: Quaternion rotation - axis-angle rotation (glsladvancedPOP)
// Variable: GLSL_QUATERNION
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 08: Quaternion Rotation (axis-angle)
uniform float u_time;
vec3 rotateAxis(vec3 p, vec3 axis, float angle) {
    float c = cos(angle); float s = sin(angle);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 axis = normalize(vec3(sin(u_time * 0.3), cos(u_time * 0.5), sin(u_time * 0.7)));
    float angle = u_time * 0.8;
    P[id] = rotateAxis(pos, axis, angle);
    Cd[id] = vec4(sin(angle + pos.x) * 0.5 + 0.5, cos(angle + pos.y) * 0.5 + 0.5,
        sin(angle * 0.5 + pos.z) * 0.5 + 0.5, 1.0);
}
