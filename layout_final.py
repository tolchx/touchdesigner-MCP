R = '/project1/glsl_test_1'

# Clean up auto-created children positions
# glsl_warp children
for c in op(R + '/glsl_warp').children:
    if 'info' in c.name.lower():
        c.nodeX = -500; c.nodeY = 80
    elif 'compute' in c.name.lower():
        c.nodeX = -500; c.nodeY = -280

# glsl_scatter children
for c in op(R + '/glsl_scatter').children:
    if 'info' in c.name.lower():
        c.nodeX = -250; c.nodeY = 80
    elif 'compute' in c.name.lower():
        c.nodeX = -250; c.nodeY = -280

# glsl_vortex children (compute only, info already placed)
for c in op(R + '/glsl_vortex').children:
    if 'compute' in c.name.lower():
        c.nodeX = -750; c.nodeY = -280

# Rename shader_info to vortex_info for clarity
info1 = op(R + '/shader_info')
info1.name = 'vortex_info'
info1.nodeX = -750; info1.nodeY = 80

print('Children repositioned')

# Final layout summary
for c in op(R).children:
    print(f'  {c.name:25s} ({int(c.nodeX):5d}, {int(c.nodeY):4d})')
