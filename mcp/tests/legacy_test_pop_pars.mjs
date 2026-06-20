import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();
const P = '/td_tests_container';

async function getPOPpars(type) {
  // Create temp node, read all pars, then destroy
  const c = await client.createOperator(type, '_tmp_pars', P, 0, 0);
  if (!c.success) return null;
  
  const r = await client.execute('import json\nt = op("' + P + '/_tmp_pars")\nprint(json.dumps([{"name":p.name,"label":p.label,"val":str(p.val)[:60],"style":p.style} for p in t.pars()]))');
  await client.deleteOperator(P + '/_tmp_pars');
  
  if (!r.success) return null;
  return JSON.parse(r.stdout);
}

async function test() {
  const popTypes = ['noisePOP', 'mathPOP', 'limitPOP', 'deletePOP', 'attributePOP', 'blendPOP', 'copyPOP', 'feedbackPOP', 'cachePOP'];
  
  for (const type of popTypes) {
    const pars = await getPOPpars(type);
    if (!pars) { console.log(type + ': FAIL'); continue; }
    
    // Filter to relevant controls (non-page, non-internal)
    const relevant = pars.filter(p => 
      !['pageindex','computedat','attrclass','numthreadsmode','threadsinput','numelems',
        'numelemspop','numelemsclass','numelemsattr','workgroupsizex','workgroupsizey',
        'workgroupsizez','dispatchsizex','dispatchsizey','dispatchsizez',
        'outputattrs','outputaccess','initoutputattrs','prevpassoutput','buildflag',
        'bypass','freeextragpumem','delinputattrs','parmcolorspace','parmreferencewhite',
        'color','vec','sampler','const','tempbuffer','matattr','array','matrix','asname',
        'colpop','opaquecolgeo'].some(prefix => p.name.startsWith(prefix))
    );
    
    console.log(type + ' (' + relevant.length + ' relevant pars):');
    for (const p of relevant.slice(0, 15)) {
      console.log('  ' + p.name + ' = ' + p.val + '  [' + p.style + ']');
    }
    if (relevant.length > 15) console.log('  ... and ' + (relevant.length - 15) + ' more');
    console.log('');
  }
}
test().catch(e => console.log('ERR:', e.message));
