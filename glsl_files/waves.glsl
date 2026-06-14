
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    // Multi-frequency wave deformation
    float w1 = sin(p.x * 1.5 + u_time * 1.2) * 0.4;
    float w2 = cos(p.z * 2.0 + u_time * 0.8) * 0.3;
    float w3 = sin((p.x + p.z) * 1.0 + u_time * 2.5) * 0.2;
    p.y += w1 + w2 + w3;
    // Twist
    float twist = sin(p.y * 0.5 + u_time) * 0.3;
    float ct = cos(twist), st = sin(twist);
    p.xz = mat2(ct, -st, st, ct) * p.xz;
    P[id] = p;
}
