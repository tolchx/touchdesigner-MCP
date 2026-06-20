import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const B = "/td_tests_container/td_glsl_tests";

async function writeGLSL(compName, code) {
  const path = B + "/" + compName + "/glsl_shader";
  // Use triple quotes in Python for safe GLSL injection
  const pyCode = "import json\nt = op('" + path + "')\nt.text = '''" + code + "'''\nprint(json.dumps({'done':True,'len':len(t.text)}))";
  return client.execute(pyCode);
}

async function test() {
  const shader1 = `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 0) out vec3 outP;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main() { float n = noise(P * 2.0 + uTime * 0.3); outP = P + vec3(n) * 0.3; }`;
  const r1 = await writeGLSL("glsl_basic", shader1);
  console.log("1 noise displacement:", r1.success);

  const shader2 = `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 2) in vec4 Cd;
layout(location = 0) out vec3 outP;
layout(location = 2) out vec4 outCd;
void main() { outP = P; vec3 c = 0.5 + 0.5 * cos(uTime * 0.5 + P.xyx + vec3(0,2,4)); outCd = vec4(c, 1.0); }`;
  const r2 = await writeGLSL("glsl_color", shader2);
  console.log("2 color:", r2.success);

  const shader3 = `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 0) out vec3 outP;
layout(location = 2) out vec4 outCd;
void main() { float d = length(P.xy); float w = sin(d * 3.0 - uTime * 2.0) * 0.5 * exp(-d * 0.3); outP = vec3(P.x, P.y, P.z + w); vec3 c = 0.5 + 0.5 * cos(uTime * 0.3 + vec3(w*2.0,w,0.0)); outCd = vec4(c, 1.0); }`;
  const r3 = await writeGLSL("glsl_wave", shader3);
  console.log("3 sine wave:", r3.success);

  const shader4 = `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 0) out vec3 outP;
layout(location = 2) out vec4 outCd;
void main() { float a = length(P.xy)*2.0+uTime*0.5; float r = length(P.xy); float v = sin(a)*0.3; float cx = P.x*cos(v)-P.y*sin(v); float cy = P.x*sin(v)+P.y*cos(v); outP = vec3(cx,cy,P.z+r*0.3*sin(uTime+r*3.0)); outCd = vec4(0.3+0.7*(0.5+0.5*sin(uTime+r*5.0)),0.2,0.8,1.0); }`;
  const r4 = await writeGLSL("glsl_vortex", shader4);
  console.log("4 vortex:", r4.success);

  const shader5 = `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 2) in vec4 Cd;
layout(location = 0) out vec3 outP;
layout(location = 2) out vec4 outCd;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main() { float n = n3(P*1.5+uTime*0.2); float n2 = n3(P*3.0+uTime*0.5); outP = P + vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5)*0.8; vec3 col = 0.5+0.5*cos(uTime*0.2+vec3(n,n2,n+n2)); outCd = vec4(mix(Cd.rgb,col,0.7),1.0); }`;
  const r5 = await writeGLSL("glsl_combo", shader5);
  console.log("5 combo:", r5.success);

  // Health check
  console.log("\n=== SALUD DE SHADERS ===");
  for (const name of ["glsl_basic","glsl_color","glsl_wave","glsl_vortex","glsl_combo"]) {
    const h = await client.healthcheck(B + "/" + name, true);
    const status = h.ok ? "OK" : "ERRORS(" + h.issueCount + ")";
    console.log("  " + status + " " + name);
    if (!h.ok && h.issues) {
      for (const iss of h.issues.slice(0, 2)) {
        console.log("    -> " + (iss.errors || iss.warnings || "").substring(0, 150));
      }
    }
  }
  console.log("\nDONE");
}
test().catch(e => console.log("ERROR:", e.message));
