layout(location = 0) out vec4 fragColor;

uniform float u_radius;      // vec0name='u_radius', vec0valuex=0.42 (const0 does NOT bind scripted)

void main() {
    vec2 p = vUV.st - 0.5;
    float d = length(p);
    float c = smoothstep(u_radius, u_radius - 0.02, d);
    fragColor = vec4(vec3(c), 1.0);
}
