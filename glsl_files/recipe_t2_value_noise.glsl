layout(location = 0) out vec4 fragColor;

uniform float u_time;        // vec0name='u_time', vec0valuex=<seconds>
uniform float u_scale;       // vec0name2='u_scale', vec0valuex2=8.0

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main() {
    vec2 p = vUV.st * u_scale;
    float n = noise(p + u_time);
    fragColor = vec4(vec3(n), 1.0);
}
