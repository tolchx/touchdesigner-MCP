import json
import subprocess

# Read the GLSL shader
with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\glsl_test_8_shader.glsl') as f:
    shader = f.read()

# Build TD Python lines
td_lines = []
td_lines.append("P='/project1'")
td_lines.append("base_name='glsl_test_8'")
td_lines.append("R=P+'/'+base_name")
td_lines.append("")
td_lines.append("# Create container")
td_lines.append("op(P).create(baseCOMP,base_name)")
td_lines.append("op(R).allowCooking=True")
td_lines.append("")
td_lines.append("# Create gridPOP source (20x25=500 pts in XZ plane)")
td_lines.append("src=op(R).create(gridPOP,'src_grid')")
td_lines.append("src.par.sizex=2.0")
td_lines.append("src.par.sizey=2.0")
td_lines.append("src.par.rows=20")
td_lines.append("src.par.cols=25")
td_lines.append("src.par.planey=True")
td_lines.append("src.nodeX=-400;src.nodeY=0")
td_lines.append("")
td_lines.append("# Create GLSL code DAT FIRST (before GLSL POP)")
td_lines.append("cdat=op(R).create(textDAT,'shader_code')")
td_lines.append("cdat.text=" + repr(shader))
td_lines.append("cdat.nodeX=200;cdat.nodeY=-120")
td_lines.append("")
td_lines.append("# Create GLSL POP with computedat set IMMEDIATELY")
td_lines.append("g=op(R).create(glslPOP,'glsl_pop')")
td_lines.append("g.par.computedat=R+'/shader_code'")
td_lines.append("g.par.outputattrs='P'")
td_lines.append("g.par.numelems=500")
td_lines.append("g.nodeX=0;g.nodeY=0")
td_lines.append("")
td_lines.append("# Create info DAT")
td_lines.append("info=op(R).create(textDAT,'info_glsl')")
td_lines.append("info.nodeX=200;info.nodeY=80")
td_lines.append("")
td_lines.append("# Connect source -> GLSL POP")
td_lines.append("src.outputConnectors[0].connect(g)")
td_lines.append("")
td_lines.append("# Cook to trigger compilation")
td_lines.append("g.cook(force=True)")
td_lines.append("")
td_lines.append("print('OK')")

td_code = "\n".join(td_lines)

# Build payload
payload = {'code': td_code}
with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\payload.json', 'w') as f:
    json.dump(payload, f)

print("Payload written successfully")
print(f"GLSL shader size: {len(shader)} chars")
print(f"TD Python code size: {len(td_code)} chars")
