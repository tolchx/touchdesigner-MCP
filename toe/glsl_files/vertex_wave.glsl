// Vertex wave deformation (glslTOP vertexdat)
// Variable: VERT_WAVE
// Source: test_live_td_glsl_vertex_shader.py
// Use with: glslTOP (vertexdat)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    vec4 p = TDDeformP(tdPosition[0]);
    p.y += sin(p.x * 3.0 + u_time) * 0.2;
    TDDeformOut(p);
}
