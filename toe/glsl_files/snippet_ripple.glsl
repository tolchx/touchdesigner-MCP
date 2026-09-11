// TD snippet glsl7: Ripple intensity as custom attribute
// Variable: GLSL_RIPPLE_ATTR
// Source: test_live_td_glsl_snippets.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements())
        return;
    vec3 originalPos = TDIn_P();
    float pulse = 1.0 + 0.3 * sin(uTime);
    vec3 pos = originalPos * pulse;
    float wave = 0.2 * sin(uTime * 2.0 + originalPos.x);
    pos.y += wave;
    P[id] = pos;
    float rippleIntensity = abs(wave) * 5.0;
    rippleIntensity = clamp(rippleIntensity, 0.0, 1.0);
    Ripple[id] = rippleIntensity;
    float colorFreq = 5.0 / pulse;
    vec4 color = vec4(
        0.5 + 0.5 * sin(originalPos.x * colorFreq + uTime),
        rippleIntensity,
        0.5 + 0.5 * sin(originalPos.z * colorFreq + uTime),
        1.0
    );
    Color[id] = color;
}
