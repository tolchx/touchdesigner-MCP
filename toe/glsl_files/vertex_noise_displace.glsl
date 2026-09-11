// Vertex noise displacement
// Variable: VERT_NOISE
// Source: test_live_td_glsl_vertex_shader.py
// Use with: glslTOP (vertexdat)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    vec4 p = TDDeformP(tdPosition[0]);
    vec4 n = TDSimplexNoise(vec4(p.xyz * 2.0, u_time * 0.5));
    p.xyz += n.xyz * 0.2;
    TDDeformOut(p);
}
