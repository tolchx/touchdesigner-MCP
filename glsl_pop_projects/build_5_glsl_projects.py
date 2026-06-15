"""
GLSL POP Projects Builder — Auto-Error-Verification System
Creates 5 complete GLSL POP projects with automatic error detection and fixing.
Usage: python build_5_glsl_projects.py
"""

import json
import urllib.request
import time
import os
import sys

HOST = 'http://127.0.0.1:44444'
PROJECT_ROOT = '/project1/glsl_projects'
GLSL_DIR = os.path.dirname(os.path.abspath(__file__)) + '/shaders'
MAX_FIX_ATTEMPTS = 3
VERIFY_DELAY = 0.5


def td_exec(code, description=""):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data, headers={'Content-Type': 'application/json'})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
        if 'error' in resp:
            print("  ERR [" + description + "]: " + resp['error'][:150])
            return {'error': resp['error']}
        else:
            output = resp.get('output', '').strip()
            if output:
                print("  OK [" + description + "]: " + output[:120])
            return resp
    except Exception as e:
        print("  CONN_ERR [" + description + "]: " + str(e)[:100])
        return {'error': str(e)}


def td_exec_json(code, description=""):
    result = td_exec(code, description)
    if 'error' in result:
        return None
    try:
        return json.loads(result.get('output', '{}'))
    except:
        return result.get('output', '')


# ─── Error Verification via DAT Info ───────────────────────────────────────

def check_dat_info_errors(parent_path, op_name):
    """Check glsl1_info DAT for GLSL compilation errors."""
    code = """
import json, time
result = {'path': '', 'has_error': False, 'error_text': '', 'status': 'unknown'}
try:
    parent = op('""" + parent_path + """')
    if parent is None:
        result['error_text'] = 'Parent not found'
        print(json.dumps(result))
    else:
        glsl_op = None
        for child in parent.children:
            if child.name == '""" + op_name + """':
                glsl_op = child
                break
        if glsl_op is None:
            for child in parent.children:
                if '""" + op_name + """' in child.name and 'glsl' in child.name.lower():
                    glsl_op = child
                    break
        if glsl_op is None:
            result['error_text'] = 'GLSL POP """ + op_name + """ not found'
            print(json.dumps(result))
        else:
            result['path'] = glsl_op.path
            try:
                glsl_op.cook(force=True)
            except:
                pass
            time.sleep(0.3)
            info_path = glsl_op.path + '/glsl1_info'
            info_dat = op(info_path)
            if info_dat is None:
                for suffix in ['info', 'glsl_info', 'compile_info']:
                    info_dat = op(glsl_op.path + '/' + suffix)
                    if info_dat is not None:
                        break
            if info_dat is not None:
                try:
                    info_text = info_dat.text if hasattr(info_dat, 'text') else str(info_dat)
                    result['error_text'] = info_text[:500]
                    if 'Compiled Successfully' in info_text:
                        result['status'] = 'compiled'
                        result['has_error'] = False
                    elif 'Error' in info_text or 'error' in info_text.lower():
                        result['status'] = 'error'
                        result['has_error'] = True
                    else:
                        result['status'] = 'unknown'
                        result['has_error'] = False
                except Exception as e:
                    result['error_text'] = 'Read error: ' + str(e)
            else:
                try:
                    errors = glsl_op.errors() if hasattr(glsl_op, 'errors') else ''
                    if errors:
                        result['has_error'] = True
                        result['error_text'] = str(errors)[:500]
                        result['status'] = 'error'
                    else:
                        result['status'] = 'no_info_dat'
                except:
                    result['status'] = 'check_failed'
            try:
                all_errors = str(glsl_op.errors()) if hasattr(glsl_op, 'errors') else ''
                if 'No input' in all_errors or 'input' in all_errors.lower():
                    result['has_error'] = True
                    result['error_text'] += ' | INPUT_ERROR: ' + all_errors[:200]
                    result['status'] = 'input_error'
            except:
                pass
except Exception as e:
    result['error_text'] = 'Exception: ' + str(e)
    result['has_error'] = True
print(json.dumps(result))
"""
    return td_exec_json(code, "check_dat_info:" + op_name)


