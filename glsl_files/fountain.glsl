void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  float a = float(id)*0.1 + u_time*2.0;
  P[id] = vec3(sin(a)*2.0, cos(a*0.5)*2.0+2.0, 0.0);
}