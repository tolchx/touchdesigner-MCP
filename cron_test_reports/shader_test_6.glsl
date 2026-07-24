uniform float u_time;

vec3 mb0, mb1, mb2;

void initMetaballs() {
    float t = u_time;
    mb0 = vec3(cos(t * 0.7) * 1.5, sin(t * 0.5) * 0.8, sin(t * 0.6) * 1.2);
    mb1 = vec3(sin(t * 0.4 + 1.2) * 1.0, cos(t * 0.6) * 1.0, cos(t * 0.5 + 0.8) * 0.8);
    mb2 = vec3(cos(t * 0.9 + 2.5) * 0.6, sin(t * 0.8 + 1.0) * 0.5, sin(t * 0.7 + 3.0) * 0.4);
}

void nearestMetaball(vec3 p, out int index, out float dist) {
    float d0 = length(p - mb0);
    float d1 = length(p - mb1);
    float d2 = length(p - mb2);
    if(d0 <= d1 && d0 <= d2) { index = 0; dist = d0; return; }
    if(d1 <= d2) { index = 1; dist = d1; return; }
    index = 2; dist = d2;
}

vec3 mbPos(int i) {
    if(i == 0) return mb0;
    if(i == 1) return mb1;
    return mb2;
}

float mbPulse(int i) {
    float rate;
    float phase;
    if(i == 0) { rate = 0.5; phase = 0.0; }
    else if(i == 1) { rate = 0.7; phase = 2.0; }
    else { rate = 0.9; phase = 4.0; }
    return sin(u_time * rate + phase) * 0.5 + 0.5;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    initMetaballs();
    
    int mbIdx;
    float mbDist;
    nearestMetaball(p, mbIdx, mbDist);
    
    vec3 mb = mbPos(mbIdx);
    vec3 dir = normalize(p - mb + 0.001);
    
    // Inverse-square pull toward nearest metaball
    float force = 0.08 / (mbDist * 0.3 + 0.1);
    float pullStrength = force * 0.4;
    
    // Tangent vortex around nearest metaball
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 tangent = cross(dir, up);
    if(dot(tangent, tangent) < 0.001)
        tangent = cross(dir, vec3(1.0, 0.0, 0.0));
    tangent = normalize(tangent);
    
    float pulse = mbPulse(mbIdx);
    float tangentStrength = force * 0.6 * pulse;
    
    vec3 displacement = dir * pullStrength + tangent * tangentStrength;
    
    // Noise overlay for organic feel
    float noise = TDSimplexNoise(vec4(p * 0.6, u_time * 0.3 + float(id) * 0.01)) * 0.15;
    displacement += normalize(p + 0.001) * noise;
    
    // Index-based organic variation
    float idxVar = sin(float(id) * 0.13 + u_time * 0.2) * 0.04;
    
    P[id] = p + displacement + vec3(idxVar);
}
