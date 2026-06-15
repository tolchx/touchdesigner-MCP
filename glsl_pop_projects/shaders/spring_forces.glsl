// Spring Bounce
uniform float u_time;
void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  vec3 pos = TDIn_P(0,id);
  float t = u_time + float(id)*0.05;
  pos.y = pos.y + sin(t*3.0)*0.5 - 0.5;
  pos.x += cos(t*1.7)*0.2;
  pos.z += sin(t*2.3)*0.2;
  P[id] = pos;
}
