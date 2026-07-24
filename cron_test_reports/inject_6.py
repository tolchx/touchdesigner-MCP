import json

td_lines = []
td_lines.append("import json")
td_lines.append("R='/project1/glsl_test_6'")
td_lines.append("R2='/project1/glsl_test_6/shader_code'")
td_lines.append("op(R2).text='void main(){INVALID_SYNTAX_HERE;P[TDIndex()]=vec3(1.0);}'")
td_lines.append("op(R+'/glsl_metaball').cook(force=True)")
td_lines.append("print(json.dumps({'injected':str(op(R+'/glsl_metaball_info').text[:500])}))")

payload = {'code': '\n'.join(td_lines)}

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\inject_6.json', 'w') as f:
    json.dump(payload, f)
print('Done')
