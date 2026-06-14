# Final fix: rebuild all GLSL POP examples from scratch
import json, urllib.request, os, time

H = 'http://127.0.0.1:44444'
GLSL_DIR = 'C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/glsl_files'
os.makedirs(GLSL_DIR, exist_ok=True)

def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:120])
    else: print('  OK:', (resp.get('output','')[:80] or '(ok)').replace(chr(10),' '))
    return resp

R = '/project1/glsl_examples'
S = 'C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/glsl_files'

# Clean
print('=== Cleaning ===')
td("op('" + R + "').destroy()")

print('\n=== Creating container ===')
td("op('/project1').create(baseCOMP, 'glsl_examples')")

# Write GLSL files
shaders = {
    'noise.glsl': 'void main(){\n  const uint id = TDIndex();\n  if(id >= TDNumElements()) return;\n  float n = TDSimplexNoise(vec4(TDIn_P(0,id)*0.5, u_time*0.3));\n  P[id] = TDIn_P(0,id) + TDIn_N(0,id) * n * 0.4;\n}',
    'color.glsl': 'void main(){\n  const uint id = TDIndex();\n  if(id >= TDNumElements()) return;\n  Cd[id] = vec4(TDIn_P(0,id)*0.5+0.5, 1.0);\n}',
    'wave.glsl': 'void main(){\n  const uint id = TDIndex();\n  if(id >= TDNumElements()) return;\n  vec3 p = TDIn_P(0,id);\n  p.y += sin(p.x*2.0+u_time*3.0)*0.3;\n  P[id] = p;\n}',
    'fountain.glsl': 'void main(){\n  const uint id = TDIndex();\n  if(id >= TDNumElements()) return;\n  float a = float(id)*0.1 + u_time*2.0;\n  P[id] = vec3(sin(a)*2.0, cos(a*0.5)*2.0+2.0, 0.0);\n}',
}
for name, content in shaders.items():
    with open(os.path.join(S, name), 'w') as f:
        f.write(content)

print('\n=== Building examples ===')

examples = [
    ('noise_deform', 'noise.glsl', 200, 'point', 'boxPOP'),
    ('color_by_pos', 'color.glsl', 200, 'point', 'boxPOP'),
    ('wave_deform', 'wave.glsl', 200, 'point', 'boxPOP'),
    ('fountain', 'fountain.glsl', 500, 'point', 'boxPOP'),
]

for i, (name, shader_file, num, attrclass, src_type) in enumerate(examples):
    print(f'\n  [{i+1}] {name}')
    # Create POP source
    src_name = 'src_' + name
    td("s=op('" + R + "').create(" + src_type + ",'" + src_name + "');s.par.tx=" + str((i-1)*3))
    # Create text DAT with GLSL code
    dat_name = name + '_code'
    with open(os.path.join(S, shader_file)) as f:
        glsl_code = f.read()
    # Escape for TD - replace newlines with literal \n
    escaped = glsl_code.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')
    td("t=op('" + R + "').create(textDAT,'" + dat_name + "');t.text='" + escaped + "'")
    # Create GLSL POP
    td("g=op('" + R + "').create(glslPOP,'" + name + "');g.par.computedat='" + dat_name + "';g.par.numelems=" + str(num))
    # Connect source -> GLSL POP
    td("op('" + R + "/" + src_name + "').outputConnectors[0].connect(op('" + R + "/" + name + "'))")

print('\n=== Positioning (left→right, top→bottom) ===')
YB = -300; XS = -300; XG = 0; XI = 250; XC = 250; RH = 220
for i, name in enumerate([e[0] for e in examples]):
    y = YB + i * RH
    td("op('" + R + "/src_" + name + "').nodeX=" + str(XS) + ";op('" + R + "/src_" + name +"').nodeY=" + str(y))
    td("op('" + R + "/" + name + "').nodeX=" + str(XG) + ";op('" + R + "/" + name + "').nodeY=" + str(y))
    td("op('" + R + "/" + name + "_code').nodeX=" + str(XC) + ";op('" + R + "/" + name + "_code').nodeY=" + str(y-40))
    td("op('" + R + "/" + name + "_info').nodeX=" + str(XI) + ";op('" + R + "/" + name + "_info').nodeY=" + str(y))
    td("op('" + R + "/" + name + "_compute').nodeX=" + str(XC) + ";op('" + R + "/" + name + "_compute').nodeY=" + str(y+40))

print('\n=== Verifying ===')
time.sleep(1)
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")
print('\nDONE')
