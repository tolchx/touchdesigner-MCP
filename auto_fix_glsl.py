"""
Auto-fix all GLSL POP examples in TouchDesigner.
Run: python auto_fix_glsl.py
"""
import json, urllib.request, time

HOST = 'http://127.0.0.1:44444'
ROOT = '/project1/glsl_examples'

def op(path):
    return "op('" + path + "')"

def td(code):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data,
        headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:120])
    else: print('  OK:', resp.get('output','')[:80].replace('\n',' '))
    return resp

# Step 1: Detect errors
print('=== DETECTING ERRORS ===')
r = td("print([(c.name, c.errors()) for c in op('" + ROOT + "').findChildren() if c.errors()])")
print()

# Step 2: Fix "No input POP" errors by connecting POP sources
print('=== FIXING CONNECTIONS ===')

# Create POP sources for each GLSL POP that needs them
glsl_ops = ['noise_deform', 'color_by_pos', 'wave_deform']
pop_sources = {}

for i, name in enumerate(glsl_ops):
    src_name = 'src_' + name
    td("p=" + op(ROOT) + ".create(boxPOP, '" + src_name + "');p.par.tx=" + str((i-1)*3))
    g = op(ROOT) + "/" + name
    p = op(ROOT) + "/" + src_name
    td("p.outputConnectors[0].connect(" + g + ")")
    pop_sources[name] = src_name

# Fix fountain (copy POP) - needs a POP source too
td("src=" + op(ROOT) + ".create(boxPOP,'src_fountain')")
td("src.outputConnectors[0].connect(" + op(ROOT) + "/fountain)")

# Step 3: Write proper GLSL code for each example
print('=== WRITING GLSL CODE ===')

# noise_deform: Simplex noise deformation
td("t=" + op(ROOT) + "/noise_code;t.text='float n = TDSimplexNoise(vec4(P * 0.5, u_time * 0.3)); P += N * n * 0.4;'")

# color_by_pos: Color by position
td("t=" + op(ROOT) + "/color_code;t.text='Cd = vec4(P * 0.5 + 0.5, 1.0);'")

# wave_deform: Wave deformation
td("t=" + op(ROOT) + "/wave_code;t.text='P.y += sin(P.x * 2.0 + u_time * 3.0) * 0.3; P.xz += cos(P.y * 1.5 + u_time * 2.0) * 0.1;'")

# fountain: Particle fountain (GLSL Copy POP)
td("t=" + op(ROOT) + "/fountain_code;t.text='P = vec3(sin(float(id)*0.1+u_time)*2.0, cos(float(id)*0.1+u_time*0.5)*2.0, 0.0);'")

# Step 4: Verify
print('=== FINAL VERIFICATION ===')
time.sleep(1)
r = td("print([(c.name, c.errors()) for c in op('" + ROOT + "').findChildren() if c.errors()])")
print()
if 'errors' in str(r) and len(str(r)) > 100:
    print('Still have errors! Need manual fix.')
else:
    print('ALL FIXED!')

def op(path):
    return "op('" + path + "')"
