import json

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\shader_test_6.glsl') as f:
    shader = f.read()

P = '/project1'
base_name = 'glsl_test_6'
R = P + '/' + base_name

td_lines = []
td_lines.append("P='" + P + "'")
td_lines.append("base_name='" + base_name + "'")
td_lines.append("R=P+'/'+base_name")
td_lines.append("op(P).create(baseCOMP,base_name)")
td_lines.append("op(R).allowCooking=True")

# Use gridPOP for dense point cloud (20x25 = 500 points)
td_lines.append("src=op(R).create(gridPOP,'src_grid')")
td_lines.append("src.par.sizex=2.0;src.par.sizey=2.0")
td_lines.append("src.par.rows=20;src.par.cols=25")
td_lines.append("src.par.planey=True")
td_lines.append("src.nodeX=-400;src.nodeY=0")

# Shader code DAT
td_lines.append('cdat=op(R).create(textDAT,"shader_code")')
td_lines.append('cdat.text=' + repr(shader))
td_lines.append("cdat.nodeX=200;cdat.nodeY=-120")

# GLSL POP - SET computedat BEFORE first cook  
td_lines.append("g=op(R).create(glslPOP,'glsl_metaball')")
td_lines.append("g.par.computedat=R+'/shader_code'")
td_lines.append("g.par.outputattrs='P'")
td_lines.append("g.par.numelems=500")
td_lines.append("g.nodeX=0;g.nodeY=0")

# Info DAT
td_lines.append("info=op(R).create(textDAT,'info_glsl')")
td_lines.append("info.nodeX=200;info.nodeY=80")

# Connect
td_lines.append("src.outputConnectors[0].connect(g)")
td_lines.append("print('OK')")

payload = {'code': '\n'.join(td_lines)}

with open(r'C:\Users\Tolch\Documents\AI_Code\Touchdesigner_MCP\Main\cron_test_reports\payload_6.json', 'w') as f:
    json.dump(payload, f)
print('Payload written')
