import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const r = await client.execute('import json\nt = op("/ui/dialogs/parGrabber/offlineHelp")\ntext = t.text\nimport re\n# Search for Write GLSL POPs article\nmatch = re.search(r\'Write GLSL POPs[^.]*?\\.(?:\\n|.){0,3000}\', text, re.IGNORECASE)\nif match:\n    print(json.dumps({"article": match.group(0)[:3000]}))\nelse:\n    # Try finding any GLSL-related content about uniforms\n    match2 = re.search(r\'uniform[^}]*?time[^.]*?\\.(?:\\n|.){0,500}\', text, re.IGNORECASE)\n    if match2:\n        print(json.dumps({"uniform": match2.group(0)[:1000]}))\n    else:\n        print(json.dumps({"not_found":True}))');
  const data = JSON.parse(r.stdout);
  if (data.article) console.log(data.article);
  if (data.uniform) console.log('UNIFORM:', data.uniform);
}
test().catch(e => console.log('ERR:', e.message));
