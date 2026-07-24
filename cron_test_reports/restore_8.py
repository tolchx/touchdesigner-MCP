import json
R = '/project1/glsl_test_8'
results = {}

# Restore correct shader and re-cook
cdat = op(R + '/shader_code')
cdat.text = 'uniform float u_time;\nfloat chladniMode(vec2 pos, float L, float n, float m) {\n    float PI = 3.14159265;\n    return cos(n*PI*pos.x/L)*cos(m*PI*pos.y/L) - cos(m*PI*pos.x/L)*cos(n*PI*pos.y/L);\n}\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 p = TDIn_P(0, id);\n    vec2 pos = p.xz;\n    float L = 2.0;\n    float t = u_time;\n    float n1 = 2.0 + 0.3*sin(t*0.12);\n    float m1 = 3.0 + 0.3*cos(t*0.09);\n    float w1 = 0.6+0.4*sin(t*0.07);\n    float c1 = chladniMode(pos, L, n1, m1);\n    float combined = w1 * c1;\n    P[id] = p + vec3(0.0, combined * 0.3, 0.0);\n}'

# Find GLSL POP
for c in op(R).children:
    if 'glslPOP' in str(type(c)):
        c.cook(force=True)
        results['cooked'] = c.name
        break

# Read info after restore
for c in op(R).children:
    if c.name == 'glsl_pop_info':
        results['info_after_restore'] = str(c.text)

# Check GLSL errors
for c in op(R).children:
    if 'glslPOP' in str(type(c)):
        results['errors_final'] = str(c.errors())

# Also check connection
for c in op(R).children:
    if 'glslPOP' in str(type(c)):
        results['num_inputs'] = len(c.inputConnectors)
        results['numelems'] = c.par.numelems.eval()

print(json.dumps(results, indent=2))
