import json
R = '/project1/glsl_test_8'
results = {}

# Find GLSL POP
glsl = None
for c in op(R).children:
    if 'glslPOP' in str(type(c)):
        glsl = c
        results['glsl_found'] = c.name
        results['errors_before'] = str(c.errors())
        break

if glsl is None:
    print('ERROR: GLSL POP not found')
    exit()

# Save original shader
cdat = op(R + '/shader_code')
original = str(cdat.text)  # store copy of original

# Inject deliberate syntax error
cdat.text = 'void main(){INVALID_SYNTAX_HERE;P[TDIndex()]=vec3(1.0);}'

# Force cook
glsl.cook(force=True)

# Read error info
for c in op(R).children:
    if c.name == 'glsl_pop_info':
        results['error_injection_result'] = str(c.text)
        results['error_injection_result_truncated'] = str(c.text)[:300]

# Restore original shader
cdat.text = original
glsl.cook(force=True)

# Verify restore
for c in op(R).children:
    if c.name == 'glsl_pop_info':
        results['after_restore'] = str(c.text)
    if 'glslPOP' in str(type(c)):
        results['errors_after'] = str(c.errors())

print(json.dumps(results, indent=2))
