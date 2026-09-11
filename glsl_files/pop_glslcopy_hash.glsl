// GlslcopyPOP: Hash-based pseudo-noise displacement
// Variable: GLSLCOPY_COMPUTE_SHADER
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

#define G 1.0
uniform float u_time;
float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
}
void main(){
    uint id = TDIndex();
    vec3 p = TDIn_P(0, id);
    float n = hash21(p.xy + u_time * 0.1);
    P[id] = p + n * 0.1;
}
