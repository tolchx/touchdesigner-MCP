""".py file to build GLSL POP examples in TouchDesigner via MCP.
Run: python build_glsl_examples.py
"""
import json, urllib.request, time

HOST = 'http://127.0.0.1:44444'

def td(code):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data,
        headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
    if 'error' in resp:
        print('  ERROR:', resp['error'][:150])
    else:
        out = resp.get('output','')[:100].replace('\n',' | ')
        print('  OK:', out if out else '(ok)')
    return resp

ROOT = '/project1/glsl_examples'

def clean_slate():
    print('=== Cleaning ===')
    td("op('" + ROOT + "').destroy()")
    td("op('/project1').create(baseCOMP, 'glsl_examples')")

def op(path):
    return "op('" + path + "')"

# ===========================
# EXAMPLE 1: Noise Deformation
# ===========================
def example_noise():
    print('\n=== Example 1: Noise Deformation ===')
    # POP source
    td("p=" + op(ROOT) + ".create(boxPOP,'pop1');p.par.tx=3")
    # GLSL code (vertex shader style)
    glsl = "float n = TDSimplexNoise(vec4(P * 0.5, u_time * 0.3)); P += N * n * 0.4;"
    td("t=" + op(ROOT) + ".create(textDAT,'noise_code');t.text='" + glsl + "'")
    # GLSL POP
    td("g=" + op(ROOT) + ".create(glslPOP,'noise_deform');g.par.computedat='noise_code';g.par.numelems=200")
    # Connect
    td("g.inputConnectors[0].connect(p)" if False else "")
    time.sleep(0.5)

# Run
clean_slate()
print('\n=== ERROR CHECK ===')
td("print([(c.name, c.errors()) for c in op('" + ROOT + "').findChildren() if c.errors()])")
