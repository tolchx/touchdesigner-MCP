import json, urllib.request
H = 'http://127.0.0.1:44444'

def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(r,timeout=10).read().decode())

R = '/project1/glsl_examples'

# Write proper GLSL code using parameters/set (avoids string escaping issues)
# Step 1: Simple pass-through shader to test compilation
code1 = 'P = P;'
td("op('" + R + "/noise_code').text = '" + code1 + "'")

# Actually, let me write it as a file and read it
# First create the GLSL file locally
with open('C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/simple.glsl', 'w') as f:
    f.write('P = P;')

# Read it in TD
td("""
import pathlib
t = op('""" + R + """/noise_code')
p = pathlib.Path('C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/simple.glsl')
t.text = p.read_text()
print('code loaded')
""")

# Check errors
r = td("g=op('" + R + "/noise_deform');print('err:', g.errors() if g.errors() else 'OK')")
print('Result:', r)
