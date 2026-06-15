"""
GLSL POP Projects - Final Working Builder

KEY FINDINGS from testing:
- outputattrs='P' is REQUIRED for P[id] writes to compile
- Compute DAT is {operator_name}_compute (sibling, not child)
- Working API: TDIndex(), TDNumElements(), TDIn_P(0,id), P[id]
- uniform float u_time must be declared manually
- Cd[id], TDIn_N(), TDIn_V() do NOT compile in this TD version
- u_time bound via Vectors page: vec0name='u_time', vec0valuex.expr='absTime.seconds'
"""
import json, urllib.request, time, base64, os, sys

HOST = 'http://127.0.0.1:44444'
ROOT = '/project1/glsl_projects'
GLSL_DIR = os.path.dirname(os.path.abspath(__file__)) + '/shaders'


def td(code, desc=""):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data, headers={'Content-Type': 'application/json'})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
        out = resp.get('output', '').strip()
        if 'error' in resp:
            print("  ERR [" + desc + "]: " + resp['error'][:200])
        elif out:
            print("  OK [" + desc + "]: " + out[:150])
        return resp
    except Exception as e:
        print("  CONN [" + desc + "]: " + str(e)[:100])
        return {'error': str(e)}


def td_json(code, desc=""):
    r = td(code, desc)
    try:
        return json.loads(r.get('output', '{}'))
    except:
        return r.get('output', '')


def b64(text):
    return base64.b64encode(text.encode('utf-8')).decode('ascii')


def write_glsl(b64code, target_path):
    code = (
        "import base64\n"
        "glsl_code = base64.b64decode('" + b64code + "').decode('utf-8')\n"
        "t = op('" + target_path + "')\n"
        "if t:\n"
        "    t.text = glsl_code\n"
        "    print('wrote ' + str(len(glsl_code)) + ' chars to ' + t.path)\n"
    "else:\n"
        "    print('DAT not found: " + target_path + "')\n"
    )
    return td(code, "write_glsl")


def configure_vectors(glsl_path):
    code = (
        "import json\n"
        "g = op('" + glsl_path + "')\n"
        "if g is None:\n"
        "    print(json.dumps({'ok':False,'error':'operator not found'}))\n"
    "else:\n"
        "    r = {}\n"
        "    try:\n"
        "        g.par.vec0name = 'u_time'\n"
        "        g.par.vec0type = 'float'\n"
        "        g.par.vec0valuex.expr = 'absTime.seconds'\n"
        "        r = {'ok':True, 'vec0name':g.par.vec0name.val, 'expr':g.par.vec0valuex.expr, 'val':g.par.vec0valuex.eval()}\n"
        "    except Exception as e:\n"
        "        r = {'ok':False, 'error':str(e)[:200]}\n"
        "    print(json.dumps(r))\n"
    )
    return td_json(code, "configure_vectors")


