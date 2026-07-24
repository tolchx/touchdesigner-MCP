uniform float u_time;

float galaxyTurbulence(vec3 p, float t) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i = 0; i < 4; i++) {
        val += amp * TDSimplexNoise(vec4(p * freq, t * 0.2));
        freq *= 2.3;
        amp *= 0.45;
    }
    return val;
}

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    
    vec3 p = TDIn_P(0, id);
    
    float dist = length(p.xz);
    float distSafe = max(dist, 0.001);
    
    // Differential rotation: inner rotates faster
    float angularVel = 2.0 / (1.0 + dist * 0.8);
    float curAngle = atan(p.z, p.x);
    
    // Spiral arm: log spiral
    float armCount = 3.0;
    float logSpiral = curAngle + angularVel * u_time + log(distSafe) * 1.4;
    
    // Distance to nearest arm
    float armPhase = logSpiral * armCount / 6.2832;
    float armDist = abs(fract(armPhase + 0.5) - 0.5);
    
    // Gaussian arm profile
    float armWidth = 0.12 + 0.08 * dist;
    float armInfluence = exp(-armDist * armDist * 10.0 / (armWidth * armWidth));
    
    // Thickness wobble along the arm
    float armWobble = sin(logSpiral * 2.0 + u_time * 0.5) * 0.3 + 0.7;
    float radialOffset = armInfluence * armWobble * 0.5;
    
    // Tangent and radial directions
    float tangentAngle = curAngle + 1.5708;
    vec2 tangentDir = vec2(cos(tangentAngle), sin(tangentAngle));
    vec2 radialDir = vec2(cos(curAngle), sin(curAngle));
    
    // Arm displacement in XZ
    vec2 armPos = p.xz + radialDir * radialOffset * 0.8 + tangentDir * armInfluence * 0.3;
    
    // Y: disc height profile
    float discHeight = 0.15 / (1.0 + dist * 0.5);
    float yNoise = TDSimplexNoise(vec4(p.xz * 0.5, u_time * 0.15, 0.0)) * 0.12;
    float ySpiral = sin(logSpiral * armCount + u_time * 0.3) * 0.08;
    float yDisplacement = (yNoise + ySpiral * armInfluence) * discHeight;
    
    // Turbulence overlay
    float turbulence = galaxyTurbulence(p * 0.4, u_time) * 0.2;
    
    // Inter-arm noise scatter
    float interArmNoise = TDSimplexNoise(vec4(p.xz * 0.3, u_time * 0.1, float(id) * 0.001)) * 0.1;
    
    // Final position
    vec3 result;
    result.x = armPos.x + turbulence * p.x / distSafe;
    result.y = p.y + yDisplacement * 0.5 + turbulence * 0.1;
    result.z = armPos.y + turbulence * p.z / distSafe;
    
    // Scatter non-arm particles
    if(armInfluence < 0.3 && dist > 0.3) {
        float scatter = (1.0 - armInfluence * 3.0) * 0.15;
        result.x += radialDir.x * scatter;
        result.z += radialDir.y * scatter;
    }
    
    // Final organic touch
    float organicNoise = TDSimplexNoise(vec4(result * 0.5, u_time * 0.12)) * 0.06;
    result += vec3(organicNoise);
    
    P[id] = result;
}
