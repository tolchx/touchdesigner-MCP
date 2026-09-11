// Suite L5: glslTOP const uniform-driven color grading
// Variable: GLSL_L5_TOP_CONST
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 5 glslTOP: const uniform-driven color grading
uniform float u_amplitude;
uniform float u_frequency;
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    float wave = sin(uv.x * u_frequency + uv.y * u_frequency) * u_amplitude;
    vec3 color = vec3(wave * 0.5 + 0.5, uv.x, uv.y);
    fragColor = TDOutputSwizzle(vec4(color, 1.0));
}
