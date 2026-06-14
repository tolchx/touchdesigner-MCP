
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float speed = u_time * 0.5;
    // Orbital movement around Y axis
    float angle = atan(p.z, p.x) + speed;
    float rad = length(p.xz);
    p.x = cos(angle) * rad;
    p.z = sin(angle) * rad;
    // Breathing scale
    float breathe = 1.0 + sin(u_time * 1.5 + p.y * 0.5) * 0.15;
    p *= breathe;
    // Wave displacement on Y
    p.y += sin(p.x * 3.0 + u_time * 2.0) * 0.2;
    P[id] = p;
}
