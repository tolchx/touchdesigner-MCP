// Color by Position - Maps XYZ to RGB
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);
}
