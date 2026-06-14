# Build proper GLSL POP examples using correct compute shader syntax

import json, urllib.request, os

H = 'http://127.0.0.1:44444'
GLSL_DIR = 'C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/glsl_files'
os.makedirs(GLSL_DIR, exist_ok=True)

def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(r,timeout=15).read().decode())

R = '/project1/glsl_examples'

# Read the current compute DAT template to find the right structure
print('=== Current compute DAT template ===')
r = td("c=op('" + R + "/noise_deform_compute');print(c.text)")
print()

# Write proper GLSL files to disk
shaders = {
    'noise.glsl': '''
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    float n = TDSimplexNoise(vec4(TDIn_P(0, id) * 0.5, u_time * 0.3));
    P[id] = TDIn_P(0, id) + TDIn_N(0, id) * n * 0.4;
}
''',
    'color.glsl': '''
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    Cd[id] = vec4(p * 0.5 + 0.5, 1.0);
}
''',
    'wave.glsl': '''
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    p.y += sin(p.x * 2.0 + u_time * 3.0) * 0.3;
    p.xz += cos(p.y * 1.5 + u_time * 2.0) * 0.1;
    P[id] = p;
}
''',
    'fountain.glsl': '''
void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    float a = float(id) * 0.1 + u_time * 2.0;
    P[id] = vec3(sin(a) * 2.0, cos(a * 0.5) * 2.0 + 2.0, 0.0);
}
''',
}

for fname, content in shaders.items():
    path = os.path.join(GLSL_DIR, fname)
    with open(path, 'w') as f:
        f.write(content.strip() + '\n')
    print(f'Written: {fname}')

# Now write each shader into the correct compute DAT
pairs = [
    ('noise_deform_compute', 'noise.glsl'),
    ('color_by_pos_compute', 'color.glsl'),
    ('wave_deform_compute', 'wave.glsl'),
    ('fountain_compute', 'fountain.glsl'),  # for glslcopyPOP
]

# Also need to find the compute DAT for fountain (it's a glslcopyPOP)
print('\n=== Finding compute DATs ===')
td("print([c.name for c in op('" + R + "').children if 'compute' in c.name.lower()])")

print('\n=== Writing GLSL code ===')
for dat, shader in pairs:
    fpath = os.path.join(GLSL_DIR, shader)
    with open(fpath) as f:
        code = f.read().replace("'", "\\'")
    r = td("t=op('" + R + "/" + dat + "'); t.text = '" + code + "'; print('Written:', t.name)")
    # Check errors on the parent GLSL POP
    parent = dat.replace('_compute', '').replace('_ptCompute', '')
    if parent != dat:
        pass  # We'll check all errors at the end

print('\n=== Final Error Check ===')
r = td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")
print('Done')
