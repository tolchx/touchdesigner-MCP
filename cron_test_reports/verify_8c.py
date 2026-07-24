import json
R = '/project1/glsl_test_8'
results = {}
# Get GLSL POP errors
for c in op(R).children:
    if c.type == td.glslPOP:
        results['glsl_errors'] = str(c.errors())
        results['outputattrs'] = str(c.par.outputattrs.eval())
        results['numelems'] = c.par.numelems.eval()
        results['numinputs'] = len(c.inputConnectors)
        results['computedat'] = str(c.par.computedat.eval())
        # Check input connection
        if c.inputConnectors:
            conns = []
            for ic in c.inputConnectors:
                if ic.dst is not None:
                    conns.append(str(ic.dst))
            results['input_connections'] = conns
    # Read the auto-created info DAT
    if c.name == 'glsl_pop_info':
        results['glsl_pop_info'] = str(c.text)
    # Read our shader code
    if c.name == 'shader_code':
        results['shader_code_preview'] = str(c.text)[:100]
    # Check compute DAT content
    if c.name == 'glsl_pop_compute':
        results['compute_dat_preview'] = str(c.text)[:200]
print(json.dumps(results, indent=2))
