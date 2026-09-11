// Vertex: Simplex noise displacement (glslTOP vertexdat)
// Variable: VS_NOISE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Vertex shader: simplex noise displacement
#include "util_noise.glsl"
uniform float u_time;
void main() {
    vec4 pos = P;
    float n = snoise(pos.xyz * 2.0 + u_time * 0.5);
    pos.xyz += normalize(pos.xyz + vec3(0.001)) * n * 0.2;
    gl_Position = TDWorldToProj(TDModelToWorld(pos));
    uv = uvable;
    color = CD;
}
