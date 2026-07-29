"""Reorganize /POP_Systems into a clean grid layout.

GLSL tests on left side (3x3 grid), POP systems (S01-S04) on right side.
"""
import json

ps = op('/POP_Systems')
if ps is None:
    print(json.dumps({'error': 'POP_Systems not found'}))
    raise SystemExit(0)

# Layout plan: 4 columns x 4 rows
# GLSL systems (9): rows 0-2, cols 0-3
# POP systems (4): row 3, cols 0-3

layout = {
    # GLSL Tests (row 0)
    'GLSL_Test':         (0,   0),
    'GLSL01_WaveDisplace': (350, 0),
    'GLSL02_ColorVel':   (700, 0),
    'GLSL03_NeighborRepel': (1050, 0),
    # GLSL Tests (row 1)
    'GLSL04_SphericalBulge': (0, 350),
    'GLSL05_VortexTornado': (350, 350),
    'GLSL06_TerrainLayered': (700, 350),
    'GLSL07_RingRipple': (1050, 350),
    # GLSL Tests (row 2)
    'GLSL08_HelixTwist': (0, 700),
    # POP Systems (row 2-3)
    'S01_AudioReactive_Trails': (700, 700),
    'S02_Boids_Flocking': (1050, 700),
    'S03_GPU_Fluid_Curl': (0, 1050),
    'S04_Instanced_Audio': (350, 1050),
}

results = []
for name, (x, y) in layout.items():
    tgt = ps.ops(name)
    if tgt and len(tgt) > 0:
        # ops returns a list, get first match
        node = tgt[0] if isinstance(tgt, (list, tuple)) else tgt
        node.nodeX = x
        node.nodeY = y
        results.append({'name': name, 'x': x, 'y': y, 'status': 'repositioned'})
    else:
        results.append({'name': name, 'status': 'NOT_FOUND'})

print(json.dumps({'repositioned': len([r for r in results if r['status']=='repositioned']), 'results': results}))
