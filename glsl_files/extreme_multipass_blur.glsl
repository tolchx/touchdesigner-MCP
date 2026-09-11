// Extreme: Multi-pass progressive blur (glslTOP, npasses=4)
// Variable: GLSL_MULTIPASS_SHADER
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Multi-pass GLSL TOP - progressive blur using npasses
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
    vec4 color = sum / 9.0;
    color.g += 0.02;
    fragColor = TDOutputSwizzle(color);
}
