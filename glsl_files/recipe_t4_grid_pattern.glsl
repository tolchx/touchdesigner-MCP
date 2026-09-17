layout(location = 0) out vec4 fragColor;

uniform float u_scale;       // grid cells across the output

float gridLine(vec2 uv, float cells) {
    vec2 g = abs(fract(uv * cells) - 0.5);
    float d = min(g.x, g.y);
    return smoothstep(0.05, 0.02, d);
}

void main() {
    float g = gridLine(vUV.st, u_scale);
    fragColor = vec4(vec3(g), 1.0);
}
