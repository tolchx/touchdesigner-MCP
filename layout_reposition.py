R = '/project1/glsl_test_1'

# Step 1: Move existing ops to new positions
src = op(R + '/src_circle')
src.nodeX = -1000; src.nodeY = 0

vortex = op(R + '/glsl_vortex')
vortex.nodeX = -750; vortex.nodeY = 0

# Move shader_code (stage 1 code) below stage 1
code1 = op(R + '/shader_code')
code1.nodeX = -750; code1.nodeY = -150
code1.nodeWidth = 200

# Position stage 2
warp = op(R + '/glsl_warp')
warp.nodeX = -500; warp.nodeY = 0

code2 = op(R + '/warp_code')
code2.nodeX = -500; code2.nodeY = -150
code2.nodeWidth = 200

# Position stage 3
scatter = op(R + '/glsl_scatter')
scatter.nodeX = -250; scatter.nodeY = 0

code3 = op(R + '/scatter_code')
code3.nodeX = -250; code3.nodeY = -150
code3.nodeWidth = 200

# Position null out
null_pop = op(R + '/null_out')
null_pop.nodeX = -50; null_pop.nodeY = 0

# Move info DATs above
info1 = op(R + '/shader_info')
info1.nodeX = -750; info1.nodeY = 80

# Info DATs created by GLSL POPs automatically
vortex_info = op(R + '/glsl_vortex_info')
vortex_info.nodeX = -750; vortex_info.nodeY = -280

warp_info = op(R + '/glsl_warp').children  # auto-created info
for c in op(R + '/glsl_warp').children:
    if 'info' in c.name.lower():
        c.nodeX = -500; c.nodeY = -280

scatter_info = op(R + '/glsl_scatter').children
for c in op(R + '/glsl_scatter').children:
    if 'info' in c.name.lower():
        c.nodeX = -250; c.nodeY = -280

print('Layout repositioned')
print('src:', src.nodeX, src.nodeY)
print('vortex:', vortex.nodeX, vortex.nodeY)
print('warp:', warp.nodeX, warp.nodeY)
print('scatter:', scatter.nodeX, scatter.nodeY)
print('null:', null_pop.nodeX, null_pop.nodeY)
