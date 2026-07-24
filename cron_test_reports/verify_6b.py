import json

td_lines = []
td_lines.append("import json")
td_lines.append("R='/project1/glsl_test_6'")
td_lines.append("results={}")
td_lines.append("for c in op(R).children:")
td_lines.append("    results[c.name+'_type']=str(type(c))")
td_lines.append("    if 'glsl' in c.name.lower() and 'info' not in c.name.lower() and 'compute' not in c.name.lower():")
td_lines.append("        results['glsl_errors']=str(c.errors())")
td_lines.append("        results['outputattrs']=str(c.par.outputattrs.eval())")
td_lines.append("        results['numelems']=str(c.par.numelems.eval())")
td_lines.append("        results['computedat']=str(c.par.computedat.eval())")
td_lines.append("    if 'info' in c.name.lower():")
td_lines.append("        try:")
td_lines.append("            t=c.text")
td_lines.append("            results['info_dat_text']=str(t[:800]) if t else '(empty)'")
td_lines.append("        except Exception as e:")
td_lines.append("            results['info_dat_text']='err:'+str(e)")
td_lines.append("    if 'grid' in c.name.lower() or 'src' in c.name.lower():")
td_lines.append("        results['source_type']=str(type(c))")
td_lines.append("        results['source_pars']='rows='+str(c.par.rows.eval())+' cols='+str(c.par.cols.eval())")
td_lines.append("results['children_names']=[str(c.name) for c in op(R).children]")
td_lines.append("print(json.dumps(results))")

payload = {'code': '\n'.join(td_lines)}

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\verify_6b.json', 'w') as f:
    json.dump(payload, f)
print('Done')
