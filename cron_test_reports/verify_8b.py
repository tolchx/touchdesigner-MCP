import json
R = '/project1/glsl_test_8'
results = {'children': []}
for c in op(R).children:
    child = {'name': c.name, 'type': str(type(c))}
    # Check for info DATs
    if c.type == td.textDAT:
        child['text_length'] = len(c.text)
        child['text_preview'] = str(c.text)[:200]
    if c.type == td.glslPOP:
        child['errors'] = str(c.errors())
        child['outputattrs'] = str(c.par.outputattrs.eval())
        child['numelems'] = c.par.numelems.eval()
        child['numinputs'] = len(c.inputConnectors)
        for ic in c.inputConnectors:
            child['input_connections'] = str(ic)
    results['children'].append(child)
results['total'] = len(op(R).children)
print(json.dumps(results, indent=2))
