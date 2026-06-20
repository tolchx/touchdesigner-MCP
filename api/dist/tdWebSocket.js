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
import WebSocket from "ws";
// ---------------------------------------------------------------------------
// TDWebSocketClient
// ---------------------------------------------------------------------------
export class TDWebSocketClient {
    ws = null;
    wsUrl;
    requestTimeout;
    msgId = 0;
    pending = new Map();
    // Connection state
    _connected = false;
    _reconnectTimer = null;
    _heartbeatTimer = null;
    _pongTimer = null;
    _reconnectAttempts = 0;
    _destroyed = false;
    /** Callback when connection state changes. */
    onConnectionChange = null;
    constructor(options = {}) {
        const host = options.host ?? process.env.TDAPI_HOST ?? "localhost";
        const port = options.port ?? parseInt(process.env.TDAPI_PORT ?? "44444", 10);
        this.wsUrl =
            options.wsUrl ?? `ws://${host}:${port}`;
        this.requestTimeout = options.requestTimeout ?? 30000;
    }
    // ---------------------------------------------------------------------------
    // Connection lifecycle
    // ---------------------------------------------------------------------------
    /**
     * Open the WebSocket connection. Resolves when connected or rejects on failure.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }
            this._destroyed = false;
            try {
                this.ws = new WebSocket(this.wsUrl);
            }
            catch (e) {
                reject(new Error(`Failed to create WebSocket: ${e}`));
                return;
            }
            const connectTimeout = setTimeout(() => {
                this.ws?.close();
                reject(new Error(`WebSocket connection timed out: ${this.wsUrl}`));
            }, 5000);
            this.ws.on("open", () => {
                clearTimeout(connectTimeout);
                this._reconnectAttempts = 0;
                this._setConnected(true);
                this._startHeartbeat();
                resolve();
            });
            // Pong listener — added once per connection, not per heartbeat cycle
            this.ws.on("pong", () => {
                this._stopPongTimer();
            });
            this.ws.on("message", (data) => {
                this._handleMessage(data.toString());
            });
            this.ws.on("close", (code, reason) => {
                clearTimeout(connectTimeout);
                this._setConnected(false);
                this._stopHeartbeat();
                this._rejectAllPending(new Error(`WebSocket closed: ${code} ${reason}`));
                this._scheduleReconnect();
            });
            this.ws.on("error", (err) => {
                clearTimeout(connectTimeout);
                // 'error' is followed by 'close', so we don't reject here
                // to avoid double-reject. The 'close' handler handles cleanup.
            });
        });
    }
    /**
     * Close the WebSocket connection gracefully.
     */
    disconnect() {
        this._destroyed = true;
        this._stopHeartbeat();
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._rejectAllPending(new Error("Client disconnected"));
        if (this.ws) {
            this.ws.close(1000, "Client disconnect");
            this.ws = null;
        }
        this._setConnected(false);
    }
    /** Whether the WebSocket is currently connected. */
    get connected() {
        return this._connected;
    }
    // ---------------------------------------------------------------------------
    // Request / Response
    // ---------------------------------------------------------------------------
    /**
     * Send a JSON-RPC request and wait for the response.
     * Maps directly to the HTTP endpoints (method = "exec", "info", etc.).
     */
    async request(method, params = {}, timeout) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }
        const id = ++this.msgId;
        const msg = { id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request timed out after ${timeout ?? this.requestTimeout}ms: ${method}`));
            }, timeout ?? this.requestTimeout);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify(msg), (err) => {
                if (err) {
                    clearTimeout(timer);
                    this.pending.delete(id);
                    reject(new Error(`WebSocket send error: ${err.message}`));
                }
            });
        });
    }
    // ---------------------------------------------------------------------------
    // Internal handlers
    // ---------------------------------------------------------------------------
    _handleMessage(raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            return; // ignore non-JSON messages
        }
        const id = msg.id;
        if (id === null || id === undefined) {
            return; // server push notification (future use)
        }
        const pending = this.pending.get(id);
        if (!pending) {
            return; // stale or unknown response
        }
        clearTimeout(pending.timer);
        this.pending.delete(id);
        if (msg.error) {
            pending.reject(new Error(`TD Error [${msg.error.code}]: ${msg.error.message}`));
        }
        else {
            pending.resolve(msg.result);
        }
    }
    _setConnected(connected) {
        if (this._connected === connected)
            return;
        this._connected = connected;
        if (this.onConnectionChange) {
            this.onConnectionChange(connected);
        }
    }
    _rejectAllPending(err) {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(err);
        }
        this.pending.clear();
    }
    // ---------------------------------------------------------------------------
    // Auto-reconnect
    // ---------------------------------------------------------------------------
    _scheduleReconnect() {
        if (this._destroyed)
            return;
        if (this._reconnectTimer)
            return;
        // Exponential backoff: 1s, 2s, 4s, max 10s
        const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 10000);
        this._reconnectAttempts++;
        this._reconnectTimer = setTimeout(async () => {
            this._reconnectTimer = null;
            if (this._destroyed)
                return;
            try {
                await this.connect();
            }
            catch {
                // connect() failure will trigger 'close' → _scheduleReconnect again
            }
        }, delay);
    }
    // ---------------------------------------------------------------------------
    // Heartbeat (ping/pong keep-alive)
    // ---------------------------------------------------------------------------
    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
                // Stale connection detection: if no pong within 10s, close to trigger reconnect
                this._stopPongTimer();
                this._pongTimer = setTimeout(() => {
                    this.ws?.close(4000, "Pong timeout");
                }, 10000);
            }
        }, 25000);
    }
    _stopHeartbeat() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        this._stopPongTimer();
    }
    _stopPongTimer() {
        if (this._pongTimer) {
            clearTimeout(this._pongTimer);
            this._pongTimer = null;
        }
    }
}
