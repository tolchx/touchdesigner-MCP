import json

with open('C:\\Users\\Tolch\\Documents\\AI_Code\\Touchdesigner_MCP\\Main\\cron_test_reports\\shader_9.glsl') as f:
    shader = f.read()

td_lines = []
td_lines.append("R='/project1/glsl_test_9'")
td_lines.append("cdat=op(R+'/shader_code')")
td_lines.append('cdat.text=' + repr(shader))
td_lines.append("op(R+'/glsl_pop').cook(force=True)")
td_lines.append("import time; time.sleep(0.2)")
td_lines.append("for c in op(R).children:")
td_lines.append("    if 'info' in c.name.lower():")
td_lines.append("        print(str(c.text))")

payload = {'code': '\n'.join(td_lines)}
with open('C:\\Users\\Tolch\\Documents\\AI_Code\\Touchdesigner_MCP\\Main\\cron_test_reports\\payload_restore_9.json', 'w') as f:
    json.dump(payload, f)
print('OK')
