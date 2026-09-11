// ============================================
// Transformations - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 5
// Descripción: Transformaciones TRS (Translate, Rotate, Scale)
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

uniform float u_time;
uniform int uNumPoints;
uniform float u_rot_speed;   // Velocidad de rotación (default: 0.5)
uniform float u_scale_pulse; // Amplitud del pulso de escala (default: 0.3)

// Matriz de rotación 2D
mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Aplicar rotación en eje Z
    float angle = u_time * u_rot_speed;
    pos.xy = rotate2d(angle) * pos.xy;
    
    // Aplicar escala pulsante
    float scale = 1.0 + sin(u_time * 2.0) * u_scale_pulse;
    pos *= scale;
    
    // Aplicar traslación sinusoidal
    pos.x += sin(u_time) * 0.5;
    pos.y += cos(u_time) * 0.5;
    
    P[id] = pos;
    
    // Color por posición
    vec3 color = vec3(
        pos.x * 0.5 + 0.5,
        pos.y * 0.5 + 0.5,
        0.8
    );
    Cd[id] = vec4(color, 1.0);
}
