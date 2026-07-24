import json
R = '/project1/glsl_test_1'
results = {'container': R, 'total_ops': len(op(R).children)}

glsl_names = ['glsl_vortex', 'glsl_warp', 'glsl_scatter']
for name in glsl_names:
    g = op(R + '/' + name)
    try:
        errs = g.errors()
    except:
        errs = '?'
    try:
        oa = str(g.par.outputattrs.eval())
    except:
        oa = '?'
    try:
        ne = str(g.par.numelems.eval())
    except:
        ne = '?'
    try:
        cd = str(g.par.computedat.eval())
    except:
        cd = '?'
    info = {
        'errors': errs,
        'outputattrs': oa,
        'numelems': ne,
        'computedat': cd,
        'num_inputs': len(g.inputConnectors)
    }
    results[name] = info

null = op(R + '/null_out')
results['null_out_inputs'] = len(null.inputConnectors)

children = []
for c in op(R).children:
    children.append({
        'name': c.name,
        'type': type(c).__name__,
        'pos': (int(c.nodeX), int(c.nodeY))
    })
results['children'] = children

print('=== VERIFIED ===')
print('Total ops:', results['total_ops'])
for name in glsl_names:
    r = results[name]
    print(f'{name}: errors="{r["errors"]}" attrs={r["outputattrs"]} inputs={r["num_inputs"]}')
print('null_out inputs:', results['null_out_inputs'])
print('Layout:')
for c in children:
    print(f'  {c["name"]:25s} {c["type"]:15s} ({c["pos"][0]:5d}, {c["pos"][1]:3d})')
