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

export interface DeleteOperatorResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface ConnectNodesResult {
  success: boolean;
  sourcePath: string;
  targetPath: string;
  sourceOutput: string;
  targetInput: number;
  error?: string;
}

export interface OperatorError {
  path: string;
  name: string;
  opType: string;
  errors: string;
  warnings: string;
  hasIssues: boolean;
  cookTime?: number | null;
}

export interface GetErrorsResult {
  path: string;
  recurse: boolean;
  operators: OperatorError[];
  issueCount: number;
}

export interface ScreenshotResult {
  success: boolean;
  path: string;
  image?: string;
  error?: string;
}

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
    const host = options.host ?? process.env.TDAPI_HOST ?? "localhost";
    const port =
      options.port ?? parseInt(process.env.TDAPI_PORT ?? "44444", 10);
    this.baseUrl = `http://${host}:${port}`;
  }

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

  async getPaneState(): Promise<PaneState | null> {
    const response = await fetch(`${this.baseUrl}/editor/pane`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async getSelection(): Promise<SelectionResult> {
    const response = await fetch(`${this.baseUrl}/editor/selection`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async getOperators(path: string = "/"): Promise<OperatorsResult> {
    const url = `${this.baseUrl}/operators?path=${encodeURIComponent(path)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

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

  async findOperators(options: {
    path?: string; query?: string; name?: string; family?: string;
    opType?: string; recursive?: boolean; limit?: number;
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
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  }

  async healthcheck(path: string, recurse: boolean = true): Promise<HealthcheckResult> {
    const url = new URL(`${this.baseUrl}/healthcheck`);
    url.searchParams.set("path", path);
    url.searchParams.set("recurse", recurse ? "1" : "0");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  }

  async getInfo(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/info`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return response.json();
  }

  // ---------------------------------------------------------------------------
  // Helper: execute Python and parse stdout as JSON
  // ---------------------------------------------------------------------------

  private async executeJson<T>(code: string, fromOp: string = "/"): Promise<T> {
    const result = await this.execute(code, fromOp);
    if (!result.success) {
      const msg = result.error?.message ?? "Unknown error";
      const errType = result.error?.type ?? "ExecutionError";
      throw new Error(`${errType}: ${msg}`);
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new Error(`Expected JSON on stdout but got: ${result.stdout.substring(0, 500)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Operator CRUD methods (backed by /execute)
  // ---------------------------------------------------------------------------

  async createOperator(type: string, name?: string, path: string = "/", positionX?: number, positionY?: number): Promise<CreateOperatorResult> {
    const safeName = name ? `'${name.replace(/'/g, "\\'")}'` : "None";
    const code = "import json\n" +
      "try:\n" +
      `    t = op('${path.replace(/'/g, "\\'")}')\n` +
      "    if t is None:\n" +
      `        print(json.dumps({'success':False,'path':'${path.replace(/'/g, "\\'")}','name':'','type':'','opType':'','error':'Parent not found'}))\n` +
      "    else:\n" +
      `        n = t.create(${type}, ${safeName})\n` +
      `        if ${positionX ?? "None"} is not None and ${positionY ?? "None"} is not None:\n` +
      `            n.nodeX = ${positionX}; n.nodeY = ${positionY}\n` +
      "        print(json.dumps({'success':True,'path':n.path,'name':n.name,'type':n.type,'opType':n.OPType,'family':'','existing':False}))\n" +
      "except Exception as e:\n" +
      "    print(json.dumps({'success':False,'path':'','name':'','type':'','opType':'','error':str(e)}))";
    return this.executeJson<CreateOperatorResult>(code);
  }

  async deleteOperator(path: string): Promise<DeleteOperatorResult> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,'path':'${path.replace(/'/g, "\\'")}'}))
    else: t.destroy(); print(json.dumps({'success':True,'path':'${path.replace(/'/g, "\\'")}'}))
except Exception as e:
    print(json.dumps({'success':False,'path':'${path.replace(/'/g, "\\'")}','error':str(e)}))`;
    return this.executeJson<DeleteOperatorResult>(code);
  }

  async connectNodes(sourcePath: string, targetPath: string, targetInput: number = 0): Promise<ConnectNodesResult> {
    const code = `import json
try:
    src = op('${sourcePath.replace(/'/g, "\\'")}'); tgt = op('${targetPath.replace(/'/g, "\\'")}')
    if src is None: print(json.dumps({'success':False,'sourcePath':'${sourcePath.replace(/'/g, "\\'")}','targetPath':'${targetPath.replace(/'/g, "\\'")}','sourceOutput':'output','targetInput':${targetInput},'error':'Source not found'}))
    elif tgt is None: print(json.dumps({'success':False,'sourcePath':'${sourcePath.replace(/'/g, "\\'")}','targetPath':'${targetPath.replace(/'/g, "\\'")}','sourceOutput':'output','targetInput':${targetInput},'error':'Target not found'}))
    else: tgt.inputConnectors[${targetInput}].connect(src); print(json.dumps({'success':True,'sourcePath':src.path,'targetPath':tgt.path,'sourceOutput':'output','targetInput':${targetInput}}))
except Exception as e:
    print(json.dumps({'success':False,'sourcePath':'${sourcePath.replace(/'/g, "\\'")}','targetPath':'${targetPath.replace(/'/g, "\\'")}','sourceOutput':'output','targetInput':${targetInput},'error':str(e)}))`;
    return this.executeJson<ConnectNodesResult>(code);
  }

  async getErrors(path: string, recurse: boolean = true): Promise<GetErrorsResult> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({"path":"${path.replace(/'/g, "\\'")}","recurse":${recurse},"operators":[],"issueCount":0}))
    else:
        def collect(n):
            try: n.cook(force=True)
            except: pass
            e = ""; w = ""
            try: e = n.errors(recurse=False)
            except: pass
            try: w = n.warnings(recurse=False)
            except: pass
            return {"path":n.path,"name":n.name,"opType":n.OPType,"errors":e,"warnings":w,"hasIssues":bool(e or w),"cookTime":None}
        items = []; seen = set()
        def walk(n):
            if n is None or n.path in seen: return
            seen.add(n.path); items.append(collect(n))
            try:
                for c in n.children: walk(c)
            except: pass
        if ${recurse ? 'True' : 'False'}: walk(t)
        else: items.append(collect(t))
        print(json.dumps({"path":t.path,"recurse":${recurse},"operators":items,"issueCount":len([i for i in items if i["hasIssues"]])}))
except Exception as e:
    print(json.dumps({"path":"${path.replace(/'/g, "\\'")}","recurse":${recurse},"operators":[],"issueCount":0,"error":str(e)}))`;
    return this.executeJson<GetErrorsResult>(code);
  }

  async screenshot(path?: string): Promise<ScreenshotResult> {
    const safe = path ? path.replace(/'/g, "\\'") : "";
    const target = safe ? `op('${safe}')` : "me";
    const code = `import json,tempfile,base64,os
try:
    t = ${target}
    if t is None: print(json.dumps({'success':False,'path':'${safe || "current"}','error':'Not found'}))
    else:
        tf = tempfile.NamedTemporaryFile(suffix='.png',delete=False).name
        try: t.save(tf); print(json.dumps({'success':True,'path':t.path,'image':base64.b64encode(open(tf,'rb').read()).decode()}))
        finally:
            try: os.unlink(tf)
            except: pass
except Exception as e:
    print(json.dumps({'success':False,'path':'${safe || "current"}','error':str(e)}))`;
    return this.executeJson<ScreenshotResult>(code, path ?? "/");
  }

  async projectLifecycle(action: string, filePath?: string): Promise<ProjectLifecycleResult> {
    const actions: Record<string, string> = {
      save: filePath ? `ui.save('${filePath.replace(/'/g, "\\'")}')` : "ui.save()",
      load: filePath ? `ui.load('${filePath.replace(/'/g, "\\'")}')` : "ui.load()",
      undo: "ui.undo()", redo: "ui.redo()",
      start_undo_block: "ui.startUndoBlock()", end_undo_block: "ui.endUndoBlock()",
      clear_undo: "ui.clearUndo()",
    };
    if (!actions[action]) return { success: false, action, error: `Unknown action: ${action}` };
    const code = `import json
try:
    ${actions[action]}
    print(json.dumps({'success':True,'action':'${action}','path':${filePath ? JSON.stringify(filePath) : "null"},'message':'${action} performed'}))
except Exception as e:
    print(json.dumps({'success':False,'action':'${action}','error':str(e)}))`;
    return this.executeJson<ProjectLifecycleResult>(code);
  }

  async popInspect(path: string): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"Not found"}))
    else:
        info = {"path":t.path,"name":t.name,"type":t.OPType}
        for attr in ['numPoints','numPrims','numVerts']:
            try: info[attr] = getattr(t, attr)
            except: pass
        try:
            attrs = []
            for a in t.attribs: attrs.append({"name":a.name,"type":str(a.type),"size":a.size,"scope":str(a.scope)})
            info["attributes"] = attrs
        except: pass
        print(json.dumps({'success':True,"data":info}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async getNodeDetail(path: string, recurse: boolean = false): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,'error':'Not found'}))
    else:
        def desc(n, d=0):
            if n is None or d>10: return None
            i = {'path':n.path,'name':n.name,'type':n.OPType}
            try:
                i['pars'] = [{'name':p.name,'label':p.label,'val':p.val,'mode':str(p.mode),'expr':p.expr,'default':p.default,'style':p.style} for p in n.pars()]
            except: pass
            try:
                i['inputs'] = [{'index':idx,'op':c.op.name if c.op else None} for idx,c in enumerate(n.inputConnectors)]
            except: pass
            try: i['viewer'] = n.viewer
            except: pass
            if ${recurse ? 'True' : 'False'}:
                try: i['children'] = [desc(c,d+1) for c in n.children if c]
                except: pass
            return i
        print(json.dumps({'success':True,'data':desc(t)}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  async getHints(nodeType: string): Promise<any> {
    return { success: true, operatorType: nodeType, hint: `Use get_param_help for parameter details on '${nodeType}'.` };
  }

  async getBuildCompatibility(opType: string): Promise<any> {
    const code = `import json
try:
    exists = False
    try:
        t = op('/').create(${opType}, "_td_compat_test")
        t.destroy()
        exists = True
    except:
        exists = False
    print(json.dumps({'success':True,'opType':'${opType.replace(/'/g, "\\'")}','available':exists}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Read / Write DAT
  // ---------------------------------------------------------------------------

  async readDat(path: string, startLine?: number, endLine?: number): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"DAT not found"}))
    else:
        lines = t.text.split('\\\\n')
        total = len(lines)
        start = ${startLine ?? 1}
        end = ${endLine ?? "total"}
        selected = lines[start-1:end]
        print(json.dumps({'success':True,"path":t.path,"totalLines":total,"startLine":start,"endLine":end,"content":"\\\\n".join(selected)}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async writeDat(path: string, text?: string, oldText?: string, newText?: string, replaceAll?: boolean): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"DAT not found"}))
    else:
        if '${oldText ? oldText.replace(/'/g, "\\'") : ""}':
            old = '${oldText ? oldText.replace(/'/g, "\\'") : ""}'
            new = '${newText ? newText.replace(/'/g, "\\'") : ""}'
            if ${replaceAll ?? false}:
                t.text = t.text.replace(old, new)
            else:
                idx = t.text.find(old)
                if idx >= 0: t.text = t.text[:idx] + new + t.text[idx+len(old):]
                else: print(json.dumps({'success':False,"error":"old_text not found"})); return
        elif '${text ? text.replace(/'/g, "\\'") : ""}':
            t.text = '${text ? text.replace(/'/g, "\\'") : ""}'
        print(json.dumps({'success':True,"path":t.path}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Read CHOP channels
  // ---------------------------------------------------------------------------

  async readChop(path: string, channels?: string[], start?: number, end?: number): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"CHOP not found"}))
    else:
        chans = ${channels ? JSON.stringify(channels) : "None"}
        s = ${start ?? 0}; e = ${end ?? "t.numSamples"}
        result = {"path":t.path,"numSamples":t.numSamples,"numChannels":t.numChannels,"channels":{}}
        if chans:
            for name in chans:
                try:
                    c = t.channel(name)
                    vals = [c[i] for i in range(max(0,s), min(e,t.numSamples))]
                    result["channels"][name] = vals
                except: pass
        else:
            for c in t.channels():
                vals = [c[i] for i in range(max(0,s), min(e,t.numSamples))]
                result["channels"][c.name] = vals
        print(json.dumps({'success':True,"data":result}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Search inside TD (code/expressions/parameters)
  // ---------------------------------------------------------------------------

  async searchInTD(query: string, root?: string, scope?: string, caseSensitive?: boolean, maxResults?: number, countOnly?: boolean): Promise<any> {
    const code = `import json
try:
    import re
    root_op = op('${root ? root.replace(/'/g, "\\'") : "/project1"}')
    q = '${query.replace(/'/g, "\\'")}'
    cs = ${caseSensitive ?? false}
    flags = 0 if cs else re.IGNORECASE
    scope_flag = '${scope ?? "all"}'
    max_r = ${maxResults ?? 50}
    count_only = ${countOnly ?? false}
    results = []
    def search_node(n, depth=0):
        if n is None or depth > 20: return
        if len(results) >= max_r: return
        try:
            if scope_flag in ('all','code') and hasattr(n,'text'):
                lines = n.text.split('\\\\n')
                for i, line in enumerate(lines):
                    if re.search(q, line, flags):
                        if count_only: results.append({"path":n.path}); return
                        else: results.append({"path":n.path,"kind":"code","line":i+1,"text":line.strip()})
                        if len(results) >= max_r: return
        except: pass
        try:
            if scope_flag in ('all','expressions'):
                for p in n.pars:
                    if p.expr and re.search(q, p.expr, flags):
                        if not count_only: results.append({"path":n.path,"kind":"expression","par":p.name,"expr":p.expr})
                        if len(results) >= max_r: return
        except: pass
        try:
            if scope_flag in ('all','parameters'):
                for p in n.pars:
                    if isinstance(p.val, str) and re.search(q, p.val, flags):
                        if not count_only: results.append({"path":n.path,"kind":"parameter","par":p.name,"val":p.val})
                        if len(results) >= max_r: return
        except: pass
        for c in n.children:
            search_node(c, depth+1)
    search_node(root_op)
    print(json.dumps({'success':True,"query":q,"scope":scope_flag,"total":len(results),"results":results}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async snapshotScene(path: string = "/"): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"Path not found"}))
    else:
        def snap(n):
            pars = {}
            try:
                for p in n.pars: pars[p.name] = {"val":p.val,"mode":str(p.mode),"expr":p.expr}
            except: pass
            children = []
            try:
                for c in n.children: children.append(snap(c))
            except: pass
            return {"path":n.path,"name":n.name,"type":n.OPType,"pars":pars,"children":children}
        print(json.dumps({'success':True,"snapshot":snap(t)}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async getReleaseDelta(buildFrom: string, buildTo?: string): Promise<any> {
    return { success: true, buildFrom, buildTo: buildTo ?? "current", note: "Use the td-build-2025 skill for complete build 2025.32820 feature documentation." };
  }

  async customParameters(path: string, page: string, params: Array<{name: string; type?: string; default?: number; min?: number; max?: number; label?: string}>): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"Not found"}))
    else:
        pp = t.customPages['${page.replace(/'/g, "\\'")}'] if '${page.replace(/'/g, "\\'")}' in t.customPages else t.appendCustomPage('${page.replace(/'/g, "\\'")}')
        defs = ${JSON.stringify(params)}
        res = []
        for p in defs:
            try:
                par = pp.appendFloat(p['name'], p.get('label', p['name']))
                if 'default' in p: par.default = p['default']
                if 'min' in p: par.min = p['min']
                if 'max' in p: par.max = p['max']
                res.append({"name":p['name'],"created":true})
            except:
                res.append({"name":p['name'],"created":false,"error":"Could not create"})
        print(json.dumps({'success':True,"path":t.path,"page":"${page.replace(/'/g, "\\'")}","params":res}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Focus & Performance
  // ---------------------------------------------------------------------------

  async getFocus(): Promise<any> {
    const code = `import json
try:
    info = {}
    p = ui.panes[0] if ui.panes else None
    if p:
        try: info["owner"] = p.owner.path
        except: pass
        try: info["networkPath"] = p.owner.path
        except: pass
    else:
        info["networkPath"] = "/"
    info["numPanes"] = len(ui.panes) if ui.panes else 0
    # Get current operator via selection
    sel = []
    try:
        for c in op('/').children:
            if c.current:
                sel.append({"path":c.path,"name":c.name,"type":c.OPType})
    except: pass
    info["selection"] = sel
    info["numSelected"] = len(sel)
    print(json.dumps({'success':True,"focus":info}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async getPerf(path?: string, top?: number): Promise<any> {
    const code = `import json
try:
    target = op('${path ? path.replace(/'/g, "\\'") : "/" }')
    if target is None: print(json.dumps({'success':False,'error':'Path not found'}))
    else:
        perf = {}
        try:
            perf['fps'] = round(1.0 / absTime.stepSeconds, 1) if absTime.stepSeconds > 0 else 0
            perf['targetFps'] = int(project.cookRate) if hasattr(project,'cookRate') else None
            perf['playing'] = me.time.play if hasattr(me.time,'play') else None
            perf['realtime'] = project.realTime if hasattr(project,'realTime') else None
        except: pass
        ops = []
        seen = set()
        def walk(n):
            if n is None or n.path in seen: return
            seen.add(n.path)
            try:
                ct = getattr(n, 'cookTime', None)
                if ct is not None and ct > 0.0:
                    ops.append({'path':n.path,'name':n.name,'type':n.OPType,'cpu_ms':round(ct*1000,2)})
            except: pass
            try:
                for c in n.children: walk(c)
            except: pass
        walk(target)
        ops.sort(key=lambda x: x.get('cpu_ms',0) or 0, reverse=True)
        limit = ${top ?? 20}
        if limit: ops = ops[:limit]
        perf['operators'] = ops
        perf['totalOps'] = len(ops)
        print(json.dumps({'success':True,'performance':perf}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Textport (log)
  // ---------------------------------------------------------------------------

  async readTextport(lines?: number): Promise<any> {
    const code = `import json
try:
    count = ${lines ?? 20}
    log = op.TDPerformance.getLog() if hasattr(op.TDPerformance,'getLog') else ""
    lines_list = log.split('\\\\n') if log else []
    recent = lines_list[-count:] if lines_list else []
    print(json.dumps({'success':True,"totalLines":len(lines_list),"lines":recent}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  async clearTextport(): Promise<any> {
    const code = `import json
try:
    # TD doesn't have a clear log API, but we can output a divider
    print("--- MCP CLEAR ---", end="")
    print(json.dumps({'success':True,"message":"Textport marker added"}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  async navigateTo(path: string): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"Operator not found"}))
    else:
        p = ui.panes[0] if ui.panes else None
        if p:
            p.owner = t.parent() if t.parent() else t
            p.home()
        print(json.dumps({'success':True,"path":t.path,"parent":t.parent().path if t.parent() else None}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Extension reinit
  // ---------------------------------------------------------------------------

  async reinitExtension(path: string): Promise<any> {
    const code = `import json
try:
    t = op('${path.replace(/'/g, "\\'")}')
    if t is None: print(json.dumps({'success':False,"error":"COMP not found"}))
    else:
        t.reinitExtension()
        print(json.dumps({'success':True,"path":t.path,"message":"Extension reinitialized"}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Batch screenshots
  // ---------------------------------------------------------------------------

  async getScreenshots(paths: string[], maxSize?: number): Promise<any> {
    const pathsJson = JSON.stringify(paths);
    const code = "import json,tempfile,base64,os\n" +
      "try:\n" +
      "    plist = " + pathsJson + "\n" +
      "    results = []\n" +
      "    for p in plist:\n" +
      "        try:\n" +
      "            t = op(p)\n" +
      "            if t is None:\n" +
      "                results.append({'path':p,'error':'Not found'})\n" +
      "            else:\n" +
      "                tf = tempfile.NamedTemporaryFile(suffix='.png',delete=False).name\n" +
      "                try:\n" +
      "                    t.save(tf)\n" +
      "                    b64 = base64.b64encode(open(tf,'rb').read()).decode()\n" +
      "                    results.append({'path':t.path,'name':t.name,'image':b64})\n" +
      "                finally:\n" +
      "                    try: os.unlink(tf)\n" +
      "                    except: pass\n" +
      "        except Exception as e:\n" +
      "            results.append({'path':p,'error':str(e)})\n" +
      "    print(json.dumps({'success':True,'results':results,'count':len(results)}))\n" +
      "except Exception as e:\n" +
      "    print(json.dumps({'success':False,'error':str(e)}))";
    return this.executeJson<any>(code);
  }
}
