// ============================================
// Spiral Points - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 7
// Descripción: Puntos en espiral con iteración
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

#define PI 3.14159265359
#define TAU 6.28318530718

uniform float u_time;
uniform int uNumPoints;
uniform float u_turns;       // Vueltas de la espiral (default: 5.0)
uniform float u_radius_max;  // Radio máximo (default: 2.0)

vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    float t = float(id) / float(uNumPoints - 1);
    
    // Espiral: ángulo crece con el índice
    float angle = t * u_turns * TAU + u_time;
    
    // Radio creciente
    float radius = t * u_radius_max;
    
    // Agregar variación orgánica
    radius += sin(t * 30.0 + u_time * 2.0) * 0.1;
    
    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius;
    pos.z = t * 2.0 - 1.0;  // Altura creciente
    
    P[id] = pos;
    
    // Color por posición en la espiral
    vec3 color = hsb2rgb(vec3(t, 0.7, 0.9));
    Cd[id] = vec4(color, 1.0);
}
