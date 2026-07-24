R = '/project1/glsl_test_1'

# Get operators
src = op(R + '/src_circle')
vortex = op(R + '/glsl_vortex')
warp = op(R + '/glsl_warp')
scatter = op(R + '/glsl_scatter')
null_pop = op(R + '/null_out')

# Disconnect old connections first
# GLSL POP input connectors: clear them all
for c in list(vortex.inputConnectors):
    c.disconnect()

for c in list(warp.inputConnectors):
    c.disconnect()

for c in list(scatter.inputConnectors):
    c.disconnect()

for c in list(null_pop.inputConnectors):
    c.disconnect()

print('All old connections cleared')

# Connect in series
src.outputConnectors[0].connect(vortex)
print('src -> vortex connected')

vortex.outputConnectors[0].connect(warp)
print('vortex -> warp connected')

warp.outputConnectors[0].connect(scatter)
print('warp -> scatter connected')

scatter.outputConnectors[0].connect(null_pop)
print('scatter -> null connected')

print('All connections made')
