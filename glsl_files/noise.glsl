void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  float n = TDSimplexNoise(vec4(TDIn_P(0,id)*0.5, u_time*0.3));
  P[id] = TDIn_P(0,id) + TDIn_N(0,id) * n * 0.4;
}