// ============================================
// Sin Wave - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 2
// Descripción: Ondas sinusoidales sobre posición Y
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

uniform float u_time;
uniform int uNumPoints;
uniform float u_amplitude;   // Amplitud de la onda (default: 0.5)
uniform float u_frequency;   // Frecuencia de la onda (default: 10.0)
uniform float u_speed;       // Velocidad de la animación (default: 1.0)

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Mapear índice a coordenada normalizada [0, 1]
    float t = float(id) / float(uNumPoints - 1);
    
    // Onda sinusoidal principal
    float wave = sin(t * u_frequency + u_time * u_speed) * u_amplitude;
    
    // Ondas anidadas (Cap 2.5)
    wave += sin(t * u_frequency * 2.0 - u_time * u_speed * 1.5) * u_amplitude * 0.3;
    wave += sin(t * u_frequency * 0.5 + u_time * u_speed * 0.7) * u_amplitude * 0.5;
    
    // Aplicar al eje Y
    pos.y = wave;
    
    P[id] = pos;
    
    // Color basado en la onda
    vec3 color = vec3(
        wave * 0.5 + 0.5,
        t,
        1.0 - t
    );
    Cd[id] = vec4(color, 1.0);
}
