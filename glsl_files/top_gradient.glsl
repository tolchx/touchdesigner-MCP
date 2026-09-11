// Advanced TOP: Procedural gradient with time (glslTOP)
// Variable: GLSL_TOP_GRADIENT
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 1c: Color Manipulation - procedural gradient with time
out vec4 fragColor;
uniform float u_time;
void main() {
    vec2 st = vUV.st;
    vec3 col = vec3(0.5 + 0.5 * sin(st.x * 6.28 + u_time),
        0.5 + 0.5 * sin(st.y * 6.28 + u_time * 0.7),
        0.5 + 0.5 * sin((st.x + st.y) * 3.14 + u_time * 1.3));
    fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
