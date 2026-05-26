/**
 * TouchDesigner HTTP API Client
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ExecuteResult {
  success: boolean;
  stdout: string;
  stderr: string;
  from_op: string;
  error?: {
    type: string;
    message: string;
  };
}

export interface PaneState {
  networkPath: string;
  x: number;
  y: number;
  zoom: number;
}

export interface OperatorInfo {
  path?: string;
  name: string;
  type: string;
  opType: string;
  family?: string;
}

export interface SelectionResult {
  operators: OperatorInfo[];
}

export interface OperatorsResult {
  path: string;
  operators: OperatorInfo[];
}

export interface ParameterInfo {
  name: string;
  label: string;
  style?: string;
  mode?: string;
  value: unknown;
  expr?: string | null;
  default?: unknown;
  isExpression: boolean;
  isPulse: boolean;
  menuNames?: string[];
  menuLabels?: string[];
}

export interface ParametersResult {
  path: string;
  operator: string;
  parameters: ParameterInfo[];
  missing: string[];
}

export interface ParameterUpdate {
  name: string;
  value?: unknown;
  expr?: string | null;
}

export interface ParameterSetResult {
  path: string;
  updated: ParameterInfo[];
  missing: string[];
  transactional: boolean;
}

export interface ConnectionOperatorInfo extends OperatorInfo {
  inputs: Array<{ index: number; path: string; name: string; opType: string }>;
  outputs: Array<{ path: string; name: string; opType: string }>;
}

export interface ConnectionsResult {
  path: string;
  recurse: boolean;
  operators: ConnectionOperatorInfo[];
}

export interface FindResult {
  path: string;
  query?: string;
  name?: string;
  family?: string;
  opType?: string;
  recursive: boolean;
  results: OperatorInfo[];
}

export interface HealthIssue {
  path: string;
  name: string;
  opType: string;
  family?: string;
  errors: string;
  warnings: string;
  hasIssues: boolean;
  cookTime?: number | null;
}

export interface HealthcheckResult {
  path: string;
  recurse: boolean;
  ok: boolean;
  issueCount: number;
  issues: HealthIssue[];
  operators: HealthIssue[];
}

/** Result from creating an operator via /execute */
export interface CreateOperatorResult {
  success: boolean;
  path: string;
  name: string;
  type: string;
  opType: string;
  family?: string;
  existing?: boolean;
  error?: string;
}

/** Result from deleting an operator via /execute */
export interface DeleteOperatorResult {
  success: boolean;
  path: string;
  error?: string;
}

/** Result from connecting nodes via /execute */
export interface ConnectNodesResult {
  success: boolean;
  sourcePath: string;
  targetPath: string;
  sourceOutput: string;
  targetInput: number;
  error?: string;
}

/** Per-operator error info */
export interface OperatorError {
  path: string;
  name: string;
  opType: string;
  errors: string;
  warnings: string;
  hasIssues: boolean;
  cookTime?: number | null;
}

/** Result from getErrors via /execute */
export interface GetErrorsResult {
  path: string;
  recurse: boolean;
  operators: OperatorError[];
  issueCount: number;
}

/** Result from screenshot via /execute */
export interface ScreenshotResult {
  success: boolean;
  path: string;
  image?: string; // base64-encoded PNG
  error?: string;
}

/** Result from project lifecycle via /execute */
export interface ProjectLifecycleResult {
  success: boolean;
  action: string;
  path?: string;
  message?: string;
  error?: string;
}

export interface TDClientOptions {
  host?: string;
  port?: number;
}

// -----------------------------------------------------------------------------
// TDClient
// -----------------------------------------------------------------------------

export class TDClient {
  private baseUrl: string;

  constructor(options: TDClientOptions = {}) {
    const host = options.host ?? "localhost";
    const port =
      options.port ?? parseInt(process.env.TDAPI_PORT ?? "44444", 10);
    this.baseUrl = `http://${host}:${port}`;
  }

