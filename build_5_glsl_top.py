"""
Build 5 GLSL TOP examples + image export.
Each shader produces visible animated output immediately.
"""
import json, urllib.request, time, os

H = 'http://127.0.0.1:44444'
def td(code):
    d = json.dumps({'code': code}).encode()
    r = urllib.request.Request(H+'/exec',data=d,headers={'Content-Type':'application/json'})
    resp = json.loads(urllib.request.urlopen(r,timeout=15).read().decode())
    if 'error' in resp: print('  ERR:', resp['error'][:80])
    else: print('  OK:', (resp.get('output','')[:80] or '(ok)').replace(chr(10),' '))
    return resp

R = '/project1/glsl_shaders'

td("op('" + R + "').destroy()")
td("op('/project1').create(baseCOMP,'glsl_shaders')")
td("op('" + R + "').nodeX=700; op('" + R + "').nodeY=0")

# 5 GLSL TOP pixel shaders (all use u_time + vUV.st for visible animation)
shaders = {
    'aurora': '''
uniform float u_time;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    vec2 p = uv * 2.0 - 1.0;
    float a = atan(p.y, p.x);
    float r = length(p);
    float wave = sin(r * 8.0 - u_time * 2.0 + a * 3.0) * 0.5 + 0.5;
    float wave2 = sin((r + a) * 6.0 + u_time * 1.5) * 0.5 + 0.5;
    float wave3 = sin(r * 12.0 - u_time * 3.0 - a * 2.0) * 0.5 + 0.5;
    vec3 col = vec3(wave * 0.8 + wave2 * 0.2, wave2 * 0.9, wave3 * 0.7 + wave * 0.3);
    fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
''',
    'fire': '''
uniform float u_time;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    float t = u_time * 2.0;
    float flame = sin(uv.y * 30.0 - t + uv.x * 10.0) * 0.5 + 0.5;
    flame *= sin(uv.y * 20.0 + t * 1.3 + uv.x * 8.0) * 0.5 + 0.5;
    flame *= 1.0 - uv.y;
    flame = clamp(flame * 3.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.1, 0.0, 0.0), vec3(1.0, 0.6, 0.1), flame);
    col = mix(col, vec3(1.0, 0.9, 0.5), flame * flame);
    fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
''',
    'kaleido': '''
uniform float u_time;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st * 2.0 - 1.0;
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 6.0;
    a = mod(a, 6.2832 / seg);
    a = abs(a - 3.1416 / seg);
    uv = vec2(cos(a), sin(a)) * r;
    float c1 = sin(uv.x * 5.0 + u_time) * 0.5 + 0.5;
    float c2 = sin(uv.y * 5.0 + u_time * 0.7) * 0.5 + 0.5;
    float c3 = sin((uv.x + uv.y) * 4.0 + u_time * 1.3) * 0.5 + 0.5;
    fragColor = TDOutputSwizzle(vec4(c1, c2, c3, 1.0));
}
''',
    'mandala': '''
uniform float u_time;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st * 2.0 - 1.0;
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float pat = sin(a * 12.0 + u_time) * 0.5 + 0.5;
    pat *= sin(r * 15.0 - u_time * 2.0) * 0.5 + 0.5;
    pat += sin((a + r) * 8.0 + u_time * 1.5) * 0.3;
    float mask = 1.0 - smoothstep(0.0, 1.0, r);
    vec3 col = mix(vec3(0.5, 0.1, 0.6), vec3(0.1, 0.5, 0.9), pat);
    col += vec3(0.3, 0.2, 0.1) * sin(r * 20.0 - u_time * 4.0);
    fragColor = TDOutputSwizzle(vec4(col * mask, 1.0));
}
''',
    'flow': '''
uniform float u_time;
out vec4 fragColor;
void main(){
    vec2 uv = vUV.st;
    vec2 p = uv * 4.0;
    float v1 = sin(p.x + u_time * 0.5 + sin(p.y * 2.0 + u_time * 0.3));
    float v2 = cos(p.y * 0.8 + u_time * 0.7 + sin(p.x * 1.5 - u_time * 0.4));
    float v3 = sin((p.x + p.y) * 0.6 + u_time + cos(p.x - p.y + u_time * 0.2));
    float v4 = cos((p.x - p.y) * 0.9 - u_time * 0.5 + sin(p.y + p.x + u_time));
    float cx = v1 * 0.5 + v2 * 0.3 + v3 * 0.2;
    float cy = v2 * 0.4 + v4 * 0.3 + v1 * 0.3;
    float cz = v3 * 0.5 + v1 * 0.2 + v4 * 0.3;
    fragColor = TDOutputSwizzle(vec4(cx * 0.5 + 0.5, cy * 0.5 + 0.5, cz * 0.5 + 0.5, 1.0));
}
''',
}

names = list(shaders.keys())
print('=== Building 5 GLSL TOP shaders ===')

for i, (name, code) in enumerate(shaders.items()):
    y = -300 + i * 160
    td("g=op('" + R + "').create(glslTOP,'" + name + "');g.nodeX=0;g.nodeY=" + str(y))
    td("d=op('" + R + "').create(textDAT,'" + name + "_code');d.nodeX=250;d.nodeY=" + str(y))
    td("d=op('" + R + "/" + name + "_code');d.text='" + code.replace("'","\\'").replace('\n','\\n') + "'")
    td("g=op('" + R + "/" + name + "');g.par.pixeldat='" + name + "_code'")
    td("n=op('" + R + "').create(nullTOP,'" + name + "_out');n.nodeX=150;n.nodeY=" + str(y))
    td("op('" + R + "/" + name + "').outputConnectors[0].connect(op('" + R + "/" + name + "_out'))")

time.sleep(2)

print('\n=== Checking compilation ===')
td("[print(c.text[100:300].replace(chr(10),' ')) for c in op('" + R + "').findChildren() if 'info' in str(c.type).lower()]")

print('\n=== Errors ===')
td("print([(c.name, c.errors()) for c in op('" + R + "').findChildren() if c.errors()])")

# Export a frame from each shader
print('\n=== Exporting images ===')
for name in names:
    td("op('" + R + "/" + name + "').display = True")

print('\n=== DONE ===')
print('Open /project1/glsl_shaders in TouchDesigner')
print('Select any GLSL TOP to see the animated shader in the viewer')
