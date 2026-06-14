void main(){
  const uint id = TDIndex();
  if(id >= TDNumElements()) return;
  Cd[id] = vec4(TDIn_P(0,id)*0.5+0.5, 1.0);
}