#!/usr/bin/env python3
"""
Convert Toe_Expand .toe.dir projects to .webtoe.json format.
Reads the .n (node), .parm (params), .network (wires) file format
and outputs WebToe-compatible JSON.
"""

import json
import os
import re
import sys

# ── Config ──────────────────────────────────────────────────────────────────
TOE_EXPAND = "C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/old/mcp_td_v3/Toe_Expand/Toe_Expand"
WEBTOE_EXAMPLES = "C:/Users/Tolch/Documents/AI_Code/WebToe/apps/web/public/examples"

TOP_5 = [
    ("POPsGuide.0.0", 2294),
    ("trail_sm_lookUpAttributeMaybeSolution.6", 1966),
    ("SolidGeometrySketches_30770", 1907),
    ("JPOPsDev", 1734),
    ("yfx-pop-workshop-1.0.68", 1489),
]

# ── Family & Type mapping ───────────────────────────────────────────────────
# TouchDesigner operator prefix -> WebToe family
FAMILY_PREFIX = {
    "TOP:": "TOP", "COMP:": "COMP", "CHOP:": "CHOP",
    "SOP:": "SOP", "POP:": "POP", "DAT:": "DAT",
    "MAT:": "MAT", "PANEL:": "PANEL",
}

# Type suffix stripping for canonical WebToe names
# E.g. "TOP:noise" -> "top:noise", "POP:particle" -> "pop:particle"
def normalize_type(raw_type):
    """Convert 'TOP:noise' -> 'top:noise', 'POP:particle' -> 'pop:particle'"""
    raw_type = raw_type.strip()
    for prefix, family in FAMILY_PREFIX.items():
        if raw_type.startswith(prefix):
            op_name = raw_type[len(prefix):].lower()
            return f"{family.lower()}:{op_name}"
    # Fallback: treat as-is
    return raw_type.lower()

def get_family(raw_type):
    """Extract family name from raw type string."""
    raw_type = raw_type.strip()
    for prefix, family in FAMILY_PREFIX.items():
        if raw_type.startswith(prefix):
            return family
    return "COMP"  # default

# ── Parsers ─────────────────────────────────────────────────────────────────

def parse_n_file(filepath):
    """Parse a .n node file. Returns dict with type, pos, flags, text, or None."""
    if not os.path.isfile(filepath):
        return None
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return None

    if not lines:
        return None

    node = {"type": None, "pos": None, "flags": {}, "has_text": False, "has_table": False,
            "inputs": [], "comment": None, "tile": None}

    in_section = False

    for line in lines:
        line = line.strip()
        if line.startswith("COMP:") or line.startswith("TOP:") or line.startswith("CHOP:") or \
           line.startswith("SOP:") or line.startswith("POP:") or line.startswith("DAT:") or \
           line.startswith("MAT:") or line.startswith("PANEL:"):
            node["type"] = line.rstrip()
        elif line.startswith("v "):
            parts = line[2:].split()
            if len(parts) >= 2:
                try:
                    node["pos"] = [float(parts[0]), float(parts[1])]
                except ValueError:
                    pass
        elif line.startswith("comment "):
            comment_text = line[8:]
            if comment_text.startswith('"') and comment_text.endswith('"'):
                comment_text = comment_text[1:-1]
            node["comment"] = comment_text
        elif line.startswith("tile "):
            parts = line[5:].split()
            if len(parts) >= 4:
                try:
                    node["tile"] = [int(float(parts[0])), int(float(parts[1])),
                                    int(float(parts[2])), int(float(parts[3]))]
                except ValueError:
                    pass
        elif line.startswith("flags = "):
            flags_str = line[8:]
            for fpair in flags_str.split():
                if "=" in fpair:
                    k, v = fpair.split("=", 1)
                    node["flags"][k] = True if v == "1" else (False if v == "0" else v)
        elif line.startswith("inputs"):
            in_section = True
        elif in_section and line.startswith("}"):
            in_section = False
        elif in_section and line and line[0].isdigit():
            parts = line.split("\t")
            if len(parts) >= 2:
                node["inputs"].append(parts[1].strip())

    return node

def parse_parm_file(filepath):
    """Parse a .parm file. Returns dict of param_name -> value info."""
    if not os.path.isfile(filepath):
        return {}
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
    except Exception:
        return {}

    params = {}
    lines = content.split("\n")
    for line in lines:
        line = line.strip()
        if not line or line == "?":
            continue
        parts = line.split(None, 2)
        if len(parts) >= 2:
            name = parts[0]
            val = parts[-1] if len(parts) == 3 else None
            params[name] = val
    return params

