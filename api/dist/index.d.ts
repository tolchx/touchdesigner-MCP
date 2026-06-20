/**
 * TouchDesigner HTTP API Client
 *
 * Unified HTTP client that routes all TouchDesigner operator interactions
 * through /exec (inline Python). Provides a consistent interface for
 * operator CRUD, parameter management, DAT/CHOP I/O, searching, and
 * performance monitoring.
 */
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
    inputs: Array<{
        index: number;
        path: string;
        name: string;
        opType: string;
    }>;
    outputs: Array<{
        path: string;
        name: string;
        opType: string;
    }>;
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
export declare class TDClient {
    private baseUrl;
    private host;
    private port;
    private connectionTimeout;
    private requestTimeout;
    private transport;
    private _ws;
    private _wsConnecting;
    private _wsFailed;
    private _wsFailedAt;
    private _connectedCache;
    private _lastKnownConnected;
    private _watchdogTimer;
    private _watchdogLastState;
    /**
     * Callback invoked when the connection state changes (detected by watchdog).
     */
    onConnectionChange: ((connected: boolean) => void) | null;
    /**
     * Returns the last known connection state without making an HTTP request.
     */
    get isConnectedCached(): boolean;
    constructor(options?: TDClientOptions);
    private _ensureWebSocket;
    /**
     * Execute a request against the TD API. Routes through WebSocket when
     * transport is 'websocket' or 'auto' (trying WebSocket first with HTTP
     * fallback). Falls back to HTTP when transport is 'http' or when the
     * WebSocket is unavailable.
     */
    private _request;
    /**
     * Route an HTTP-style request through the WebSocket JSON-RPC protocol.
     * Maps URL path + method to a WebSocket method name and params.
     */
    private _requestViaWebSocket;
    /**
     * Execute an HTTP request against the TD API with timeout and standardised
     * error handling.  Throws on non-2xx responses including the body text.
     */
    private _requestViaHttp;
    /**
     * Run arbitrary Python inside TouchDesigner and return stdout + stderr.
     * Uses the /exec twozero-compatible endpoint.
     */
    execute(code: string, fromOp?: string): Promise<ExecuteResult>;
    /**
     * Helper: run Python and parse stdout as JSON.  Used internally by every
     * tool method that needs structured data from TD.
     */
    private executeJson;
    /**
     * Auto-arrange operators in a container using a topological-sort layout.
     * Sources end up on the left, outputs on the right, organized as a clean
     * grid.  Works for all operator families including POPs.
     *
     * Wraps the TD HTTP `POST /auto_layout` endpoint.
     */
    autoLayout(path?: string, spacingX?: number, spacingY?: number): Promise<any>;
    /**
     * Create an operator between two existing operators with auto-detected
     * type compatibility. Auto-positions and wires the new operator.
     *
     * The TD handler accepts both `source/destination/type` and
     * `src/dst/target_type` parameter names; this method sends the
     * `source/destination/type` form.
     */
    smartConnect(source: string, destination: string, opType?: string, name?: string): Promise<any>;
    /**
     * Quick connectivity check.  Returns `true` if the TD API responds to a
     * GET /info within the configured connectionTimeout.
     * Uses a 2-second TTL cache to avoid hammering the endpoint.
     */
    isConnected(): Promise<boolean>;
    /**
     * Start a watchdog timer that periodically checks connection state.
     * Fires `onConnectionChange` when the state transitions.
     */
    startConnectionWatchdog(intervalMs?: number): void;
    /**
     * Stop the connection watchdog timer.
     */
    stopConnectionWatchdog(): void;
    /**
     * Submit Python code for asynchronous execution in TouchDesigner.
     * Returns immediately with a taskId that can be polled via getTaskStatus().
     */
    executeAsync(code: string, fromOp?: string): Promise<{
        taskId: string;
    }>;
    /**
     * Poll the status of an async execution task.
     */
    getTaskStatus(taskId: string): Promise<{
        status: string;
        result?: any;
    }>;
    /**
     * Poll a task until it completes or times out.
     * @returns The task result on completion.
     * @throws If the task fails or the timeout is exceeded.
     */
    waitForTask(taskId: string, timeoutMs?: number, pollIntervalMs?: number): Promise<any>;
    getPaneState(): Promise<PaneState | null>;
    getSelection(): Promise<SelectionResult>;
    getOperators(path?: string): Promise<OperatorsResult>;
    getParameters(path: string, names?: string[]): Promise<ParametersResult>;
    setParameters(path: string, updates: ParameterUpdate[], transactional?: boolean): Promise<ParameterSetResult>;
    getConnections(path: string, recurse?: boolean): Promise<ConnectionsResult>;
    findOperators(options: {
        path?: string;
        query?: string;
        name?: string;
        family?: string;
        opType?: string;
        recursive?: boolean;
        limit?: number;
    }): Promise<FindResult>;
    healthcheck(path?: string, recurse?: boolean): Promise<HealthcheckResult>;
    getInfo(): Promise<any>;
    createOperator(type: string, name?: string, path?: string, positionX?: number, positionY?: number): Promise<CreateOperatorResult>;
    deleteOperator(path: string): Promise<DeleteOperatorResult>;
    connectNodes(sourcePath: string, targetPath: string, targetInput?: number): Promise<ConnectNodesResult>;
    getErrors(path: string, recurse?: boolean): Promise<GetErrorsResult>;
    screenshot(path?: string, maxSize?: number): Promise<ScreenshotResult>;
    projectLifecycle(action: string, filePath?: string): Promise<ProjectLifecycleResult>;
    popInspect(path: string): Promise<any>;
    getNodeDetail(path: string, recurse?: boolean): Promise<any>;
    getHints(nodeType: string): Promise<any>;
    getBuildCompatibility(opType: string): Promise<any>;
    readDat(path: string, startLine?: number, endLine?: number): Promise<any>;
    writeDat(path: string, text?: string, oldText?: string, newText?: string, replaceAll?: boolean): Promise<any>;
    readChop(path: string, channels?: string[], start?: number, end?: number): Promise<any>;
    searchInTD(query: string, root?: string, scope?: string, caseSensitive?: boolean, maxResults?: number, countOnly?: boolean): Promise<any>;
    snapshotScene(path?: string): Promise<any>;
    getReleaseDelta(buildFrom: string, buildTo?: string): Promise<any>;
    customParameters(path: string, pageName: string, params: Array<{
        name: string;
        type?: string;
        default?: number;
        min?: number;
        max?: number;
        label?: string;
    }>): Promise<any>;
    getFocus(): Promise<any>;
    /**
     * Get comprehensive spatial context: current network, selected operators,
     * focused operator, parent path, siblings, and pane state.
     * Designed for *here and *this spatial markers.
     */
    getSpatialContext(): Promise<any>;
    getPerf(path?: string, top?: number): Promise<any>;
    readTextport(lines?: number): Promise<any>;
    clearTextport(): Promise<any>;
    navigateTo(path: string): Promise<any>;
    reinitExtension(path: string): Promise<any>;
    getScreenshots(paths: string[], maxSize?: number): Promise<any>;
    /**
     * Take screenshots of multiple operators.
     * Returns a properly typed array of ScreenshotResult.
     */
    screenshotMulti(paths: string[], maxSize?: number): Promise<ScreenshotResult[]>;
    pulseParam(path: string, name: string): Promise<any>;
    copyNode(path: string, destination?: string, name?: string): Promise<any>;
    disconnect(path: string, inputIndex?: number): Promise<any>;
    memorySave(key: string, content: string, tags?: string[]): Promise<any>;
    memoryRecall(query: string, limit?: number): Promise<any>;
    toolBatch(tools: Array<{
        name: string;
        args?: any;
    }>): Promise<any>;
    exploreProject(path?: string): Promise<any>;
    searchOfficialDocs(query: string, limit?: number): Promise<any>;
}
