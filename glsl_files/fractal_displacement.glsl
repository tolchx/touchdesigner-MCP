// ============================================
// Fractal Displacement - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 11
// Descripción: Desplazamiento con fractal Julia
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

uniform float u_time;
uniform int uNumPoints;
uniform float u_fractal_scale;  // Escala del fractal (default: 1.5)
uniform vec2 u_julia_c;         // Parámetro Julia (default: vec2(-0.7, 0.27015))

vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Mapear posición a plano complejo
    vec2 c = pos.xy * u_fractal_scale;
    vec2 z = vec2(0.0);
    
    // Parámetro Julia animado
    vec2 juliaC = vec2(
        u_julia_c.x + sin(u_time * 0.2) * 0.1,
        u_julia_c.y + cos(u_time * 0.3) * 0.1
    );
    
    // Iteraciones del fractal
    float iter = 0.0;
    const int MAX_ITER = 20;
    for (int i = 0; i < MAX_ITER; i++) {
        z = cmul(z, z) + juliaC;
        if (dot(z, z) > 4.0) break;
        iter += 1.0;
    }
    
    // Normalizar iteraciones
    float t = iter / float(MAX_ITER);
    
    // Color basado en fractal
    vec3 color = hsb2rgb(vec3(t + u_time * 0.1, 0.8, 0.9));
    
    // Desplazar puntos según fractal
    pos.z += t * 2.0 - 1.0;
    pos.xy += z * 0.1;
    
    P[id] = pos;
    Cd[id] = vec4(color, 1.0);
}
