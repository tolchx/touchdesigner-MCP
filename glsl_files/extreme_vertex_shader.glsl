// Extreme: GLSL TOP vertex shader - wave deformation (glslTOP vertexdat)
// Variable: GLSL_VERTEX_SHADER
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// GLSL TOP vertex shader - wave deformation of geometry
uniform float u_time;
void main() {
    vec4 pos = P;
    pos.y += sin(u_time * 2.0 + pos.x * 5.0 + pos.z * 3.0) * 0.15;
    pos.x += cos(u_time * 1.5 + pos.z * 4.0) * 0.08;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
