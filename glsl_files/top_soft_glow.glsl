// Advanced TOP: Soft glow composite (glslTOP)
// Variable: GLSL_TOP_SOFT_GLOW
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 3 Pass 2: Soft glow on edge output
out vec4 fragColor;
void main() {
    vec2 res = uTD2DInfos[0].res.zw;
    vec4 sum = vec4(0.0);
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            vec2 offset = vec2(float(x), float(y)) * res * 2.0;
            sum += texture(sTD2DInputs[0], vUV.st + offset);
        }
    }
    vec4 blurred = sum / 25.0;
    vec4 sharp = texture(sTD2DInputs[0], vUV.st);
    vec4 result = max(sharp, blurred * 1.5);
    result.rgb *= vec3(0.3, 1.0, 0.5);
    fragColor = TDOutputSwizzle(result);
}
