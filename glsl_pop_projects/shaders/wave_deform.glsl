// Wave Deform
uniform float u_time;
void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  vec3 pos = TDIn_P(0,id);
  pos.y += sin(pos.x*2.0 + u_time*3.0) * 0.3;
  pos.y += cos(pos.z*1.5 + u_time*2.0) * 0.2;
  P[id] = pos;
}
