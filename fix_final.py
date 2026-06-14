# Final fix: set outputattrs=P and proper GLSL for all examples
import json, urllib.request, time

H = 'http://127.0.0.1:44444'
def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:80])
    else: print('  OK:', (resp.get('output','')[:80] or '(ok)').replace(chr(10),' '))
    return resp

R = '/project1/glsl_examples'

examples = {
    'noise_deform': {
        'code': 'uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; vec3 p=TDIn_P(0,id); float n=TDSimplexNoise(vec4(p*0.5,u_time*0.3)); P[id]=p+normalize(p)*n*0.4;}',
        'attrs': 'P'
    },
    'color_by_pos': {
        'code': 'void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; P[id]=TDIn_P(0,id)*1.001;}',
        'attrs': 'P'
    },
    'wave_deform': {
        'code': 'uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; vec3 p=TDIn_P(0,id); p.y+=sin(p.x*2.0+u_time*3.0)*0.3; P[id]=p;}',
        'attrs': 'P'
    },
    'fountain': {
        'code': 'uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; float a=float(id)*0.1+u_time*2.0; P[id]=vec3(sin(a)*2.0,cos(a*0.5)*2.0+2.0,0.0);}',
        'attrs': 'P'
    },
}

print('=== Fixing all GLSL POPs ===')
for name, cfg in examples.items():
    td("g=op('" + R + "/" + name + "');g.par.outputattrs='" + cfg['attrs'] + "'")
    td("t=op('" + R + "/" + name + "_code');t.text='" + cfg['code'] + "'")

time.sleep(1)

print('\n=== Info DAT results ===')
td("[print(f'{c.name}: {c.text[:200].replace(chr(10),\" \")}') for c in op('" + R + "').children if 'info' in c.name]")

print('\n=== Errors ===')
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")
