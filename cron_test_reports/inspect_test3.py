import json
R = '/project1/glsl_test_3'
results = []
for c in op(R).children:
    info = {'name': c.name, 'type': str(c.type), 'x': c.nodeX, 'y': c.nodeY}
    if c.type == td.glslPOP:
        info['errors'] = str(c.errors())
        info['outputattrs'] = c.par.outputattrs.eval()
        info['numelems'] = c.par.numelems.eval()
        info['outputs'] = len(c.outputConnectors)
        # check connections
        conns = []
        for i in range(len(c.inputConnectors)):
            src = c.inputConnectors[i].source
            if src:
                conns.append('input['+str(i)+']='+src.owner.path)
        info['inputs'] = conns
    results.append(info)
print(json.dumps({'ops': results, 'count': len(results)}))
