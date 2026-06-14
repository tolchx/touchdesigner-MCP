# Position all GLSL POP nodes neatly: left to right, top to bottom
import json, urllib.request, time

H = 'http://127.0.0.1:44444'

def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:100])
    else: print('  OK:', (resp.get('output','')[:80] or '(ok)').replace(chr(10),' '))
    return resp

R = '/project1/glsl_examples'
# Layout: 4 rows, each row: source | glsl_pop | info
# Source at col 0, glsl at col 250, info at col 450, code at col 450 row+50
# Row spacing: 200

Y_BASE = -300
X_SRC = -300
X_GLSL = 0
X_INFO = 250
X_CODE = 250
ROW_H = 220

examples = ['noise_deform', 'color_by_pos', 'wave_deform', 'fountain']

print('=== Positioning all operators ===')
for i, name in enumerate(examples):
    y = Y_BASE + i * ROW_H
    td("op('" + R + "/src_" + name + "').nodeX = " + str(X_SRC) + "; op('" + R + "/src_" + name + "').nodeY = " + str(y))
    td("op('" + R + "/" + name + "').nodeX = " + str(X_GLSL) + "; op('" + R + "/" + name + "').nodeY = " + str(y))
    td("op('" + R + "/" + name + "_code').nodeX = " + str(X_CODE) + "; op('" + R + "/" + name + "_code').nodeY = " + str(y - 40))
    td("op('" + R + "/" + name + "_info').nodeX = " + str(X_INFO) + "; op('" + R + "/" + name + "_info').nodeY = " + str(y))
    td("op('" + R + "/" + name + "_compute').nodeX = " + str(X_CODE) + "; op('" + R + "/" + name + "_compute').nodeY = " + str(y + 40))

print('\n=== Verify positions ===')
td("print([(c.name, str(c.type), c.nodeX, c.nodeY) for c in op('" + R + "').children])")

print('\nDONE')
