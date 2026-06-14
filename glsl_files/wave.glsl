void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  vec3 p = TDIn_P(0,id);
  p.y += sin(p.x*2.0+u_time*3.0)*0.3;
  P[id] = p;
}