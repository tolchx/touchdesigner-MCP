/**
 * TouchDesigner HTTP API Client
 *
 * Unified HTTP client that routes all TouchDesigner operator interactions
 * through /exec (inline Python). Provides a consistent interface for
 * operator CRUD, parameter management, DAT/CHOP I/O, searching, and
 * performance monitoring.
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

export type TDTransport = "http" | "websocket" | "auto";

export interface TDClientOptions {
  host?: string;
  port?: number;
  /** Timeout in ms for the initial connection health-check (default 3000). */
  connectionTimeout?: number;
  /** Default timeout in ms for individual API calls (default 30000). */
  requestTimeout?: number;
  /** Transport mode: 'http' (default), 'websocket' (persistent connection), or 'auto' (try WS first, fallback HTTP). */
  transport?: TDTransport;
}

// -----------------------------------------------------------------------------
// Internal error helpers to avoid instanceof issues across realms
// -----------------------------------------------------------------------------

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

// -----------------------------------------------------------------------------
// TDClient
// -----------------------------------------------------------------------------

export class TDClient {
  private baseUrl: string;
  private host: string;
  private port: number;
  private connectionTimeout: number;
  private requestTimeout: number;
  private transport: TDTransport;

  // ---------------------------------------------------------------------------
  // WebSocket transport (lazy-initialized)
  // ---------------------------------------------------------------------------
  private _ws: import("./tdWebSocket.js").TDWebSocketClient | null = null;
  private _wsConnecting = false;
  private _wsFailed = false;
  private _wsFailedAt: number | undefined;

  // ---------------------------------------------------------------------------
  // Connection cache (TTL 2s) & watchdog
  // ---------------------------------------------------------------------------
  private _connectedCache: { value: boolean; timestamp: number } | null = null;
  private _lastKnownConnected: boolean = false;
  private _watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private _watchdogLastState: boolean = false;

  /**
   * Callback invoked when the connection state changes (detected by watchdog).
   */
  onConnectionChange: ((connected: boolean) => void) | null = null;

  /**
   * Returns the last known connection state without making an HTTP request.
   */
  get isConnectedCached(): boolean {
    return this._lastKnownConnected;
  }

  constructor(options: TDClientOptions = {}) {
    const host = options.host ?? process.env.TDAPI_HOST ?? "localhost";
    const port =
      options.port ?? parseInt(process.env.TDAPI_PORT ?? "44444", 10);
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
    this.connectionTimeout = options.connectionTimeout ?? 3000;
    this.requestTimeout = options.requestTimeout ?? 30000;
    this.transport = options.transport ?? "auto";
  }

  // ---------------------------------------------------------------------------
  // WebSocket transport (lazy connect)
  // ---------------------------------------------------------------------------

