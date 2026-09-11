// Tutorials: Audio-reactive heightfield - multi-band simulation (glsladvancedPOP)
// Variable: GLSL_AUDIO_REACTIVE
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Tut 10: Audio-Reactive Heightfield (simulated)
uniform float u_time;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    float x = (pos.x + 2.0) / 4.0;
    float bass = sin(x * 3.0 + u_time * 4.0) * 0.4;
    float mid = sin(x * 15.0 + u_time * 6.0) * 0.2;
    float high = sin(x * 30.0 + u_time * 8.0) * 0.1;
    P[id] = pos + vec3(0.0, (bass + mid + high) * 0.5, 0.0);
    Cd[id] = vec4(abs(bass) * 2.0, abs(mid) * 2.0, abs(high) * 2.0, 1.0);
}
