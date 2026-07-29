
    def _handle_document(self, request: dict, response: dict) -> dict:
        """Handle POST /document — auto-document a container network.

        Walks all operators in the given container path, generating a
        natural language description of the network including:
        - Overall purpose / summary
        - Operator list with roles
        - Connection descriptions
        - Parameter values
        - ASCII art connection diagram
        """
        try:
            payload = json.loads(request.get("data", "") or "{}")
        except:
            payload = request.get("pars", {})
        container_path = payload.get("path", "/project1")

        code = rf'''import json

try:
    container = op('{container_path}')
    if container is None:
        print(json.dumps({{'error': 'Container not found: {container_path}'}}))
    else:
        children = list(container.children)
        ops_info = []
        connections = []
        params = {{}}
        total_errors = 0

        for c in children:
            errs = []
            try:
                e = c.errors()
                if e:
                    if isinstance(e, (list, tuple)):
                        errs = [str(x) for x in e if x]
                    else:
                        errs = [str(e)]
            except:
                pass
            if errs:
                total_errors += 1

            # Determine role based on type and connections
            ctype = str(c.type) if hasattr(c, 'type') else str(c.OPType) if hasattr(c, 'OPType') else 'unknown'
            cfam = str(c.family) if hasattr(c, 'family') else 'unknown'

            # Check if it has outputs connected
            has_output = False
            try:
                for oc in c.outputConnectors:
                    if oc.connections:
                        has_output = True
                        break
            except:
                pass

            # Check if it has inputs
            has_input = False
            try:
                for ic in c.inputConnectors:
                    if ic.connections:
                        has_input = True
                        break
            except:
                pass

            # Determine role
            if not has_input and has_output:
                role = "source"
            elif has_input and has_output:
                role = "processor"
            elif has_input and not has_output:
                role = "sink / output"
            elif not has_input and not has_output:
                role = "standalone"
            else:
                role = "unknown"

            ops_info.append({{
                'path': c.path,
                'name': c.name,
                'type': ctype,
                'family': cfam,
                'role': role,
                'error_count': len(errs),
                'errors': errs,
            }})

            # Collect parameters (first 10 significant ones)
            op_params = {{}}
            try:
                count = 0
                for p in c.pars():
                    if count >= 15:
                        break
                    try:
                        val = p.eval()
                        if val is not None and val != '':
                            op_params[p.name] = str(val)
                            count += 1
                    except:
                        pass
            except:
                pass
            if op_params:
                params[c.path] = op_params

        # Build connections list
        for c in children:
            try:
                for idx, ic in enumerate(c.inputConnectors):
                    if ic.connections:
                        src = ic.connections[0].owner
                        src_name = src.name
                        connections.append({{
                            'from': src.path,
                            'from_name': src_name,
                            'to': c.path,
                            'to_name': c.name,
                            'input_index': idx,
                        }})
            except:
                pass

        # Build ASCII diagram
        # Group by depth (topological sort based on connections)
        in_degree = {{c.path: 0 for c in children}}
        adj = {{c.path: [] for c in children}}
        path_map = {{c.path: c.name for c in children}}

        for conn in connections:
            f = conn['from']
            t = conn['to']
            if f in adj:
                adj[f].append(t)
            if t in in_degree:
                in_degree[t] += 1

        # Topological sort
        queue = [p for p, d in in_degree.items() if d == 0]
        sorted_paths = []
        while queue:
            node = queue.pop(0)
            sorted_paths.append(node)
            for nxt in adj.get(node, []):
                if nxt in in_degree:
                    in_degree[nxt] -= 1
                    if in_degree[nxt] == 0:
                        queue.append(nxt) if nxt not in queue else None

        for p in path_map:
            if p not in sorted_paths:
                sorted_paths.append(p)

        # Create ASCII diagram
        depth = {{}}
        for p in sorted_paths:
            max_d = 0
            for conn in connections:
                if conn['to'] == p:
                    src_d = depth.get(conn['from'], -1)
                    max_d = max(max_d, src_d + 1)
            depth[p] = max_d

        diagram_lines = []
        by_depth = {{}}
        for p in sorted_paths:
            d = depth.get(p, 0)
            if d not in by_depth:
                by_depth[d] = []
            by_depth[d].append(path_map.get(p, p))

        for d in sorted(by_depth.keys()):
            col_label = f"Column {{d+1}}"
            ops_in_col = ", ".join(by_depth[d])
            diagram_lines.append(f"  {{col_label}}: [{{ops_in_col}}]")

        # Arrows between columns
        for conn in connections:
            sd = depth.get(conn['from'], 0)
            dd = depth.get(conn['to'], 0)
            if dd > sd:
                diagram_lines.append(
                    f"    {{conn['from_name']}} ──→ {{conn['to_name']}} (input {{conn['input_index']}})"
                )

        if not diagram_lines:
            diagram_lines.append("  (no connections)")

        diagram = "\\n".join(diagram_lines)

        # Generate summary
        fam_counts = {{}}
        role_counts = {{}}
        for o in ops_info:
            fam_counts[o['family']] = fam_counts.get(o['family'], 0) + 1
            role_counts[o['role']] = role_counts.get(o['role'], 0) + 1

        fam_str = ", ".join(f"{{k}}: {{v}}" for k, v in sorted(fam_counts.items()))
        role_str = ", ".join(f"{{k}}: {{v}}" for k, v in sorted(role_counts.items()))
        source_names = [o['name'] for o in ops_info if o['role'] == 'source']
        processor_names = [o['name'] for o in ops_info if o['role'] == 'processor']
