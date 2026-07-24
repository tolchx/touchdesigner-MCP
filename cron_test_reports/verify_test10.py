import json

td_lines = []
# Check auto-created compute DAT
td_lines.append("for c in op('/project1/glsl_test_10').children:")
td_lines.append("    if 'compute' in str(c.name).lower() and 'lorenz' in str(c.name).lower():")
td_lines.append("        txt=str(c.text)")
td_lines.append("        print(c.name + ': len=' + str(len(txt)) + ' firstline=' + txt.split(chr(10))[0][:60])")
# List all children
td_lines.append("print('---children---')")
td_lines.append("for c in op('/project1/glsl_test_10').children:")
td_lines.append("    print(c.name)")
# Reverify
td_lines.append("print('---verify---')")
td_lines.append("import json")
td_lines.append("import urllib.request")
td_lines.append("resp=urllib.request.urlopen('http://127.0.0.1:44444/verify?path=/project1/glsl_test_10')")
td_lines.append("print(resp.read().decode())")

payload = {'code': chr(10).join(td_lines)}
with open('payload.json', 'w') as f:
    json.dump(payload, f)
print('done')