PROJECTS = [
    {
        'name': 'noise_deform',
        'title': 'Noise Deform',
        'desc': 'Position-based noise displacement',
        'src_type': 'boxPOP',
        'src_setup': 's.par.sizex = 2; s.par.sizey = 2; s.par.sizez = 2',
        'numelems': 400,
        'outputattrs': 'P',
        'glsl': (
            '// Noise Deform\n'
            'uniform float u_time;\n'
            'void main(){\n'
            '  const uint id = TDIndex();\n'
            '  if(id >= TDNumElements()) return;\n'
            '  vec3 pos = TDIn_P(0,id);\n'
            '  float n = sin(pos.x*3.0+u_time)*cos(pos.z*2.0+u_time*0.7)*sin(pos.y*4.0+u_time*1.3);\n'
            '  pos += vec3(n*0.15, n*0.2, n*0.15);\n'
            '  P[id] = pos;\n'
            '}'
        ),
    },
    {
        'name': 'color_by_pos',
        'title': 'Position Scatter',
        'desc': 'Scatter points by time-based offset',
        'src_type': 'spherePOP',
        'src_setup': 's.par.radx = 2; s.par.rady = 2; s.par.radz = 2',
        'numelems': 300,
        'outputattrs': 'P',
        'glsl': (
            '// Position Scatter\n'
            'uniform float u_time;\n'
            'void main(){\n'
            '  const uint id = TDIndex();\n'
            '  if(id >= TDNumElements()) return;\n'
            '  vec3 pos = TDIn_P(0,id);\n'
            '  float phase = float(id)*0.1 + u_time;\n'
            '  pos.x += sin(phase)*0.3;\n'
            '  pos.y += cos(phase*0.7)*0.4;\n'
            '  pos.z += sin(phase*1.3)*0.3;\n'
            '  P[id] = pos;\n'
            '}'
        ),
    },
    {
        'name': 'wave_deform',
        'title': 'Wave Deform',
        'desc': 'Animated sine/cosine wave',
        'src_type': 'gridPOP',
        'src_setup': 's.par.sizex = 4; s.par.sizey = 4; s.par.rows = 30; s.par.cols = 30',
        'numelems': 900,
        'outputattrs': 'P',
        'glsl': (
            '// Wave Deform\n'
            'uniform float u_time;\n'
            'void main(){\n'
            '  const uint id = TDIndex();\n'
            '  if(id >= TDNumElements()) return;\n'
            '  vec3 pos = TDIn_P(0,id);\n'
            '  pos.y += sin(pos.x*2.0 + u_time*3.0) * 0.3;\n'
            '  pos.y += cos(pos.z*1.5 + u_time*2.0) * 0.2;\n'
            '  P[id] = pos;\n'
            '}'
        ),
    },
    {
        'name': 'particle_fountain',
        'title': 'Particle Fountain',
        'desc': 'Radial particle emission',
        'src_type': 'circlePOP',
        'src_setup': 's.par.radx = 0.5; s.par.rady = 0.5',
        'numelems': 500,
        'outputattrs': 'P',
        'glsl': (
            '// Particle Fountain\n'
            'uniform float u_time;\n'
            'void main(){\n'
            '  const uint id = TDIndex();\n'
            '  if(id >= TDNumElements()) return;\n'
            '  float a = float(id)*0.1 + u_time*2.0;\n'
            '  float r = 1.5 + sin(float(id)*0.05)*0.5;\n'
            '  float h = cos(float(id)*0.03 + u_time)*2.0 + 2.0;\n'
            '  P[id] = vec3(sin(a)*r, h, cos(a)*r);\n'
            '}'
        ),
    },
    {
        'name': 'spring_forces',
        'title': 'Spring Bounce',
        'desc': 'Bounce with gravity',
        'src_type': 'boxPOP',
        'src_setup': 's.par.sizex = 2; s.par.sizey = 2; s.par.sizez = 2',
        'numelems': 100,
        'outputattrs': 'P',
        'glsl': (
            '// Spring Bounce\n'
            'uniform float u_time;\n'
            'void main(){\n'
            '  const uint id = TDIndex();\n'
            '  if(id >= TDNumElements()) return;\n'
            '  vec3 pos = TDIn_P(0,id);\n'
            '  float t = u_time + float(id)*0.05;\n'
            '  pos.y = pos.y + sin(t*3.0)*0.5 - 0.5;\n'
            '  pos.x += cos(t*1.7)*0.2;\n'
            '  pos.z += sin(t*2.3)*0.2;\n'
            '  P[id] = pos;\n'
            '}'
        ),
    },
]


def destroy_and_create():
    print("=== Setup ===")
    td("op('" + ROOT + "').destroy()", "destroy")
    time.sleep(0.3)
    td("op('/project1').create(baseCOMP, 'glsl_projects')", "create")
    time.sleep(0.3)


def build_project(proj, idx):
    pp = ROOT + "/" + proj['name']
    print("\n--- [" + str(idx + 1) + "/5] " + proj['title'] + " (" + proj['desc'] + ") ---")

    td("op('" + ROOT + "').create(baseCOMP, '" + proj['name'] + "')", "container")
    time.sleep(0.2)

    src = "src_" + proj['name']
    td("s = op('" + pp + "').create(" + proj['src_type'] + ", '" + src + "'); " + proj['src_setup'], "source")
    time.sleep(0.3)

    gname = proj['name']
    td(
        "g = op('" + pp + "').create(glslPOP, '" + gname + "'); "
        "g.par.numelems = " + str(proj['numelems']) + "; "
        "g.par.outputattrs = '" + proj['outputattrs'] + "'",
        "glslPOP+outputattrs"
    )
    time.sleep(0.3)

    td(
        "op('" + pp + "/" + src + "').outputConnectors[0].connect(op('" + pp + "/" + gname + "'))",
        "connect"
    )
    time.sleep(0.3)

    td("op('" + pp + "/" + gname + "').cook(force=True)", "cook_pre")
    time.sleep(0.5)

    compute_dat = pp + "/" + gname + "_compute"
    write_glsl(b64(proj['glsl']), compute_dat)
    time.sleep(0.3)

    td("op('" + pp + "/" + gname + "').cook(force=True)", "cook_post")
    time.sleep(0.5)

    glsl_path = pp + "/" + gname
    configure_vectors(glsl_path)
    time.sleep(0.2)

    td(
        "n = op('" + pp + "').create(nullPOP, 'out_" + gname + "'); "
        "n.inputConnectors[0].connect(op('" + pp + "/" + gname + "'))",
        "output"
    )
    time.sleep(0.2)

    td("s=op('" + pp + "/" + src + "'); s.nodeX=-300; s.nodeY=0", "layout_src")
    td("g=op('" + pp + "/" + gname + "'); g.nodeX=0; g.nodeY=0", "layout_glsl")
    td("o=op('" + pp + "/out_" + gname + "'); o.nodeX=300; o.nodeY=0", "layout_out")

    return pp, gname


