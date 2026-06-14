import json, urllib.request
H = 'http://127.0.0.1:44444'
def td(c):
    d = json.dumps({'code':c}).encode()
    r = json.loads(urllib.request.urlopen(urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'}),timeout=10).read().decode())
    if 'error' in r: print('ERR:', r['error'][:100])
    else: print('OK:', r.get('output','')[:80])
    return r

R = '/project1/glsl_examples'

# Wire all GLSL POPs to their sources
pairs = [
    ('src_noise_deform', 'noise_deform'),
    ('src_color_by_pos', 'color_by_pos'),
    ('src_wave_deform', 'wave_deform'),
    ('src_fountain', 'fountain'),
]

for src, dst in pairs:
    td("p=op('" + R + "/" + src + "'); g=op('" + R + "/" + dst + "'); p.outputConnectors[0].connect(g); print('OK:" + dst + "')")

# Now fix GLSL code for noise_deform (compile error)
# The issue is likely missing uniform declarations or syntax
td("t=op('" + R + "/noise_code');t.text=''')")

# Check
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")
