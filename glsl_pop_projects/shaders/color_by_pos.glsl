// Position Scatter
uniform float u_time;
void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  vec3 pos = TDIn_P(0,id);
  float phase = float(id)*0.1 + u_time;
  pos.x += sin(phase)*0.3;
  pos.y += cos(phase*0.7)*0.4;
  pos.z += sin(phase*1.3)*0.3;
  P[id] = pos;
}
