import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function main() {
  // Find the correct root
  const r = await client.execute("import json\nprint(json.dumps({'op_root':op('/').path,'project1':op('/project1').path if op('/project1') else None}))");
  console.log('Root info:', r.stdout);

  const P = '/project1';
  
  // Check what exists
  const ops = await client.getOperators(P);
  console.log('project1 children:', ops.operators.map(o => o.name));
  
  // Create container
  try { await client.deleteOperator(P + '/td_elek'); } catch(e) {}
  await new Promise(r => setTimeout(r, 300));
  const comp = await client.createOperator('baseCOMP', 'td_elek', P, 0, 0);
  console.log('Created container:', comp.success, comp.path);
  
  const BP = comp.path;
  
  // Build first system
  await client.createOperator('spherePOP', 'sphere', BP, 0, 0);
  await client.createOperator('copyPOP', 'copy', BP, 250, 0);
  await client.createOperator('noisePOP', 'noise', BP, 500, 0);
  await client.createOperator('nullPOP', 'out', BP, 750, 0);
  
  await client.connectNodes(BP + '/sphere', BP + '/copy', 0);
  await client.connectNodes(BP + '/copy', BP + '/noise', 0);
  await client.connectNodes(BP + '/noise', BP + '/out', 0);
  
  // Set params
  await client.execute('import json\nt = op("' + BP + '/copy")\nt.par.ncy = 6\nt.par.ty = 0.5\nprint("ok")');
  await client.execute('import json\nt = op("' + BP + '/noise")\nt.par.amp0 = 0.4\nprint("ok")');
  
  const h = await client.healthcheck(BP, true);
  console.log('First system:', h.ok ? 'OK' : 'ISSUES');
  
  // List everything
  const all = await client.getOperators(BP);
  console.log('Children:', all.operators.map(o => o.name + '(' + o.opType + ')'));
}
main().catch(e => console.log('ERR:', e.message));