def parse_network_file(filepath, parent_path_segments):
    """Parse a .network file. Returns list of wire dicts with resolved node names."""
    if not os.path.isfile(filepath):
        return []
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return []

    wires = []
    in_section = False
    for line in lines:
        line = line.strip()
        if line == "compinputs":
            in_section = True
            continue
        if line == "end" and in_section:
            in_section = False
            continue
        if in_section and line and line[0].isdigit():
            parts = line.split("\t")
            if len(parts) >= 2:
                target_path = parts[1].strip()
                # Target could be "Render/out1" or "null3" etc.
                # Resolve relative to parent container
                target_segments = target_path.split("/")
                resolved_name = "_".join(parent_path_segments + target_segments)
                wires.append({"target": target_path, "segments": target_segments, 
                              "resolved": resolved_name})

    return wires


def parse_cparm_file(filepath):
    """Parse .cparm (container parm) file."""
    return parse_parm_file(filepath)


# ── Main converter ──────────────────────────────────────────────────────────

def scan_toe_dir(toe_dir_path):
    """Scan a .toe.dir directory and build a complete network model."""
    # Map of node name (relative to toe.dir) -> node info
    nodes = {}
    # Map of container path -> list of wire dicts
    wires_by_container = {}
    # Map of node name -> parm dict
    parms = {}
    
    all_files = []
    for root, dirs, files in os.walk(toe_dir_path):
        for f in files:
            all_files.append(os.path.join(root, f))
    
    # Process .n files
    for fp in all_files:
        rel = os.path.relpath(fp, toe_dir_path)
        if not rel.endswith(".n"):
            continue
        
        base_name = rel[:-2]  # strip .n
        node = parse_n_file(fp)
        if node and node["type"]:
            # Convert file path to a WebToe node name
            # e.g., "local/maps/replicator1" -> segment path
            segments = base_name.replace("\\", "/").split("/")
            node_name = "_".join(segments)
            
            node["file_base"] = base_name
            node["segments"] = segments
            
            # Also check for associated .parm, .text, .table files
            parm_path = fp[:-1] + "parm"  # .n -> .parm
            if os.path.isfile(parm_path):
                node["has_parm"] = True
                p = parse_parm_file(parm_path)
                if p:
                    parms[node_name] = p
            else:
                node["has_parm"] = False
            
            text_path = fp[:-1] + "text"
            node["has_text"] = os.path.isfile(text_path)
            
            table_path = fp[:-1] + "table"
            node["has_table"] = os.path.isfile(table_path)
            
            nodes[node_name] = node
    
    # Process .network files
    for fp in all_files:
        rel = os.path.relpath(fp, toe_dir_path)
        if not rel.endswith(".network"):
            continue
        
        base_name = rel[:-8]  # strip .network
        segments = base_name.replace("\\", "/").split("/")
        
        # The network file belongs to a COMP that has these connections
        container_name = "_".join(segments)
        wires = parse_network_file(fp, segments)
        if wires:
            wires_by_container[container_name] = wires
    
    return nodes, parms, wires_by_container


