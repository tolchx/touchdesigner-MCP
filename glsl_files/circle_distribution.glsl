// ============================================
// Circle Distribution - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 4
// Descripción: Puntos distribuidos en círculo con variación
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

#define PI 3.14159265359

uniform float u_time;
uniform int uNumPoints;
uniform float u_radius;      // Radio base (default: 1.0)
uniform float u_waves;       // Number de ondas (default: 20.0)

vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    float t = float(id) / float(uNumPoints - 1);
    
    // Ángulo base + rotación temporal
    float angle = t * 2.0 * PI + u_time * 0.5;
    
    // Radio con variación ondulada
    float radius = u_radius + sin(t * u_waves + u_time * 2.0) * 0.2;
    
    // Posición en círculo
    vec3 pos;
    pos.x = cos(angle) * radius;
    pos.y = sin(angle) * radius;
    pos.z = 0.0;
    
    P[id] = pos;
    
    // Color basado en posición angular
    vec3 color = hsb2rgb(vec3(t, 0.8, 0.9));
    Cd[id] = vec4(color, 1.0);
}
