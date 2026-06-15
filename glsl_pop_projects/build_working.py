"""
GLSL POP Projects — Working Builder
Creates 5 GLSL POP projects using the correct pattern:
  1. Create glslPOP (auto-creates glsl1_compute child)
  2. Find and modify the auto-generated glsl1_compute DAT
  3. Force cook and verify

This matches how TD actually works: the compute DAT is a CHILD of the glslPOP.
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


def write_glsl_to_child(b64code, glsl_pop_path, child_name):
    """Write GLSL code to a child DAT inside a glslPOP via base64."""
    code = (
        "import base64\n"
        "glsl_code = base64.b64decode('" + b64code + "').decode('utf-8')\n"
        "t = op('" + glsl_pop_path + "/" + child_name + "')\n"
        "if t:\n"
        "    t.text = glsl_code\n"
        "    print('wrote ' + str(len(glsl_code)) + ' chars to ' + t.path)\n"
        "else:\n"
        "    print('DAT not found: " + glsl_pop_path + "/" + child_name + "')\n"
    )
    return td(code, "write_glsl")


# ─── Project Definitions ────────────────────────────────────────────────────
# All use glslPOP. Source POPs use correct param names for each type.
PROJECTS = [
    {
        'name': 'noise_deform',
        'title': 'Noise Deform',
        'src_type': 'boxPOP',
        'src_setup': "s.par.sizex = 2; s.par.sizey = 2; s.par.sizez = 2",
        'numelems': 400,
        'glsl': (
            "// Noise Deform\n"
            "void main(){\n"
            "  const uint id = TDIndex();\n"
            "  if(id >= TDNumElements()) return;\n"
            "  float n = TDSimplexNoise(vec4(TDIn_P(0,id)*0.5, u_time*0.3));\n"
            "  P[id] = TDIn_P(0,id) + TDIn_N(0,id) * n * 0.4;\n"
            "}"
        ),
    },
    {
        'name': 'color_by_pos',
        'title': 'Color by Position',
        'src_type': 'spherePOP',
        'src_setup': "s.par.radx = 2; s.par.rady = 2; s.par.radz = 2",
        'numelems': 300,
        'glsl': (
            "// Color by Position\n"
            "void main(){\n"
            "  const uint id = TDIndex();\n"
            "  if(id >= TDNumElements()) return;\n"
            "  vec3 pos = TDIn_P(0,id);\n"
            "  Cd[id] = vec4(pos.x*0.25+0.5, pos.y*0.25+0.5, pos.z*0.25+0.5, 1.0);\n"
            "}"
        ),
    },
    {
        'name': 'wave_deform',
        'title': 'Wave Deform',
        'src_type': 'gridPOP',
        'src_setup': "s.par.sizex = 4; s.par.sizey = 4; s.par.rows = 30; s.par.cols = 30",
        'numelems': 900,
        'glsl': (
            "// Wave Deform\n"
            "void main(){\n"
            "  const uint id = TDIndex();\n"
            "  if(id >= TDNumElements()) return;\n"
            "  vec3 pos = TDIn_P(0,id);\n"
            "  pos.y += sin(pos.x*2.0 + u_time*3.0) * 0.3;\n"
            "  pos.y += cos(pos.z*1.5 + u_time*2.0) * 0.2;\n"
            "  P[id] = pos;\n"
            "}"
        ),
    },
    {
        'name': 'particle_fountain',
        'title': 'Particle Fountain',
        'src_type': 'circlePOP',
        'src_setup': "s.par.radx = 0.5; s.par.rady = 0.5",
        'numelems': 500,
        'glsl': (
            "// Particle Fountain\n"
            "void main(){\n"
            "  const uint id = TDIndex();\n"
            "  if(id >= TDNumElements()) return;\n"
            "  float a = float(id)*0.1 + u_time*2.0;\n"
            "  float r = 1.5 + sin(float(id)*0.05)*0.5;\n"
            "  float h = cos(float(id)*0.03 + u_time)*2.0 + 2.0;\n"
            "  P[id] = vec3(sin(a)*r, h, cos(a)*r);\n"
            "}"
        ),
    },
    {
        'name': 'spring_forces',
        'title': 'Spring Forces',
        'src_type': 'boxPOP',
        'src_setup': "s.par.sizex = 2; s.par.sizey = 2; s.par.sizez = 2",
        'numelems': 100,
        'glsl': (
            "// Spring Forces\n"
            "void main(){\n"
            "  const uint id = TDIndex();\n"
            "  if(id >= TDNumElements()) return;\n"
            "  vec3 pos = TDIn_P(0,id);\n"
            "  vec3 vel = TDIn_V(0,id);\n"
            "  vec3 rest = vec3(pos.x, 0.0, pos.z);\n"
            "  vel *= 0.98;\n"
            "  vel += vec3(0.0,-0.005,0.0) + (rest-pos)*0.02;\n"
            "  pos += vel * 0.1;\n"
            "  P[id] = pos;\n"
            "}"
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
    print("\n--- [" + str(idx + 1) + "/5] " + proj['title'] + " ---")

    # Sub-container
    td("op('" + ROOT + "').create(baseCOMP, '" + proj['name'] + "')", "container")
    time.sleep(0.2)

    # Source POP with correct params
    src = "src_" + proj['name']
    td("s = op('" + pp + "').create(" + proj['src_type'] + ", '" + src + "'); " + proj['src_setup'], "source")
    time.sleep(0.3)

    # Create glslPOP (auto-creates glsl1_compute child)
    gname = proj['name']
    td(
        "g = op('" + pp + "').create(glslPOP, '" + gname + "'); "
        "g.par.numelems = " + str(proj['numelems']),
        "glslPOP"
    )
    time.sleep(0.5)

    # Connect source -> glslPOP
    td(
        "op('" + pp + "/" + src + "').outputConnectors[0].connect(op('" + pp + "/" + gname + "'))",
        "connect"
    )
    time.sleep(0.3)

    # Find the auto-generated compute DAT (glsl1_compute) inside the glslPOP
    # and write our GLSL code to it
    b64code = b64(proj['glsl'])
    write_glsl_to_child(b64code, pp + "/" + gname, "glsl1_compute")
    time.sleep(0.3)

    # Force cook
    td("op('" + pp + "/" + gname + "').cook(force=True)", "cook")
    time.sleep(0.5)

    # Create output null
    td(
        "n = op('" + pp + "').create(nullPOP, 'out_" + gname + "'); "
        "n.inputConnectors[0].connect(op('" + pp + "/" + gname + "'))",
        "output"
    )
    time.sleep(0.2)

    # Layout
    td(
        "src = op('" + pp + "/" + src + "'); "
        "glsl = op('" + pp + "/" + gname + "'); "
        "out = op('" + pp + "/out_" + gname + "'); "
        "if src: src.nodeX = -300; src.nodeY = 0; "
        "if glsl: glsl.nodeX = 0; glsl.nodeY = 0; "
        "if out: out.nodeX = 300; out.nodeY = 0",
        "layout"
    )

    return pp, gname


def verify_all():
    print("\n" + "=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    time.sleep(2)

    code = (
        "import json, time\n"
        "results = {}\n"
        "parent = op('" + ROOT + "')\n"
        "if parent:\n"
        "    for proj in parent.children:\n"
        "        info = {'status': 'unknown', 'errors': '', 'compute_text': ''}\n"
        "        for child in proj.children:\n"
        "            op_type = child.OPType if hasattr(child, 'OPType') else '?'\n"
        "            if 'glsl' in op_type.lower():\n"
        "                try:\n"
        "                    child.cook(force=True)\n"
        "                except:\n"
        "                    pass\n"
        "                time.sleep(0.3)\n"
        "                try:\n"
        "                    errs = str(child.errors()) if hasattr(child, 'errors') else ''\n"
        "                    if errs:\n"
        "                        info['errors'] = errs[:400]\n"
        "                        info['status'] = 'has_errors'\n"
        "                    else:\n"
        "                        info['status'] = 'clean'\n"
        "                except:\n"
        "                    pass\n"
        "                # Read compute DAT content\n"
        "                compute = op(child.path + '/glsl1_compute')\n"
        "                if compute and hasattr(compute, 'text') and compute.text:\n"
        "                    info['compute_text'] = compute.text[:100]\n"
        "        results[proj.name] = info\n"
        "print(json.dumps(results, indent=2))\n"
    )
    return td_json(code, "verify")


def main():
    print("GLSL POP Working Builder")
    print("Uses auto-generated glsl1_compute DAT inside each glslPOP")
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
            ct = info.get('compute_text', '')
            icon = 'OK' if st == 'clean' else 'ERR'
            if st != 'clean':
                all_clean = False
            print("  [" + icon + "] " + name + " — " + st)
            if ct:
                print("       compute: " + ct[:100])
            if errs:
                print("       errors: " + errs[:200])
    else:
        print("  Parse error:", str(results)[:300])

    print("\n  Overall: " + ("ALL CLEAN" if all_clean else "SOME ISSUES"))
    print("=" * 60)

    # Save GLSL files
    os.makedirs(GLSL_DIR, exist_ok=True)
    for proj in PROJECTS:
        with open(os.path.join(GLSL_DIR, proj['name'] + '.glsl'), 'w') as f:
            f.write(proj['glsl'].strip() + '\n')
    print("  Saved " + str(len(PROJECTS)) + " GLSL files to " + GLSL_DIR)

    return 0 if all_clean else 1


if __name__ == '__main__':
    sys.exit(main())
