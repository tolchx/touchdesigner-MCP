import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  
  // For each shader, first write the default, then add our modifications
  const shaders = {
    glsl_basic: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = snoise(P[id] * 2.0 + TDTime() * 0.3);',
      '    P[id] += vec3(n) * 0.3;',
      '}'
    ].join('\n'),
    glsl_color: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    vec3 c = 0.5 + 0.5 * cos(TDTime() * 0.5 + P[id].xyx + vec3(0,2,4));',
      '    Cd[id] = vec4(c, 1.0);',
      '}'
    ].join('\n'),
    glsl_wave: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float d = length(P[id].xy);',
      '    float w = sin(d * 3.0 - TDTime() * 2.0) * 0.5 * exp(-d * 0.3);',
      '    P[id].z += w;',
      '    vec3 c = 0.5 + 0.5 * cos(TDTime() * 0.3 + vec3(w*2.0,w,0.0));',
      '    Cd[id] = vec4(c, 1.0);',
      '}'
    ].join('\n'),
    glsl_vortex: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float a = length(P[id].xy)*2.0+TDTime()*0.5;',
      '    float r = length(P[id].xy);',
      '    float v = sin(a)*0.3;',
      '    float cx = P[id].x*cos(v)-P[id].y*sin(v);',
      '    float cy = P[id].x*sin(v)+P[id].y*cos(v);',
      '    P[id] = vec3(cx, cy, P[id].z + r*0.3*sin(TDTime()+r*3.0));',
      '    vec3 col = 0.3+0.7*(0.5+0.5*sin(TDTime()+r*5.0));',
      '    Cd[id] = vec4(col, 0.2, 0.8, 1.0);',
      '}'
    ].join('\n'),
    glsl_combo: [
      'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
      'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }',
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = n3(P[id]*1.5+TDTime()*0.2);',
      '    float n2 = n3(P[id]*3.0+TDTime()*0.5);',
      '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8;',
      '    vec3 col = 0.5+0.5*cos(TDTime()*0.2+vec3(n,n2,n+n2));',
      '    Cd[id] = vec4(mix(Cd[id].rgb, col, 0.7), 1.0);',
      '}'
    ].join('\n')
  };
  
  for (const [comp, shader] of Object.entries(shaders)) {
    const glslPath = base + '/' + comp + '/glsl_shader';
    
    // Get computedat path
    const r = await client.execute('import json\nt = op("' + glslPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
    const cd = JSON.parse(r.stdout).cd;
    
    if (!cd || !cd.startsWith('/')) {
      console.log(comp + ': no computedat');
      continue;
    }
    
    // Write shader
    const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + shader + '"""\nprint(json.dumps({"len":len(t.text)}))');
    if (!w.success) { console.log(comp + ': write failed'); continue; }
    
    // Cook and check
    const h = await client.healthcheck(base + '/' + comp, true);
    console.log(comp + ': ' + (h.ok ? 'OK' : 'ERROR'));
  }
}
test().catch(e => console.log('ERR:', e.message));
