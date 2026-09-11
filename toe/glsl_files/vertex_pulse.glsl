// Vertex pulsating scale
// Variable: VERT_PULSE
// Source: test_live_td_glsl_vertex_shader.py
// Use with: glslTOP (vertexdat)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    vec4 p = TDDeformP(tdPosition[0]);
    float scale = 1.0 + sin(u_time * 2.0) * 0.2;
    p.xyz *= scale;
    TDDeformOut(p);
}