  /** Execute Python code in TouchDesigner */
  async execute(code: string, fromOp: string = "/"): Promise<ExecuteResult> {
    let url = `${this.baseUrl}/execute`;
    if (fromOp !== "/") {
      url += `?from_op=${encodeURIComponent(fromOp)}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: code,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  /** Get current pane state (network path, position, zoom) */
  async getPaneState(): Promise<PaneState | null> {
    const response = await fetch(`${this.baseUrl}/editor/pane`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Get currently selected operators */
  async getSelection(): Promise<SelectionResult> {
    const response = await fetch(`${this.baseUrl}/editor/selection`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Get operators at specified path */
  async getOperators(path: string = "/"): Promise<OperatorsResult> {
    const url = `${this.baseUrl}/operators?path=${encodeURIComponent(path)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Get parameters for an operator */
  async getParameters(path: string, names?: string[]): Promise<ParametersResult> {
    const url = new URL(`${this.baseUrl}/parameters`);
    url.searchParams.set("path", path);
    if (names && names.length > 0) {
      url.searchParams.set("names", names.join(","));
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Set parameters for an operator */
  async setParameters(
    path: string,
    updates: ParameterUpdate[],
    transactional: boolean = true
  ): Promise<ParameterSetResult> {
    const response = await fetch(`${this.baseUrl}/parameters/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, updates, transactional }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Inspect input/output connections */
  async getConnections(path: string, recurse: boolean = false): Promise<ConnectionsResult> {
    const url = new URL(`${this.baseUrl}/connections`);
    url.searchParams.set("path", path);
    url.searchParams.set("recurse", recurse ? "1" : "0");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Find operators by query/name/family/type */
  async findOperators(options: {
    path?: string;
    query?: string;
    name?: string;
    family?: string;
    opType?: string;
    recursive?: boolean;
    limit?: number;
  }): Promise<FindResult> {
    const url = new URL(`${this.baseUrl}/find`);
    if (options.path) url.searchParams.set("path", options.path);
    if (options.query) url.searchParams.set("query", options.query);
    if (options.name) url.searchParams.set("name", options.name);
    if (options.family) url.searchParams.set("family", options.family);
    if (options.opType) url.searchParams.set("opType", options.opType);
    url.searchParams.set("recursive", options.recursive === false ? "0" : "1");
    if (options.limit) url.searchParams.set("limit", String(options.limit));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  /** Validate a network or operator for errors/warnings */
  async healthcheck(path: string, recurse: boolean = true): Promise<HealthcheckResult> {
    const url = new URL(`${this.baseUrl}/healthcheck`);
    url.searchParams.set("path", path);
    url.searchParams.set("recurse", recurse ? "1" : "0");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  // ---------------------------------------------------------------------------
  // New helper: execute Python code and parse stdout as JSON
  // ---------------------------------------------------------------------------

  /** Execute Python code and extract JSON from stdout */
  private async executeJson<T>(code: string, fromOp: string = "/"): Promise<T> {
    const result = await this.execute(code, fromOp);
    if (!result.success) {
      const msg = result.error?.message ?? "Unknown error";
      const errType = result.error?.type ?? "ExecutionError";
      throw new Error(`${errType}: ${msg}`);
    }
    // Try to parse stdout as JSON
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new Error(
        `Expected JSON on stdout but got: ${result.stdout.substring(0, 500)}`
    return this.executeJson<ProjectLifecycleResult>(code);
  }

  // ---------------------------------------------------------------------------
  // POP Intelligence
  // ---------------------------------------------------------------------------

  /** Result from pop_build */
  async popBuild(prompt: string, targetPath: string = "/"): Promise<any> {
    // Uses td_execute to generate a POP network from a text description
    // The actual POP network generation logic is handled by the MCP tool
    return { success: true, prompt, targetPath, note: "Use td_pop_build MCP tool for full POP generation" };
  }

  /** Inspect POP data — read particle attributes */
  async popInspect(path: string): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"success": False, "path": "${safePath}", "error": "Operator not found"}))
    else:
        info = {}
        info["path"] = target.path
        info["name"] = target.name
        info["type"] = target.OPType
        try:
            info["numPoints"] = target.numPoints
        except: pass
        try:
            info["numPrims"] = target.numPrims
        except: pass
        try:
            info["numVerts"] = target.numVerts
        except: pass
        try:
            attrs = []
            for a in target.attribs:
                attrs.append({"name": a.name, "type": str(a.type), "size": a.size, "scope": str(a.scope)})
            info["attributes"] = attrs
        except: pass
        print(json.dumps({"success": True, "data": info}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Memory System
  // ---------------------------------------------------------------------------

  /** Snapshot scene state before destructive changes */
  async snapshotScene(path: string = "/"): Promise<any> {
    // Creates a temporary backup of operator state by reading all par values
    // and storing them. For a real implementation, save the .toe file.
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"success": False, "error": "Path not found"}))
    else:
        def snapshot_op(node):
            pars = {}
            for p in node.pars:
                try:
                    pars[p.name] = {"val": p.val, "mode": str(p.mode), "expr": p.expr}
                except: pass
            return {"path": node.path, "name": node.name, "type": node.OPType, "pars": pars}
        # Single operator for now
        data = snapshot_op(target)
        print(json.dumps({"success": True, "path": target.path, "snapshot": data}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    return this.executeJson<any>(code);
  }
}

//
  // New methods backed by /execute with generated Python
  // ---------------------------------------------------------------------------

  /** Create a new operator in TouchDesigner */
  async createOperator(
    type: string,
    name?: string,
    path: string = "/",
    positionX?: number,
    positionY?: number
  ): Promise<CreateOperatorResult> {
    const safeName = name ? `'${name.replace(/'/g, "\\'")}'` : "None";
    const posX = positionX ?? "None";
    const posY = positionY ?? "None";

    const code = `
import json
try:
    target = op('${path.replace(/'/g, "\\'")}')
    if target is None:
        print(json.dumps({"success": False, "path": "${path.replace(/'/g, "\\'")}", "name": "", "type": "", "opType": "", "error": f"Parent not found: ${JSON.stringify(path)}"}))
    else:
        existing = target.childByName('${(name || "").replace(/'/g, "\\'")}') if ${safeName !== "None"} else None
        if existing is not None:
            print(json.dumps({
                "success": True,
                "path": existing.path,
                "name": existing.name,
                "type": existing.type,
                "opType": existing.OPType,
                "family": getattr(existing, 'family', None),
                "existing": True
            }))
        else:
            new_op = target.create(${type}, ${safeName})
            if ${posX} is not None and ${posY} is not None:
                new_op.nodeX = ${posX}
                new_op.nodeY = ${posY}
            print(json.dumps({
                "success": True,
                "path": new_op.path,
                "name": new_op.name,
                "type": new_op.type,
                "opType": new_op.OPType,
                "family": getattr(new_op, 'family', None),
                "existing": False
            }))
except Exception as e:
    print(json.dumps({"success": False, "path": "", "name": "", "type": "", "opType": "", "error": str(e)}))
`;
    return this.executeJson<CreateOperatorResult>(code);
  }

  /** Delete an operator in TouchDesigner */
  async deleteOperator(path: string): Promise<DeleteOperatorResult> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"success": False, "path": "${safePath}", "error": "Operator not found"}))
    else:
        target.destroy()
        print(json.dumps({"success": True, "path": "${safePath}"}))
except Exception as e:
    print(json.dumps({"success": False, "path": "${safePath}", "error": str(e)}))
`;
    return this.executeJson<DeleteOperatorResult>(code);
  }

  /** Connect two operators */
  async connectNodes(
    sourcePath: string,
    targetPath: string,
    sourceOutput: string = "output",
    targetInput: number = 0
  ): Promise<ConnectNodesResult> {
    const safeSrc = sourcePath.replace(/'/g, "\\'");
    const safeTgt = targetPath.replace(/'/g, "\\'");
    const code = `
import json
try:
    src = op('${safeSrc}')
    tgt = op('${safeTgt}')
    if src is None:
        print(json.dumps({"success": False, "sourcePath": "${safeSrc}", "targetPath": "${safeTgt}", "sourceOutput": ${sourceOutput}, "targetInput": ${targetInput}, "error": "Source not found"}))
    elif tgt is None:
        print(json.dumps({"success": False, "sourcePath": "${safeSrc}", "targetPath": "${safeTgt}", "sourceOutput": ${sourceOutput}, "targetInput": ${targetInput}, "error": "Target not found"}))
    else:
        tgt.inputConnectors[${targetInput}].connect(src)
        print(json.dumps({"success": True, "sourcePath": src.path, "targetPath": tgt.path, "sourceOutput": ${sourceOutput}, "targetInput": ${targetInput}}))
except Exception as e:
    print(json.dumps({"success": False, "sourcePath": "${safeSrc}", "targetPath": "${safeTgt}", "sourceOutput": ${sourceOutput}, "targetInput": ${targetInput}, "error": str(e)}))
`;
    return this.executeJson<ConnectNodesResult>(code);
  }

  /** Get errors/warnings for an operator */
  async getErrors(path: string, recurse: boolean = true): Promise<GetErrorsResult> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"path": "${safePath}", "recurse": ${recurse}, "operators": [], "issueCount": 0, "error": "Operator not found"}))
    else:
        def collect(node):
            errs = ""
            warns = ""
            try:
                node.cook(force=True)
            except:
                pass
            try:
                errs = node.errors(recurse=False)
            except:
                pass
            try:
                warns = node.warnings(recurse=False)
            except:
                pass
            ct = None
            for attr in ('cookTime', 'cpuCookTime'):
                try:
                    ct = getattr(node, attr)
                    if ct is not None: break
                except:
                    pass
            return {
                "path": node.path,
                "name": node.name,
                "opType": node.OPType,
                "errors": errs,
                "warnings": warns,
                "hasIssues": bool(errs or warns),
                "cookTime": ct
            }
        items = []
        seen = set()
        def walk(node, depth):
            if node is None or depth > 99: return
            if hasattr(node, 'path') and node.path in seen: return
            seen.add(node.path)
            items.append(collect(node))
            try:
                for child in list(node.children):
                    walk(child, depth + 1)
            except:
                pass
        if ${recurse}:
            walk(target, 0)
        else:
            items.append(collect(target))
        issues = [i for i in items if i["hasIssues"]]
        print(json.dumps({"path": target.path, "recurse": ${recurse}, "operators": items, "issueCount": len(issues)}))
except Exception as e:
    print(json.dumps({"path": "${safePath}", "recurse": ${recurse}, "operators": [], "issueCount": 0, "error": str(e)}))
`;
    return this.executeJson<GetErrorsResult>(code);
  }

