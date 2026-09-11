// Sobel edge detection
// Variable: GLSL_EDGE
// Source: test_live_td_glsl_advanced.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec2 uv = vUV.st;
    vec4 tl = texture(sTD2DInputs[0], uv + vec2(-texel.x, -texel.y));
    vec4 tc = texture(sTD2DInputs[0], uv + vec2(0.0, -texel.y));
    vec4 tr = texture(sTD2DInputs[0], uv + vec2(texel.x, -texel.y));
    vec4 ml = texture(sTD2DInputs[0], uv + vec2(-texel.x, 0.0));
    vec4 mr = texture(sTD2DInputs[0], uv + vec2(texel.x, 0.0));
    vec4 bl = texture(sTD2DInputs[0], uv + vec2(-texel.x, texel.y));
    vec4 bc = texture(sTD2DInputs[0], uv + vec2(0.0, texel.y));
    vec4 br = texture(sTD2DInputs[0], uv + vec2(texel.x, texel.y));
    vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;
    vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;
    float edge = length(sx) + length(sy);
    fragColor = TDOutputSwizzle(vec4(vec3(edge), 1.0));
}
