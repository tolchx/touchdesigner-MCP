layout(location = 0) out vec4 fragColor;

uniform float u_time;
uniform float u_freq;

void main() {
    vec2 p = vUV.st - 0.5;
    float d = length(p);
    float wave = sin(d * u_freq - u_time * 2.0);
    float c = smoothstep(0.1, 0.9, wave);
    fragColor = vec4(vec3(c), 1.0);
}
