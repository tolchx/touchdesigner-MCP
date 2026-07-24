import json

td_lines = []
td_lines.append("import json")
td_lines.append("R='/project1/glsl_test_6'")
td_lines.append("results={}")
td_lines.append("for c in op(R).children:")
td_lines.append("    if c.type==td.glslPOP:")
td_lines.append("        results['glsl_name']=c.name")
td_lines.append("        results['glsl_errors']=str(c.errors())")
td_lines.append("        results['outputattrs']=c.par.outputattrs.eval()")
td_lines.append("        results['numelems']=c.par.numelems.eval()")
td_lines.append("        results['computedat']=c.par.computedat.eval()")
td_lines.append("    if c.type==td.textDAT and 'info' in c.name.lower():")
td_lines.append("        try:")
td_lines.append("            info_text=c.text")
td_lines.append("            results['info_text']=info_text[:1000] if info_text else '(empty)'")
td_lines.append("        except:")
td_lines.append("            results['info_text']='(error reading)'")
td_lines.append("    if c.type==td.gridPOP:")
td_lines.append("        results['source_type']='gridPOP'")
td_lines.append("        results['rows']=c.par.rows.eval()")
td_lines.append("        results['cols']=c.par.cols.eval()")
td_lines.append("results['children_count']=len(op(R).children)")
td_lines.append("results['children_names']=[str(c.name) for c in op(R).children]")
td_lines.append("print(json.dumps(results))")

payload = {'code': '\n'.join(td_lines)}

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\verify_6.json', 'w') as f:
    json.dump(payload, f)
print('Verify payload written')