def build_webtoe_json(project_name, nodes, parms, wires_by_container):
    """Build a .webtoe.json structure from parsed data."""
    
    # Flatten all nodes into WebToe format with position + params
    webtoe_nodes = []
    webtoe_wires = []
    node_name_set = set()
    
    # For tracking wire connections
    # Map: node_segments_tuple -> node_name
    seg_to_name = {}
    for nname, ninfo in nodes.items():
        seg_to_name[tuple(ninfo["segments"])] = nname
        node_name_set.add(nname)
    
    # Sort nodes by path depth for hierarchical processing
    sorted_nodes = sorted(nodes.items(), key=lambda x: len(x[1]["segments"]))
    
    # Group nodes by their parent container
    container_children = {}  # parent_segments_string -> list of child node names
    
    for nname, ninfo in sorted_nodes:
        segs = ninfo["segments"]
        if len(segs) > 1:
            parent = "_".join(segs[:-1])
            if parent not in container_children:
                container_children[parent] = []
            container_children[parent].append(nname)
        else:
            if "" not in container_children:
                container_children[""] = []
            container_children[""].append(nname)
    
    # Identify which nodes are containers (have children)
    container_set = set(container_children.keys()) - {""}
    
    def make_node_entry(nname, ninfo, depth=0):
        """Create a WebToe node entry."""
        entry = {
            "name": nname,
            "type": normalize_type(ninfo["type"]),
            "family": get_family(ninfo["type"]),
            "pos": ninfo["pos"] if ninfo["pos"] else [depth * 200, 0],
        }
        
        # Add flags if display is true
        if ninfo["flags"].get("display"):
            entry["flags"] = {"display": True}
        
        # Add params from .parm file (key ones only)
        if nname in parms and parms[nname]:
            webtoe_params = {}
            p = parms[nname]
            
            # Map common TouchDesigner parameter names to WebToe format
            for pname, pval in p.items():
                # Skip internal params
                if pname in ("display", "enable", "nodeview", "opviewer", "topsmoothness", "borderover"):
                    continue
                if pval is None:
                    continue
                # Simple value mapping
                try:
                    fval = float(pval)
                    webtoe_params[pname] = {"mode": "const", "value": fval}
                except (ValueError, TypeError):
                    # Try boolean
                    if pval.lower() in ("on", "true", "1"):
                        webtoe_params[pname] = {"mode": "const", "value": True}
                    elif pval.lower() in ("off", "false", "0"):
                        webtoe_params[pname] = {"mode": "const", "value": False}
                    else:
                        # String value - only include short meaningful ones
                        if len(pval) < 60:
                            webtoe_params[pname] = {"mode": "const", "value": pval}
            
            if webtoe_params:
                entry["params"] = webtoe_params
        
        # Add text content if the node has text
        if ninfo.get("has_text"):
            entry["text"] = f"(text content from {ninfo['file_base']}.text)"
        
        # Recursively add children if this is a container
        if nname in container_children:
            children = []
            for cnname in container_children[nname]:
                if cnname in nodes:
                    cinfo = nodes[cnname]
                    child_entry = make_node_entry(cnname, cinfo, depth + 1)
                    if child_entry:
                        children.append(child_entry)
            if children:
                entry["children"] = children
        
        return entry
    
    # Build root-level nodes (those with single segment or no parent container)
    root_nodes = []
    for nname in sorted(nodes.keys()):
        segs = nodes[nname]["segments"]
        if len(segs) == 1 or "_".join(segs[:-1]) not in container_set:
            # Root-level node or container that's at root
            entry = make_node_entry(nname, nodes[nname])
            if entry:
                root_nodes.append(entry)
    
    # We have dupes since make_node_entry recursively adds children.
    # Let's only add root-level nodes that aren't already children of a root container.
    # Simplify: just use the flat node list
    
    # Actually, let me switch approach: flat list is simpler for WebToe
    # But containers with children are nested in the format
    # Let me do a mixed approach: flat for simple, nested for containers
    
    # Simpler approach: flat node list
    webtoe_nodes_flat = []
    for nname, ninfo in sorted(nodes.items()):
        try:
            entry = {
                "name": nname,
                "type": normalize_type(ninfo["type"]),
                "family": get_family(ninfo["type"]),
                "pos": ninfo["pos"] if ninfo["pos"] else [0, 0],
            }
            
            if ninfo["flags"].get("display"):
                entry["flags"] = {"display": True}
            
            if nname in parms and parms[nname]:
                webtoe_params = {}
                for pname, pval in parms[nname].items():
                    if pname in ("display", "enable", "nodeview", "opviewer", "topsmoothness", "borderover"):
                        continue
                    if pval is None:
                        continue
                    try:
                        fval = float(pval)
                        webtoe_params[pname] = {"mode": "const", "value": fval}
                    except (ValueError, TypeError):
                        if pval.lower() in ("on", "true", "1"):
                            webtoe_params[pname] = {"mode": "const", "value": True}
                        elif pval.lower() in ("off", "false", "0"):
                            webtoe_params[pname] = {"mode": "const", "value": False}
                        elif len(pval) < 60:
                            webtoe_params[pname] = {"mode": "const", "value": pval}
                if webtoe_params:
                    entry["params"] = webtoe_params
            
            if ninfo.get("has_text"):
                entry["text"] = f"<text from {ninfo['file_base']}.text>"
            
            webtoe_nodes_flat.append(entry)
        except Exception:
            continue
    
    # Build wires from the network files
    for cont_name, wlist in wires_by_container.items():
        for w in wlist:
            target_path_full = "/".join(w["segments"])
            # The source is the container node itself
            # The target is the connected node
            # Try to resolve the connection
            source_name = cont_name
            to_name = w["resolved"]
            
            if source_name in node_name_set:
                webtoe_wires.append({
                    "from": f"{source_name}:0",
                    "to": f"{to_name}:0"
                })
    
    # Also build wires from inputs in .n files
    for nname, ninfo in nodes.items():
        for i, inp in enumerate(ninfo.get("inputs", [])):
            # Input is a relative path like "noise1" or "../render/out1"
            # Try to find the referenced node
            input_segments = inp.split("/")
            # Resolve relative to current node's parent
            current_segs = ninfo["segments"]
            
            # Simple resolution: try absolute first, then relative
            resolved_name = "_".join(input_segments)
            if resolved_name in node_name_set:
                webtoe_wires.append({
                    "from": f"{resolved_name}:0",
                    "to": f"{nname}:{i}"
                })
            else:
                # Try relative to parent
                for depth_back in range(len(current_segs)):
                    parent_base = "_".join(current_segs[:-(depth_back + 1)])
                    candidate = f"{parent_base}_{resolved_name}" if parent_base else resolved_name
                    if candidate in node_name_set:
                        webtoe_wires.append({
                            "from": f"{candidate}:0",
                            "to": f"{nname}:{i}"
                        })
                        break
    
    # Deduplicate wires
    seen_wires = set()
    unique_wires = []
    for w in webtoe_wires:
        key = (w["from"], w["to"])
        if key not in seen_wires:
            seen_wires.add(key)
            unique_wires.append(w)
    
    # Build JSON
    result = {
        "app": "webtoe",
        "version": 1,
        "root": {
            "nodes": webtoe_nodes_flat,
            "wires": unique_wires,
        },
        "meta": {
            "title": project_name,
            "comment": f"Imported from Toe_Expand/{project_name} — {len(nodes)} operators, {len(unique_wires)} connections",
            "source": f"Toe_Expand/{project_name}",
            "node_count": len(nodes),
            "wire_count": len(unique_wires),
        }
    }
    
    return result


