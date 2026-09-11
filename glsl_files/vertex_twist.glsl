// Vertex: Twist rotation by Y axis (glslTOP vertexdat)
// Variable: VS_TWIST
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Vertex shader: twist rotation based on Y
uniform float u_time;
void main() {
    vec4 pos = P;
    float twist = pos.y * 2.0 + u_time;
    float c = cos(twist); float s = sin(twist);
    vec3 twisted = vec3(pos.x * c - pos.z * s, pos.y, pos.x * s + pos.z * c);
    gl_Position = TDWorldToProj(TDModelToWorld(vec4(twisted, 1.0)));
    uv = uvable;
    color = CD;
}
