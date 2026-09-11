// 3-pass edge detect + glow (glslTOP npasses=3)
// Variable: GLSL_3PASS_EDGE_GLOW
// Source: test_live_td_glsl_npasses.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec2 uv = vUV.st;
    vec4 color = texture(sTD2DInputs[0], uv);
    if (uTDPass == 0) {
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
        color = vec4(vec3(edge), 1.0);
    } else if (uTDPass == 1) {
        vec4 sum = vec4(0.0);
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);
            }
        }
        color = sum / 9.0;
    } else {
        vec4 edges = texture(sTD2DInputs[0], uv);
        color = edges * vec4(0.3, 1.0, 0.5, 1.0);
    }
    fragColor = TDOutputSwizzle(color);
}
