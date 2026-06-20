import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const B = "/td_tests_container/td_glsl_tests";

const shaders = {
  glsl_basic: `#version 330
uniform float uTime;
layout(location = 0) in vec3 P;
layout(location = 0) out vec3 outP;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
void main() { float n = noise(P * 2.0 + uTime * 0.3); outP = P + vec3(n) * 0.3; }`,
};

async function test() {
  const comp = "glsl_basic";
  const computePath = B + "/" + comp + "/glsl_shader/glsl_shader_compute";

  // Check if compute DAT exists
  const check = await client.execute('import json\ntry:\n    t = op("' + computePath + '")\n    print(json.dumps({"exists":True,"len":len(t.text)}))\nexcept:\n    print(json.dumps({"exists":False}))');
  console.log("compute DAT check:", check.stdout || check.error);

  // Write shader to internal compute DAT
  const writeCode = 'import json\nt = op("' + computePath + '")\nt.text = """' + shaders[comp] + '"""\nprint(json.dumps({"done":True,"len":len(t.text)}))';
  const write = await client.execute(writeCode);
  console.log("write:", write.stdout || write.error);

  // Health check
  const health = await client.healthcheck(B + "/" + comp, true);
  console.log("health:", health.ok ? "OK" : "ISSUES " + health.issueCount);
  if (!health.ok && health.issues) {
    for (const iss of health.issues) {
      console.log("  " + iss.path + ": " + (iss.errors || "").substring(0,200));
    }
  }
}
test().catch(e => console.log("ERR:", e.message));
