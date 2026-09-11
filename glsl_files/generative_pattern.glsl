// ============================================
// Generative Pattern - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 10
// Descripción: Patrón generativo con ruido simplex
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

// #include "util_noise.glsl" // Descomentar si TD encuentra el include

uniform float u_time;
uniform int uNumPoints;

// Simplex noise fallback (si include no está disponible)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
uniform float u_noise_scale;   // Escala del ruido (default: 2.0)
uniform float u_displacement;  // Fuerza de desplazamiento (default: 0.3)

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Coordenadas para ruido
    vec3 noisePos = pos * u_noise_scale + u_time * 0.3;
    
    // Múltiples capas de ruido (fractal noise / FBM)
    float n = 0.0;
    n += snoise(noisePos * 1.0) * 0.5;
    n += snoise(noisePos * 2.0) * 0.25;
    n += snoise(noisePos * 4.0) * 0.125;
    
    // Aplicar desplazamiento orgánico
    pos += vec3(
        n * u_displacement,
        snoise(noisePos + 100.0) * u_displacement,
        snoise(noisePos + 200.0) * u_displacement * 0.5
    );
    
    P[id] = pos;
    
    // Color basado en ruido
    vec3 color = vec3(
        n * 0.5 + 0.5,
        snoise(noisePos + 50.0) * 0.5 + 0.5,
        snoise(noisePos + 150.0) * 0.5 + 0.5
    );
    Cd[id] = vec4(color, 1.0);
}