def check_all_errors(parent_path):
    """Check all operators in a container for errors."""
    code = """
import json
results = []
try:
    parent = op('""" + parent_path + """')
    if parent is None:
        print(json.dumps({'error': 'Parent not found'}))
    else:
        for child in parent.findChildren():
            try:
                errs = child.errors() if hasattr(child, 'errors') else ''
                warns = child.warnings() if hasattr(child, 'warnings') else ''
                if errs or warns:
                    results.append({
                        'path': child.path,
                        'name': child.name,
                        'opType': child.OPType if hasattr(child, 'OPType') else 'unknown',
                        'errors': str(errs)[:300],
                        'warnings': str(warns)[:300],
                        'hasIssues': bool(errs or warns)
                    })
            except:
                pass
        print(json.dumps({'operators': results, 'count': len(results)}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"""
    return td_exec_json(code, "check_all_errors")


# ─── Auto-Fix Engine ────────────────────────────────────────────────────────

def auto_fix_glsl_errors(parent_path, glsl_name, error_info):
    """Auto-fix common GLSL compilation errors."""
    fixes_applied = []
    error_text = error_info.get('error_text', '') if error_info else ''
    status = error_info.get('status', '') if error_info else ''

    # Fix 1: No input POP -> Connect a source POP
    if 'No input' in error_text or 'input_error' in status:
        code = """
import json
try:
    parent = op('""" + parent_path + """')
    glsl_name = '""" + glsl_name + """'
    glsl_op = None
    for child in parent.children:
        if glsl_name in child.name and 'glsl' in child.name.lower():
            glsl_op = child
            break
    if glsl_op is None:
        for child in parent.children:
            if child.name == glsl_name:
                glsl_op = child
                break
    if glsl_op is not None:
        has_input = False
        try:
            for conn in glsl_op.inputConnectors:
                if conn.connections:
                    has_input = True
                    break
        except:
            pass
        if not has_input:
            src_name = 'src_' + glsl_name
            src_op = None
            for child in parent.children:
                if child.name == src_name:
                    src_op = child
                    break
            if src_op is None:
                src_op = parent.create(boxPOP, src_name)
                src_op.nodeX = glsl_op.nodeX - 300
                src_op.nodeY = glsl_op.nodeY
            src_op.outputConnectors[0].connect(glsl_op)
            print(json.dumps({'fixed': 'connected_source', 'source': src_op.path}))
        else:
            print(json.dumps({'fixed': 'already_connected'}))
    else:
        print(json.dumps({'error': 'GLSL POP not found'}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"""
        result = td_exec_json(code, "fix_input:" + glsl_name)
        if result and result.get('fixed'):
            fixes_applied.append("Connected source POP to " + glsl_name)

    # Fix 2: GLSL compilation error -> Rewrite safe GLSL code
    if 'Compile' in error_text or 'error' in status or 'Error' in error_text:
        safe_glsl = get_safe_glsl_for_project(glsl_name)
        if safe_glsl:
            safe_glsl_escaped = safe_glsl.replace("\\", "\\\\").replace("'", "\\'")
            code = """
import json
try:
    parent = op('""" + parent_path + """')
    glsl_name = '""" + glsl_name + """'
    glsl_op = None
    compute_dat = None
    for child in parent.children:
        if child.name == glsl_name or (glsl_name in child.name and 'glsl' in child.name.lower()):
            glsl_op = child
            for suffix in ['_compute', '_code', '_glsl']:
                for sibling in parent.children:
                    if sibling.name == glsl_name + suffix:
                        compute_dat = sibling
                        break
                if compute_dat:
                    break
    if glsl_op is not None:
        safe_code = '""" + safe_glsl_escaped + """'
        if compute_dat is None:
            compute_dat = parent.create(textDAT, glsl_name + '_compute')
            compute_dat.nodeX = glsl_op.nodeX
            compute_dat.nodeY = glsl_op.nodeY + 80
        compute_dat.text = safe_code
        if hasattr(glsl_op, 'par') and hasattr(glsl_op.par, 'computedat'):
            glsl_op.par.computedat = compute_dat.name
        glsl_op.cook(force=True)
        print(json.dumps({'fixed': 'rewrote_glsl', 'dat': compute_dat.path}))
    else:
        print(json.dumps({'error': 'GLSL POP not found for fix'}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"""
            result = td_exec_json(code, "fix_glsl_code:" + glsl_name)
            if result and result.get('fixed'):
                fixes_applied.append("Rewrote GLSL code for " + glsl_name)

    return fixes_applied


