// ============================================
// Grid Pattern - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 6
// Descripción: Puntos distribuidos en grilla con patrón
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

uniform float u_time;
uniform int uNumPoints;
uniform float u_grid_size;   // Tamaño de la grilla (default: 10.0)
uniform float u_wave_amp;    // Amplitud de onda (default: 0.1)

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    // Convertir índice a posición 2D en grilla
    float gridSize = ceil(sqrt(float(uNumPoints)));
    float x = mod(float(id), gridSize);
    float y = floor(float(id) / gridSize);
    
    // Normalizar a [-1, 1]
    vec2 uv = vec2(x, y) / (gridSize - 1.0) * 2.0 - 1.0;
    
    // Patrón basado en distancia al centro
    float d = length(uv);
    float pattern = smoothstep(0.8, 0.2, d);
    
    // Animación
    uv += sin(u_time + d * 3.0) * u_wave_amp;
    
    vec3 pos = vec3(uv, 0.0);
    P[id] = pos;
    
    // Color por patrón
    vec3 color = vec3(
        pattern,
        uv.x * 0.5 + 0.5,
        uv.y * 0.5 + 0.5
    );
    Cd[id] = vec4(color, 1.0);
}
