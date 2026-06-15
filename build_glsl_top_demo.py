# Build visible GLSL TOP examples (image shaders) that can be seen immediately
import json, urllib.request, time, os

H = 'http://127.0.0.1:44444'
def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:100])
    else: print('  OK:', (resp.get('output','')[:80] or '(ok)').replace(chr(10),' '))
    return resp

R = '/project1/glsl_top_demo'

print('=== Creating GLSL TOP demo project ===')
td("op('" + R + "').destroy()")
td("op('/project1').create(baseCOMP, 'glsl_top_demo')")
td("op('" + R + "').nodeX = 600; op('" + R + "').nodeY = 200")

# GLSL TOP #1: Shadertoy-style animated gradient
shader1 = '''
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;
    float r = length(p);
    float a = atan(p.y, p.x);
    float c1 = sin(r * 5.0 - u_time * 2.0) * 0.5 + 0.5;
    float c2 = sin(a * 3.0 + u_time * 1.5) * 0.5 + 0.5;
    float c3 = sin((r + a) * 4.0 + u_time) * 0.5 + 0.5;
    fragColor = TDOutputSwizzle(vec4(c1, c2, c3, 1.0));
}
'''

# GLSL TOP #2: Plasma/kaleidoscope
shader2 = '''
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    vec2 p = uv * 3.0;
    float v1 = sin(p.x + u_time);
    float v2 = sin(p.y * 2.0 + u_time * 0.7);
    float v3 = sin((p.x + p.y) * 1.5 + u_time * 1.3);
    float cx = v1 + v2 + v3;
    float cy = sin(p.y * 2.0 + u_time * 0.5) + cos(p.x * 1.5 - u_time * 0.8);
    float cz = sin((p.x - p.y) * 2.0 + u_time * 1.1);
    fragColor = TDOutputSwizzle(vec4(cx * 0.5 + 0.5, cy * 0.5 + 0.5, cz * 0.5 + 0.5, 1.0));
}
'''

# GLSL TOP #3: Color bars with motion
shader3 = '''
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    float bars = sin(uv.x * 20.0 + u_time) * 0.5 + 0.5;
    float bars2 = sin(uv.y * 15.0 - u_time * 0.8) * 0.5 + 0.5;
    float mixv = sin((uv.x + uv.y) * 10.0 + u_time * 1.5) * 0.5 + 0.5;
    vec3 col1 = vec3(0.2, 0.5, 0.9);
    vec3 col2 = vec3(0.9, 0.2, 0.5);
    vec3 col3 = vec3(0.2, 0.9, 0.4);
    vec3 c = mix(mix(col1, col2, bars), col3, bars2);
    fragColor = TDOutputSwizzle(vec4(c, 1.0));
}
'''

# GLSL TOP #4: Tunnel effect
shader4 = '''
uniform float u_time;
uniform vec2 u_resolution;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float tunnel = sin(r * 20.0 - u_time * 3.0) * 0.5 + 0.5;
    float spin = sin(a * 8.0 + u_time * 2.0 + r * 5.0) * 0.5 + 0.5;
    float mask = 1.0 - smoothstep(0.1, 1.0, r);
    vec3 col = mix(vec3(0.1, 0.0, 0.2), vec3(0.9, 0.3, 0.6), tunnel * spin);
    fragColor = TDOutputSwizzle(vec4(col * mask, 1.0));
}
'''

shaders = [shader1, shader2, shader3, shader4]
names = ['gradient', 'plasma', 'color_bars', 'tunnel']

for i, (name, code) in enumerate(zip(names, shaders)):
    y_pos = -200 + i * 150
    # Create GLSL TOP
    td("g=op('" + R + "').create(glslTOP,'" + name + "');g.nodeX=0;g.nodeY=" + str(y_pos))
    # Set pixel shader code
    td("t=op('" + R + "/" + name + "').create(textDAT,'pix');t.nodeX=0;t.nodeY=" + str(y_pos+50))
    td("t=op('" + R + "/" + name + "/pix');t.text='" + code.replace("'", "\\'").replace('\n', '\\n') + "'")
    td("op('" + R + "/" + name + "').par.pixeldat = 'pix'")
    # Add null for easy connection
    td("n=op('" + R + "').create(nullTOP,'" + name + "_out');n.nodeX=200;n.nodeY=" + str(y_pos))
    td("op('" + R + "/" + name + "').outputConnectors[0].connect(op('" + R + "/" + name + "_out'))")
    print(f'  [{i+1}] {name} created')

time.sleep(1)

print('\n=== Verifying ===')
td("[print(f'{c.name}:', c.text[:100].replace(chr(10),' ')) for c in op('" + R + "').findChildren() if 'info' in str(c.type).lower() or c.name=='pix']")
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")

print('\n=== DONE ===')
print('Open the GLSL TOP viewer to see animated visuals!')