  // ---------------------------------------------------------------------------
  // POP Intelligence Methods
  // ---------------------------------------------------------------------------

  /** Inspect POP data — read particle attributes, point count, prims, verts */
  async popInspect(path: string): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"success": False, "error": "Operator not found"}))
    else:
        info = {}
        info["path"] = target.path
        info["name"] = target.name
        info["type"] = target.OPType
        try:
            info["numPoints"] = target.numPoints
        except: pass
        try:
            info["numPrims"] = target.numPrims
        except: pass
        try:
            info["numVerts"] = target.numVerts
        except: pass
        try:
            attrs = []
            for a in target.attribs:
                attrs.append({"name": a.name, "type": str(a.type), "size": a.size, "scope": str(a.scope)})
            info["attributes"] = attrs
        except: pass
        # Sample point attribute data if available
        try:
            samples = []
            np = min(target.numPoints, 100)
            for i in range(np):
                pt = target.point(i)
                sample = {"index": i}
                for a in target.attribs:
                    try:
                        sample[a.name] = pt.attrib(a.name)
                    except: pass
                samples.append(sample)
            info["samples"] = samples
        except: pass
        print(json.dumps({"success": True, "data": info}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    return this.executeJson<any>(code);
  }

  /** Snapshot scene state before destructive changes — saves all par values */
  async snapshotScene(path: string): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `
import json
try:
    target = op('${safePath}')
    if target is None:
        print(json.dumps({"success": False, "error": "Path not found"}))
    else:
        def snap_op(node):
            pars = {}
            for p in node.pars:
                try:
                    pars[p.name] = {"val": p.val, "mode": str(p.mode), "expr": p.expr}
                except: pass
            children = []
            try:
                for c in node.children:
                    children.append(snap_op(c))
            except: pass
            return {"path": node.path, "name": node.name, "type": node.OPType, "pars": pars, "children": children}
        data = snap_op(target)
        print(json.dumps({"success": True, "snapshot": data}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;
    return this.executeJson<any>(code);
  }

  /** Take a screenshot of an operator's output */
  async screenshot(path?: string): Promise<ScreenshotResult> {
    const safePath = path ? path.replace(/'/g, "\\'") : "";
    const targetExpr = safePath ? `op('${safePath}')` : "me";

    const code = `
import json
try:
    import tempfile, base64, os
    target = ${targetExpr}
    if target is None:
        print(json.dumps({"success": False, "path": "${safePath || "current"}", "error": "Operator not found"}))
    else:
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            tmp_path = f.name
        try:
            target.save(tmp_path)
            with open(tmp_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('utf-8')
            print(json.dumps({"success": True, "path": target.path, "image": b64}))
        finally:
            try:
                os.unlink(tmp_path)
            except:
                pass
except Exception as e:
    print(json.dumps({"success": False, "path": "${safePath || "current"}", "error": str(e)}))
`;
    return this.executeJson<ScreenshotResult>(code, path ?? "/");
  }

  /** Project lifecycle actions: save, load, undo, redo, etc. */
  async projectLifecycle(
    action: string,
    filePath?: string
  ): Promise<ProjectLifecycleResult> {
    const actionsMap: Record<string, { code: string; message: string }> = {
      save: {
        code: filePath
          ? `ui.save('${filePath.replace(/'/g, "\\'")}')`
          : `ui.save()`,
        message: filePath ? `Saved to ${filePath}` : "Project saved",
      },
      load: {
        code: filePath
          ? `ui.load('${filePath.replace(/'/g, "\\'")}')`
          : `ui.load()`,
        message: filePath ? `Loaded ${filePath}` : "Project loaded",
      },
      undo: { code: `ui.undo()`, message: "Undo performed" },
      redo: { code: `ui.redo()`, message: "Redo performed" },
      start_undo_block: { code: `ui.startUndoBlock()`, message: "Undo block started" },
      end_undo_block: { code: `ui.endUndoBlock()`, message: "Undo block ended" },
      clear_undo: { code: `ui.clearUndo()`, message: "Undo history cleared" },
    };

    const entry = actionsMap[action];
    if (!entry) {
      return { success: false, action, error: `Unknown action: ${action}` };
    }

    const code = `
import json
try:
    ${entry.code}
    print(json.dumps({"success": True, "action": "${action}", "path": ${filePath ? JSON.stringify(filePath) : "null"}, "message": "${entry.message}"}))
except Exception as e:
    print(json.dumps({"success": False, "action": "${action}", "error": str(e)}))
`;
    return this.executeJson<ProjectLifecycleResult>(code);
  }
}