def get_safe_glsl_for_project(name):
    """Return safe, known-good GLSL code based on project name."""
    shaders = {
        'noise': "void main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    float n = TDSimplexNoise(vec4(pos * 0.5, u_time * 0.3));\n    pos += TDIn_N(0, id) * n * 0.4;\n    P[id] = pos;\n}",
        'color': "void main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 p = TDIn_P(0, id);\n    Cd[id] = vec4(p * 0.5 + 0.5, 1.0);\n}",
        'wave': "void main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 p = TDIn_P(0, id);\n    p.y += sin(p.x * 2.0 + u_time * 3.0) * 0.3;\n    P[id] = p;\n}",
        'fountain': "void main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    float a = float(id) * 0.1 + u_time * 2.0;\n    P[id] = vec3(sin(a) * 2.0, cos(a * 0.5) * 2.0 + 2.0, 0.0);\n}",
        'spring': "void main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    vec3 vel = TDIn_V(0, id);\n    vel += vec3(0.0, -0.01, 0.0);\n    pos += vel * 0.1;\n    P[id] = pos;\n}",
    }
    for key, shader in shaders.items():
        if key in name.lower():
            return shader
    return shaders['noise']


# ─── GLSL POP Project Definitions ──────────────────────────────────────────

PROJECTS = [
    {
        'name': 'project1_noise_deform',
        'title': 'Noise Deform',
        'description': 'Deforma puntos con Simplex Noise 4D',
        'source_type': 'boxPOP',
        'source_params': {'rows': 20, 'cols': 20},
        'glsl_type': 'glslPOP',
        'glsl_params': {'numelems': 400},
        'compute_dat_name': 'noise_compute',
        'glsl_code': "// Noise Deform - Simplex Noise 4D displacement\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    vec3 norm = TDIn_N(0, id);\n    float noise = TDSimplexNoise(vec4(pos * 0.5, u_time * 0.3));\n    pos += norm * noise * 0.4;\n    P[id] = pos;\n}",
    },
    {
        'name': 'project2_color_by_pos',
        'title': 'Color by Position',
        'description': 'Colorea puntos segun su posicion 3D',
        'source_type': 'spherePOP',
        'source_params': {'radius': 2.0},
        'glsl_type': 'glslPOP',
        'glsl_params': {'numelems': 300},
        'compute_dat_name': 'color_compute',
        'glsl_code': "// Color by Position - Maps XYZ to RGB\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);\n}",
    },
    {
        'name': 'project3_wave_deform',
        'title': 'Wave Deform',
        'description': 'Ondulacion animada con seno/coseno',
        'source_type': 'gridPOP',
        'source_params': {'rows': 30, 'cols': 30},
        'glsl_type': 'glslPOP',
        'glsl_params': {'numelems': 900},
        'compute_dat_name': 'wave_compute',
        'glsl_code': "// Wave Deform - Animated sine/cosine wave\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    pos.y += sin(pos.x * 2.0 + u_time * 3.0) * 0.3;\n    pos.y += cos(pos.z * 1.5 + u_time * 2.0) * 0.2;\n    P[id] = pos;\n}",
    },
    {
        'name': 'project4_particle_fountain',
        'title': 'Particle Fountain',
        'description': 'Fuente de particulas con movimiento radial',
        'source_type': 'circlePOP',
        'source_params': {'radius': 0.5},
        'glsl_type': 'glslPOP',
        'glsl_params': {'numelems': 500},
        'compute_dat_name': 'fountain_compute',
        'glsl_code': "// Particle Fountain - Radial particle emission\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    float angle = float(id) * 0.1 + u_time * 2.0;\n    float radius = 1.5 + sin(float(id) * 0.05) * 0.5;\n    float height = cos(float(id) * 0.03 + u_time) * 2.0 + 2.0;\n    P[id] = vec3(sin(angle) * radius, height, cos(angle) * radius);\n}",
    },
    {
        'name': 'project5_spring_forces',
        'title': 'Spring Forces',
        'description': 'Fuerzas de resorte con gravedad y amortiguacion',
        'source_type': 'boxPOP',
        'source_params': {'rows': 10, 'cols': 10},
        'glsl_type': 'glslPOP',
        'glsl_params': {'numelems': 100},
        'compute_dat_name': 'spring_compute',
        'glsl_code': "// Spring Forces - Gravity + spring damping\nvoid main() {\n    const uint id = TDIndex();\n    if(id >= TDNumElements()) return;\n    vec3 pos = TDIn_P(0, id);\n    vec3 vel = TDIn_V(0, id);\n    vec3 rest = vec3(pos.x, 0.0, pos.z);\n    vec3 springForce = (rest - pos) * 0.02;\n    vel *= 0.98;\n    vel += vec3(0.0, -0.005, 0.0) + springForce;\n    pos += vel * 0.1;\n    P[id] = pos;\n}",
    },
]


