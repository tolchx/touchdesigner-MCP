import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function writeShaderInside(comp, shaderLines) {
  const base = '/td_tests_container/td_glsl_tests';
  const glslPath = base + '/' + comp + '/glsl_shader';
  
  // 1. Check what errors exist
  const healthBefore = await client.healthcheck(base + '/' + comp, true);
  
  // 2. Create textDAT as child of glslPOP
  const createCode = 'import json\nt = op("' + glslPath + '")\nt2 = t.create(textDAT, "glsl_code")\nprint(json.dumps({"created":t2.path}))';
  const create = await client.execute(createCode);
  if (!create.success) return { error: 'create child DAT failed: ' + (create.error?.message || '') };
  const childPath = glslPath + '/glsl_code';
  
  // 3. Write GLSL code
  const shaderCode = shaderLines.join('\n');
  const writeCode = 'import json\nt = op("' + childPath + '")\nt.text = """' + shaderCode + '"""\nprint(json.dumps({"written":len(t.text)}))';
  const write = await client.execute(writeCode);
  if (!write.success) return { error: 'write failed' };
  
  // 4. Set computedat to relative path
  const setCode = 'import json\nt = op("' + glslPath + '")\nt.par.computedat = op("' + childPath + '")\nprint(json.dumps({"set":True}))';
  const set = await client.execute(setCode);
  
  // 5. Force cook and check errors
  const health = await client.healthcheck(base + '/' + comp, true);
  if (!health.ok && health.issues) {
    return { ok: false, issues: health.issues.map(i => (i.errors || i.warnings || '').substring(0,150)).join('; ') };
  }
  return { ok: true };
}

async function test() {
  const shaders = {
    glsl_basic: [
      '#version 330', 'uniform float uTime;',
      'layout(location = 0) in vec3 P;', 'layout(location = 0) out vec3 outP;',
      'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
      'float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }',
      'void main() { float n = noise(P * 2.0 + uTime * 0.3); outP = P + vec3(n) * 0.3; }'
    ],
    glsl_color: [
      '#version 330', 'uniform float uTime;',
      'layout(location = 0) in vec3 P;', 'layout(location = 2) in vec4 Cd;',
      'layout(location = 0) out vec3 outP;', 'layout(location = 2) out vec4 outCd;',
      'void main() { outP = P; vec3 c = 0.5 + 0.5 * cos(uTime * 0.5 + P.xyx + vec3(0,2,4)); outCd = vec4(c, 1.0); }'
    ],
    glsl_wave: [
      '#version 330', 'uniform float uTime;',
      'layout(location = 0) in vec3 P;', 'layout(location = 0) out vec3 outP;',
      'layout(location = 2) out vec4 outCd;',
      'void main() { float d = length(P.xy); float w = sin(d * 3.0 - uTime * 2.0) * 0.5 * exp(-d * 0.3); outP = vec3(P.x, P.y, P.z + w); vec3 c = 0.5 + 0.5 * cos(uTime * 0.3 + vec3(w*2.0,w,0.0)); outCd = vec4(c, 1.0); }'
    ],
    glsl_vortex: [
      '#version 330', 'uniform float uTime;',
      'layout(location = 0) in vec3 P;', 'layout(location = 0) out vec3 outP;',
      'layout(location = 2) out vec4 outCd;',
      'void main() { float a = length(P.xy)*2.0+uTime*0.5; float r = length(P.xy); float v = sin(a)*0.3; float cx = P.x*cos(v)-P.y*sin(v); float cy = P.x*sin(v)+P.y*cos(v); outP = vec3(cx,cy,P.z+r*0.3*sin(uTime+r*3.0)); outCd = vec4(0.3+0.7*(0.5+0.5*sin(uTime+r*5.0)),0.2,0.8,1.0); }'
    ],
    glsl_combo: [
      '#version 330', 'uniform float uTime;',
      'layout(location = 0) in vec3 P;', 'layout(location = 2) in vec4 Cd;',
      'layout(location = 0) out vec3 outP;', 'layout(location = 2) out vec4 outCd;',
      'float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
      'float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }',
      'void main() { float n = n3(P*1.5+uTime*0.2); float n2 = n3(P*3.0+uTime*0.5); outP = P + vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8; vec3 col = 0.5+0.5*cos(uTime*0.2+vec3(n,n2,n+n2)); outCd = vec4(mix(Cd.rgb,col,0.7),1.0); }'
    ]
  };

  console.log('=== Writing GLSL as child of glslPOP ===');
  for (const [comp, lines] of Object.entries(shaders)) {
    const r = await writeShaderInside(comp, lines);
    console.log('  ' + comp + ': ' + (r.ok ? 'OK' : 'ISSUE: ' + (r.issues || r.error || '?')));
  }
  console.log('\nDONE');
}
test().catch(e => console.log('ERR:', e.message));
