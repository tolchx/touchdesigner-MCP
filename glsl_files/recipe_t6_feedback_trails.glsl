layout(location = 0) out vec4 fragColor;

uniform float u_decay;       // vec0name='u_decay', vec0valuex=0.95

void main() {
    vec2 p = vUV.st - 0.5;
    float dot_ = smoothstep(0.06, 0.02, length(p));
    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;
    fragColor = vec4(max(vec3(dot_), prev * u_decay), 1.0);
}
