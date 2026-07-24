uniform float u_time;

// Lissajous attractor: parametric curve position
vec3 lissajousPos(float fx, float fy, float fz, float phase, float scale, float t) {
    float ax = t * fx + phase;
    float ay = t * fy + phase * 1.3;
    float az = t * fz + phase * 0.7;
    return vec3(
        sin(ax) * scale,
        sin(ay) * scale * 0.8,
        sin(az) * scale * 0.6
    );
}

// Multi-octave turbulence
float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.15));
        freq *= 2.1;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);

    // Golden-ratio phase per point for even spatial spread
    float phi = float(id) * 1.618;

    // Three Lissajous attractors with different frequency ratios
    float t = u_time * 0.3;
    vec3 a0 = lissajousPos(1.0, 1.5, 0.8, phi, 1.5, t);
    vec3 a1 = lissajousPos(1.33, 1.0, 1.2, phi * 1.7 + 2.0, 1.2, t * 0.8);
    vec3 a2 = lissajousPos(0.8, 1.25, 1.0, phi * 0.5 + 4.0, 0.9, t * 1.2);

    // Distance to each attractor
    float d0 = length(p - a0);
    float d1 = length(p - a1);
    float d2 = length(p - a2);

    // Gaussian influence falloff
    float inf0 = exp(-d0 * d0 * 0.5);
    float inf1 = exp(-d1 * d1 * 0.8);
    float inf2 = exp(-d2 * d2 * 0.6);

    // Direction toward each attractor
    vec3 dir0 = (a0 - p) / max(d0, 0.001);
    vec3 dir1 = (a1 - p) / max(d1, 0.001);
    vec3 dir2 = (a2 - p) / max(d2, 0.001);

    // Harmonic resonance envelope: each attractor's strength oscillates
    float res0 = 0.5 + 0.5 * sin(u_time * 0.4 + phi * 0.3);
    float res1 = 0.5 + 0.5 * sin(u_time * 0.6 + phi * 0.5 + 1.5);
    float res2 = 0.5 + 0.5 * sin(u_time * 0.5 + phi * 0.7 + 3.0);

    // Radial pull toward attractors
    vec3 pull = vec3(0.0);
    pull += dir0 * inf0 * 0.6 * res0;
    pull += dir1 * inf1 * 0.4 * res1;
    pull += dir2 * inf2 * 0.3 * res2;

    // Tangential orbital component around attractors
    vec3 tan0 = cross(normalize(p + 0.001), normalize(a0 + 0.001));
    vec3 tan1 = cross(normalize(p + 0.001), normalize(a1 + 0.001));
    vec3 tan2 = cross(normalize(p + 0.001), normalize(a2 + 0.001));
    pull += tan0 * inf0 * 0.4 * res0;
    pull += tan1 * inf1 * 0.3 * res1;
    pull += tan2 * inf2 * 0.2 * res2;

    // Simplex noise turbulence for organic drift
    float noise = turbulence(p * 0.5, u_time);
    pull += normalize(p + 0.001) * noise * 0.15;

    // Radial breathing envelope
    float dist = length(p);
    float breathe = 1.0 + 0.1 * sin(u_time * 0.3 + dist * 0.5);

    P[id] = p + pull * breathe;
}
