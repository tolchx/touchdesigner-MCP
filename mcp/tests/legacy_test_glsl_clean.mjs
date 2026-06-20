import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function cleanup() {
  const base = '/td_tests_container';
  
  // Delete old GLSL test COMP
  try { await client.deleteOperator(base + '/td_glsl_tests'); } catch(e) {}
  console.log('Cleaned old GLSL tests');
  
  // Create fresh container
  const c = await client.createOperator('baseCOMP', 'td_glsl_tests', base, 0, -1200);
  console.log('New container:', c.success, c.path);
  
  // Create 5 test COMPs
  const tests = [
    { name: 'glsl_noise', y: 0, desc: 'Noise displacement via id' },
    { name: 'glsl_wave', y: -300, desc: 'Sine wave deformation' },
    { name: 'glsl_vortex', y: -600, desc: 'Vortex rotation' },
    { name: 'glsl_multinoise', y: -900, desc: 'Multi-frequency noise' },
    { name: 'glsl_twist', y: -1200, desc: 'Twist + wave complex' },
  ];
  
  for (const t of tests) {
    const r = await client.createOperator('baseCOMP', t.name, base + '/td_glsl_tests', 0, t.y);
    console.log('  ' + t.name + ': ' + (r.success ? 'OK' : 'FAIL') + ' - ' + t.desc);
  }
}
cleanup().catch(e => console.log('ERR:', e.message));
