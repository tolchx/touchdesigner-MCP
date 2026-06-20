import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  // Search offline help for GLSL POP documentation
  const r = await client.execute('import json\nt = op("/ui/dialogs/parGrabber/offlineHelp")\ntext = t.text\n# Search for glslPOP or GLSL POP\nimport re\nmatches = re.findall(r\'glslPOP[^.]*?\\.(?:\\n|.){0,500}\', text, re.IGNORECASE)[:3]\nprint(json.dumps({"matches": matches}))');
  const data = JSON.parse(r.stdout);
  for (const m of data.matches) {
    console.log('--- MATCH ---');
    console.log(m.substring(0, 500));
  }
}
test().catch(e => console.log('ERR:', e.message));
