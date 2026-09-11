// Advanced TOP: Luminance threshold (glslTOP)
// Variable: GLSL_TOP_THRESHOLD
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 1a: Threshold - luminance-based black/white threshold
out vec4 fragColor;
void main() {
    vec4 src = texture(sTD2DInputs[0], vUV.st);
    float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
    float thresh = 0.3;
    vec3 result = (lum > thresh) ? src.rgb : vec3(0.0);
    fragColor = TDOutputSwizzle(vec4(result, 1.0));
}
