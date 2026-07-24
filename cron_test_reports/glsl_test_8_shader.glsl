uniform float u_time;

// Chladni plate standing wave: cos(n*pi*x/L)*cos(m*pi*y/L) - cos(m*pi*x/L)*cos(n*pi*y/L)
float chladniMode(vec2 pos, float L, float n, float m) {
    float x = pos.x;
    float y = pos.y;
    float PI = 3.14159265;
    float nx = n * PI * x / L;
    float mx = m * PI * x / L;
    float ny = n * PI * y / L;
    float my = m * PI * y / L;
    return cos(nx) * cos(my) - cos(mx) * cos(ny);
}

// Smooth mode blending weight
float modeWeight(float t, float phase) {
    return 0.5 + 0.5 * sin(t * 0.3 + phase);
}

// Multi-octave turbulence for surface noise
float turbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 3; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.15));
        freq *= 2.3;
        amp *= 0.45;
    }
    return val;
}

// Gradient of chladni for tangential displacement
vec2 chladniGrad(vec2 pos, float L, float n, float m) {
    float eps = 0.01;
    float dx = chladniMode(pos + vec2(eps, 0.0), L, n, m) - chladniMode(pos - vec2(eps, 0.0), L, n, m);
    float dy = chladniMode(pos + vec2(0.0, eps), L, n, m) - chladniMode(pos - vec2(0.0, eps), L, n, m);
    return vec2(dx, dy) / (2.0 * eps);
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    
    // gridPOP with planey=True gives points in XZ plane
    vec2 pos = p.xz;
    float L = 2.0; // plate half-size (grid extends ±1.0)
    
    float t = u_time;
    
    // --- Layer 1: Slow-evolving fundamental modes ---
    // Mode (2,3): classic rectangular Chladni figure
    float n1 = 2.0 + 0.3 * sin(t * 0.12);
    float m1 = 3.0 + 0.3 * cos(t * 0.09);
    float w1 = 0.6 + 0.4 * sin(t * 0.07);
    float c1 = chladniMode(pos, L, n1, m1);
    
    // Mode (4,1): higher-frequency cross pattern
    float n2 = 4.0 + 0.4 * sin(t * 0.15 + 1.2);
    float m2 = 1.0 + 0.2 * cos(t * 0.11 + 0.8);
    float w2 = 0.4 + 0.3 * sin(t * 0.13 + 2.5);
    float c2 = chladniMode(pos, L, n2, m2);
    
    // Mode (1,5): tall thin stripes
    float n3 = 1.0 + 0.2 * sin(t * 0.18 + 3.0);
    float m3 = 5.0 + 0.5 * cos(t * 0.14 + 1.5);
    float w3 = 0.3 + 0.2 * sin(t * 0.10 + 0.3);
    float c3 = chladniMode(pos, L, n3, m3);
    
    // Mode (3,3): symmetric square pattern
    float n4 = 3.0 + 0.25 * sin(t * 0.06 + 0.5);
    float m4 = 3.0 + 0.25 * cos(t * 0.08 + 2.0);
    float w4 = 0.5 + 0.3 * sin(t * 0.11 + 1.0);
    float c4 = chladniMode(pos, L, n4, m4);
    
    // --- Layer 2: Vertical displacement from combined modes ---
    float combined = w1 * c1 + w2 * c2 + w3 * c3 + w4 * c4;
    float amplitude = 0.3;
    float yDisp = combined * amplitude;
    
    // --- Layer 3: Tangential surface displacement (along plate) ---
    // Follow the gradient of the dominant mode for fluid surface flow
    float dominantW = max(max(w1, w2), max(w3, w4));
    vec2 grad = vec2(0.0);
    if(dominantW == w1 || abs(dominantW - w1) < 0.01) {
        // Check each mode's contribution
    }
    grad = chladniGrad(pos, L, n1, m1) * w1 * 0.08;
    grad += chladniGrad(pos, L, n2, m2) * w2 * 0.06;
    grad += chladniGrad(pos, L, n3, m3) * w3 * 0.04;
    
    // --- Layer 4: Noise overlay for organic surface texture ---
    float noise = turbulence(p * 0.6, t) * 0.04;
    
    // --- Layer 5: Radial breathing envelope ---
    float dist = length(pos);
    float breathe = 1.0 - 0.2 * dist * dist;
    
    // --- Layer 6: Per-point phase for spatial variety ---
    float idxPhase = float(id) * 0.033;
    float spatialJitter = sin(pos.x * 8.0 + pos.y * 6.0 + idxPhase + t * 0.5) * 0.02;
    
    // --- Combine ---
    vec3 result;
    result.x = p.x + grad.x + noise * pos.x * 0.5 + spatialJitter;
    result.y = p.y + yDisp * breathe + noise * 0.3;
    result.z = p.z + grad.y + noise * pos.y * 0.5 + spatialJitter;
    
    P[id] = result;
}
