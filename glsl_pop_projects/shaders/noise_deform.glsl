// Noise Deform
uniform float u_time;
void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  vec3 pos = TDIn_P(0,id);
  float n = sin(pos.x*3.0+u_time)*cos(pos.z*2.0+u_time*0.7)*sin(pos.y*4.0+u_time*1.3);
  pos += vec3(n*0.15, n*0.2, n*0.15);
  P[id] = pos;
}
