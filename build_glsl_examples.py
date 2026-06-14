import json, urllib.request, sys

HOST = 'http://127.0.0.1:44444'

def td(code):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data, headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())
    if 'error' in resp:
        print('  ERROR:', resp['error'][:120])
    else:
        out = resp.get('output','')[:80]
        print('  OK:', out.replace(chr(10),' '))
    return resp

PJ = '/project1/glsl_examples'

# Clean
td("op('" + PJ + "').destroy()")
td("op('/project1').create(baseCOMP, 'glsl_examples')")

# --- Example 1: Noise Deformation ---
print('--- Example 1: Noise Deformation ---')
td("op('" + PJ + "').create(sphereSOP, 'sphere1')")
td("t=op('" + PJ + "').create(textDAT,'noise_code');t.text='float n = TDSimplexNoise(vec4(P * u_freq, u_time * u_speed)); P += N * n * u_amp;'")
td("g=op('" + PJ + "').create(glslPOP,'noise_deform');g.par.computedat='noise_code';g.par.numelems=200")

# --- Example 2: Color By Position ---
print('--- Example 2: Color By Position ---')
td("op('" + PJ + "').create(sphereSOP, 'sphere2')")
td("t=op('" + PJ + "').create(textDAT,'color_code');t.text='Cd = vec4(P * 0.5 + 0.5, 1.0);'")
td("g=op('" + PJ + "').create(glslPOP,'color_by_pos');g.par.computedat='color_code';g.par.numelems=200")

# --- Example 3: Wave Deformation ---
print('--- Example 3: Wave Deformation ---')
td("op('" + PJ + "').create(torusSOP, 'torus1')")
wave_code = "P.y += sin(P.x * 2.0 + u_time * 3.0) * 0.3; P.xz += cos(P.y * 1.5 + u_time * 2.0) * 0.1;"
td("t=op('" + PJ + "').create(textDAT,'wave_code');t.text='" + wave_code + "'")
td("g=op('" + PJ + "').create(glslPOP,'wave_deform');g.par.computedat='wave_code';g.par.numelems=200")

# --- Example 4: Particle Fountain (GLSL Copy POP) ---
print('--- Example 4: Particle Fountain ---')
fountain = "if(u_time < age) return; float a = u_time * 2.0 + id * 0.1; P = vec3(sin(a)*2.0, cos(a)*2.0+3.0, 0.0); age = u_time + 1.0;"
td("t=op('" + PJ + "').create(textDAT,'fountain_code');t.text='" + fountain + "'")
td("g=op('" + PJ + "').create(glslcopyPOP,'fountain');g.par.computedat='fountain_code';g.par.numelems=500")

# Verify
print('--- Verify ---')
td("print([c.name + ' (' + str(c.type) + ')' for c in op('" + PJ + "').children])")

print('\\nDONE - 4 GLSL POP examples created in /project1/glsl_examples')
