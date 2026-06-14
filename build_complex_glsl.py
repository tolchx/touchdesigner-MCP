import json, urllib.request, time, os

H = 'http://127.0.0.1:44444'
S = 'C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/glsl_files'
os.makedirs(S, exist_ok=True)

def td(code):
    d = json.dumps({'code': code, 'lang':'python'}).encode()
    try:
        r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
        resp = json.loads(urllib.request.urlopen(r,timeout=30).read().decode())
        if 'error' in resp: print('  ERR:', resp['error'][:100])
        else: print('  OK:', (resp.get('output','')[:100] or '(ok)').replace(chr(10),' '))
        return resp
    except Exception as e:
        print('  NET ERR:', e)
        return {'error': str(e)}

R = '/project1/glsl_examples'

print('=== Cleaning ===')
td("op('" + R + "').destroy()")
td("op('/project1').create(baseCOMP, 'glsl_examples')")
print()

# Write all GLSL shader files
shaders = {
    'movement.glsl': '''
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float speed = u_time * 0.5;
    // Orbital movement around Y axis
    float angle = atan(p.z, p.x) + speed;
    float rad = length(p.xz);
    p.x = cos(angle) * rad;
    p.z = sin(angle) * rad;
    // Breathing scale
    float breathe = 1.0 + sin(u_time * 1.5 + p.y * 0.5) * 0.15;
    p *= breathe;
    // Wave displacement on Y
    p.y += sin(p.x * 3.0 + u_time * 2.0) * 0.2;
    P[id] = p;
}
''',
    'waves.glsl': '''
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    // Multi-frequency wave deformation
    float w1 = sin(p.x * 1.5 + u_time * 1.2) * 0.4;
    float w2 = cos(p.z * 2.0 + u_time * 0.8) * 0.3;
    float w3 = sin((p.x + p.z) * 1.0 + u_time * 2.5) * 0.2;
    p.y += w1 + w2 + w3;
    // Twist
    float twist = sin(p.y * 0.5 + u_time) * 0.3;
    float ct = cos(twist), st = sin(twist);
    p.xz = mat2(ct, -st, st, ct) * p.xz;
    P[id] = p;
}
''',
    'explosion.glsl': '''
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    // Explosion: push points outward from center over time
    float dist = length(p);
    float force = sin(u_time * 1.5) * 0.5 + 0.5;
    vec3 dir = normalize(p + 0.001);
    float push = force * 2.0 + sin(dist * 2.0 - u_time * 3.0) * 0.3;
    p += dir * push;
    // Spiral rotation
    float a = u_time * 0.5 + dist * 0.3;
    float ct = cos(a), st = sin(a);
    p.xz = mat2(ct, -st, st, ct) * p.xz;
    P[id] = p;
}
''',
    'fountain2.glsl': '''
uniform float u_time;
void main(){
    const uint id = TDIndex();
    if(id >= TDNumElements()) return;
    float a = float(id) * 0.05 + u_time * 2.0;
    float r = 0.5 + sin(float(id) * 0.3 + u_time) * 0.3;
    float x = cos(a) * r * (1.0 + sin(u_time * 0.7) * 0.3);
    float z = sin(a) * r * (1.0 + cos(u_time * 0.5) * 0.3);
    float y = 2.0 + sin(float(id) * 0.1 + u_time * 1.5) * 1.5 - abs(sin(u_time * 0.3)) * 3.0;
    P[id] = vec3(x, y + 2.0, z);
}
''',
}

for name, content in shaders.items():
    p = os.path.join(S, name)
    with open(p, 'w') as f: f.write(content)
    print(f'  Written: {name}')

print('\n=== Building complex examples ===')

examples = [
    ('movement', 'movement.glsl', True,  200, 'boxPOP'),
    ('waves',    'waves.glsl',    True,  200, 'boxPOP'),
    ('explosion','explosion.glsl',True,  500, 'spherePOP'),
    ('fountain2','fountain2.glsl',True,  800, 'boxPOP'),
]

for i, (name, shader_file, has_time, num, src_type) in enumerate(examples):
    y = -300 + i * 250

    # POP source
    src_name = 'src_' + name
    td("s=op('" + R + "').create(" + src_type + ",'" + src_name + "');s.nodeX=-350;s.nodeY=" + str(y))
    if src_type == 'spherePOP':
        td("s.par.rows=20;s.par.columns=20;s.par.radius=1.5")

    # Read GLSL
    with open(os.path.join(S, shader_file)) as f:
        glsl = f.read().strip()

    # Create code DAT
    td("t=op('" + R + "').create(textDAT,'" + name + "_code');t.nodeX=300;t.nodeY=" + str(y-40))
    td("t=op('" + R + "/" + name + "_code');t.text='" + glsl.replace("'", "\\'").replace('\n', '\\n') + "'")

    # Create GLSL POP
    td("g=op('" + R + "').create(glslPOP,'" + name + "');g.par.computedat='" + name + "_code';g.par.numelems=" + str(num) + ";g.par.outputattrs='P';g.nodeX=0;g.nodeY=" + str(y))

    # Connect source → GLSL POP
    td("op('" + R + "/" + src_name + "').outputConnectors[0].connect(op('" + R + "/" + name + "'))")

    print(f'  [{i+1}] {name} built')

print('\n=== Verifying ===')
time.sleep(2)
td("print('Errors:', [(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")

print('\n=== Info DATs ===')
td("[print(f\"{c.name}: {c.text[100:250].replace(chr(10),' ')}\") for c in op('" + R + "').children if 'info' in c.name]")
