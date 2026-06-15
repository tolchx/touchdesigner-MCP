// Noise Deform - Simplex Noise 4D displacement
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    vec3 norm = TDIn_N(0, id);
    float noise = TDSimplexNoise(vec4(pos * 0.5, u_time * 0.3));
    pos += norm * noise * 0.4;
    P[id] = pos;
}
