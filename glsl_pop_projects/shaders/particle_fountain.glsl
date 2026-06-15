// Particle Fountain
uniform float u_time;
void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  float a = float(id)*0.1 + u_time*2.0;
  float r = 1.5 + sin(float(id)*0.05)*0.5;
  float h = cos(float(id)*0.03 + u_time)*2.0 + 2.0;
  P[id] = vec3(sin(a)*r, h, cos(a)*r);
}
