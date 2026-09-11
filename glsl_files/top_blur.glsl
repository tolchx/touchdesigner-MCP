// Advanced TOP: 3x3 box blur (glslTOP)
// Variable: GLSL_TOP_BLUR
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 1b: Blur - 3x3 box blur
out vec4 fragColor;
void main() {
    vec2 res = uTD2DInfos[0].res.zw;
    vec4 sum = vec4(0.0);
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) * res;
            sum += texture(sTD2DInputs[0], vUV.st + offset);
        }
    }
    fragColor = TDOutputSwizzle(sum / 9.0);
}
