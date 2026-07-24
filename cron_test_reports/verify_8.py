import json
R = '/project1/glsl_test_8'
results = {}
# Find GLSL POP and info DAT
for c in op(R).children:
    if c.type == td.glslPOP:
        results['glsl_errors'] = str(c.errors())
        results['outputattrs'] = str(c.par.outputattrs.eval())
        results['numelems'] = c.par.numelems.eval()
        results['numinputs'] = len(c.inputConnectors)
    if hasattr(c, 'info') and 'info' in c.name.lower():
        results['info_text'] = str(c.text).strip()
    if c.name == 'info_glsl':
        results['custom_info'] = str(c.text).strip()
results['total_children'] = len(op(R).children)
print(json.dumps(results))
