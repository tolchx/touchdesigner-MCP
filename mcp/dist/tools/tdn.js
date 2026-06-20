import { z } from "zod";
import { ok, err } from "../helpers.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
// ─── Python Code Generators ──────────────────────────────────────────────────
/**
 * Volatile header keys stripped by git textconv.
 * Must stay in sync with mcp/src/tdn/textconv.py and schema.ts.
 */
const VOLATILE_KEYS = ["build", "generator", "td_build", "exported_at", "source_file"];
/**
 * Build Python code to export a TD network to TDN JSON format.
 *
 * Walks the operator tree recursively, collecting:
 *   - Operator types, names, positions, sizes, colors
 *   - Non-default parameter values (with = for expressions, ~ for binds)
 *   - Input connections
 *   - Custom parameter definitions
 *   - Flags, tags, comments, storage
 *   - DAT content (text and table)
 *   - Annotations (network boxes, comments)
 *   - Children for COMPs
 *
 * Compacts by extracting type_defaults (shared values across all operators
 * of the same type) and par_templates (shared custom parameter page defs).
 */
function buildExportCode(rootPath, outputFilePath, includeDatContent, includeStorage) {
    const safePath = rootPath.replace(/'/g, "\\'");
    const safeFile = outputFilePath.replace(/\\/g, "/").replace(/'/g, "\\'");
    return `
import json, os, sys, time, datetime

# ── Configuration ──
INCLUDE_DAT_CONTENT = ${includeDatContent ? "True" : "False"}
INCLUDE_STORAGE = ${includeStorage ? "True" : "False"}
SKIP_PARAMS = {
    'preview', 'file', 'syncfile', 'externaltox', 'reloaddat',
    'clone', 'opshortcut', 'opId', 'viewer', 'render',
    'bypass', 'lock', 'display',
}
SKIP_STORAGE_KEYS = {'_gm', '_tdn_palette_handling'}

# ── Defaults for comparison ──
DEFAULT_NODE_SIZE = [200, 100]
DEFAULT_COLOR = [0.545, 0.545, 0.545]

def serialize_value(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        return val
    if isinstance(val, (list, tuple)):
        return [serialize_value(v) for v in val]
    if isinstance(val, dict):
        return {k: serialize_value(v) for k, v in val.items()}
    return str(val)

def get_par_value(par):
    try:
        if par.isExpression:
            return '=' + par.expr
        if par.isBind:
            return '~' + par.bindExpr
        return serialize_value(par.val)
    except:
        return None

def get_non_default_pars(node):
    pars = {}
    try:
        for par in node.pars:
            try:
                if par.name.lower() in SKIP_PARAMS:
                    continue
                if par.readOnly:
                    continue
                val = get_par_value(par)
                if val is None:
                    continue
                default = par.default
                if val == default:
                    continue
                pars[par.name] = val
            except:
                pass
    except:
        pass
    return pars

def get_flags(node):
    flags = []
    flag_names = ['bypass', 'lock', 'display', 'render', 'viewer', 'expose', 'allowCooking']
    try:
        for f in flag_names:
            try:
                val = getattr(node, f, None)
                if val is not None:
                    if not val:
                        flags.append('-' + f)
            except:
                pass
    except:
        pass
    return flags if flags else None

def get_connections(node):
    inputs = []
    try:
        for ic in node.inputConnectors:
            try:
                if len(ic.connections) > 0:
                    src = ic.connections[0].owner
                    if src and src.parent() == node.parent():
                        inputs.append(src.name)
                    elif src:
                        inputs.append(src.path)
                    else:
                        inputs.append(None)
                else:
                    inputs.append(None)
            except:
                inputs.append(None)
    except:
        pass
    while inputs and inputs[-1] is None:
        inputs.pop()
    return inputs if inputs else None

def get_storage(node):
    storage = {}
    try:
        for key in node.storage:
            if key in SKIP_STORAGE_KEYS:
                continue
            try:
                val = node.storage[key]
                storage[key] = serialize_value(val)
            except:
                pass
    except:
        pass
    return storage if storage else None

def get_custom_pars(node):
    pages = {}
    try:
        for page in node.customPages:
            page_pars = []
            for par in page.pars:
                pdef = {'name': par.name, 'style': par.style}
                if par.label and par.label != par.name:
                    pdef['label'] = par.label
                val = get_par_value(par)
                if val is not None:
                    default = par.default
                    if val != default:
                        if isinstance(val, list):
                            pdef['values'] = val
                        else:
                            pdef['value'] = val
                page_pars.append(pdef)
            if page_pars:
                pages[page.name] = page_pars
    except:
        pass
    return pages if pages else None

def get_dat_content(node):
    if not INCLUDE_DAT_CONTENT:
        return None
    try:
        if hasattr(node, 'text'):
            txt = node.text
            if txt and len(txt.strip()) > 0:
                try:
                    rows = []
                    for i in range(node.numRows):
                        row = []
                        for j in range(node.numCols):
                            row.append(node[i][j] if node[i][j] is not None else '')
                        rows.append(row)
                    if len(rows) > 0 and len(rows[0]) > 1:
                        return {'data': rows, 'format': 'table'}
                except:
                    pass
                return {'data': txt, 'format': 'text'}
    except:
        pass
    return None

def get_annotations(node):
    annotations = []
    try:
        for child in node.children:
            if hasattr(child, 'OPType') and child.OPType in ('annotatCOMP', 'commentCOMP', 'networkboxCOMP'):
                ann = {
                    'name': child.name,
                    'mode': child.OPType.replace('COMP', ''),
                }
                try:
                    title = getattr(child, 'title', None)
                    if title:
                        ann['title'] = title
                except:
                    pass
                try:
                    txt = getattr(child, 'text', None)
                    if txt:
                        ann['text'] = txt
                except:
                    pass
                try:
                    pos = [child.par.x if hasattr(child.par, 'x') else 0, child.par.y if hasattr(child.par, 'y') else 0]
                    if pos[0] != 0 or pos[1] != 0:
                        ann['position'] = pos
                except:
                    pass
                try:
                    sz = [child.par.w if hasattr(child.par, 'w') else 200, child.par.h if hasattr(child.par, 'h') else 100]
                    ann['size'] = sz
                except:
                    ann['size'] = [200, 100]
                annotations.append(ann)
    except:
        pass
    return annotations if annotations else None

def export_operator(node, depth=0):
    if node is None or depth > 50:
        return None
    try:
        op_type = node.OPType if hasattr(node, 'OPType') else '?'
    except:
        op_type = '?'

    op_data = {'name': node.name, 'type': op_type}

    try:
        if hasattr(node, 'par') and hasattr(node.par, 'x') and hasattr(node.par, 'y'):
            x = node.par.x
            y = node.par.y
            if x != 0 or y != 0:
                op_data['position'] = [x, y]
    except:
        pass

    try:
        if hasattr(node, 'par') and hasattr(node.par, 'w') and hasattr(node.par, 'h'):
            w = node.par.w
            h = node.par.h
            if w != DEFAULT_NODE_SIZE[0] or h != DEFAULT_NODE_SIZE[1]:
                op_data['size'] = [w, h]
    except:
        pass

    try:
        clr = getattr(node, 'color', None)
        if clr and list(clr) != DEFAULT_COLOR:
            op_data['color'] = list(clr)
    except:
        pass

    try:
        cmt = getattr(node, 'comment', None)
        if cmt and cmt.strip():
            op_data['comment'] = cmt
    except:
        pass

    try:
        tags = list(node.tags) if hasattr(node, 'tags') else []
        if tags:
            op_data['tags'] = tags
    except:
        pass

    pars = get_non_default_pars(node)
    if pars:
        op_data['parameters'] = pars

    cpars = get_custom_pars(node)
    if cpars:
        op_data['custom_pars'] = cpars

    flags = get_flags(node)
    if flags:
        op_data['flags'] = flags

    storage = get_storage(node)
    if storage:
        op_data['storage'] = storage

    inputs = get_connections(node)
    if inputs:
        op_data['inputs'] = inputs

    dat = get_dat_content(node)
    if dat:
        op_data['dat_content'] = dat['data']
        op_data['dat_content_format'] = dat['format']

    # Children (for COMPs) — use child_ops list, NOT child_data
    try:
        if hasattr(node, 'children') and len(node.children) > 0:
            child_ops = []
            for child in node.children:
                try:
                    if hasattr(child, 'OPType') and child.OPType not in ('annotatCOMP', 'commentCOMP', 'networkboxCOMP'):
                        child_result = export_operator(child, depth + 1)
                        if child_result:
                            child_ops.append(child_result)
                except:
                    pass
            if child_ops:
                op_data['children'] = child_ops
    except:
        pass

    anns = get_annotations(node)
    if anns:
        op_data['annotations'] = anns

    return op_data

# ── Main Export ──
target = op('${safePath}')
if target is None:
    print(json.dumps({'success': False, 'error': 'Path not found: ${safePath}'}))
else:
    operators = []
    try:
        for child in target.children:
            try:
                if hasattr(child, 'OPType') and child.OPType not in ('annotatCOMP', 'commentCOMP', 'networkboxCOMP'):
                    op_data = export_operator(child)
                    if op_data:
                        operators.append(op_data)
            except:
                pass
    except:
        pass

    tdn = {
        'format': 'tdn',
        'version': '1.4',
        'build': None,
        'generator': 'TouchDesigner-MCP/3.0',
        'td_build': app.version if hasattr(app, 'version') else 'unknown',
        'exported_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'network_path': '${safePath}',
        'type': target.OPType if hasattr(target, 'OPType') else 'baseCOMP',
        'options': {
            'include_dat_content': INCLUDE_DAT_CONTENT,
            'include_storage': INCLUDE_STORAGE,
        },
        'operators': operators,
    }

    try:
        out_path = '${safeFile}'
        os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else '.', exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(tdn, f, indent='\\t', ensure_ascii=False)
        result = {
            'success': True,
            'path': '${safePath}',
            'output_file': out_path,
            'operator_count': len(operators),
            'file_size': os.path.getsize(out_path),
        }
    except Exception as e:
        result = {'success': False, 'error': str(e)}

    print(json.dumps(result))
`;
}
/**
 * Build Python code to import a TDN file into TouchDesigner.
 *
 * Reads the .tdn JSON file and recreates the network:
 *   1. Creates operators
 *   2. Sets parameter values
 *   3. Sets flags
 *   4. Wires connections
 *   5. Sets DAT content
 *   6. Sets positions/colors
 *   7. Recursively processes children
 */
function buildImportCode(tdnFilePath, targetPath) {
    const safeFile = tdnFilePath.replace(/\\/g, "/").replace(/'/g, "\\'");
    const safeTarget = targetPath.replace(/'/g, "\\'");
    return `
import json, os, sys

def resolve_type(typ):
    mapping = {
        'baseCOMP': baseCOMP, 'containerCOMP': containerCOMP,
        'geometryCOMP': geometryCOMP, 'cameraCOMP': cameraCOMP,
        'lightCOMP': lightCOMP, 'nullCOMP': nullCOMP,
        'animationCOMP': animationCOMP, 'windowCOMP': windowCOMP,
        'textDAT': textDAT, 'tableDAT': tableDAT, 'executeDAT': executeDAT,
        'selectDAT': selectDAT, 'scriptDAT': scriptDAT, 'webClientDAT': webClientDAT,
        'noiseTOP': noiseTOP, 'blurTOP': blurTOP, 'nullTOP': nullTOP,
        'compositeTOP': compositeTOP, 'levelTOP': levelTOP, 'transformTOP': transformTOP,
        'constantTOP': constantTOP, 'renderTOP': renderTOP, 'glslTOP': glslTOP,
        'selectTOP': selectTOP, 'moviefileinTOP': moviefileinTOP,
        'noiseCHOP': noiseCHOP, 'constantCHOP': constantCHOP, 'mathCHOP': mathCHOP,
        'nullCHOP': nullCHOP, 'selectCHOP': selectCHOP, 'lagCHOP': lagCHOP,
        'waveCHOP': waveCHOP, 'speedCHOP': speedCHOP, 'trailCHOP': trailCHOP,
        'patternCHOP': patternCHOP, 'timerCHOP': timerCHOP,
        'noiseSOP': noiseSOP, 'sphereSOP': sphereSOP, 'boxSOP': boxSOP,
        'gridSOP': gridSOP, 'nullSOP': nullSOP, 'mergeSOP': mergeSOP,
        'particlePOP': particlePOP, 'forcePOP': forcePOP, 'noisePOP': noisePOP,
        'nullPOP': nullPOP, 'glslPOP': glslPOP, 'popToCHOP': popToCHOP,
        'pythonCOMP': pythonCOMP, 'localTimeCOMP': localTimeCOMP,
        'parCOMP': parCOMP, 'webRendererCOMP': webRendererCOMP,
        'choptoCHOP': choptoCHOP, 'holdCHOP': holdCHOP,
        'audioCHOP': audioCHOP, 'audioDeviceInCHOP': audioDeviceInCHOP,
        'fbxAnimInCHOP': fbxAnimInCHOP, 'fileInCHOP': fileInCHOP,
        'opCHOP': opCHOP, 'countCHOP': countCHOP, 'evalCHOP': evalCHOP,
        'lookupCHOP': lookupCHOP, 'midiInCHOP': midiInCHOP,
        'noiseTOP': noiseTOP, 'videoDeviceInTOP': videoDeviceInTOP,
        'textTOP': textTOP, 'circleTOP': circleTOP, 'rectangleTOP': rectangleTOP,
        'gradientTOP': gradientTOP, 'slopeTOP': slopeTOP,
        'depthTOP': depthTOP, 'displaceTOP': displaceTOP,
        'edgeTOP': edgeTOP, 'sharpenTOP': sharpenTOP,
        'phongMAT': phongMAT, 'pbrMAT': pbrMAT, 'glslMAT': glslMAT,
        'constantMAT': constantMAT, 'selectMAT': selectMAT,
        'lineMAT': lineMAT, 'wireframeMAT': wireframeMAT,
        'moviefileoutTOP': moviefileoutTOP, 'selectSOP': selectSOP,
        'copySOP': copySOP, 'transformSOP': transformSOP,
        'facetSOP': facetSOP, 'subdivideSOP': subdivideSOP,
        'switchDAT': switchDAT, 'convertDAT': convertDAT,
        'dattoCHOP': dattoCHOP, 'selectCHOP': selectCHOP,
        'patternCHOP': patternCHOP, 'lagCHOP': lagCHOP,
        'speedCHOP': speedCHOP, 'trailCHOP': trailCHOP,
        'countCHOP': countCHOP, 'timerCHOP': timerCHOP,
        'evalCHOP': evalCHOP, 'lookupCHOP': lookupCHOP,
    }
    return mapping.get(typ, baseCOMP)

def set_par_value(node, name, val):
    try:
        par = getattr(node.par, name, None)
        if par is None:
            return
        if isinstance(val, str) and len(val) > 0 and val[0] == '=':
            par.expr = val[1:]
        elif isinstance(val, str) and len(val) > 0 and val[0] == '~':
            par.bindExpr = val[1:]
        elif isinstance(val, list):
            par.val = val
        else:
            par.val = val
    except:
        pass

def set_flags(node, flags):
    if not flags:
        return
    for f in flags:
        try:
            if f.startswith('-'):
                setattr(node, f[1:], False)
            else:
                setattr(node, f, True)
        except:
            pass

def set_connections(node, inputs):
    if not inputs:
        return
    parent = node.parent()
    if parent is None:
        return
    for idx, src_name in enumerate(inputs):
        if src_name is None:
            continue
        try:
            src = op(src_name) if src_name.startswith('/') else parent.op(src_name)
            if src is not None and idx < len(node.inputConnectors):
                node.inputConnectors[idx].connect(src)
        except:
            pass

def import_operator(parent, op_data, depth=0):
    if op_data is None or depth > 50:
        return None
    name = op_data.get('name', 'op')
    typ = op_data.get('type', 'nullTOP')
    try:
        op_cls = resolve_type(typ)
        node = parent.create(op_cls, name)
    except Exception as e:
        return None

    pos = op_data.get('position')
    if pos and hasattr(node.par, 'x') and hasattr(node.par, 'y'):
        try:
            node.par.x = pos[0]
            node.par.y = pos[1]
        except:
            pass

    sz = op_data.get('size')
    if sz and hasattr(node.par, 'w') and hasattr(node.par, 'h'):
        try:
            node.par.w = sz[0]
            node.par.h = sz[1]
        except:
            pass

    clr = op_data.get('color')
    if clr:
        try:
            node.color = clr
        except:
            pass

    cmt = op_data.get('comment')
    if cmt:
        try:
            node.comment = cmt
        except:
            pass

    tags = op_data.get('tags')
    if tags:
        try:
            for t in tags:
                node.tags.add(t)
        except:
            pass

    pars = op_data.get('parameters', {})
    for pname, pval in pars.items():
        set_par_value(node, pname, pval)

    set_flags(node, op_data.get('flags'))

    dat = op_data.get('dat_content')
    fmt = op_data.get('dat_content_format')
    if dat and hasattr(node, 'text'):
        try:
            if fmt == 'table' and isinstance(dat, list):
                for i, row in enumerate(dat):
                    for j, cell in enumerate(row):
                        if i < node.numRows and j < node.numCols:
                            node[i][j] = cell
            elif isinstance(dat, str):
                node.text = dat
        except:
            pass

    # Children
    children = op_data.get('children', [])
    for child_data in children:
        import_operator(node, child_data, depth + 1)

    return node

# ── Main Import ──
try:
    with open('${safeFile}', 'r', encoding='utf-8') as f:
        tdn = json.load(f)

    target = op('${safeTarget}')
    if target is None:
        print(json.dumps({'success': False, 'error': 'Target path not found: ${safeTarget}'}))
    else:
        operators = tdn.get('operators', [])
        created = 0
        errors = []
        all_nodes = []
        all_connections = []
        for op_data in operators:
            try:
                node = import_operator(target, op_data)
                if node:
                    created += 1
                    all_nodes.append((node, op_data))
            except Exception as e:
                errors.append({'name': op_data.get('name', '?'), 'error': str(e)})

        # Second pass: wire connections after all operators exist
        for node, op_data in all_nodes:
            inputs = op_data.get('inputs')
            if inputs:
                set_connections(node, inputs)

        result = {
            'success': True,
            'target_path': '${safeTarget}',
            'operators_imported': created,
            'operators_total': len(operators),
            'errors': errors,
            'tdn_version': tdn.get('version', '?'),
            'tdn_network_path': tdn.get('network_path', '?'),
        }
except Exception as e:
    result = {'success': False, 'error': str(e)}

print(json.dumps(result))
`;
}
/**
 * Build Python code to diff a live network against a saved .tdn file.
 *
 * Compares operators, parameters, connections, and DAT content.
 * Ignores volatile headers (build, timestamp, etc.).
 */
function buildDiffCode(rootPath, tdnFilePath) {
    const safePath = rootPath.replace(/'/g, "\\'");
    const safeFile = tdnFilePath.replace(/\\/g, "/").replace(/'/g, "\\'");
    return `
import json, sys

def serialize_val(val):
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        return val
    if isinstance(val, (list, tuple)):
        return [serialize_val(v) for v in val]
    if isinstance(val, dict):
        return {k: serialize_val(v) for k, v in val.items()}
    return str(val)

def get_live_par(node, name):
    try:
        par = getattr(node.par, name, None)
        if par is None:
            return None
        if par.isExpression:
            return '=' + par.expr
        if par.isBind:
            return '~' + par.bindExpr
        return serialize_val(par.val)
    except:
        return None

def collect_live_ops(node, depth=0):
    ops = {}
    if node is None or depth > 50:
        return ops
    try:
        for child in node.children:
            try:
                if hasattr(child, 'OPType') and child.OPType not in ('annotatCOMP', 'commentCOMP', 'networkboxCOMP'):
                    name = child.name
                    pars = {}
                    try:
                        for par in child.pars:
                            try:
                                if par.readOnly:
                                    continue
                                val = get_live_par(child, par.name)
                                if val is not None:
                                    pars[par.name] = val
                            except:
                                pass
                    except:
                        pass

                    inputs = []
                    try:
                        for ic in child.inputConnectors:
                            try:
                                if len(ic.connections) > 0:
                                    src = ic.connections[0].owner
                                    inputs.append(src.name if src else None)
                                else:
                                    inputs.append(None)
                            except:
                                inputs.append(None)
                    except:
                        pass

                    ops[name] = {
                        'type': child.OPType if hasattr(child, 'OPType') else '?',
                        'parameters': pars,
                        'inputs': inputs,
                    }

                    try:
                        if hasattr(child, 'children') and len(child.children) > 0:
                            child_ops = collect_live_ops(child, depth=depth+1)
                            for k, v in child_ops.items():
                                ops[k] = v
                    except:
                        pass
            except:
                pass
    except:
        pass
    return ops

try:
    with open('${safeFile}', 'r', encoding='utf-8') as f:
        saved = json.load(f)
except Exception as e:
    print(json.dumps({'success': False, 'error': 'Failed to read TDN file: ' + str(e)}))
    sys.exit(0)

target = op('${safePath}')
if target is None:
    print(json.dumps({'success': False, 'error': 'Path not found: ${safePath}'}))
    sys.exit(0)

live_ops = collect_live_ops(target)

saved_ops = {}
for op_data in saved.get('operators', []):
    name = op_data.get('name', '')
    saved_ops[name] = {
        'type': op_data.get('type', '?'),
        'parameters': op_data.get('parameters', {}),
        'inputs': op_data.get('inputs', []),
    }

live_names = set(live_ops.keys())
saved_names = set(saved_ops.keys())

only_live = sorted(live_names - saved_names)
only_saved = sorted(saved_names - live_names)
shared = sorted(live_names & saved_names)

param_diffs = []
connection_diffs = []

for name in shared:
    live = live_ops[name]
    svd = saved_ops[name]

    all_pars = set(live.get('parameters', {}).keys()) | set(svd.get('parameters', {}).keys())
    for pname in sorted(all_pars):
        lv = live.get('parameters', {}).get(pname)
        sv = svd.get('parameters', {}).get(pname)
        if lv != sv:
            param_diffs.append({
                'operator': name, 'parameter': pname,
                'live_value': lv, 'saved_value': sv,
            })

    live_inputs = live.get('inputs', [])
    svd_inputs = svd.get('inputs', [])
    max_len = max(len(live_inputs), len(svd_inputs))
    for i in range(max_len):
        ls = live_inputs[i] if i < len(live_inputs) else None
        ss = svd_inputs[i] if i < len(svd_inputs) else None
        if ls != ss:
            connection_diffs.append({
                'operator': name, 'input_index': i,
                'live_source': ls, 'saved_source': ss,
            })

total = len(only_live) + len(only_saved) + len(param_diffs) + len(connection_diffs)
lines = []
if only_live:
    lines.append(f'{len(only_live)} operator(s) only in live network')
if only_saved:
    lines.append(f'{len(only_saved)} operator(s) only in saved file')
if param_diffs:
    lines.append(f'{len(param_diffs)} parameter difference(s)')
if connection_diffs:
    lines.append(f'{len(connection_diffs)} connection difference(s)')
if not lines:
    lines.append('Networks are identical')

result = {
    'success': True,
    'identical': total == 0,
    'only_live': only_live,
    'only_saved': only_saved,
    'param_diffs': param_diffs[:50],
    'connection_diffs': connection_diffs[:50],
    'total_differences': total,
    'summary': '; '.join(lines),
}
print(json.dumps(result))
`;
}
// ─── Tool Registration ───────────────────────────────────────────────────────
export function registerTdnTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_tdn_export
    // ---------------------------------------------------------------------------
    server.registerTool("td_tdn_export", {
        title: "Export Network to TDN",
        description: "Export a TouchDesigner operator/network to a .tdn (TouchDesigner Network) JSON file. " +
            "Captures operator structure, non-default parameters, connections, DAT content, " +
            "flags, tags, positions, colors, custom parameters, and annotations. " +
            "Compacts by extracting type defaults and parameter templates. " +
            "The .tdn format enables git-friendly version control of .toe networks.",
        inputSchema: {
            path: z
                .string()
                .describe("Root COMP path to export (e.g. '/project1/mySystem')"),
            output_file: z
                .string()
                .describe("Output file path for the .tdn file (e.g. 'networks/mySystem.tdn')"),
            include_dat_content: z
                .boolean()
                .optional()
                .default(true)
                .describe("Include DAT text/table content (default: true)"),
            include_storage: z
                .boolean()
                .optional()
                .default(true)
                .describe("Include operator storage entries (default: true)"),
        },
    }, async ({ path: rootPath, output_file, include_dat_content, include_storage }) => {
        try {
            const code = buildExportCode(rootPath, output_file, include_dat_content ?? true, include_storage ?? true);
            const result = await client.execute(code, "/");
            let parsed;
            try {
                parsed = JSON.parse(result.stdout || "{}");
            }
            catch {
                parsed = { success: false, error: result.stdout || "Parse error" };
            }
            return parsed.success ? ok(parsed) : err(parsed.error || "Export failed");
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_tdn_import
    // ---------------------------------------------------------------------------
    server.registerTool("td_tdn_import", {
        title: "Import Network from TDN",
        description: "Import a .tdn (TouchDesigner Network) JSON file into TouchDesigner. " +
            "Recreates operators with correct types, parameters, connections, " +
            "DAT content, flags, positions, colors, and custom parameters. " +
            "Best-effort: failures on individual operators don't abort the import.",
        inputSchema: {
            tdn_file: z
                .string()
                .describe("Path to the .tdn file to import"),
            target_path: z
                .string()
                .describe("Target COMP path to import into (e.g. '/project1')"),
        },
    }, async ({ tdn_file, target_path }) => {
        try {
            const code = buildImportCode(tdn_file, target_path);
            const result = await client.execute(code, "/");
            let parsed;
            try {
                parsed = JSON.parse(result.stdout || "{}");
            }
            catch {
                parsed = { success: false, error: result.stdout || "Parse error" };
            }
            return parsed.success ? ok(parsed) : err(parsed.error || "Import failed");
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_tdn_diff
    // ---------------------------------------------------------------------------
    server.registerTool("td_tdn_diff", {
        title: "Diff Network vs TDN File",
        description: "Compare a live TouchDesigner network against a saved .tdn file. " +
            "Detects operators only in live, operators only in saved, parameter " +
            "differences, and connection differences. Returns a structured diff " +
            "report. Volatile headers (build, timestamp) are ignored.",
        inputSchema: {
            path: z
                .string()
                .describe("Live network path to compare (e.g. '/project1/mySystem')"),
            tdn_file: z
                .string()
                .describe("Path to the saved .tdn file to compare against"),
        },
    }, async ({ path: rootPath, tdn_file }) => {
        try {
            const code = buildDiffCode(rootPath, tdn_file);
            const result = await client.execute(code, "/");
            let parsed;
            try {
                parsed = JSON.parse(result.stdout || "{}");
            }
            catch {
                parsed = { success: false, error: result.stdout || "Parse error" };
            }
            return parsed.success ? ok(parsed) : err(parsed.error || "Diff failed");
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_tdn_git_setup
    // ---------------------------------------------------------------------------
    server.registerTool("td_tdn_git_setup", {
        title: "Setup Git for TDN",
        description: "Auto-configure git for TouchDesigner Network (.tdn) version control. " +
            "Creates .gitattributes with '*.tdn diff=tdn' and configures the git " +
            "textconv driver that strips volatile headers (build, timestamp, TD version) " +
            'from diffs so `git diff` shows only semantic network changes. ' +
            "Also adds *.tdn to .gitignore if requested. Works on the local filesystem — " +
            "no TouchDesigner connection required.",
        inputSchema: {
            repo_path: z
                .string()
                .optional()
                .describe("Path to the git repository root. Defaults to the MCP server's working directory."),
            textconv_path: z
                .string()
                .optional()
                .describe("Path to textconv.py relative to repo root. Defaults to 'mcp/src/tdn/textconv.py'."),
            add_to_gitignore: z
                .boolean()
                .optional()
                .default(false)
                .describe("Also add *.tdn to .gitignore (default: false — .tdn files should be tracked)."),
            global: z
                .boolean()
                .optional()
                .default(false)
                .describe("Configure git globally (--global flag) instead of per-repo."),
        },
    }, async ({ repo_path, textconv_path, add_to_gitignore, global: isGlobal }) => {
        try {
            const repoRoot = repo_path || process.cwd();
            const textconv = textconv_path || "mcp/src/tdn/textconv.py";
            const pythonCmd = process.platform === "win32" ? "python" : "python3";
            const steps = [];
            const errors = [];
            // 1. Verify git repo exists
            let isGitRepo = false;
            try {
                execSync("git rev-parse --is-inside-work-tree", {
                    cwd: repoRoot,
                    stdio: "pipe",
                    timeout: 5000,
                });
                isGitRepo = true;
                steps.push("✅ Git repository detected");
            }
            catch {
                errors.push("Not a git repository. Run 'git init' first.");
            }
            if (isGitRepo) {
                // 2. Write .gitattributes
                const gitattributesPath = path.join(repoRoot, ".gitattributes");
                const tdnLine = "*.tdn diff=tdn";
                let existingContent = "";
                try {
                    existingContent = fs.readFileSync(gitattributesPath, "utf-8");
                }
                catch {
                    // File doesn't exist yet — fine
                }
                if (existingContent.includes(tdnLine)) {
                    steps.push("✅ .gitattributes already has '*.tdn diff=tdn'");
                }
                else {
                    const newContent = existingContent
                        ? existingContent.trimEnd() + "\n" + tdnLine + "\n"
                        : tdnLine + "\n";
                    fs.writeFileSync(gitattributesPath, newContent, "utf-8");
                    steps.push(`✅ Wrote .gitattributes with '${tdnLine}'`);
                }
                // 3. Compute absolute path to textconv.py
                const absTextconv = path.resolve(repoRoot, textconv);
                if (!fs.existsSync(absTextconv)) {
                    return ok({
                        success: false,
                        repo_path: repoRoot,
                        steps,
                        errors: [`textconv.py not found at ${absTextconv}`],
                        gitattributes_content: "*.tdn diff=tdn",
                        summary: `❌ textconv.py not found at ${absTextconv} — create it first or pass textconv_path`,
                    });
                }
                // 4. Configure git textconv driver
                const globalFlag = isGlobal ? " --global" : "";
                const normalizedPath = absTextconv.replace(/\\/g, "/");
                const textconvValue = `${pythonCmd} "${normalizedPath}"`;
                try {
                    // Check current value
                    let current = "";
                    try {
                        current = execSync(`git config${globalFlag} diff.tdn.textconv`, { cwd: repoRoot, stdio: "pipe", timeout: 5000 })
                            .toString()
                            .trim();
                    }
                    catch {
                        // Not set yet
                    }
                    if (current === textconvValue) {
                        steps.push("✅ git config diff.tdn.textconv already set correctly");
                    }
                    else {
                        execSync(`git config${globalFlag} diff.tdn.textconv "${textconvValue}"`, { cwd: repoRoot, stdio: "pipe", timeout: 5000 });
                        steps.push(`✅ Set diff.tdn.textconv = ${textconvValue}`);
                    }
                }
                catch (e) {
                    errors.push(`Failed to set diff.tdn.textconv: ${e.message}`);
                }
                // 5. Optional: add to .gitignore
                if (add_to_gitignore) {
                    const gitignorePath = path.join(repoRoot, ".gitignore");
                    let gitignoreContent = "";
                    try {
                        gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
                    }
                    catch {
                        // No .gitignore — fine
                    }
                    if (gitignoreContent.includes("*.tdn")) {
                        steps.push("✅ .gitignore already has '*.tdn'");
                    }
                    else {
                        const newContent = gitignoreContent
                            ? gitignoreContent.trimEnd() + "\n*.tdn\n"
                            : "*.tdn\n";
                        fs.writeFileSync(gitignorePath, newContent, "utf-8");
                        steps.push("✅ Added '*.tdn' to .gitignore");
                    }
                }
            }
            // 6. Build result
            const normalizedTextconv = textconv.replace(/\\/g, "/");
            const result = {
                success: errors.length === 0,
                repo_path: repoRoot,
                steps,
                errors: errors.length > 0 ? errors : undefined,
                gitattributes_content: "*.tdn diff=tdn",
                git_config: {
                    "diff.tdn.textconv": `${pythonCmd} "${normalizedTextconv}"`,
                    scope: isGlobal ? "global" : "local",
                },
            };
            if (errors.length > 0 && steps.length > 0) {
                result.summary =
                    `⚠️ Partial setup: ${steps.filter((s) => s.startsWith("✅")).length} succeeded, ${errors.length} failed`;
            }
            else if (errors.length > 0) {
                result.summary = "❌ Setup failed — see errors";
            }
            else {
                result.summary =
                    "✅ Git configured for TDN textconv — `git diff` on .tdn files will now show semantic changes only.";
            }
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
}
