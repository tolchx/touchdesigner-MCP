import json, urllib.request

def td(code):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request('http://127.0.0.1:44444/exec', data=data, headers={'Content-Type':'application/json'})
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read().decode())

# Step 1: Delete previous test
td("c = op('/project1/glsl_examples/noise_deform1'); c.destroy()")

# Step 2: Create GLSL code as a Text DAT
code1 = '''
root = op('/project1/glsl_examples')
# Create text DAT with GLSL compute shader
txt = root.create(textDAT, 'glsl_noise_code')
txt.text = '''
void main(){
    float n = TDSimplexNoise(vec4(P * u_freq, u_time * u_speed));
    P += N * n * u_amp;
}
'''
print('Text DAT created:', txt.path)
'''
print(td(code1))
