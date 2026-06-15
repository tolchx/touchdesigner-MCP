// Spring Forces - Gravity + spring damping
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    vec3 vel = TDIn_V(0, id);
    vec3 rest = vec3(pos.x, 0.0, pos.z);
    vec3 springForce = (rest - pos) * 0.02;
    vel *= 0.98;
    vel += vec3(0.0, -0.005, 0.0) + springForce;
    pos += vel * 0.1;
    P[id] = pos;
}