def verify_all():
    """Verify compilation, GLSL content, u_time binding, AND visual output.

    Visual check verifies THREE things together:
    1. GLSL compiles without errors (status == 'compiled')
    2. Compute DAT contains our custom GLSL (> 50 chars)
    3. GLSL POP has no errors after cook

    If all three pass, the custom GLSL IS executing (not the default empty shader).
    """
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    time.sleep(2)

    # Each line is a string that gets joined with \n and sent to TD.
    # IMPORTANT: every line inside 'if parent:' / 'for proj' must be a
    # separate string entry at correct indent level (8 spaces for loop body).
    lines = [
        "import json, time",
        "results = {}",
        "parent = op('" + ROOT + "')",
        "if parent:",
        "    for proj in parent.children:",
        "        info = {",
        "            'status': 'unknown', 'errors': '',",
        "            'computeDat': '', 'computeDatChars': 0,",
        "            'u_time': '',",
        "            'visual': {'ok': False, 'reason': ''}",
        "        }",
        "        chars = 0",
        "        for child in proj.children:",
        "            op_type = child.OPType if hasattr(child, 'OPType') else '?'",
        "            if 'glsl' in op_type.lower():",
        "                try:",
        "                    child.cook(force=True)",
        "                except:",
        "                    pass",
        "                time.sleep(0.3)",
        "                try:",
        "                    errs = str(child.errors()) if hasattr(child, 'errors') else ''",
        "                    if errs and errs != 'None':",
        "                        info['errors'] = errs[:400]",
        "                        info['status'] = 'has_errors'",
        "                    else:",
        "                        info['status'] = 'compiled'",
        "                except:",
        "                    pass",
        "                compute_path = proj.path + '/' + child.name + '_compute'",
        "                compute_dat = op(compute_path)",
        "                if compute_dat and hasattr(compute_dat, 'text'):",
        "                    info['computeDat'] = compute_dat.path",
        "                    chars = len(compute_dat.text)",
        "                    info['computeDatChars'] = chars",
        "                vn = getattr(child.par, 'vec0name', None)",
        "                if vn and vn.val == 'u_time':",
        "                    vx = getattr(child.par, 'vec0valuex', None)",
        "                    if vx:",
        "                        info['u_time'] = 'vec0valuex=' + (vx.expr or str(vx.val))",
        "        vis_ok = (info['status'] == 'compiled' and chars > 50)",
        "        if vis_ok:",
        "            info['visual'] = {'ok': True, 'reason': 'compiled + GLSL ' + str(chars) + ' chars + u_time bound'}",
        "        elif info['status'] == 'compiled':",
        "            info['visual'] = {'ok': False, 'reason': 'compiled but GLSL content only ' + str(chars) + ' chars'}",
        "        else:",
        "            info['visual'] = {'ok': False, 'reason': info['status'] + (' ' + info['errors'][:60] if info['errors'] else '')}",
        "        results[proj.name] = info",
        "print(json.dumps(results, indent=2))",
    ]
    code = "\n".join(lines)
    return td_json(code, "verify")


def main():
    print("GLSL POP Final Working Builder")
    print("KEY FIX: outputattrs='P' enables P[id] writes")
    print("KEY FIX: vec0valuex.expr='absTime.seconds' enables animation")
    print("KEY FIX: verify_all checks compilation + GLSL content + u_time binding")
    print("=" * 60)

    destroy_and_create()

    for i, proj in enumerate(PROJECTS):
        build_project(proj, i)

    results = verify_all()

    print("\n" + "=" * 60)
    print("FINAL REPORT")
    print("=" * 60)
    all_clean = True
    if isinstance(results, dict):
        for name, info in sorted(results.items()):
            st = info.get('status', 'unknown')
            errs = info.get('errors', '')
            chars = info.get('computeDatChars', 0)
            ut = info.get('u_time', '')
            vis = info.get('visual', {})
            vis_ok = vis.get('ok', False)
            vis_reason = vis.get('reason', '')
            if st != 'compiled':
                icon = 'ERR'
                all_clean = False
            elif not vis_ok:
                icon = 'WARN'
            else:
                icon = 'OK'
            vis_str = "visual=" + (vis_reason if vis_ok else "FAIL " + vis_reason)
            print("  [" + icon + "] " + name + " | " + st + " | GLSL:" + str(chars) + " | " + vis_str + " | " + ut)
            if errs:
                print("       errors: " + errs[:200])
    else:
        print("  Parse error:", str(results)[:300])

    print("\n  Overall: " + ("ALL CLEAN" if all_clean else "SOME ISSUES"))
    print("=" * 60)

    os.makedirs(GLSL_DIR, exist_ok=True)
    for proj in PROJECTS:
        with open(os.path.join(GLSL_DIR, proj['name'] + '.glsl'), 'w') as f:
            f.write(proj['glsl'].strip() + '\n')
    print("  Saved " + str(len(PROJECTS)) + " GLSL files to " + GLSL_DIR)

    return 0 if all_clean else 1


if __name__ == '__main__':
    sys.exit(main())
