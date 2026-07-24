uniform float u_time;

// FBM noise for domain warping base
float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        value += amp * TDSimplexNoise(p * freq);
        freq *= 2.1;
        amp *= 0.45;
    }
    return value;
}

// Domain-warped noise: input to noise is itself a noise field
float domainWarp(vec3 p, float t) {
    vec3 q = vec3(
        fbm(p + vec3(0.0, 0.0, t * 0.2)),
        fbm(p + vec3(1.7, 2.3, t * 0.15)),
        fbm(p + vec3(4.1, 5.7, t * 0.25))
    );
    vec3 r = vec3(
        fbm(p + 2.5 * q + vec3(0.0, 0.0, t * 0.1)),
        fbm(p + 2.5 * q + vec3(1.2, 3.7, t * 0.12)),
        fbm(p + 2.5 * q + vec3(5.3, 0.8, t * 0.08))
    );
    return fbm(p + 1.5 * r);
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Domain-warped noise creates intricate terrain
    float warp = domainWarp(p * 0.4, u_time);

    // Secondary modulation: index-based variation
    float idxVar = float(id % 17) * 0.021;

    // Radial displacement with terrain features
    vec3 dir = p / distSafe;
    float displacement = warp * 0.5 + sin(p.x * 2.0 + p.z * 2.0 + u_time * 0.3) * 0.05;

    // Terrain stratification: bands of different displacement intensity
    float band = sin(p.y * 3.0 + warp * 2.0) * 0.5 + 0.5;
    displacement *= 0.6 + 0.4 * band;

    // Ridge-like features
    float ridge = 1.0 - abs(TDSimplexNoise(vec4(p * 0.6, u_time * 0.15)) - 0.5) * 2.0;
    ridge = pow(max(ridge, 0.0), 2.0);
    displacement += ridge * 0.15;

    // Index scatter for organic variation
    displacement += idxVar * 0.05;

    P[id] = p + dir * displacement;
}
