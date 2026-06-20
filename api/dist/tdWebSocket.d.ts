/**
 * TouchDesigner WebSocket Transport Client
 *
 * Persistent WebSocket connection to TD's WebServer DAT.
 * Replaces HTTP fetch() with a single long-lived connection,
 * eliminating per-request TCP overhead (~0.3ms vs ~3ms).
 *
 * Protocol: JSON-RPC over WebSocket text frames.
 *   Request:  { "id": 1, "method": "exec", "params": { "code": "..." } }
 *   Response: { "id": 1, "result": { "output": "..." } }
 *   Error:    { "id": 1, "error": { "code": -1, "message": "..." } }
 */
export interface TDWebSocketOptions {
    host?: string;
    port?: number;
    /** Timeout in ms for individual requests (default 30000). */
    requestTimeout?: number;
    /** Base URL for the WebSocket connection. */
    wsUrl?: string;
}
export declare class TDWebSocketClient {
    private ws;
    private wsUrl;
    private requestTimeout;
    private msgId;
    private pending;
    private _connected;
    private _reconnectTimer;
    private _heartbeatTimer;
    private _pongTimer;
    private _reconnectAttempts;
    private _destroyed;
    /** Callback when connection state changes. */
    onConnectionChange: ((connected: boolean) => void) | null;
    constructor(options?: TDWebSocketOptions);
    /**
     * Open the WebSocket connection. Resolves when connected or rejects on failure.
     */
    connect(): Promise<void>;
    /**
     * Close the WebSocket connection gracefully.
     */
    disconnect(): void;
    /** Whether the WebSocket is currently connected. */
    get connected(): boolean;
    /**
     * Send a JSON-RPC request and wait for the response.
     * Maps directly to the HTTP endpoints (method = "exec", "info", etc.).
     */
    request(method: string, params?: Record<string, unknown>, timeout?: number): Promise<unknown>;
    private _handleMessage;
    private _setConnected;
    private _rejectAllPending;
    private _scheduleReconnect;
    private _startHeartbeat;
    private _stopHeartbeat;
    private _stopPongTimer;
}
