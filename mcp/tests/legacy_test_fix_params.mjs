import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function test() {
  // Read exact par names for copyPOP
  await client.createOperator('copyPOP', '_tmp_pars', P, 0, 0);
  const r = await client.execute('import json\nt = op("' + P + '/_tmp_pars")\nprint(json.dumps({"all":[p.name for p in t.pars()],"vals":{p.name:str(p.val) for p in t.pars() if "ncx" in p.name or "nrows" in p.name or "ncols" in p.name or "ncopy" in p.name or "numcopy" in p.name or "n" in p.name.lower() and p.name[0]=="n"}}))');
  console.log('copyPOP pars starting with n:', r.stdout);
  await client.deleteOperator(P + '/_tmp_pars');
  
  // Read deletePOP par details
  await client.createOperator('deletePOP', '_tmp_del', P, 0, 0);
  const r2 = await client.execute('import json\nt = op("' + P + '/_tmp_del")\nprint(json.dumps({"pars":[{"n":p.name,"v":str(p.val)[:40],"l":p.label} for p in t.pars() if "input" in p.name.lower() or "src" in p.name or "connect" in p.name]}))');
  console.log('deletePOP input pars:', r2.stdout);
  await client.deleteOperator(P + '/_tmp_del');
}
test().catch(e => console.log('ERR:', e.message));
