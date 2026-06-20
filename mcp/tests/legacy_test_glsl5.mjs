import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const base = '/td_tests_container/td_glsl_tests';
  for (const comp of ['glsl_basic','glsl_color','glsl_wave','glsl_vortex','glsl_combo']) {
    const p = base + '/' + comp + '/glsl_shader';
    // Get children via operator inspection
    const code = 'import json\nt = op("' + p + '")\nchildren = [{"name":c.name,"type":c.OPType,"path":c.path} for c in t.children]\nprint(json.dumps(children))';
    const r = await client.execute(code);
    if (r.success) {
      const children = JSON.parse(r.stdout);
      if (children.length > 0) {
        console.log(comp + ' children:');
        for (const c of children) {
          console.log('  ' + c.name + ' (' + c.type + ') @ ' + c.path);
        }
      } else {
        console.log(comp + ': NO CHILDREN');
      }
    } else {
      console.log(comp + ': FAIL');
    }
  }
}
test().catch(e => console.log('ERR:', e.message));
