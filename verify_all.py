import json
R = '/project1/glsl_test_1'
results = {'container': R, 'total_ops': len(op(R).children)}

# Check each GLSL POP
glsl_names = ['glsl_vortex', 'glsl_warp', 'glsl_scatter']
for name in glsl_names:
    g = op(R + '/' + name)
    info = {
        'errors': g.errors(),
        'outputattrs': g.par.outputattrs.eval(),
        'numelems': g.par.numelems.eval(),
        'computedat': g.par.computedat.eval(),
        'num_inputs': len(g.inputConnectors)
    }
    results[name] = info

# Check null
null = op(R + '/null_out')
results['null_out'] = {
    'num_inputs': len(null.inputConnectors)
}

# List all children with positions
children = []
for c in op(R).children:
    children.append({
        'name': c.name,
        'type': type(c).__name__,
        'pos': (int(c.nodeX), int(c.nodeY))
    })
results['children'] = children

print(json.dumps(results, indent=2))
