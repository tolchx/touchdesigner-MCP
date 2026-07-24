uniform float u_time;

// Curl noise: divergence-free vector field from simplex noise gradient
// Creates fluid-like swirling motion distinct from scalar noise displacement

// 3D simplex noise gradient (finite difference approximation)
vec3 noiseGrad(vec3 p) {
    float eps = 0.01;
    float v0 = TDSimplexNoise(p);
    float vx = TDSimplexNoise(p + vec3(eps, 0.0, 0.0));
    float vy = TDSimplexNoise(p + vec3(0.0, eps, 0.0));
    float vz = TDSimplexNoise(p + vec3(0.0, 0.0, eps));
    return (vec3(vx, vy, vz) - v0) / eps;
}

// Curl of a scalar field: curl(F) where F = scalarPotential * [1,1,1]
// curl(F) = (dF_z/dy - dF_y/dz, dF_x/dz - dF_z/dx, dF_y/dx - dF_x/dy)
vec3 curlNoise(vec3 p) {
    vec3 g = noiseGrad(p);
    // For scalar potential field, curl is the gradient cross with axis
    // Simplified: take cross product of noise gradient with direction
    vec3 curl;
    curl.x = g.y * 0.5 - g.z * 0.5;
    curl.y = g.z * 0.5 - g.x * 0.5;
    curl.z = g.x * 0.5 - g.y * 0.5;
    return curl;
}

// Multi-octave curl noise — FBM of curl fields
vec3 curlFbm(vec3 p, float t) {
    vec3 total = vec3(0.0);
    float amp = 1.0;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        vec3 q = p * freq + vec3(t * 0.15 * float(i+1));
        total += curlNoise(q) * amp;
        freq *= 2.1;
        amp *= 0.45;
    }
    return total;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;

    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float distSafe = max(dist, 0.001);

    // Per-point phase offset for spatial variety
    float idxPhase = float(id) * 0.073 + float(id % 11) * 0.041;

    // Layer 1: Primary curl noise displacement (divergence-free fluid flow)
    vec3 curl = curlFbm(p * 0.5 + vec3(0.0, 0.0, u_time * 0.08), u_time);

    // Layer 2: Secondary curl at different scale for micro-turbulence
    vec3 curlFine = curlFbm(p * 1.2 + vec3(1.7, 3.2, u_time * 0.12), u_time * 0.7);

    // Layer 3: Radial breathing envelope
    float breathe = 0.6 + 0.4 * sin(u_time * 0.3 + dist * 0.8 + idxPhase);

    // Layer 4: Vertical stratification — stronger displacement near equator
    float heightFactor = 1.0 - abs(p.y) * 0.3 / max(distSafe, 0.1);
    heightFactor = max(heightFactor, 0.2);

    // Layer 5: Index-based jitter for organic variation
    float jitter = sin(float(id) * 0.19 + u_time * 0.4 + p.x * 2.0) * 0.03;

    // Combine layers
    vec3 displacement = curl * 0.35 * breathe * heightFactor
                      + curlFine * 0.12 * breathe
                      + normalize(p + 0.001) * jitter * 0.5;

    // Layer 6: Tangential swirl — rotate displacement around Y axis by curl magnitude
    float swirlAngle = length(curl) * 0.5 + u_time * 0.05;
    float ca = cos(swirlAngle);
    float sa = sin(swirlAngle);
    vec3 swirled;
    swirled.x = displacement.x * ca - displacement.z * sa;
    swirled.y = displacement.y;
    swirled.z = displacement.x * sa + displacement.z * ca;

    P[id] = p + swirled;
}
