// Vertex pass-through + pixel shader
// Variable: VERT_PASSTHROUGH
// Source: test_live_td_glsl_vertex_shader.py
// Use with: glslTOP (vertexdat)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    vec4 p = TDDeformP(tdPosition[0]);
    TDDeformOut(p);
}
