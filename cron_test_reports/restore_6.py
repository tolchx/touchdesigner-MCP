import json
import os

# Read the original shader and build a restore payload
with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\shader_test_6.glsl') as f:
    shader = f.read()

td_lines = []
td_lines.append("import json")
td_lines.append("R='/project1/glsl_test_6'")
td_lines.append("cdat=op(R+'/shader_code')")
td_lines.append("cdat.text=" + repr(shader))
td_lines.append("op(R+'/glsl_metaball').cook(force=True)")
td_lines.append("print(json.dumps({'restored':True,'errors':str(op(R+'/glsl_metaball').errors())}))")

payload = {'code': '\n'.join(td_lines)}

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\restore_6.json', 'w') as f:
    json.dump(payload, f)
print('Done')