# ─── Build Functions ────────────────────────────────────────────────────────

def create_container():
    print("\n" + "=" * 60)
    print("STEP 1: Creating container")
    print("=" * 60)
    td_exec("op('" + PROJECT_ROOT + "').destroy()", "destroy_old")
    time.sleep(0.3)
    td_exec("op('/project1').create(baseCOMP, 'glsl_projects')", "create_container")
    time.sleep(0.3)
    print("  Container created at " + PROJECT_ROOT)


def build_project(project, index):
    print("\n" + "=" * 60)
    print("STEP 2." + str(index + 1) + ": Building: " + project['title'])
    print("  " + project['description'])
    print("=" * 60)

    pp = PROJECT_ROOT + "/" + project['name']

    # Create project container
    td_exec("op('" + PROJECT_ROOT + "').create(baseCOMP, '" + project['name'] + "')", "create_proj")
    time.sleep(0.2)

    # Create source POP
    src_name = "src_" + project['name'].split('_', 2)[2]
    src_type = project['source_type']
    src_params = project['source_params']
    param_str = ""
    for k, v in src_params.items():
        if isinstance(v, int):
            param_str += "; s.par." + k + " = " + str(v)
        elif isinstance(v, float):
            param_str += "; s.par." + k + " = " + str(v)

    td_exec("s = op('" + pp + "').create(" + src_type + ", '" + src_name + "')" + param_str, "create_src")
    time.sleep(0.2)

    # Create compute DAT with GLSL code
    compute_name = project['compute_dat_name']
    glsl_escaped = project['glsl_code'].replace("\\", "\\\\").replace("'", "\\'")
    td_exec("t = op('" + pp + "').create(textDAT, '" + compute_name + "'); t.text = '" + glsl_escaped + "'", "create_dat")
    time.sleep(0.2)

    # Create GLSL POP
    glsl_name = project['name'].split('_', 2)[2]
    glsl_short = glsl_name.replace('_', '')
    numelems = project['glsl_params']['numelems']

    td_exec(
        "g = op('" + pp + "').create(" + project['glsl_type'] + ", '" + glsl_short + "'); "
        "g.par.computedat = '" + compute_name + "'; "
        "g.par.numelems = " + str(numelems),
        "create_glsl"
    )
    time.sleep(0.2)

    # Connect source -> GLSL POP
    td_exec(
        "src = op('" + pp + "/" + src_name + "'); "
        "glsl = op('" + pp + "/" + glsl_short + "'); "
        "src.outputConnectors[0].connect(glsl)",
        "connect"
    )
    time.sleep(0.3)

    # Create null output
    td_exec(
        "n = op('" + pp + "').create(nullPOP, 'out_" + glsl_short + "'); "
        "n.inputConnectors[0].connect(op('" + pp + "/" + glsl_short + "'))",
        "create_out"
    )
    time.sleep(0.2)

    # Position nodes
    td_exec(
        "src = op('" + pp + "/" + src_name + "'); "
        "glsl = op('" + pp + "/" + glsl_short + "'); "
        "out = op('" + pp + "/out_" + glsl_short + "'); "
        "compute = op('" + pp + "/" + compute_name + "'); "
        "if src: src.nodeX = -300; src.nodeY = 0; "
        "if glsl: glsl.nodeX = 0; glsl.nodeY = 0; "
        "if out: out.nodeX = 300; out.nodeY = 0; "
        "if compute: compute.nodeX = 0; compute.nodeY = 100",
        "layout"
    )

    return pp, glsl_short


