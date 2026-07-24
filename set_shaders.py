R = '/project1/glsl_test_1'

warp_code = op(R + '/warp_code')
warp_code.text = """uniform float u_time;
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float nx = TDSimplexNoise(vec4(p * 0.6 + 50.0, u_time * 0.25));
    float ny = TDSimplexNoise(vec4(p * 0.6 + 150.0, u_time * 0.3));
    float nz = TDSimplexNoise(vec4(p * 0.6 + 250.0, u_time * 0.35));
    float angle = p.y * 0.5 + u_time * 0.2;
    vec3 offset;
    offset.x = (nx * 0.5 + sin(angle) * 0.1) * 0.25;
    offset.y = (ny * 0.4 + cos(p.x * 2.0 + u_time) * 0.08) * 0.25;
    offset.z = (nz * 0.5 + cos(angle) * 0.1) * 0.25;
    P[id] = p + offset;
}"""
print('warp OK', len(warp_code.text))

scat_code = op(R + '/scatter_code')
scat_code.text = """uniform float u_time;
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float pulse = sin(u_time * 0.8 + length(p) * 0.5) * 0.15 + 0.15;
    float dist = length(p);
    float sphereWarp = sin(dist * 2.0 - u_time * 0.6) * 0.12;
    float jx = TDSimplexNoise(vec4(p * 2.0 + 400.0, u_time * 0.5)) * 0.06;
    float jy = TDSimplexNoise(vec4(p * 2.0 + 500.0, u_time * 0.55)) * 0.06;
    float jz = TDSimplexNoise(vec4(p * 2.0 + 600.0, u_time * 0.6)) * 0.06;
    vec3 dir = normalize(p + 0.001);
    P[id] = p + dir * pulse + vec3(jx, jy, jz) + dir * sphereWarp;
}"""
print('scatter OK', len(scat_code.text))
