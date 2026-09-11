// Vertex: Sinusoidal wave deformation (glslTOP vertexdat)
// Variable: VS_WAVE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Vertex shader: sinusoidal wave deformation
uniform float u_time;
void main() {
    vec4 pos = P;
    pos.y += sin(u_time * 2.0 + pos.x * 5.0 + pos.z * 3.0) * 0.15;
    pos.x += cos(u_time * 1.5 + pos.z * 4.0) * 0.08;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
