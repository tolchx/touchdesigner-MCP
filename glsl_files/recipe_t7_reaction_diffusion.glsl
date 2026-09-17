layout(location = 0) out vec4 fragColor;

uniform float u_diffusion;

void main() {
    vec2 px = vec2(1.0 / 256.0);   // 1 texel at the default 256x256 output
    vec2 uv = vUV.st;
    vec3 c  = texture(sTD2DInputs[0], uv).rgb;
    vec3 l  = texture(sTD2DInputs[0], uv - vec2(px.x, 0.0)).rgb;
    vec3 r  = texture(sTD2DInputs[0], uv + vec2(px.x, 0.0)).rgb;
    vec3 u  = texture(sTD2DInputs[0], uv - vec2(0.0, px.y)).rgb;
    vec3 d  = texture(sTD2DInputs[0], uv + vec2(0.0, px.y)).rgb;
    vec3 lap = (l + r + u + d - 4.0 * c);
    vec3 state = c + u_diffusion * lap;
    // seed: keep re-injecting a soft ring so the sim has a source
    float ring = smoothstep(0.30, 0.26, abs(length(uv - 0.5) - 0.2));
    state = mix(state, vec3(1.0), ring * 0.02);
    fragColor = vec4(clamp(state, 0.0, 1.0), 1.0);
}
