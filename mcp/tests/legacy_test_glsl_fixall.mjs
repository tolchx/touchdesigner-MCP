import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function fixAllGLSL() {
  const base = '/td_tests_container/td_glsl_tests';
  console.log('=== FIXING ALL GLSL SHADERS ===');

  const configs = [
    { comp: 'glsl_basic', shader: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = sin(P[id].x * 2.0 + P[id].y * 3.0 + float(id) * 0.01) * 0.5 + 0.5;',
      '    P[id] += vec3(n) * 0.2;',
      '}'
    ].join('\n'), attrs: 'P' },
    { comp: 'glsl_color', shader: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float r = length(P[id].xy);',
      '    float d = sin(r * 3.0) * 0.3 * exp(-r * 0.3);',
      '    P[id].z += d;',
      '}'
    ].join('\n'), attrs: 'P' },
    { comp: 'glsl_wave', shader: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float r = length(P[id].xy);',
      '    float w = sin(r * 3.0) * 0.3 * exp(-r * 0.3);',
      '    P[id].z += w;',
      '}'
    ].join('\n'), attrs: 'P' },
    { comp: 'glsl_vortex', shader: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float r = length(P[id].xy);',
      '    float rot = sin(r * 2.0) * 0.3;',
      '    float cr = cos(rot);',
      '    float sr = sin(rot);',
      '    float cx = P[id].x*cr - P[id].y*sr;',
      '    float cy = P[id].x*sr + P[id].y*cr;',
      '    P[id] = vec3(cx, cy, P[id].z);',
      '}'
    ].join('\n'), attrs: 'P' },
    { comp: 'glsl_combo', shader: [
      'void main() {',
      '    const uint id = TDIndex();',
      '    if(id >= TDNumElements()) return;',
      '    float n = sin(P[id].x * 1.5 + P[id].y * 2.0 + float(id) * 0.001) * 0.5 + 0.5;',
      '    float n2 = sin(P[id].x * 3.0 + P[id].y * 4.0 + float(id) * 0.002) * 0.5 + 0.5;',
      '    P[id] += vec3(n-0.5, n2-0.5, (n+n2)*0.5-0.5) * 0.5;',
      '}'
    ].join('\n'), attrs: 'P' },
  ];

  for (const cfg of configs) {
    const compPath = base + '/' + cfg.comp;
    const glslPath = compPath + '/glsl_shader';
    
    // Find the compute DAT (from computedat)
    const cdR = await client.execute('import json\nt = op("' + glslPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
    if (!cdR.success) { console.log(cfg.comp + ': FAIL get computedat'); continue; }
    const cd = JSON.parse(cdR.stdout).cd;
    if (!cd || !cd.startsWith('/')) { console.log(cfg.comp + ': no computedat'); continue; }
    
    // Set outputattrs
    await client.execute('import json\nt = op("' + glslPath + '")\nt.par.outputattrs = "' + cfg.attrs + '"\nprint("ok")');
    
    // Write shader
    const w = await client.execute('import json\nt = op("' + cd + '")\nt.text = """' + cfg.shader + '"""\nprint(json.dumps({"len":len(t.text)}))');
    if (!w.success) { console.log(cfg.comp + ': write FAIL'); continue; }
    
    // Health check
    const h = await client.healthcheck(compPath, true);
    console.log('  ' + cfg.comp + ': ' + (h.ok ? 'OK' : 'ERR') + ' (' + cfg.attrs + ')');
    if (!h.ok && h.issues) {
      for (const i of h.issues) {
        if (i.path.includes(cfg.comp)) console.log('    ' + i.path + ': ' + (i.errors || '').substring(0, 200));
      }
    }
  }
  
  console.log('\n=== DEFINING NEW FRESH GLSL POPS ===');
  // Create new glslPOPs with proper config and shaders that work
  for (const cfg of configs) {
    // Create fresh glslPOP
    const createR = await client.execute('import json\nparent = op("' + base + '/' + cfg.comp + '")\nfresh = parent.create(glslPOP, \"glsl_shader_new\")\nprint(json.dumps({"path":fresh.path}))');
    if (!createR.success) { console.log(cfg.comp + ': create FAIL'); continue; }
    const newPath = JSON.parse(createR.stdout).path;
    
    // Wait for auto-DAT creation
    await new Promise(r => setTimeout(r, 300));
    
    // Find the auto-generated compute DAT
    const cdR2 = await client.execute('import json\nt = op("' + newPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())}))');
    if (!cdR2.success) continue;
    const newCd = JSON.parse(cdR2.stdout).cd;
    
    // Set outputattrs and write shader
    await client.execute('import json\nt = op("' + newPath + '")\nt.par.outputattrs = "' + cfg.attrs + '"\nprint("ok")');
    await client.execute('import json\nt = op("' + newCd + '")\nt.text = """' + cfg.shader + '"""\nprint("ok")');
    
    // Connect source
    const sourcePath = base + '/' + cfg.comp + '/source';
    await client.connectNodes(sourcePath, newPath, 0);
    
    const h = await client.healthcheck(newPath, false);
    console.log('  ' + cfg.comp + '_new: ' + (h.ok ? 'OK' : 'ERR'));
    if (!h.ok && h.issues) console.log('    ' + (h.issues[0]?.errors || '').substring(0, 200));
  }

  console.log('\nDONE');
}
fixAllGLSL().catch(e => console.log('FATAL:', e.message));
