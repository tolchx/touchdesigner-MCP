uniform float u_time;

// Lorenz system: sigma, rho, beta
// Creates the iconic butterfly-shaped strange attractor
const float sigma = 10.0;
const float rho = 28.0;
const float beta = 8.0 / 3.0;

// Lorenz derivative
vec3 lorenz(vec3 p) {
    vec3 v;
    v.x = sigma * (p.y - p.x);
    v.y = p.x * (rho - p.z) - p.y;
    v.z = p.x * p.y - beta * p.z;
    return v;
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
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Per-point phase: golden ratio + index variation for diverse trajectories
    float phase = float(id) * 1.618 + float(id % 7) * 0.079;

    // Map point into Lorenz attractor space
    // Lorenz attractor operates at scale ~30, so we scale up
    vec3 lpos = p * 10.0 + vec3(0.0, 0.0, 25.0);

    // Layer 1: Primary Lorenz trajectory (direct position mapping)
    vec3 vel1 = lorenz(lpos + vec3(sin(phase), cos(phase * 1.3), 0.0));

    // Layer 2: Time-shifted trajectory branch
    vec3 lpos2 = lpos + vec3(2.0 * sin(u_time * 0.1 + phase), 0.0, 2.0 * cos(u_time * 0.1 + phase * 0.7));
    vec3 vel2 = lorenz(lpos2);

    // Layer 3: Inverted attractor branch (opposite wing of the butterfly)
    vec3 lpos3 = -lpos + vec3(0.0, 5.0 * sin(u_time * 0.08 + phase * 1.1), 5.0 * cos(u_time * 0.12));
    vec3 vel3 = lorenz(lpos3);

    // Blend the three trajectories with time-varying weights
    float w1 = 0.5 + 0.3 * sin(u_time * 0.15 + phase * 0.5);
    float w2 = 0.4 + 0.3 * sin(u_time * 0.2 + phase * 0.8 + 1.5);
    float w3 = 0.3 + 0.3 * cos(u_time * 0.18 + phase * 0.3 + 3.0);
    float wSum = w1 + w2 + w3;
    w1 /= wSum; w2 /= wSum; w3 /= wSum;

    vec3 displacement = (vel1 * w1 + vel2 * w2 + vel3 * w3) * 0.025;

    // Radial breathing envelope
    float breathe = 0.6 + 0.4 * sin(u_time * 0.3 + dist * 0.8 + phase * 0.2);
    displacement *= breathe;

    // Noise turbulence overlay
    float noise = turbulence(p * 0.5 + vec3(phase * 0.1), u_time);
    float noiseStrength = 0.06 + 0.02 * sin(u_time * 0.22 + phase);

    // Add noise in tangent plane
    vec3 dir = normalize(p + 0.001);
    vec3 up = abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(dir, up));
    vec3 bitangent = normalize(cross(dir, tangent));
    displacement += tangent * noise * noiseStrength;
    displacement += bitangent * TDSimplexNoise(vec4(p * 0.7, u_time * 0.2 + phase * 0.3)) * noiseStrength;

    // Height modulation: points further from origin get Y bias from Lorenz
    float heightBias = vel1.y * 0.01 * breathe;
    displacement.y += heightBias;

    // Per-point micro-jitter for organic feel
    float jitter = sin(float(id) * 0.23 + u_time * 0.5 + p.x * 1.5) * 0.015;
    displacement += vec3(jitter);

    P[id] = p + displacement;
}
