/**
 * TouchDesigner HTTP API Client
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
export interface TDClientOptions {
    host?: string;
    port?: number;
}
export declare class TDClient {
    private baseUrl;
    constructor(options?: TDClientOptions);
    execute(code: string, fromOp?: string): Promise<ExecuteResult>;
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
    healthcheck(path: string, recurse?: boolean): Promise<HealthcheckResult>;
    getInfo(): Promise<any>;
    private executeJson;
    createOperator(type: string, name?: string, path?: string, positionX?: number, positionY?: number): Promise<CreateOperatorResult>;
    deleteOperator(path: string): Promise<DeleteOperatorResult>;
    connectNodes(sourcePath: string, targetPath: string, targetInput?: number): Promise<ConnectNodesResult>;
    getErrors(path: string, recurse?: boolean): Promise<GetErrorsResult>;
    screenshot(path?: string): Promise<ScreenshotResult>;
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
    customParameters(path: string, page: string, params: Array<{
        name: string;
        type?: string;
        default?: number;
        min?: number;
        max?: number;
        label?: string;
    }>): Promise<any>;
    getFocus(): Promise<any>;
    getPerf(path?: string, top?: number): Promise<any>;
    readTextport(lines?: number): Promise<any>;
    clearTextport(): Promise<any>;
    navigateTo(path: string): Promise<any>;
    reinitExtension(path: string): Promise<any>;
    getScreenshots(paths: string[], maxSize?: number): Promise<any>;
}
