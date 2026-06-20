import { z } from "zod";
import { ok, err } from "../helpers.js";
export function registerInspectionTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_pane
    // ---------------------------------------------------------------------------
    server.registerTool("td_pane", {
        title: "Get Pane State",
        description: "Get the current network editor pane state including the network path, position (x, y), and zoom level.",
        inputSchema: {},
    }, async () => {
        try {
            const result = await client.getPaneState();
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_selection
    // ---------------------------------------------------------------------------
    server.registerTool("td_selection", {
        title: "Get Selection",
        description: "Get the currently selected operators in the network editor. Returns operator info including path, name, type, and family.",
        inputSchema: {},
    }, async () => {
        try {
            const result = await client.getSelection();
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_operators
    // ---------------------------------------------------------------------------
    server.registerTool("td_operators", {
        title: "List Operators",
        description: "List all child operators at the specified path. Returns operator info including name, type, and opType.",
        inputSchema: {
            path: z
                .string()
                .optional()
                .describe("Operator path (default: '/')"),
        },
    }, async ({ path: opPath }) => {
        try {
            const result = await client.getOperators(opPath ?? "/");
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_find
    // ---------------------------------------------------------------------------
    server.registerTool("td_find", {
        title: "Find Operators",
        description: "Find operators by query, name, family or operator type within a network path.",
        inputSchema: {
            path: z.string().optional().describe("Base path"),
            query: z.string().optional().describe("Free text query"),
            name: z.string().optional().describe("Name substring"),
            family: z.string().optional().describe("Family filter"),
            opType: z.string().optional().describe("Operator type substring"),
            recursive: z
                .boolean()
                .optional()
                .describe("Search descendants recursively"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(200)
                .optional()
                .describe("Max results"),
        },
    }, async (args) => {
        try {
            const result = await client.findOperators(args);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_connections
    // ---------------------------------------------------------------------------
    server.registerTool("td_connections", {
        title: "Inspect Connections",
        description: "Inspect real input/output connections for an operator or a whole network subtree.",
        inputSchema: {
            path: z.string().describe("Operator or container path"),
            recurse: z
                .boolean()
                .optional()
                .describe("Include descendants recursively"),
        },
    }, async ({ path: opPath, recurse }) => {
        try {
            const result = await client.getConnections(opPath, recurse ?? false);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_errors
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_errors", {
        title: "Get Errors",
        description: "Get errors and warnings from a TouchDesigner operator or entire network. Force-cooks each operator and reports issues.",
        inputSchema: {
            path: z.string().describe("Operator path to inspect"),
            recurse: z
                .boolean()
                .optional()
                .default(true)
                .describe("Recurse into child operators (default: true)"),
        },
    }, async ({ path: opPath, recurse }) => {
        try {
            const result = await client.getErrors(opPath, recurse ?? true);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_healthcheck
    // ---------------------------------------------------------------------------
    server.registerTool("td_healthcheck", {
        title: "Healthcheck Network",
        description: "Force-cook and validate a TouchDesigner operator/network, reporting errors, warnings and per-operator issues.",
        inputSchema: {
            path: z.string().describe("Operator path"),
            recurse: z
                .boolean()
                .optional()
                .default(false)
                .describe("Validate descendants recursively (default: false)"),
        },
    }, async ({ path: opPath, recurse }) => {
        try {
            const result = await client.healthcheck(opPath, recurse ?? false);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_node_detail
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_node_detail", {
        title: "Get Node Detail",
        description: "Get detailed information about a TouchDesigner operator: parameters, inputs, flags, and optionally recursive children.",
        inputSchema: {
            path: z.string().describe("Operator path"),
            recurse: z
                .boolean()
                .optional()
                .default(false)
                .describe("Include children recursively"),
        },
    }, async ({ path: opPath, recurse }) => {
        try {
            const result = await client.getNodeDetail(opPath, recurse ?? false);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_hints
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_hints", {
        title: "Get Operator Hints",
        description: "Get hints and wiring guidance for a specific TouchDesigner operator type.",
        inputSchema: {
            node_type: z
                .string()
                .describe("Operator type (e.g. 'noiseTOP')"),
        },
    }, async ({ node_type }) => {
        try {
            const result = await client.getHints(node_type);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_info
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_info", {
        title: "Get TD Info",
        description: "Get TouchDesigner environment info: build version, date, commercial status, platform.",
        inputSchema: {},
    }, async () => {
        try {
            const result = await client.getInfo();
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_focus
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_focus", {
        title: "Get Focus",
        description: "Get the current user focus in TouchDesigner: which network is open, selected operators, current operator.",
        inputSchema: {},
    }, async () => {
        try {
            const result = await client.getFocus();
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_perf
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_perf", {
        title: "Get Performance",
        description: "Get performance data from TouchDesigner: FPS, cook budget, GPU memory, and slowest operators sorted by cook time.",
        inputSchema: {
            path: z
                .string()
                .optional()
                .describe("Path to profile (default: '/')"),
            top: z
                .number()
                .optional()
                .default(20)
                .describe("Number of slowest operators to return"),
        },
    }, async ({ path: opPath, top }) => {
        try {
            const result = await client.getPerf(opPath, top ?? 20);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_pop_inspect
    // ---------------------------------------------------------------------------
    server.registerTool("td_pop_inspect", {
        title: "Inspect POP Data",
        description: "Read particle data from a POP operator: point/prim/vert counts, attributes with types, and sampled attribute values.",
        inputSchema: {
            path: z.string().describe("POP operator path to inspect"),
        },
    }, async ({ path: opPath }) => {
        try {
            const result = await client.popInspect(opPath);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_build_compatibility
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_build_compatibility", {
        title: "Check Build Compatibility",
        description: "Check if a specific operator type exists in current TD build.",
        inputSchema: {
            op_type: z.string().describe("Operator type to check"),
        },
    }, async ({ op_type }) => {
        try {
            const result = await client.getBuildCompatibility(op_type);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_release_delta
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_release_delta", {
        title: "Get Release Delta",
        description: "Get information about what changed between TouchDesigner builds.",
        inputSchema: {
            build_from: z.string().describe("Source build version"),
            build_to: z
                .string()
                .optional()
                .describe("Target build version (default: current)"),
        },
    }, async ({ build_from, build_to }) => {
        try {
            const result = await client.getReleaseDelta(build_from, build_to);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_spatial_context
    // ---------------------------------------------------------------------------
    server.registerTool("td_spatial_context", {
        title: "Spatial Context",
        description: "Get the current spatial context in TouchDesigner for resolving *here and *this markers. " +
            "Returns: the active network path (*here), current operator (*this), parent path, " +
            "selected operators, sibling operators, and all open panes. " +
            "Use this when the user says *here, *this, or refers to their current view/selection.",
        inputSchema: {},
    }, async () => {
        try {
            const result = await client.getSpatialContext();
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_explore_project
    // ---------------------------------------------------------------------------
    server.registerTool("td_explore_project", {
        title: "Explore Project",
        description: "Get a comprehensive guided tour of a TouchDesigner project: operator count, " +
            "family breakdown, type distribution, errors, performance hotspots, GLSL shaders, " +
            "extensions, and custom parameters. Use this to understand an unknown project " +
            "before making changes. Equivalent to TWOZERO's 'Study this project'.",
        inputSchema: {
            path: z
                .string()
                .optional()
                .default("/")
                .describe("Root path to explore (default: '/')"),
        },
    }, async ({ path: opPath }) => {
        try {
            const result = await client.exploreProject(opPath ?? "/");
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_compare_networks
    // ---------------------------------------------------------------------------
    server.registerTool("td_compare_networks", {
        title: "Compare Two Networks",
        description: "Compare two container operators side-by-side: structure (operators present), " +
            "parameters (non-default values), and connections. Returns a structured diff " +
            "showing operators only in A, only in B, and shared operators with parameter " +
            "or connection differences.",
        inputSchema: {
            path_a: z.string().describe("First container path (e.g. '/project1/compA')"),
            path_b: z.string().describe("Second container path (e.g. '/project1/compB')"),
        },
    }, async ({ path_a, path_b }) => {
        try {
            const safeA = path_a.replace(/'/g, "\\\\'");
            const safeB = path_b.replace(/'/g, "\\\\'");
            const code = `import json
try:
    def introspect(container):
        """Collect operators, params, and connections from a container."""
        if container is None:
            return None
        ops = {}
        for child in container.children:
            if child is None:
                continue
            info = {
                'name': child.name,
                'type': child.OPType,
                'path': child.path,
                'pars': {},
                'inputs': [],
            }
            # Collect non-default parameters
            try:
                for p in child.pars:
                    try:
                        val = p.val
                        default = getattr(p, 'default', None)
                        mode = str(p.mode)
                        expr = p.expr if p.isExpression else None
                        is_default = (mode == 'CONSTANT' and val == default)
                        if not is_default or expr is not None:
                            info['pars'][p.name] = {
                                'val': val,
                                'expr': expr,
                                'mode': mode,
                                'default': default,
                            }
                    except:
                        pass
            except:
                pass
            # Collect input connections
            try:
                for idx, conn in enumerate(child.inputConnectors):
                    try:
                        src = conn.op
                        if src:
                            info['inputs'].append({
                                'index': idx,
                                'source': src.name,
                                'sourcePath': src.path,
                            })
                    except:
                        pass
            except:
                pass
            ops[child.name] = info
        return ops

    def compare_networks(a_path, b_path):
        comp_a = op(a_path)
        comp_b = op(b_path)

        if comp_a is None:
            return {'success': False, 'error': f'Container A not found: {a_path}'}
        if comp_b is None:
            return {'success': False, 'error': f'Container B not found: {b_path}'}

        ops_a = introspect(comp_a)
        ops_b = introspect(comp_b)

        names_a = set(ops_a.keys())
        names_b = set(ops_b.keys())

        only_a = sorted(names_a - names_b)
        only_b = sorted(names_b - names_a)
        shared = sorted(names_a & names_b)

        # Compare shared operators
        param_diffs = []
        connection_diffs = []

        for name in shared:
            a = ops_a[name]
            b = ops_b[name]

            # Type mismatch
            if a['type'] != b['type']:
                param_diffs.append({
                    'operator': name,
                    'kind': 'type_mismatch',
                    'type_a': a['type'],
                    'type_b': b['type'],
                })

            # Parameter diffs
            all_pars = set(a['pars'].keys()) | set(b['pars'].keys())
            for par_name in sorted(all_pars):
                pa = a['pars'].get(par_name)
                pb = b['pars'].get(par_name)
                if pa is None:
                    param_diffs.append({
                        'operator': name,
                        'parameter': par_name,
                        'kind': 'only_in_b',
                        'value_b': pb['val'] if pb else None,
                    })
                elif pb is None:
                    param_diffs.append({
                        'operator': name,
                        'parameter': par_name,
                        'kind': 'only_in_a',
                        'value_a': pa['val'] if pa else None,
                    })
                else:
                    # Both have the param — compare values
                    a_val = pa.get('expr') or pa.get('val')
                    b_val = pb.get('expr') or pb.get('val')
                    if str(a_val) != str(b_val):
                        param_diffs.append({
                            'operator': name,
                            'parameter': par_name,
                            'kind': 'value_diff',
                            'value_a': a_val,
                            'value_b': b_val,
                        })

            # Connection diffs
            inputs_a = {str(i['index']): i.get('source', '?') for i in a['inputs']}
            inputs_b = {str(i['index']): i.get('source', '?') for i in b['inputs']}
            all_inputs = sorted(set(inputs_a.keys()) | set(inputs_b.keys()))
            for idx in all_inputs:
                src_a = inputs_a.get(idx)
                src_b = inputs_b.get(idx)
                if src_a != src_b:
                    connection_diffs.append({
                        'operator': name,
                        'input_index': int(idx),
                        'source_a': src_a,
                        'source_b': src_b,
                    })

        # Summary
        total_diffs = len(only_a) + len(only_b) + len(param_diffs) + len(connection_diffs)
        summary_lines = []
        if only_a:
            summary_lines.append(f'{len(only_a)} operator(s) only in A')
        if only_b:
            summary_lines.append(f'{len(only_b)} operator(s) only in B')
        if param_diffs:
            summary_lines.append(f'{len(param_diffs)} parameter difference(s)')
        if connection_diffs:
            summary_lines.append(f'{len(connection_diffs)} connection difference(s)')
        if not summary_lines:
            summary_lines.append('Networks are identical')

        return {
            'success': True,
            'path_a': comp_a.path,
            'path_b': comp_b.path,
            'operators_a': len(ops_a),
            'operators_b': len(ops_b),
            'only_in_a': [{'name': n, 'type': ops_a[n]['type']} for n in only_a],
            'only_in_b': [{'name': n, 'type': ops_b[n]['type']} for n in only_b],
            'param_diffs': param_diffs,
            'connection_diffs': connection_diffs,
            'total_differences': total_diffs,
            'summary': '; '.join(summary_lines),
        }

    result = compare_networks('${safeA}', '${safeB}')
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`;
            const result = await client.execute(code, "/");
            if (!result.success) {
                const msg = result.error?.message ?? result.stderr ?? "Unknown error";
                return err(msg);
            }
            const parsed = JSON.parse(result.stdout.trim());
            return ok(parsed);
        }
        catch (e) {
            return err(e);
        }
    });
}