def get_node_type_stats(nodes):
    """Get statistics about node types in the project."""
    families = {}
    types = {}
    for nname, ninfo in nodes.items():
        f = get_family(ninfo["type"])
        t = normalize_type(ninfo["type"])
        families[f] = families.get(f, 0) + 1
        types[t] = types.get(t, 0) + 1
    return families, types


def write_import_report(output_dir):
    """Write a comprehensive import report."""
    report_lines = [
        "# WebToe Import Report: Toe_Expand Project Conversion",
        "",
        f"Source: {TOE_EXPAND}",
        f"Destination: {output_dir}",
        "",
        "## Imported Projects",
        "",
        "| # | Project | Nodes | Wires | Families | Types | Size |",
        "|---|---------|-------|-------|----------|-------|------|",
    ]
    
    total_nodes = 0
    total_wires = 0
    
    for i, (pname, _) in enumerate(TOP_5, 1):
        fpath = os.path.join(output_dir, f"11-import-{pname.lower().replace(' ', '_')}.webtoe.json")
        if os.path.isfile(fpath):
            with open(fpath, 'r') as f:
                data = json.load(f)
            ncount = len(data["root"]["nodes"])
            wcount = len(data["root"]["wires"])
            fsize = os.path.getsize(fpath)
            families = set(n["family"] for n in data["root"]["nodes"])
            types = set(n["type"] for n in data["root"]["nodes"])
            total_nodes += ncount
            total_wires += wcount
            report_lines.append(
                f"| {i} | {pname} | {ncount} | {wcount} | {', '.join(sorted(families))} | {len(types)} types | {fsize/1024:.1f} KB |"
            )
    
    report_lines.extend([
        "",
        f"**Totals: {total_nodes} nodes, {total_wires} wires across {len(TOP_5)} projects**",
        "",
        "## Family Coverage",
        "",
        "Nodes per family across all projects:",
        "",
    ])
    
    # Aggregate family counts
    all_families = {}
    for pname, _ in TOP_5:
        fpath = os.path.join(output_dir, f"11-import-{pname.lower().replace(' ', '_')}.webtoe.json")
        if os.path.isfile(fpath):
            with open(fpath, 'r') as f:
                data = json.load(f)
            for n in data["root"]["nodes"]:
                f = n["family"]
                all_families[f] = all_families.get(f, 0) + 1
    
    for f, count in sorted(all_families.items()):
        report_lines.append(f"- {f}: {count}")
    
    report_lines.extend([
        "",
        "## Type Coverage (Top 30 by count)",
        "",
        "| Type | Count |",
        "|------|-------|",
    ])
    
    all_types = {}
    for pname, _ in TOP_5:
        fpath = os.path.join(output_dir, f"11-import-{pname.lower().replace(' ', '_')}.webtoe.json")
        if os.path.isfile(fpath):
            with open(fpath, 'r') as f:
                data = json.load(f)
            for n in data["root"]["nodes"]:
                t = n["type"]
                all_types[t] = all_types.get(t, 0) + 1
    
    for t, count in sorted(all_types.items(), key=lambda x: -x[1])[:30]:
        report_lines.append(f"| {t} | {count} |")
    
    report_lines.extend([
        "",
        "## Notes",
        "",
        "- Parameters are stubbed with default values from .parm files where available",
        "- Wire connections derived from .network files and inputs in .n files",
        "- Container hierarchy is flattened — all nodes are root-level with fully qualified names",
        "- Text/script content (DAT, GLSL) is referenced but not fully embedded",
        "- Complex COMP containers treated as flat node entries",
        "- Some file paths may have had their `.toe.dir` at slightly different nest levels",
    ])
    
    report_path = os.path.join(output_dir, "IMPORT_REPORT.md")
    with open(report_path, 'w') as f:
        f.write("\n".join(report_lines))
    
    return report_path


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(WEBTOE_EXAMPLES, exist_ok=True)
    
    results = {}
    
    for pname, expected_nodes in TOP_5:
        # Try multiple paths for .toe.dir
        possible_paths = [
            os.path.join(TOE_EXPAND, pname, f"{pname}.toe.dir"),
            os.path.join(TOE_EXPAND, f"{pname}.toe.dir"),
            os.path.join(TOE_EXPAND, pname),
        ]
        
        toe_dir_path = None
        for pp in possible_paths:
            if os.path.isdir(pp):
                # Check if this is a .toe.dir (has .n files directly or in subdirs)
                items = [f for f in os.listdir(pp) if f.endswith(".n")]
                if items or os.path.isdir(pp):
                    # Check subdirs
                    sub_items = []
                    for r, d, files in os.walk(pp):
                        sub_items.extend(f for f in files if f.endswith(".n"))
                    if sub_items:
                        toe_dir_path = pp
                        break
        
        if not toe_dir_path:
            print(f"❌ Could not find .toe.dir for {pname}")
            # Try the inner Toe_Expand/Toe_Expand structure
            inner_path = os.path.join(TOE_EXPAND, pname)
            if os.path.isdir(inner_path):
                inner_dirs = [d for d in os.listdir(inner_path) if d.endswith(".toe.dir")]
                if inner_dirs:
                    toe_dir_path = os.path.join(inner_path, inner_dirs[0])
            
        if not toe_dir_path:
            print(f"❌ Still could not find .toe.dir for {pname}")
            continue
        
        print(f"📁 Scanning {pname} at {toe_dir_path}")
        nodes, parms, wires_by_container = scan_toe_dir(toe_dir_path)
        
        print(f"   Found {len(nodes)} nodes, {len(parms)} param sets, {len(wires_by_container)} network files")
        
        if len(nodes) < 10:
            print(f"   ⚠️  Very few nodes ({len(nodes)}), may be incomplete")
        
        # Build WebToe JSON
        webtoe_data = build_webtoe_json(pname, nodes, parms, wires_by_container)
        families, types = get_node_type_stats(nodes)
        
        print(f"   Families: {dict(families)}")
        print(f"   Unique types: {len(types)}")
        
        # Write output
        safe_name = pname.lower().replace(" ", "_").replace(".", "_")
        out_file = os.path.join(WEBTOE_EXAMPLES, f"11-import-{safe_name}.webtoe.json")
        
        with open(out_file, 'w') as f:
            json.dump(webtoe_data, f, indent=1)
        
        fsize = os.path.getsize(out_file)
        print(f"   ✅ Wrote {out_file} ({fsize/1024:.1f} KB, {len(webtoe_data['root']['nodes'])} nodes, {len(webtoe_data['root']['wires'])} wires)")
        
        results[pname] = {
            "file": out_file,
            "nodes": len(webtoe_data["root"]["nodes"]),
            "wires": len(webtoe_data["root"]["wires"]),
            "families": families,
            "types": len(types),
            "size_kb": fsize / 1024,
        }
    
    # Write import report
    report_path = write_import_report(WEBTOE_EXAMPLES)
    print(f"\n📄 Import report: {report_path}")
    
    # Summary
    print("\n" + "="*60)
    print("CONVERSION SUMMARY")
    print("="*60)
    total_n = sum(r["nodes"] for r in results.values())
    total_w = sum(r["wires"] for r in results.values())
    for pname, r in results.items():
        print(f"  {pname}: {r['nodes']} nodes, {r['wires']} wires, {r['size_kb']:.1f} KB")
    print(f"  TOTAL: {total_n} nodes, {total_w} wires across {len(results)} projects")


if __name__ == "__main__":
    main()
