"""Reorganize /project1 into logical baseCOMP groups."""
import json

p1 = op('/project1')
results = {'engine': [], 'dev': [], 'clocks': 0}

def move_into(parent_comp, node_name, nx=0, ny=0):
    """Copy a node from /project1/ into parent_comp and destroy original."""
    tgt = op('/project1/' + node_name)
    if tgt is None:
        return False
    cp = parent_comp.copy(tgt)
    cp.nodeX = nx
    cp.nodeY = ny
    tgt.destroy()
    return True

# === Create baseCOMP containers ===
engine = p1.create(td.baseCOMP, '_neon_engine')
engine.nodeX = 600
engine.nodeY = -300

dev = p1.create(td.baseCOMP, '_dev')
dev.nodeX = 600
dev.nodeY = 400

# === Move neon infrastructure into _neon_engine ===
neon_nodes = [
    'neon_server', 'neon_server_callbacks',
    'websocket1', 'websocket1_callbacks',
    'neon_values',
    '_neon_code', '_neon_code1', '_neon_code2', '_neon_code3', '_neon_code4',
    'neon_readme', 'neon_readme1',
]
for i, name in enumerate(neon_nodes):
    if move_into(engine, name, 0, -i * 60):
        results['engine'].append(name)

# Move _neon_clock* into _neon_engine
ci = 0
for i in range(13):
    cname = '_neon_clock' + str(i) if i > 0 else '_neon_clock'
    if move_into(engine, cname, (ci % 6) * 130, 300 + (ci // 6) * 50):
        ci += 1
results['clocks'] = ci

# Move neon_channels1-17 + callbacks 
nc = 0
for i in range(1, 18):
    for sfx in ['', '_callbacks']:
        cname = 'neon_channels' + str(i) + sfx
        if move_into(engine, cname, (nc % 6) * 130, 400 + (nc // 6) * 50):
            nc += 1

# === Move dev/debug nodes into _dev ===
dev_nodes = [
    '_d3', '_sc1', 'text1',
    '_ps_test', '_ps_test_callbacks', '_test_ren',
    'neon_out1', 'neon_out2', 'neon_out3',
]
for i, name in enumerate(dev_nodes):
    if move_into(dev, name, 0, -i * 60):
        results['dev'].append(name)

print(json.dumps(results))