  private async _ensureWebSocket(): Promise<import("./tdWebSocket.js").TDWebSocketClient> {
    if (this._ws && this._ws.connected) return this._ws;
    // Reset failed flag after 30s cooldown so WebSocket can retry
    if (this._wsFailed && this._wsFailedAt && Date.now() - this._wsFailedAt > 30000) {
      this._wsFailed = false;
      this._wsFailedAt = undefined;
    }
    if (this._wsFailed) throw new Error("WebSocket transport previously failed");
    if (this._wsConnecting) {
      // Wait for in-flight connection attempt
      await new Promise((r) => setTimeout(r, 100));
      if (this._ws && this._ws.connected) return this._ws;
      throw new Error("WebSocket connection in progress");
    }

    // Dynamic import — ws is an optional dependency
    const { TDWebSocketClient } = await import("./tdWebSocket.js");
    const wsClient = new TDWebSocketClient({
      host: this.host,
      port: this.port,
      requestTimeout: this.requestTimeout,
    });
    wsClient.onConnectionChange = (connected) => {
      this._lastKnownConnected = connected;
      if (this.onConnectionChange) this.onConnectionChange(connected);
    };

    this._wsConnecting = true;
    try {
      await wsClient.connect();
      this._ws = wsClient;
      this._wsFailed = false;
      this._lastKnownConnected = true;
      return wsClient;
    } catch (e) {
      this._wsFailed = true;
      this._wsFailedAt = Date.now();
      throw e;
    } finally {
      this._wsConnecting = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared request helper — handles WebSocket, HTTP fallback, timeouts
  // ---------------------------------------------------------------------------

  /**
   * Execute a request against the TD API. Routes through WebSocket when
   * transport is 'websocket' or 'auto' (trying WebSocket first with HTTP
   * fallback). Falls back to HTTP when transport is 'http' or when the
   * WebSocket is unavailable.
   */
  private async _request(
    url: string,
    options: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      timeout?: number;
    } = {},
  ): Promise<any> {
    // --- Try WebSocket first for 'auto' or 'websocket' modes ---
    if (this.transport !== "http") {
      try {
        return await this._requestViaWebSocket(url, options);
      } catch (wsErr) {
        // For 'websocket' mode, don't fallback to HTTP
        if (this.transport === "websocket") throw wsErr;
        // For 'auto', fallback to HTTP silently
      }
    }

    // --- HTTP fallback ---
    return this._requestViaHttp(url, options);
  }

  /**
   * Route an HTTP-style request through the WebSocket JSON-RPC protocol.
   * Maps URL path + method to a WebSocket method name and params.
   */
  private async _requestViaWebSocket(
    url: string,
    options: {
      method?: string;
      body?: string;
      timeout?: number;
    } = {},
  ): Promise<any> {
    const ws = await this._ensureWebSocket();

    // Parse the URL to extract method and params
    const parsed = new URL(url);
    const path = parsed.pathname;
    const httpMethod = options.method ?? "GET";

    // Map URL path to WebSocket method name
    let wsMethod = path.replace(/^\//, ""); // strip leading /
    if (!wsMethod) wsMethod = "info";

    // Build params from query string and/or body
    const params: Record<string, unknown> = {};
    for (const [k, v] of parsed.searchParams) {
      params[k] = v;
    }
    if (options.body) {
      try {
        const body = JSON.parse(options.body);
        Object.assign(params, body);
      } catch {
        // body isn't JSON — pass as-is
      }
    }

    return ws.request(wsMethod, params, options.timeout);
  }

  /**
   * Execute an HTTP request against the TD API with timeout and standardised
   * error handling.  Throws on non-2xx responses including the body text.
   */
  private async _requestViaHttp(
    url: string,
    options: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      timeout?: number;
    } = {},
  ): Promise<any> {
    const timeout = options.timeout ?? this.requestTimeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          bodyText = "(could not read response body)";
        }
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${bodyText.substring(0, 1000)}`,
        );
      }

      return response.json();
    } catch (e: unknown) {
      if (isAbortError(e)) {
        throw new Error(`Request timed out after ${timeout}ms: ${url}`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // execute / exec
  // ---------------------------------------------------------------------------

  /**
   * Run arbitrary Python inside TouchDesigner and return stdout + stderr.
   * Uses the /exec twozero-compatible endpoint.
   */
  async execute(code: string, fromOp: string = "/"): Promise<ExecuteResult> {
    const data = await this._request(`${this.baseUrl}/exec`, {
      method: "POST",
      body: JSON.stringify({ code, fromOp }),
    });
    return {
      success: !data.error,
      stdout: data.output || "",
      stderr: data.error || "",
      from_op: fromOp,
      error: data.error
        ? { type: "ExecutionError", message: data.error }
        : undefined,
    };
  }

  /**
   * Helper: run Python and parse stdout as JSON.  Used internally by every
   * tool method that needs structured data from TD.
   */
  private async executeJson<T>(code: string, fromOp: string = "/"): Promise<T> {
    const result = await this.execute(code, fromOp);
    if (!result.success) {
      const msg = result.error?.message ?? (result.stderr || "Unknown error");
      const errType = result.error?.type ?? "ExecutionError";
      throw new Error(`${errType}: ${msg}`);
    }
    const out = result.stdout.trim();
    if (!out) {
      if (result.stderr) {
        throw new Error(`Execution stderr: ${result.stderr.substring(0, 500)}`);
      }
      throw new Error(
        "Expected JSON on stdout but output was empty. Code may have failed silently.",
      );
    }
    try {
      return JSON.parse(out) as T;
    } catch {
      // Fallback: try to extract the first JSON object from the output
      const jsonMatch = out.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as T;
        } catch {
          /* noop – fall through to the final throw */
        }
      }
      throw new Error(`Expected JSON on stdout. Got: ${out.substring(0, 500)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection health
  // ---------------------------------------------------------------------------

  /**
   * Quick connectivity check.  Returns `true` if the TD API responds to a
   * GET /info within the configured connectionTimeout.
   * Uses a 2-second TTL cache to avoid hammering the endpoint.
   */
  async isConnected(): Promise<boolean> {
    const CACHE_TTL_MS = 2000;
    const now = Date.now();

    // Return cached value if still fresh
    if (this._connectedCache && now - this._connectedCache.timestamp < CACHE_TTL_MS) {
      return this._connectedCache.value;
    }

    try {
      await this._request(`${this.baseUrl}/info`, {
        timeout: this.connectionTimeout,
      });
      this._connectedCache = { value: true, timestamp: now };
      this._lastKnownConnected = true;
      return true;
    } catch {
      // Invalidate cache on connection error so next call retries fresh
      this._connectedCache = null;
      this._lastKnownConnected = false;
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Connection watchdog (auto-reconnect detection)
  // ---------------------------------------------------------------------------

  /**
   * Start a watchdog timer that periodically checks connection state.
   * Fires `onConnectionChange` when the state transitions.
   */
  startConnectionWatchdog(intervalMs: number = 10000): void {
    this.stopConnectionWatchdog();
    this._watchdogLastState = this._lastKnownConnected;
    this._watchdogTimer = setInterval(async () => {
      const connected = await this.isConnected();
      if (connected !== this._watchdogLastState) {
        this._watchdogLastState = connected;
        if (this.onConnectionChange) {
          this.onConnectionChange(connected);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop the connection watchdog timer.
   */
  stopConnectionWatchdog(): void {
    if (this._watchdogTimer !== null) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Async execution support
  // ---------------------------------------------------------------------------

  /**
   * Submit Python code for asynchronous execution in TouchDesigner.
   * Returns immediately with a taskId that can be polled via getTaskStatus().
   */
  async executeAsync(
    code: string,
    fromOp?: string,
  ): Promise<{ taskId: string }> {
    const data = await this._request(`${this.baseUrl}/execute_async`, {
      method: "POST",
      body: JSON.stringify({ code, fromOp: fromOp ?? "/" }),
    });
    if (data && data.taskId) {
      return { taskId: data.taskId };
    }
    // Handle server response that wraps result differently
    if (typeof data === "object" && data !== null) {
      const d = data as any;
      if (d.taskId) return { taskId: d.taskId };
      if (d.task_id) return { taskId: d.task_id };
      if (d.data && d.data.taskId) return { taskId: d.data.taskId };
    }
    throw new Error(
      `executeAsync: unexpected response — ${JSON.stringify(data).substring(0, 500)}`,
    );
  }

  /**
   * Poll the status of an async execution task.
   */
  async getTaskStatus(
    taskId: string,
  ): Promise<{ status: string; result?: any }> {
    const data = await this._request(
      `${this.baseUrl}/task_status?taskId=${encodeURIComponent(taskId)}`,
    );
    if (typeof data === "object" && data !== null) {
      const d = data as any;
      return {
        status: d.status ?? "unknown",
        result: d.result,
      };
    }
    return { status: "unknown", result: data };
  }

  /**
   * Poll a task until it completes or times out.
   * @returns The task result on completion.
   * @throws If the task fails or the timeout is exceeded.
   */
  async waitForTask(
    taskId: string,
    timeoutMs: number = 30000,
    pollIntervalMs: number = 500,
  ): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    let lastStatus: string = "unknown";
    while (Date.now() < deadline) {
      const status = await this.getTaskStatus(taskId);
      lastStatus = status.status;
      if (status.status === "done") {
        return status.result;
      }
      if (
        status.status === "error" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        throw new Error(
          `Task ${taskId} ${status.status}: ${JSON.stringify(status.result)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(
      `Task ${taskId} timed out after ${timeoutMs}ms (last status: ${lastStatus})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Editor / UI
  // ---------------------------------------------------------------------------

  async getPaneState(): Promise<PaneState | null> {
    return this._request(`${this.baseUrl}/editor/pane`);
  }

  async getSelection(): Promise<SelectionResult> {
    return this._request(`${this.baseUrl}/editor/selection`);
  }

  // ---------------------------------------------------------------------------
  // Operators
  // ---------------------------------------------------------------------------

  async getOperators(path: string = "/"): Promise<OperatorsResult> {
    return this._request(
      `${this.baseUrl}/operators?path=${encodeURIComponent(path)}`,
    );
  }

  async getParameters(
    path: string,
    names?: string[],
  ): Promise<ParametersResult> {
    const url = new URL(`${this.baseUrl}/parameters`);
    url.searchParams.set("path", path);
    if (names && names.length > 0) {
      url.searchParams.set("names", names.join(","));
    }
    return this._request(url.toString());
  }
  async setParameters(
    path: string,
    updates: ParameterUpdate[],
    transactional: boolean = true,
  ): Promise<ParameterSetResult> {
    const safePath = path.replace(/'/g, "\\'");
    const updatesJson = JSON.stringify(updates);
    const updatesB64 = Buffer.from(updatesJson).toString("base64");
    const pyTransactional = transactional ? "True" : "False";
    const code = `import json,base64
try:
    t = op('${safePath}')
    if t is None:
        print(json.dumps({'success':False,'error':'Not found'}))
    else:
        updates = json.loads(base64.b64decode('${updatesB64}').decode('utf-8'))
        updated = []
        missing = []
        for u in updates:
            try:
                p = getattr(t.par, u['name'])
                if 'value' in u:
                    p.val = u['value']
                elif 'expr' in u:
                    if u['expr'] is not None:
                        p.expr = u['expr']
                    else:
                        p.mode = ParMode.CONSTANT
                updated.append({'name':p.name,'label':p.label,'value':p.val,'mode':str(p.mode),'isExpression':p.isExpression})
            except AttributeError:
                missing.append(u['name'])
        print(json.dumps({'success':True,'path':'${safePath}','updated':updated,'missing':missing,'transactional':${transactional ? "True" : "False"}}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<ParameterSetResult>(code);
  }

  async getConnections(
    path: string,
    recurse: boolean = false,
  ): Promise<ConnectionsResult> {
    const url = new URL(`${this.baseUrl}/connections`);
    url.searchParams.set("path", path);
    url.searchParams.set("recurse", recurse ? "1" : "0");
    return this._request(url.toString());
  }

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
    url.searchParams.set(
      "recursive",
      options.recursive === false ? "0" : "1",
    );
    if (options.limit) url.searchParams.set("limit", String(options.limit));
    return this._request(url.toString());
  }

  async healthcheck(
    path: string = "/",
    recurse: boolean = false,
  ): Promise<HealthcheckResult> {
    const url = new URL(`${this.baseUrl}/healthcheck`);
    url.searchParams.set("path", path);
    url.searchParams.set("recurse", recurse ? "1" : "0");
    return this._request(url.toString());
  }

  async getInfo(): Promise<any> {
    return this._request(`${this.baseUrl}/info`);
  }

  // ---------------------------------------------------------------------------
  // Operator CRUD methods (backed by /exec)
  // ---------------------------------------------------------------------------

  async createOperator(
    type: string,
    name?: string,
    path: string = "/",
    positionX?: number,
    positionY?: number,
  ): Promise<CreateOperatorResult> {
    const safeName = name ? `'${name.replace(/'/g, "\\'")}'` : "None";
    const code =
      "import json\n" +
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
    const sp = Py.esc(path);
    const code = new Py()
      .import_("json")
      .tryBody(`t = op('${sp}')`)
      .tryBody(`if t is None: print(json.dumps({'success':False,'path':'${sp}'}))`)
      .tryBody(`else: t.destroy(); print(json.dumps({'success':True,'path':'${sp}'}))`)
      .exceptBody(`print(json.dumps({'success':False,'path':'${sp}','error':str(e)}))`)
      .build();
    return this.executeJson<DeleteOperatorResult>(code);
  }

  async connectNodes(
    sourcePath: string,
    targetPath: string,
    targetInput: number = 0,
  ): Promise<ConnectNodesResult> {
    const sSrc = Py.esc(sourcePath);
    const sTgt = Py.esc(targetPath);
    const code = new Py()
      .import_("json")
      .tryBody(`src = op('${sSrc}'); tgt = op('${sTgt}')`)
      .tryBody(`if src is None: print(json.dumps({'success':False,'sourcePath':'${sSrc}','targetPath':'${sTgt}','sourceOutput':'output','targetInput':${targetInput},'error':'Source not found'}))`)
      .tryBody(`elif tgt is None: print(json.dumps({'success':False,'sourcePath':'${sSrc}','targetPath':'${sTgt}','sourceOutput':'output','targetInput':${targetInput},'error':'Target not found'}))`)
      .tryBody(`else: tgt.inputConnectors[${targetInput}].connect(src); print(json.dumps({'success':True,'sourcePath':src.path,'targetPath':tgt.path,'sourceOutput':'output','targetInput':${targetInput}}))`)
      .exceptBody(`print(json.dumps({'success':False,'sourcePath':'${sSrc}','targetPath':'${sTgt}','sourceOutput':'output','targetInput':${targetInput},'error':str(e)}))`)
      .build();
    return this.executeJson<ConnectNodesResult>(code);
  }

  async getErrors(
    path: string,
    recurse: boolean = true,
  ): Promise<GetErrorsResult> {
    const safePath = path.replace(/'/g, "\\'");
    const pyRecurse = recurse ? "True" : "False";
    const code = `import json
try:
    t = op('${safePath}')
    if t is None: print(json.dumps({"path":"${safePath}","recurse":${pyRecurse},"operators":[],"issueCount":0}))
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
        print(json.dumps({"path":t.path,"recurse":${pyRecurse},"operators":items,"issueCount":len([i for i in items if i["hasIssues"]])}))
except Exception as e:
    print(json.dumps({"path":"${safePath}","recurse":${pyRecurse},"operators":[],"issueCount":0,"error":str(e)}))`;
    return this.executeJson<GetErrorsResult>(code);
  }

  async screenshot(
    path?: string,
    maxSize?: number,
  ): Promise<ScreenshotResult> {
    const safe = path ? path.replace(/'/g, "\\'") : "";
    const target = safe ? `op('${safe}')` : "me";
    const resizeCode = maxSize
      ? `
        try:
            from PIL import Image as PILImage
            import io
            img_data = open(tf, 'rb').read()
            pil_img = PILImage.open(io.BytesIO(img_data))
            w, h = pil_img.size
            if w > ${maxSize} or h > ${maxSize}:
                if w >= h:
                    new_w = ${maxSize}
                    new_h = int(h * ${maxSize} / w)
                else:
                    new_h = ${maxSize}
                    new_w = int(w * ${maxSize} / h)
                pil_img = pil_img.resize((new_w, new_h), PILImage.LANCZOS)
                buf = io.BytesIO()
                pil_img.save(buf, format='PNG')
                b64 = base64.b64encode(buf.getvalue()).decode()
            else:
                b64 = base64.b64encode(img_data).decode()
        except ImportError:
            b64 = base64.b64encode(open(tf, 'rb').read()).decode()
        `
      : `
        b64 = base64.b64encode(open(tf, 'rb').read()).decode()
        `;
    const code = `import json,tempfile,base64,os
try:
    t = ${target}
    if t is None: print(json.dumps({'success':False,'path':'${safe || "current"}','error':'Not found'}))
    else:
        tf = tempfile.NamedTemporaryFile(suffix='.png',delete=False).name
        try:
            t.save(tf)
            ${resizeCode}
            print(json.dumps({'success':True,'path':t.path,'image':b64}))
        finally:
            try: os.unlink(tf)
            except: pass
except Exception as e:
    print(json.dumps({'success':False,'path':'${safe || "current"}','error':str(e)}))`;
    return this.executeJson<ScreenshotResult>(code, path ?? "/");
  }

  async projectLifecycle(
    action: string,
    filePath?: string,
  ): Promise<ProjectLifecycleResult> {
    const actions: Record<string, string> = {
      save: filePath
        ? `ui.save('${filePath.replace(/'/g, "\\'")}')`
        : "ui.save()",
      load: filePath
        ? `ui.load('${filePath.replace(/'/g, "\\'")}')`
        : "ui.load()",
      undo: "ui.undo()",
      redo: "ui.redo()",
      start_undo_block: "ui.startUndoBlock()",
      end_undo_block: "ui.endUndoBlock()",
      clear_undo: "ui.clearUndo()",
    };
    if (!actions[action])
      return {
        success: false,
        action,
        error: `Unknown action: ${action}`,
      };
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
    return {
      success: true,
      operatorType: nodeType,
      hint: `Use get_param_help for parameter details on '${nodeType}'.`,
    };
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

  async readDat(
    path: string,
    startLine?: number,
    endLine?: number,
  ): Promise<any> {
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

  async writeDat(
    path: string,
    text?: string,
    oldText?: string,
    newText?: string,
    replaceAll?: boolean,
  ): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const safeOld = oldText ? oldText.replace(/'/g, "\\'") : "";
    const safeNew = newText ? newText.replace(/'/g, "\\'") : "";
    const safeText = text ? text.replace(/'/g, "\\'") : "";
    const pyReplaceAll = replaceAll === true ? "True" : "False";
    const code = `import json
try:
    t = op('${safePath}')
    if t is None: print(json.dumps({'success':False,"error":"DAT not found"}))
    else:
        if '${safeOld}':
            old = '${safeOld}'
            new = '${safeNew}'
            if ${pyReplaceAll}:
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

  async readChop(
    path: string,
    channels?: string[],
    start?: number,
    end?: number,
  ): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const chansJson = channels === undefined ? "null" : JSON.stringify(channels);
    const code = `import json
try:
    t = op('${safePath}')
    if t is None:
        print(json.dumps({'success':False,"error":"Operator not found"}))
    elif t.family != 'CHOP':
        print(json.dumps({'success':False,"error":"Operator is not a CHOP, it is a " + t.family}))
    else:
        chans = ${chansJson === "null" ? "None" : chansJson}
        s = ${start ?? 0}; e = ${end ?? "t.numSamples"}
        result = {"path":t.path,"numSamples":t.numSamples,"numChannels":t.numChannels if hasattr(t, 'numChannels') else 0,"channels":{}}
        if chans:
            for name in chans:
                try:
                    c = t.channel(name)
                    vals = [c[i] for i in range(max(0,s), min(e,t.numSamples))]
                    result["channels"][name] = vals
                except: pass
        else:
            # Iterar canales de forma segura
            try:
                ch_names = [ch.name for ch in t.chans()]
            except:
                try:
                    ch_names = [ch.name for ch in t]
                except:
                    ch_names = []
            for name in ch_names:
                try:
                    c = t.channel(name) if hasattr(t, 'channel') else None
                    if c is not None:
                        vals = [c[j] for j in range(max(0,s), min(e,t.numSamples))]
                        result["channels"][name] = vals
                except:
                    pass
        print(json.dumps({'success':True,"data":result}))
except Exception as e:
    print(json.dumps({'success':False,"error":str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Search inside TD (code/expressions/parameters)
  // ---------------------------------------------------------------------------

  async searchInTD(
    query: string,
    root?: string,
    scope?: string,
    caseSensitive?: boolean,
    maxResults?: number,
    countOnly?: boolean,
  ): Promise<any> {
    const safeRoot = root ? root.replace(/'/g, "\\'") : "/project1";
    const safeQuery = query.replace(/'/g, "\\'");
    const safeScope = scope ?? "all";
    const pyCaseSensitive = caseSensitive === true ? "True" : "False";
    const pyCountOnly = countOnly === true ? "True" : "False";
    const code = `import json
try:
    import re
    root_op = op('${safeRoot}')
    q = '${safeQuery}'
    cs = ${pyCaseSensitive}
    flags = 0 if cs else re.IGNORECASE
    scope_flag = '${safeScope}'
    max_r = ${maxResults ?? 50}
    count_only = ${pyCountOnly}
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
    return {
      success: true,
      buildFrom,
      buildTo: buildTo ?? "current",
      note: "Use the td-build-2025 skill for complete build 2025.32820 feature documentation.",
    };
  }

  async customParameters(
    path: string,
    pageName: string,
    params: Array<{
      name: string;
      type?: string;
      default?: number;
      min?: number;
      max?: number;
      label?: string;
    }>,
  ): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const safePage = pageName.replace(/'/g, "\\'");
    const code = `import json
try:
    t = op('${safePath}')
    if t is None:
        print(json.dumps({'success':False,"error":"Not found"}))
    elif hasattr(t, 'family') and t.family != 'COMP':
        print(json.dumps({'success':False,"error":"Custom parameters only supported on COMP operators, this is a " + t.family}))
    else:
        try:
            pp = t.appendCustomPage('${safePage}')
        except:
            pp = [p for p in t.customPages if p.name == '${safePage}'][0]
        defs = ${JSON.stringify(params)}
        res = []
        for p in defs:
            try:
                if p.get('type','float') == 'float':
                    par = pp.appendFloat(p['name'], label=p.get('label', p['name']))
                elif p['type'] == 'int':
                    par = pp.appendInt(p['name'], label=p.get('label', p['name']))
                elif p['type'] == 'toggle':
                    par = pp.appendToggle(p['name'], label=p.get('label', p['name']))
                elif p['type'] == 'pulse':
                    par = pp.appendPulse(p['name'], label=p.get('label', p['name']))
                else:
                    par = pp.appendFloat(p['name'], label=p.get('label', p['name']))
                if 'default' in p: par.default = p['default']
                if 'min' in p: par.min = p['min']
                if 'max' in p: par.max = p['max']
                res.append({"name":p['name'],"created":True})
            except Exception as pe:
                res.append({"name":p['name'],"created":False,"error":str(pe)})
        print(json.dumps({'success':True,"path":t.path,"page":"${safePage}","params":res}))
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

  /**
   * Get comprehensive spatial context: current network, selected operators,
   * focused operator, parent path, siblings, and pane state.
   * Designed for *here and *this spatial markers.
   */
  async getSpatialContext(): Promise<any> {
    const code = `import json
try:
    ctx = {}
    
    # --- Pane state ---
    pane = ui.panes.current if hasattr(ui, 'panes') else None
    if pane is None and ui.panes:
        pane = ui.panes[0]
    
    network_path = '/'
    pane_info = {}
    if pane is not None:
        try:
            owner = pane.owner
            if owner is not None:
                network_path = owner.path
                pane_info = {
                    'networkPath': owner.path,
                    'networkName': owner.name,
                    'networkType': owner.OPType,
                    'x': pane.x if hasattr(pane, 'x') else 0,
                    'y': pane.y if hasattr(pane, 'y') else 0,
                    'zoom': pane.zoom if hasattr(pane, 'zoom') else 1.0,
                }
        except: pass
    ctx['pane'] = pane_info
    ctx['networkPath'] = network_path
    
    # --- Parent path (one level up) ---
    parent_path = '/'
    try:
        current_op = op(network_path)
        if current_op is not None and current_op.parent() is not None:
            parent_path = current_op.parent().path
    except: pass
    ctx['parentPath'] = parent_path
    
    # --- Viewed network info (the COMP you're looking inside) ---
    viewed_network = None
    try:
        current_op = op(network_path)
        if current_op is not None:
            viewed_network = {
                'path': current_op.path,
                'name': current_op.name,
                'opType': current_op.OPType,
                'family': getattr(current_op, 'family', None),
            }
    except: pass
    ctx['viewedNetwork'] = viewed_network
    
    # --- Focused operator (the one with blue highlight: child.current == True) ---
    focused = None
    try:
        if pane is not None and pane.owner is not None:
            for child in pane.owner.children:
                if child.current:
                    pars = []
                    try:
                        for p in child.pars():
                            pars.append({
                                'name': p.name,
                                'label': getattr(p, 'label', p.name),
                                'value': p.val,
                                'mode': str(p.mode),
                                'expr': p.expr if p.isExpression else None,
                            })
                    except: pass
                    focused = {
                        'path': child.path,
                        'name': child.name,
                        'opType': child.OPType,
                        'family': getattr(child, 'family', None),
                        'parameters': pars[:20],
                    }
                    break
    except: pass
    ctx['focusedOperator'] = focused
    
    # --- Selected operators (multi-select) ---
    selected = []
    try:
        if pane is not None and pane.owner is not None:
            for child in pane.owner.children:
                if child.selected or child.current:
                    info = {
                        'path': child.path,
                        'name': child.name,
                        'opType': child.OPType,
                        'family': getattr(child, 'family', None),
                    }
                    try:
                        inputs = []
                        for idx, conn in enumerate(child.inputConnectors):
                            if conn.op is not None:
                                inputs.append({
                                    'index': idx,
                                    'source': conn.op.name,
                                    'sourcePath': conn.op.path,
                                })
                        info['inputs'] = inputs
                    except: pass
                    selected.append(info)
    except: pass
    ctx['selected'] = selected
    ctx['numSelected'] = len(selected)
    
    # --- Siblings (limit 30 for token efficiency) ---
    siblings = []
    total_siblings = 0
    try:
        parent_op = op(network_path)
        if parent_op is not None:
            total_siblings = len(list(parent_op.children))
            for child in parent_op.children:
                if len(siblings) >= 30: break
                siblings.append({
                    'path': child.path,
                    'name': child.name,
                    'opType': child.OPType,
                    'family': getattr(child, 'family', None),
                })
    except: pass
    ctx['siblings'] = siblings
    ctx['numSiblings'] = total_siblings
    
    # --- All open panes ---
    panes = []
    try:
        for p in ui.panes:
            try:
                panes.append({
                    'networkPath': p.owner.path if p.owner else '/',
                    'type': str(p.type) if hasattr(p, 'type') else 'unknown',
                })
            except: pass
    except: pass
    ctx['allPanes'] = panes
    
    # --- Spatial marker resolution hints ---
    resolved_this = None
    if focused is not None:
        resolved_this = focused['path']
    elif len(selected) > 0:
        resolved_this = selected[0]['path']
    else:
        resolved_this = network_path
    ctx['spatialMarkers'] = {
        '*here': network_path,
        '*this': resolved_this,
        '*parent': parent_path,
        '*selected': [s['path'] for s in selected],
    }
    
    print(json.dumps({'success': True, 'context': ctx}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`;
    return this.executeJson<any>(code);
  }

  async getPerf(path?: string, top?: number): Promise<any> {
    const safePath = path ? path.replace(/'/g, "\\'") : "/";
    const code = `import json
try:
    target = op('${safePath}')
    if target is None: print(json.dumps({'success':False,'error':'Path not found'}))
    else:
        perf = {}
        try:
            perf['fps'] = round(1.0 / absTime.stepSeconds, 1) if absTime.stepSeconds > 0 else 0
            perf['targetFps'] = int(project.cookRate) if hasattr(project,'cookRate') else None
            perf['playing'] = op('/').time.play if hasattr(op('/').time,'play') else None
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
    const count = lines ?? 20;
    const code = `import json
try:
    entries = []
    try:
        log = op.TDPerformance.getLog()
    except:
        log = ""
    lines_list = log.split('\\\\n') if log else []
    recent = lines_list[-${count}:] if lines_list else []
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
    const sp = Py.esc(path);
    const code = `import json
try:
    t = op('${sp}')
    if t is None: print(json.dumps({'success':False,'error':'Operator not found'}))
    else:
        p = ui.panes[0] if ui.panes else None
        if p:
            p.owner = t.parent() if t.parent() else t
            p.home()
        print(json.dumps({'success':True,'path':t.path,'parent':t.parent().path if t.parent() else None}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Extension reinit
  // ---------------------------------------------------------------------------

  async reinitExtension(path: string): Promise<any> {
    const sp = Py.esc(path);
    const code = new Py()
      .import_("json")
      .tryBody(`t = op('${sp}')`)
      .tryBody(`if t is None: print(json.dumps({'success':False,'error':'COMP not found'}))`)
      .tryBody(`else:`)
      .tryBody(`    t.reinitExtension()`)
      .tryBody(`    print(json.dumps({'success':True,'path':t.path,'message':'Extension reinitialized'}))`)
      .exceptBody(`print(json.dumps({'success':False,'error':str(e)}))`)
      .build();
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Batch screenshots
  // ---------------------------------------------------------------------------

  async getScreenshots(paths: string[], maxSize?: number): Promise<any> {
    const pathsJson = JSON.stringify(paths);
    const code =
      "import json,tempfile,base64,os\n" +
      "try:\n" +
      "    plist = " +
      pathsJson +
      "\n" +
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

  /**
   * Take screenshots of multiple operators.
   * Returns a properly typed array of ScreenshotResult.
   */
  async screenshotMulti(
    paths: string[],
    maxSize?: number,
  ): Promise<ScreenshotResult[]> {
    const pathsJson = JSON.stringify(paths);
    const resizeCode =
      maxSize !== undefined
        ? `\n        try:\n            from PIL import Image as PILImage\n            import io\n            img_data = open(tf, 'rb').read()\n            pil_img = PILImage.open(io.BytesIO(img_data))\n            w, h = pil_img.size\n            if w > ${maxSize} or h > ${maxSize}:\n                if w >= h:\n                    new_w = ${maxSize}\n                    new_h = int(h * ${maxSize} / w)\n                else:\n                    new_h = ${maxSize}\n                    new_w = int(w * ${maxSize} / h)\n                pil_img = pil_img.resize((new_w, new_h), PILImage.LANCZOS)\n                buf = io.BytesIO()\n                pil_img.save(buf, format='PNG')\n                b64 = base64.b64encode(buf.getvalue()).decode()\n            else:\n                b64 = base64.b64encode(img_data).decode()\n        except ImportError:\n            b64 = base64.b64encode(img_data).decode()`
        : "";
    const code =
      "import json,tempfile,base64,os\n" +
      `try:\n` +
      `    plist = ${pathsJson}\n` +
      `    results = []\n` +
      `    for p in plist:\n` +
      `        try:\n` +
      `            t = op(p)\n` +
      `            if t is None:\n` +
      `                results.append({'success':False,'path':p,'error':'Not found'})\n` +
      `            else:\n` +
      `                tf = tempfile.NamedTemporaryFile(suffix='.png',delete=False).name\n` +
      `                try:\n` +
      `                    t.save(tf)\n` +
      `                    b64 = base64.b64encode(open(tf,'rb').read()).decode()` +
      `${resizeCode}\n` +
      `                    results.append({'success':True,'path':t.path,'image':b64})\n` +
      `                finally:\n` +
      `                    try: os.unlink(tf)\n` +
      `                    except: pass\n` +
      `        except Exception as e:\n` +
      `            results.append({'success':False,'path':p,'error':str(e)})\n` +
      `    print(json.dumps({'success':True,'results':results,'count':len(results)}))\n` +
      `except Exception as e:\n` +
      `    print(json.dumps({'success':False,'error':str(e)}))`;
    const result = await this.executeJson<{ results: ScreenshotResult[] }>(
      code,
    );
    return result.results ?? [];
  }

  // ---------------------------------------------------------------------------
  // td_pulse_param
  // ---------------------------------------------------------------------------

  async pulseParam(path: string, name: string): Promise<any> {
    const sp = Py.esc(path);
    const sn = Py.esc(name);
    const code = `import json
try:
    t = op('${sp}')
    if t is None: print(json.dumps({'success':False,'error':'Not found'}))
    else:
        found = False
        for p in t.pars('*'):
            if p.name.lower() == '${sn}'.lower():
                p.pulse()
                found = True
                print(json.dumps({'success':True,'path':t.path,'par':p.name}))
                break
        if not found:
            for p in t.pars('*'):
                if '${sn}'.lower() in p.name.lower():
                    p.pulse()
                    found = True
                    print(json.dumps({'success':True,'path':t.path,'par':p.name,'matched':'fuzzy'}))
                    break
        if not found:
            print(json.dumps({'success':False,'error':f'Parameter \\"${sn}\\" not found', 'available':[p.name for p in t.pars('*')[:10]]}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // td_copy_node
  // ---------------------------------------------------------------------------

  async copyNode(
    path: string,
    destination?: string,
    name?: string,
  ): Promise<any> {
    const safeSrc = path.replace(/'/g, "\\'");
    const safeDst = destination ? destination.replace(/'/g, "\\'") : "";
    const safeName = name ? name.replace(/'/g, "\\'") : "";
    const code = `import json,base64
try:
    src = op('${safeSrc}')
    if src is None:
        print(json.dumps({'success':False,'error':'Source not found'}))
    else:
        dst_parent = op('${safeDst}') if '${safeDst}' else src.parent()
        if dst_parent is None:
            print(json.dumps({'success':False,'error':'Destination parent not found'}))
        else:
            new_name = src.name + '_copy'
            if '${safeName}':
                new_name = '${safeName}'
            newOp = dst_parent.copy(src)
            if newOp and new_name:
                newOp.name = new_name
            print(json.dumps({'success':True,'source':src.path,'parent':dst_parent.path,'name':newOp.name if newOp else new_name}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // td_disconnect
  // ---------------------------------------------------------------------------

  async disconnect(path: string, inputIndex?: number): Promise<any> {
    const sp = Py.esc(path);
    const idx = inputIndex ?? 0;
    const code = `import json
try:
    t = op('${sp}')
    if t is None: print(json.dumps({'success':False,'error':'Not found'}))
    else:
        idx = ${idx}
        if idx < len(t.inputConnectors):
            t.inputConnectors[idx].disconnect()
            print(json.dumps({'success':True,'path':t.path,'input':idx}))
        else:
            print(json.dumps({'success':False,'error':'Input index out of range'}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // Memory System (simple JSON-based)
  // ---------------------------------------------------------------------------

  async memorySave(
    key: string,
    content: string,
    tags?: string[],
  ): Promise<any> {
    const code = `import json, os
try:
    memDir = op.findPath(op('~').path + '/.hermes/skills/memory') if hasattr(op,'findPath') else os.path.expanduser('~/.hermes/skills/memory')
    os.makedirs(memDir, exist_ok=True)
    entry = {'key':'${key.replace(/'/g, "\\'")}','content':'${content.replace(/'/g, "\\'")}','tags':${JSON.stringify(tags ?? [])}}
    fpath = os.path.join(memDir, '${key.replace(/'/g, "\\'")}.json')
    with open(fpath,'w') as f: json.dump(entry, f)
    print(json.dumps({'success':True,'key':'${key.replace(/'/g, "\\'")}','path':fpath}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  async memoryRecall(query: string, limit?: number): Promise<any> {
    const code = `import json, os, glob, re
try:
    memDir = os.path.expanduser('~/.hermes/skills/memory')
    q = '${query.replace(/'/g, "\\'")}'.lower()
    limit = ${limit ?? 5}
    results = []
    if os.path.isdir(memDir):
        for f in glob.glob(os.path.join(memDir, '*.json')):
            try:
                with open(f) as fh: entry = json.load(fh)
                score = 0
                if q in entry.get('key','').lower(): score += 3
                if q in entry.get('content','').lower(): score += 2
                for t in entry.get('tags',[]):
                    if q in t.lower(): score += 1
                if score > 0:
                    results.append({'key':entry['key'],'content':entry['content'][:200],'tags':entry.get('tags',[]),'score':score})
            except: pass
    results.sort(key=lambda x: -x['score'])
    print(json.dumps({'success':True,'results':results[:limit],'total':len(results)}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }

  // ---------------------------------------------------------------------------
  // tool_batch — execute multiple tools sequentially
  // ---------------------------------------------------------------------------

  async toolBatch(
    tools: Array<{ name: string; args?: any }>,
  ): Promise<any> {
    const results = [];
    for (const tool of tools) {
      try {
        const method = (this as any)[tool.name];
        if (typeof method === "function") {
          const r = await method.call(this, tool.args);
          results.push({ name: tool.name, success: true, result: r });
        } else {
          results.push({
            name: tool.name,
            success: false,
            error: "Method not found: " + tool.name,
          });
        }
      } catch (e: any) {
        results.push({ name: tool.name, success: false, error: e.message });
      }
    }
    return { success: true, results };
  }

  // ---------------------------------------------------------------------------
  // td_explore_project — guided tour of the entire project
  // ---------------------------------------------------------------------------

  async exploreProject(path: string = "/"): Promise<any> {
    const safePath = path.replace(/'/g, "\\'");
    const code = `import json
try:
    MAX_DEPTH = 5
    
    project_info = {
        'root': '${safePath}',
        'tdBuild': None,
        'fps': None,
        'playing': None,
    }
    try: project_info['tdBuild'] = str(tdu.Build)
    except: pass
    try: project_info['fps'] = round(1.0 / absTime.stepSeconds, 1) if absTime.stepSeconds > 0 else 0
    except: pass
    try: project_info['playing'] = op('/').time.play if hasattr(op('/').time, 'play') else None
    except: pass
    
    state = {'total_ops': 0}
    family_counts = {}
    op_type_counts = {}
    errors_found = []
    perf_hotspots = []
    custom_par_comps = []
    extensions = []
    glsl_shaders = []
    
    def walk(node, depth=0):
        if node is None or depth > MAX_DEPTH:
            return
        try:
            for child in node.children:
                if state['total_ops'] > 200:
                    break
                state['total_ops'] += 1
                
                fam = getattr(child, 'family', 'Unknown') or 'Unknown'
                family_counts[fam] = family_counts.get(fam, 0) + 1
                
                op_type = child.OPType
                op_type_counts[op_type] = op_type_counts.get(op_type, 0) + 1
                
                try:
                    child.cook(force=True)
                except: pass
                try:
                    e = child.errors(recurse=False)
                    if e:
                        errors_found.append({'path': child.path, 'name': child.name, 'opType': op_type, 'error': str(e)[:200]})
                except: pass
                
                try:
                    ct = getattr(child, 'cookTime', None)
                    if ct is not None and ct > 0.001:
                        perf_hotspots.append({'path': child.path, 'name': child.name, 'opType': op_type, 'cpu_ms': round(ct * 1000, 2)})
                except: pass
                
                try:
                    if hasattr(child, 'customPages') and child.customPages:
                        pages = [p.name for p in child.customPages]
                        if len(custom_par_comps) < 20:
                            custom_par_comps.append({'path': child.path, 'name': child.name, 'opType': op_type, 'pages': pages})
                except: pass
                
                try:
                    ext = getattr(child, 'extensionNames', [])
                    if ext:
                        if len(extensions) < 20:
                            extensions.append({'path': child.path, 'name': child.name, 'extensions': list(ext)})
                except: pass
                
                try:
                    if 'glsl' in op_type.lower() or (hasattr(child, 'text') and 'gl_Position' in getattr(child, 'text', '')):
                        glsl_shaders.append({'path': child.path, 'name': child.name, 'opType': op_type})
                except: pass
                
                if hasattr(child, 'children'):
                    walk(child, depth + 1)
        except: pass
    
    root_op = op('${safePath}')
    if root_op is None:
        print(json.dumps({'success': False, 'error': f'Path not found: ${safePath}'}))
    else:
        walk(root_op)
        
        perf_hotspots.sort(key=lambda x: x.get('cpu_ms', 0), reverse=True)
        perf_hotspots = perf_hotspots[:15]
        errors_found = errors_found[:20]
        top_types = sorted(op_type_counts.items(), key=lambda x: -x[1])[:15]
        
        summary_parts = []
        summary_parts.append(f'{state["total_ops"]} operators found')
        if family_counts:
            fam_str = ', '.join(f'{k}: {v}' for k, v in sorted(family_counts.items(), key=lambda x: -x[1])[:5])
            summary_parts.append(f'Families: {fam_str}')
        if errors_found:
            summary_parts.append(f'{len(errors_found)} errors detected')
        if perf_hotspots:
            summary_parts.append(f'{len(perf_hotspots)} slow operators (>1ms)')
        if glsl_shaders:
            summary_parts.append(f'{len(glsl_shaders)} GLSL shaders')
        if extensions:
            summary_parts.append(f'{len(extensions)} operators with extensions')
        if custom_par_comps:
            summary_parts.append(f'{len(custom_par_comps)} operators with custom parameters')
        
        result = {
            'success': True,
            'projectInfo': project_info,
            'summary': '; '.join(summary_parts),
            'totalOperators': state['total_ops'],
            'familyBreakdown': family_counts,
            'topOperatorTypes': [{'opType': t, 'count': c} for t, c in top_types],
            'errors': errors_found,
            'performanceHotspots': perf_hotspots,
            'glslShaders': glsl_shaders,
            'extensions': extensions,
            'customParameters': custom_par_comps,
        }
        print(json.dumps(result))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`;
    return this.executeJson<any>(code, path);
  }

  // ---------------------------------------------------------------------------
  // td_search_official_docs — search the offline help
  // ---------------------------------------------------------------------------

  async searchOfficialDocs(query: string, limit?: number): Promise<any> {
    const code = `import json, re
try:
    t = op('/ui/dialogs/parGrabber/offlineHelp')
    text = t.text
    q = '${query.replace(/'/g, "\\'")}'
    limit = ${limit ?? 5}
    results = []
    # Search for operator names containing the query
    for match in re.finditer(r'"([^"]+POP|[^"]+TOP|[^"]+CHOP|[^"]+SOP|[^"]+DAT|[^"]+COMP)":\\s*\\{[^}]+"summary":\\s*"([^"]+)"', text, re.IGNORECASE):
        name = match.group(1)
        summary = match.group(2)
        if q.lower() in name.lower() or q.lower() in summary.lower():
            results.append({'operator':name,'summary':summary[:200]})
            if len(results) >= limit: break
    print(json.dumps({'success':True,'results':results,'query':q}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
    return this.executeJson<any>(code);
  }
}
