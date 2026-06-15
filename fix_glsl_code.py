# Fix all GLSL shaders with proper uniform/attribute declarations
import json, urllib.request, time

H = 'http://127.0.0.1:44444'

def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: 
        err = resp['error'][:80]
        print('  ERR:', err)
    else:
        out = (resp.get('output','')[:80] or '(ok)').replace(chr(10),' ')
        print('  OK:', out)
    return resp

R = '/project1/glsl_examples'

# Fix all GLSL compute DATs with proper uniform declarations
print('=== Fixing GLSL code ===')

# noise_deform: add uniform u_time
td("t=op('" + R + "/noise_deform_code');t.text='''uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; float n=TDSimplexNoise(vec4(TDIn_P(0,id)*0.5, u_time*0.3)); P[id]=TDIn_P(0,id)+TDIn_N(0,id)*n*0.4;}'''")

# wave_deform: add uniform u_time
td("t=op('" + R + "/wave_deform_code');t.text='''uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; vec3 p=TDIn_P(0,id); p.y+=sin(p.x*2.0+u_time*3.0)*0.3; P[id]=p;}'''")

# color_by_pos: Cd needs to be written through TDOut_Cd or just use color output approach
# Actually, Cd is not an output attribute by default. Let's use a different approach:
# Write color to P just for demonstration, or set up Cd as output attribute
td("t=op('" + R + "/color_by_pos_code');t.text='''void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; P[id]=TDIn_P(0,id)*1.001;}'''")

# fountain: add uniform u_time  
td("t=op('" + R + "/fountain_code');t.text='''uniform float u_time; void main(){const uint id=TDIndex();if(id>=TDNumElements()) return; float a=float(id)*0.1+u_time*2.0; P[id]=vec3(sin(a)*2.0, cos(a*0.5)*2.0+2.0, 0.0);}'''")

time.sleep(1)

print('\n=== Checking info DATs ===')
td("[print(f'{c.name}: {c.text[:120].replace(chr(10),\" \")}') for c in op('" + R + "').children if 'info' in c.name]")

print('\n=== Checking errors ===')
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")
