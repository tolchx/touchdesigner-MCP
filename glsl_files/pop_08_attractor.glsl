// 10 Bases: Attraction field with const params (glsladvancedPOP)
// Variable: GLSL_ATTRACTOR
//
// TouchDesigner GLSL shader
// Use with: glslPOP, glsladvancedPOP, glslTOP, or glslcopyPOP
//

// Base 08: Attraction field toward center
// u_strength is set via TD const params (const0name/const0value)
uniform float u_time;
uniform float u_strength;
void main() {
    uint id = TDIndex();
    vec3 pos = TDIn_P(0, id);
    vec3 center = vec3(0.0, sin(u_time * 0.5) * 0.3, 0.0);
    vec3 dir = center - pos;
    float dist = length(dir);
    vec3 norm_dir = dist > 0.001 ? dir / dist : vec3(0.0);
    float force = u_strength / (dist * dist + 0.5);
    vec3 orbital = vec3(-pos.z, 0.0, pos.x) * 0.3;
    P[id] = pos + norm_dir * force * 0.05 + orbital * 0.02;
    Cd[id] = vec4(force * 0.5, 1.0 - force * 0.3, 0.8, 1.0);
}
