// Quaternion rotation of particle positions
// Variable: GLSL_QUAT
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
vec4 quatMul(vec4 a, vec4 b) {
    return vec4(
        a.w*b.xyz + b.w*a.xyz + cross(a.xyz, b.xyz),
        a.w*b.w - dot(a.xyz, b.xyz)
    );
}
vec3 quatRotate(vec4 q, vec3 v) {
    vec4 qv = vec4(v, 0.0);
    vec4 conj = vec4(-q.xyz, q.w);
    return quatMul(quatMul(q, qv), conj).xyz;
}
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float a = u_time * 0.5;
    vec4 q = vec4(sin(a), 0.0, 0.0, cos(a));
    p = quatRotate(q, p);
    P[id] = p;
}
