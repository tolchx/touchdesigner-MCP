import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const BASE = '/td_tests_container/td_glsl_tests';

async function test() {
  // Test ONE thing at a time on vortex to find the exact break
  const comp = 'glsl_vortex';
  const glslP = BASE + '/' + comp + '/glsl_shader';
  const r = await client.execute('import json\nt = op("' + glslP + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
  const cd = JSON.parse(r.stdout).cd;

  // Test 1: Can we use both sin AND cos in the same shader?
  const t1 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); P[id].z = cr + sr; }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t1 + '"""\nprint("ok")');
  const h1 = await client.healthcheck(BASE + '/' + comp, true);
  console.log('1. cos+sin same shader:', h1.ok ? 'OK' : 'ERR');

  // Test 2: Single vec3 assignment with cos and sin
  const t2 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id] = vec3(P[id].x * cos(r) - P[id].y * sin(r), P[id].x * sin(r) + P[id].y * cos(r), P[id].z); }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t2 + '"""\nprint("ok")');
  const h2 = await client.healthcheck(BASE + '/' + comp, true);
  console.log('2. vec3(cos,sin) inline:', h2.ok ? 'OK' : 'ERR');
  if (!h2.ok) {
    // Methodically strip it down
    const t2a = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); P[id] = vec3(P[id].x * cr - P[id].y * sr, 0, 0); }';
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t2a + '"""\nprint("ok")');
    const h2a = await client.healthcheck(BASE + '/' + comp, true);
    console.log('2a. P.x only:', h2a.ok ? 'OK' : 'ERR');
    
    const t2b = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); P[id] = vec3(0, P[id].x * sr + P[id].y * cr, 0); }';
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t2b + '"""\nprint("ok")');
    const h2b = await client.healthcheck(BASE + '/' + comp, true);
    console.log('2b. P.y only:', h2b.ok ? 'OK' : 'ERR');
    
    const t2c = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); P[id] = vec3(P[id].x * cr, P[id].y * cr, P[id].z); }';
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t2c + '"""\nprint("ok")');
    const h2c = await client.healthcheck(BASE + '/' + comp, true);
    console.log('2c. P.x*cr, P.y*cr:', h2c.ok ? 'OK' : 'ERR');
    
    const t2d = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); float cr = cos(r); float sr = sin(r); float x = P[id].x; float y = P[id].y; P[id] = vec3(x * cr - y * sr, 0, 0); }';
    await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t2d + '"""\nprint("ok")');
    const h2d = await client.healthcheck(BASE + '/' + comp, true);
    console.log('2d. tmp vars P.x:', h2d.ok ? 'OK' : 'ERR');
  }

  // Test 3: Can we write to P.x and P.y separately?
  const t3 = 'void main() { const uint id = TDIndex(); if(id >= TDNumElements()) return; float r = length(P[id].xy); P[id].x = cos(r); P[id].y = sin(r); }';
  await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + t3 + '"""\nprint("ok")');
  const h3 = await client.healthcheck(BASE + '/' + comp, true);
  console.log('3. P.x=cos, P.y=sin separate:', h3.ok ? 'OK' : 'ERR');
}
test().catch(e => console.log('ERR:', e.message));
