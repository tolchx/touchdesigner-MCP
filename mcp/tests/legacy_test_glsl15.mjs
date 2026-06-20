import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests/glsl_basic';
  
  // The freshly created glslPOP has auto-generated DAT: test_default_compute
  const computeDat = base + '/test_default_compute';
  
  // Write a proper compute shader for POPs
  // TD's glslPOP compute shader uses standard GLSL compute
  // but with TD-specific buffer bindings for P, Cd, etc.
  const shader = [
    '#version 430',
    'layout(local_size_x = 64) in;',
    '',
    'uniform float uTime;',
    '',
    'struct Point {',
    '    vec3 P;',
    '    vec3 v;',
    '    vec4 Cd;',
    '    float life;',
    '    float age;',
    '};',
    '',
    'layout(std430, binding = 0) buffer PointBuffer { Point points[]; };',
    '',
    'void main() {',
    '    uint id = gl_GlobalInvocationID.x;',
    '    Point pt = points[id];',
    '    pt.P.x += sin(uTime + pt.P.y * 0.5) * 0.01;',
    '    pt.P.y += cos(uTime + pt.P.x * 0.5) * 0.01;',
    '    points[id] = pt;',
    '}'
  ].join('\n');
  
  const w1 = await client.execute('import json\nt = op("' + computeDat + '")\nt.text = """' + shader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write compute shader:', w1.success, w1.stdout);
  
  // Set numelems to match incoming points
  const w2 = await client.execute('import json\nt = op("' + base + '/test_default")\nt.par.numelems = 100\nprint(json.dumps({"numelems":t.par.numelems.eval()}))');
  console.log('set numelems:', w2.stdout);
  
  // Health check
  const h = await client.healthcheck(base + '/test_default', true);
  console.log('health:', h.ok ? 'OK' : 'ISSUES');
  if (!h.ok && h.issues) {
    for (const i of h.issues) {
      console.log('  ' + i.path + ': ' + (i.errors || '').substring(0, 200));
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
