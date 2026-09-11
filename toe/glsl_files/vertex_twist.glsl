// Vertex twist deformation around Y axis
// Variable: VERT_TWIST
// Source: test_live_td_glsl_vertex_shader.py
// Use with: glslTOP (vertexdat)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    vec4 p = TDDeformP(tdPosition[0]);
    float angle = p.y * 0.5 + u_time;
    float ct = cos(angle), st = sin(angle);
    vec2 xz = vec2(p.x * ct - p.z * st, p.x * st + p.z * ct);
    p.xz = xz;
    TDDeformOut(p);
}
