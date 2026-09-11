// Advanced TOP: Feedback decal - zoom + fade (glslTOP + feedbackTOP)
// Variable: GLSL_TOP_FEEDBACK_DECAL
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 2: Feedback Loop - decal shader that zooms and fades
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st - vec2(0.5);
    uv *= 0.98;
    uv += vec2(0.5);
    vec4 fb = texture(sTD2DInputs[0], uv);
    fb.rgb *= 0.92;
    fragColor = TDOutputSwizzle(fb);
}
