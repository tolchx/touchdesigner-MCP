import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const p = '/td_tests_container/td_glsl_tests/glsl_basic/glsl_shader';
  const shader = [
    '#version 330',
    'uniform float uTime;',
    'layout(location = 0) in vec3 P;',
    'layout(location = 0) out vec3 outP;',
    'void main() { outP = P + vec3(sin(uTime+P.x)*0.1); }'
  ].join('\n');
  
  // Write via par.Text using Python triple quotes
  const code = 'import json\nt = op("' + p + '")\nt.par.Text = """' + shader + '"""\nprint(json.dumps({"done":True,"val":t.par.Text.eval()[:50]}))';
  const r = await client.execute(code);
  console.log('write shader:', r.stdout?.substring(0,200) || r.error?.message);
  
  // Write all 5 shaders  
  const shaders = {
    glsl_basic: ['#version 330','uniform float uTime;','layout(location = 0) in vec3 P;','layout(location = 0) out vec3 outP;','float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }','float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }','void main() { float n = noise(P * 2.0 + uTime * 0.3); outP = P + vec3(n) * 0.3; }'].join('\n'),
    glsl_color: ['#version 330','uniform float uTime;','layout(location = 0) in vec3 P;','layout(location = 2) in vec4 Cd;','layout(location = 0) out vec3 outP;','layout(location = 2) out vec4 outCd;','void main() { outP = P; vec3 c = 0.5 + 0.5 * cos(uTime * 0.5 + P.xyx + vec3(0,2,4)); outCd = vec4(c, 1.0); }'].join('\n'),
    glsl_wave: ['#version 330','uniform float uTime;','layout(location = 0) in vec3 P;','layout(location = 0) out vec3 outP;','layout(location = 2) out vec4 outCd;','void main() { float d = length(P.xy); float w = sin(d * 3.0 - uTime * 2.0) * 0.5 * exp(-d * 0.3); outP = vec3(P.x, P.y, P.z + w); vec3 c = 0.5 + 0.5 * cos(uTime * 0.3 + vec3(w*2.0,w,0.0)); outCd = vec4(c, 1.0); }'].join('\n'),
    glsl_vortex: ['#version 330','uniform float uTime;','layout(location = 0) in vec3 P;','layout(location = 0) out vec3 outP;','layout(location = 2) out vec4 outCd;','void main() { float a = length(P.xy)*2.0+uTime*0.5; float r = length(P.xy); float v = sin(a)*0.3; float cx = P.x*cos(v)-P.y*sin(v); float cy = P.x*sin(v)+P.y*cos(v); outP = vec3(cx,cy,P.z+r*0.3*sin(uTime+r*3.0)); outCd = vec4(0.3+0.7*(0.5+0.5*sin(uTime+r*5.0)),0.2,0.8,1.0); }'].join('\n'),
    glsl_combo: ['#version 330','uniform float uTime;','layout(location = 0) in vec3 P;','layout(location = 2) in vec4 Cd;','layout(location = 0) out vec3 outP;','layout(location = 2) out vec4 outCd;','float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }','float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }','void main() { float n = n3(P*1.5+uTime*0.2); float n2 = n3(P*3.0+uTime*0.5); outP = P + vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8; vec3 col = 0.5+0.5*cos(uTime*0.2+vec3(n,n2,n+n2)); outCd = vec4(mix(Cd.rgb,col,0.7),1.0); }'].join('\n')
  };
  
  const base = '/td_tests_container/td_glsl_tests/';
  for (const [comp, s] of Object.entries(shaders)) {
    const path = base + comp + '/glsl_shader';
    const pyCode = 'import json\nt = op("' + path + '")\nt.par.Text = """' + s + '"""\nprint(json.dumps({"done":True,"len":len(str(t.par.Text.eval()))}))';
    const res = await client.execute(pyCode);
    if (res.success) {
      console.log(comp + ': OK ' + JSON.parse(res.stdout).len + ' chars');
    } else {
      console.log(comp + ': FAIL ' + (res.error?.message || ''));
    }
  }
  
  // Health check
  console.log('\n=== HEALTH ===');
  for (const comp of Object.keys(shaders)) {
    const h = await client.healthcheck(base + comp, true);
    console.log('  ' + (h.ok ? 'OK' : 'ISSUES') + ' ' + comp);
    if (!h.ok && h.issues) {
      for (const iss of h.issues) {
        console.log('    ' + iss.path + ': ' + (iss.errors || iss.warnings || '').substring(0,200));
      }
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
