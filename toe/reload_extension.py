"""Force-reload the TouchDesignerAPI extension by re-importing the Python module.

This script is executed via POST /exec and forces a reload of the TouchDesignerAPI
class methods that may not be registered in the compiled .tox extension.

It uses importlib.reload() on the TouchDesignerAPI module and then tries to
re-initialize the extension component.
"""
import json
import importlib
import sys

results = {}

# Step 1: Find and reload the TouchDesignerAPI module
reloaded_modules = []
for name, mod in list(sys.modules.items()):
    if 'touchedesignerapi' in name.lower() or 'td_utils' in name.lower():
        try:
            importlib.reload(mod)
            reloaded_modules.append(name)
        except Exception as e:
            reloaded_modules.append(f"{name}: {e}")

results['reloaded_modules'] = reloaded_modules

# Step 2: Find the extension COMP and re-cook it
try:
    ext = op('/project1/TouchDesignerAPI')
    if ext:
        ext.cook(force=True)
        results['extension_cooked'] = True
        results['extension_path'] = ext.path
    else:
        results['extension_cooked'] = False
        results['extension_error'] = 'Extension not found at /project1/TouchDesignerAPI'
except Exception as e:
    results['extension_cooked'] = False
    results['extension_error'] = str(e)

# Step 3: Verify some key methods exist
try:
    if ext:
        api = ext.op('TouchDesignerAPI') if hasattr(ext, 'op') else ext
        # Check methods
        import types
        methods = [name for name in dir(api) if callable(getattr(api, name, None)) and name.startswith('_handle_')]
        results['available_handlers'] = methods
        # Check specific ones
        for endpoint in ['_handle_auto_layout', '_handle_glsl_reload', '_handle_glsl_update',
                         '_handle_smart_connect', '_handle_pop_inspect', '_handle_get_node_detail']:
            results[endpoint] = hasattr(api, endpoint)
except Exception as e:
    results['method_check_error'] = str(e)

# Step 4: Try to force-cook the webserver DAT
try:
    for c in op('/project1').children:
        if 'webserver' in c.OPType.lower() or 'websocket' in c.OPType.lower():
            c.cook(force=True)
            results[f'cooked_{c.name}'] = True
except Exception as e:
    results['cook_error'] = str(e)

print(json.dumps(results, indent=2))
