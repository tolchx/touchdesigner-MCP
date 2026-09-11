// Vertex: Time-based pulse scaling (glslTOP vertexdat)
// Variable: VS_PULSE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Vertex shader: time-based pulse scaling
uniform float u_time;
void main() {
    vec4 pos = P;
    float pulse = 1.0 + sin(u_time * 3.0) * 0.3;
    pos.xyz *= pulse;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
