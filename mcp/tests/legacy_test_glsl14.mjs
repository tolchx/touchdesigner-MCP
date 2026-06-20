import { TDClient } from '../../api/dist/index.js';
const client = new TDClient();

async function test() {
  const comp = 'glsl_basic';
  const base = '/td_tests_container/td_glsl_tests';
  const src = base + '/' + comp + '/glsl_shader_src';
  const glsl = base + '/' + comp + '/glsl_shader';
  
  // First check the default shader that TD auto-generates for fresh glslPOP
  const freshPath = base + '/' + comp + '/test_default';
  const autoShader = await client.execute('import json\nt = op("' + freshPath + '")\ntry:\n    # Read computedat to find source\n    cd = t.par.computedat.eval() if t.par.computedat else None\n    if cd and cd != "":\n        print(json.dumps({"computedat":cd}))\n    else:\n        # No computedat - read internal code from par.text or similar\n        print(json.dumps({"computedat":"none"}))\nexcept Exception as e:\n    print(json.dumps({"error":str(e)}))');
  console.log('fresh default source:', autoShader.stdout);
  
  // The default computedat value for a fresh glslPOP
  const defaultCd = await client.execute('import json\nt = op("' + freshPath + '")\nprint(json.dumps({"cd":str(t.par.computedat.eval())[:100]}))');
  console.log('default computedat:', defaultCd.stdout);
  
  // Try writing a proper GLSL POP compute shader
  // In TD, glslPOP uses standard GLSL compute shader layout
  // The P attribute is accessed differently than in vertex shaders
  const computeShader = [
    '#version 430',
    'layout(local_size_x = 64) in;',
    '',
    'uniform float uTime;',
    '',
    'layout(std430, binding = 0) buffer Pos { vec3 positions[]; };',
    '',
    'void main() {',
    '    uint idx = gl_GlobalInvocationID.x;',
    '    positions[idx].x += sin(uTime + positions[idx].y) * 0.01;',
    '    positions[idx].y += cos(uTime + positions[idx].x) * 0.01;',
    '}'
  ].join('\n');
  
  const w = await client.execute('import json\nt = op("' + src + '")\nt.text = """' + computeShader + '"""\nprint(json.dumps({"len":len(t.text)}))');
  console.log('write compute shader:', w.success);
  
  const h = await client.healthcheck(base + '/' + comp, true);
  console.log('compute shader health:', h.issues?.length > 0 ? h.issues[0].errors?.substring(0,300) : 'OK');
  
  // Another attempt - maybe we need to set attrclass to 'auto' or change how attributes are declared
  // Let's look at a working example by checking if TD has built-in examples
  const examples = await client.execute('import json\n# Check if there are any built-in shaders we can read\ntry:\n    t = op("/ui/dialogs/parGrabber/offlineHelp")\n    print(json.dumps({"has_help":True,"len":len(t.text)}))\nexcept:\n    print(json.dumps({"has_help":False}))');
  console.log('offline help:', examples.stdout);
}
test().catch(e => console.log('ERR:', e.message));
