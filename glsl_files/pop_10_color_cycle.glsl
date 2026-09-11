// 10 Bases: Color cycling animation (glsladvancedPOP)
// Variable: GLSL_COLOR_CYCLE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 10: Color cycling animation
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float wave = sin(pos.x * 2.0 + u_time) * 0.08;
    P[id] = pos + vec3(0.0, wave, 0.0);
    float hue = fract(atan(pos.z, pos.x) / 6.283 + u_time * 0.1 + pos.y * 0.3);
    float sat = 0.8 + 0.2 * sin(pos.y * 3.0);
    float val = 0.7 + 0.3 * cos(pos.x * 2.0 + u_time * 0.5);
    vec3 rgb = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    Cd[id] = vec4(rgb * val * sat, 1.0);
}
