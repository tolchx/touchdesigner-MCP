"""Debug: get actual GLSL error text and check source POP params."""
import json, urllib.request, time

HOST = 'http://127.0.0.1:44444'

def td(code):
    data = json.dumps({'code': code}).encode()
    req = urllib.request.Request(HOST + '/exec', data=data, headers={'Content-Type': 'application/json'})
    r = json.loads(urllib.request.urlopen(req, timeout=15).read().decode())
    return r.get('output', '')

# 1. Check info DAT content for each project
print("=== Info DAT Content ===")
code = """
import json
parent = op('/project1/glsl_projects')
if parent:
    for proj in parent.children:
        for child in proj.children:
            if 'info' in child.name.lower():
                try:
                    txt = child.text if hasattr(child, 'text') else 'NO TEXT ATTR'
                    print(proj.name + '/' + child.name + ': ' + str(txt)[:500])
                except Exception as e:
                    print(proj.name + '/' + child.name + ': EXCEPTION ' + str(e))
"""
print(td(code))

# 2. Check what params boxPOP/spherePOP/gridPOP/circlePOP actually have
print("\n=== Source POP Params ===")
code2 = """
import json
parent = op('/project1/glsl_projects')
if parent:
    for proj in parent.children:
        for child in proj.children:
            if 'src_' in child.name:
                try:
                    par_names = [p.name for p in child.pars()]
                    print(proj.name + '/' + child.name + ' (' + child.OPType + '): ' + str(par_names)[:300])
                except Exception as e:
                    print(proj.name + '/' + child.name + ': ' + str(e)[:200])
"""
print(td(code2))

# 3. Force cook glslPOP and check errors in detail
print("\n=== GLSL POP Detailed Errors ===")
code3 = """
import json, time
parent = op('/project1/glsl_projects')
if parent:
    for proj in parent.children:
        for child in proj.children:
            op_type = child.OPType if hasattr(child, 'OPType') else '?'
            if 'glsl' in op_type.lower():
                try:
                    child.cook(force=True)
                except:
                    pass
                time.sleep(0.5)
                errs = ''
                try:
                    errs = str(child.errors())
                except:
                    pass
                # Check computedat value
                cd = ''
                try:
                    cd = str(child.par.computedat.eval())
                except:
                    cd = 'N/A'
                print(proj.name + '/' + child.name + ':')
                print('  computedat=' + cd)
                print('  errors=' + errs[:300])
                # Check children
                for c in child.children:
                    try:
                        ct = c.text[:200] if hasattr(c, 'text') and c.text else 'empty'
                        print('  child ' + c.name + ': ' + ct[:200])
                    except:
                        pass
"""
print(td(code3))

# 4. Try creating a simple test GLSL POP manually
print("\n=== Manual Test ===")
code4 = """
import json
parent = op('/project1/glsl_projects')
if parent:
    # Create a test container
    test = parent.create(baseCOMP, 'test_man')
    # Create source
    src = test.create(boxPOP, 'test_src')
    src.par.rows = 10
    src.par.cols = 10
    # Create compute DAT with simple GLSL
    cdat = test.create(textDAT, 'test_glsl_code')
    cdat.text = 'void main() { P[id] = TDIn_P(0, id); }'
    # Create glslPOP
    glsl = test.create(glslPOP, 'test_glsl')
    glsl.par.computedat = 'test_glsl_code'
    glsl.par.numelems = 100
    # Connect
    src.outputConnectors[0].connect(glsl)
    import time
    time.sleep(1)
    # Check
    errs = str(glsl.errors()) if hasattr(glsl, 'errors') else 'no errors attr'
    info = op(glsl.path + '/glsl1_info')
    info_text = info.text if info and hasattr(info, 'text') else 'NO INFO'
    print('errors: ' + errs[:300])
    print('info: ' + str(info_text)[:500])
    print('computedat: ' + str(glsl.par.computedat.eval()))
    # Cleanup
    test.destroy()
"""
print(td(code4))