def verify_and_fix(project_path, glsl_name, project_title):
    """Verify DAT info errors and auto-fix until clean."""
    print("\n" + "=" * 60)
    print("STEP 3: Verifying & fixing: " + project_title)
    print("=" * 60)

    all_fixes = []

    for attempt in range(MAX_FIX_ATTEMPTS):
        print("\n  Attempt " + str(attempt + 1) + "/" + str(MAX_FIX_ATTEMPTS) + "...")
        time.sleep(VERIFY_DELAY)

        error_info = check_dat_info_errors(project_path, glsl_name)
        if error_info is None:
            print("  Could not read DAT info, skipping...")
            continue

        status = error_info.get('status', 'unknown')
        has_error = error_info.get('has_error', False)
        error_text = error_info.get('error_text', '')

        if status == 'compiled' and not has_error:
            print("  GLSL compiled successfully!")
            break

        if has_error or status == 'error':
            print("  Error detected: " + error_text[:200])
            fixes = auto_fix_glsl_errors(project_path, glsl_name, error_info)
            if fixes:
                all_fixes.extend(fixes)
                print("  Applied fixes: " + ", ".join(fixes))
            else:
                print("  No auto-fix available for this error")
                break
        else:
            print("  Status: " + status + " - checking general errors...")
            general_errors = check_all_errors(project_path)
            if general_errors and general_errors.get('count', 0) > 0:
                for op_err in general_errors.get('operators', []):
                    if op_err.get('hasIssues'):
                        print("  WARN " + op_err['name'] + ": " + op_err.get('errors', '')[:100])
            else:
                print("  No operator errors found")
                break

    time.sleep(VERIFY_DELAY)
    final_check = check_all_errors(project_path)
    final_count = final_check.get('count', 0) if final_check else 0

    return {
        'fixes_applied': all_fixes,
        'final_error_count': final_count,
        'status': 'clean' if final_count == 0 else 'has_issues'
    }


def position_all_projects():
    print("\n" + "=" * 60)
    print("STEP 4: Layout positioning")
    print("=" * 60)
    positions = [(-600, 0), (-200, 0), (200, 0), (-400, -300), (0, -300)]
    for i, (proj, (x, y)) in enumerate(zip(PROJECTS, positions)):
        td_exec(
            "p = op('" + PROJECT_ROOT + "/" + proj['name'] + "'); "
            "if p: p.nodeX = " + str(x) + "; p.nodeY = " + str(y),
            "pos:" + proj['title']
        )


def generate_report(results):
    print("\n" + "=" * 60)
    print("FINAL REPORT")
    print("=" * 60)
    total_fixes = 0
    all_clean = True
    for i, (proj, result) in enumerate(zip(PROJECTS, results)):
        icon = "OK" if result['status'] == 'clean' else "ERR"
        fixes = len(result['fixes_applied'])
        total_fixes += fixes
        if result['status'] != 'clean':
            all_clean = False
        print("\n  [" + icon + "] Project " + str(i + 1) + ": " + proj['title'])
        print("     Path: " + PROJECT_ROOT + "/" + proj['name'])
        print("     GLSL: " + proj['glsl_type'] + " (" + str(proj['glsl_params']['numelems']) + " elements)")
        print("     Source: " + proj['source_type'])
        print("     Status: " + result['status'])
        if fixes > 0:
            print("     Fixes: " + str(fixes))
            for fix in result['fixes_applied']:
                print("       - " + fix)
    print("\n" + "-" * 60)
    print("  Total projects: " + str(len(PROJECTS)))
    print("  Total fixes: " + str(total_fixes))
    print("  Overall: " + ("ALL CLEAN" if all_clean else "SOME ISSUES"))
    print("-" * 60)
    return all_clean


def main():
    print("GLSL POP Projects Builder - Auto-Error-Verification System")
    print("Creating 5 projects with automatic error detection and fixing\n")

    create_container()

    project_info = []
    for i, project in enumerate(PROJECTS):
        project_path, glsl_name = build_project(project, i)
        project_info.append((project_path, glsl_name))

    results = []
    for i, ((project_path, glsl_name), project) in enumerate(zip(project_info, PROJECTS)):
        result = verify_and_fix(project_path, glsl_name, project['title'])
        results.append(result)

    position_all_projects()
    all_clean = generate_report(results)

    print("\n" + "=" * 60)
    print("Saving GLSL files to disk")
    print("=" * 60)
    os.makedirs(GLSL_DIR, exist_ok=True)
    for proj in PROJECTS:
        filename = proj['compute_dat_name'].replace('_compute', '.glsl')
        filepath = os.path.join(GLSL_DIR, filename)
        with open(filepath, 'w') as f:
            f.write(proj['glsl_code'].strip() + '\n')
        print("  Saved: " + filename)

    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    return 0 if all_clean else 1


if __name__ == '__main__':
    sys.exit(main())
