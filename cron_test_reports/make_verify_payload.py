import json

td_lines = []
td_lines.append("R='/project1/glsl_test_9'")
td_lines.append("results={}")
td_lines.append("results['total_ops']=len(op(R).children)")
td_lines.append("for c in op(R).children:")
td_lines.append("    t=str(type(c))")
td_lines.append("    if 'glslPOP' in t:")
td_lines.append("        results['glsl_errors']=str(c.errors())")
td_lines.append("        results['outputattrs']=c.par.outputattrs.eval()")
td_lines.append("        results['numelems']=c.par.numelems.eval()")
td_lines.append("        results['num_inputs']=len(c.inputConnectors)")
td_lines.append("        try:")
td_lines.append("            results['connected_src_name']=c.inputConnectors[0].op().name")
td_lines.append("        except:")
td_lines.append("            results['connected']=str(type(c.inputConnectors[0]))")
td_lines.append("print(json.dumps(results))")
td_lines.append("for c in op(R).children:")
td_lines.append("    print(c.name, str(type(c)).split('.')[-1].strip(\">'\"))")

payload = {'code': '\n'.join(td_lines)}
with open('C:\\Users\\Tolch\\Documents\\AI_Code\\Touchdesigner_MCP\\Main\\cron_test_reports\\payload_verify_9.json', 'w') as f:
    json.dump(payload, f)
print('OK')
