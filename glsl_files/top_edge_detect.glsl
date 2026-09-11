// Advanced TOP: Sobel edge detection (glslTOP)
// Variable: GLSL_TOP_EDGE_DETECT
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Chain 3 Pass 1: Sobel edge detection
out vec4 fragColor;
void main() {
    vec2 res = uTD2DInfos[0].res.zw;
    vec4 tl = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, -res.y));
    vec4 tc = texture(sTD2DInputs[0], vUV.st + vec2(0.0, -res.y));
    vec4 tr = texture(sTD2DInputs[0], vUV.st + vec2(res.x, -res.y));
    vec4 ml = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, 0.0));
    vec4 mr = texture(sTD2DInputs[0], vUV.st + vec2(res.x, 0.0));
    vec4 bl = texture(sTD2DInputs[0], vUV.st + vec2(-res.x, res.y));
    vec4 bc = texture(sTD2DInputs[0], vUV.st + vec2(0.0, res.y));
    vec4 br = texture(sTD2DInputs[0], vUV.st + vec2(res.x, res.y));
    vec3 sx = -tl.rgb - 2.0*ml.rgb - bl.rgb + tr.rgb + 2.0*mr.rgb + br.rgb;
    vec3 sy = -tl.rgb - 2.0*tc.rgb - tr.rgb + bl.rgb + 2.0*bc.rgb + br.rgb;
    float edge = length(sx) + length(sy);
    fragColor = TDOutputSwizzle(vec4(vec3(edge), 1.0));
}
