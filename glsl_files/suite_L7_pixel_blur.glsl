// Suite L7: Multi-pass pixel blur with const uniforms (glslTOP)
// Variable: GLSL_L7_PIXELBLUR
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Level 7: Multi-pass pixel shader - iterative box blur
uniform float u_radius;
uniform float u_strength;
out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec4 sum = vec4(0.0); float total = 0.0;
    int rad = int(u_radius);
    for (int x = -rad; x <= rad; x++) {
        for (int y = -rad; y <= rad; y++) {
            vec2 offset = vec2(float(x), float(y)) * texel * u_strength;
            sum += texture(sTD2DInputs[0], uv + offset);
            total += 1.0;
        }
    }
    fragColor = TDOutputSwizzle(sum / total);
}
