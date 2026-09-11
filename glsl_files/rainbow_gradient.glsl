// ============================================
// Rainbow Gradient - GLSL POP para TouchDesigner
// Fuente: fullscreencode.com/ejemplosshaders/ Cap 3
// Descripción: Gradiente arcoíris con conversión HSB→RGB
// ============================================

#version 430
layout(local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

uniform float u_time;
uniform int uNumPoints;
uniform float u_saturation;  // Saturación (default: 0.8)
uniform float u_brightness;  // Brillo (default: 0.9)
uniform float u_speed;       // Velocidad (default: 0.1)

// Conversión HSB a RGB (Cap 3.2)
vec3 hsb2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    rgb = rgb * rgb * (3.0 - 2.0 * rgb);
    return c.z * mix(vec3(1.0), rgb, c.y);
}

void main() {
    uint id = TDIndex();
    if (id >= uNumPoints) return;
    
    vec3 pos = TDIn_P(0, id);
    
    // Normalizar posición
    float t = float(id) / float(uNumPoints - 1);
    
    // Hue varía con el tiempo y la posición
    float hue = fract(t + u_time * u_speed);
    
    // Color arcoíris
    vec3 color = hsb2rgb(vec3(hue, u_saturation, u_brightness));
    
    // Aplicar color
    Cd[id] = vec4(color, 1.0);
    
    // También modificar posición ligeramente según el color
    pos.z = sin(t * 6.28318 + u_time) * 0.3;
    P[id] = pos;
}
