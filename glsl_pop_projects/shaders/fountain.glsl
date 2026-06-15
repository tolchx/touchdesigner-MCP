// Particle Fountain - Radial particle emission
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    float angle = float(id) * 0.1 + u_time * 2.0;
    float radius = 1.5 + sin(float(id) * 0.05) * 0.5;
    float height = cos(float(id) * 0.03 + u_time) * 2.0 + 2.0;
    P[id] = vec3(sin(angle) * radius, height, cos(angle) * radius);
}
