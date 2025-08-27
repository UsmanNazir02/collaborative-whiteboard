// src/utils/websocket.js - Debug Version

class WebSocketManager {
    constructor(sessionId, onMessage) {
        this.sessionId = sessionId;
        this.onMessage = onMessage;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3; // Reduced for debugging
        this.reconnectDelay = 5000; // Increased delay
        this.isIntentionallyClosed = false;
        this.connectionId = Math.random().toString(36).substr(2, 9);

        console.log(`[WebSocket ${this.connectionId}] Created manager for session ${sessionId}`);
    }

    connect() {
        // Prevent multiple connections
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            console.log(`[WebSocket ${this.connectionId}] Connection already exists, state: ${this.ws.readyState}`);
            return this.ws;
        }

        const wsUrl = `ws://localhost:8000/ws/${this.sessionId}`;
        console.log(`[WebSocket ${this.connectionId}] Connecting to: ${wsUrl}`);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = (event) => {
            console.log(`[WebSocket ${this.connectionId}] Connected successfully to session: ${this.sessionId}`);
            console.log(`[WebSocket ${this.connectionId}] Connection event:`, event);
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log(`[WebSocket ${this.connectionId}] Message received:`, data.type, data);
                if (this.onMessage) {
                    this.onMessage(data);
                }
            } catch (error) {
                console.error(`[WebSocket ${this.connectionId}] Error parsing message:`, error, event.data);
            }
        };

        this.ws.onclose = (event) => {
            console.log(`[WebSocket ${this.connectionId}] Connection closed:`, {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                intentionally: this.isIntentionallyClosed
            });

            // Log common close codes
            const closeCodes = {
                1000: 'Normal Closure',
                1001: 'Going Away',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received',
                1006: 'Abnormal Closure',
                1007: 'Invalid frame payload data',
                1008: 'Policy Violation',
                1009: 'Message too big',
                1010: 'Missing Extension',
                1011: 'Internal Error',
                1012: 'Service Restart',
                1013: 'Try Again Later',
                1014: 'Bad Gateway',
                1015: 'TLS Handshake'
            };

            console.log(`[WebSocket ${this.connectionId}] Close code meaning: ${closeCodes[event.code] || 'Unknown'}`);

            // Don't reconnect if we intentionally closed the connection
            if (this.isIntentionallyClosed) {
                console.log(`[WebSocket ${this.connectionId}] Connection was intentionally closed, not reconnecting`);
                return;
            }

            // Don't reconnect if we've exceeded max attempts
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log(`[WebSocket ${this.connectionId}] Max reconnection attempts (${this.maxReconnectAttempts}) reached, giving up`);
                return;
            }

            // Don't reconnect on certain error codes
            if (event.code === 1008 || event.code === 1003) {
                console.log(`[WebSocket ${this.connectionId}] Not reconnecting due to error code: ${event.code}`);
                return;
            }

            // Attempt to reconnect after a delay
            this.reconnectAttempts++;
            console.log(`[WebSocket ${this.connectionId}] Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);

            setTimeout(() => {
                if (!this.isIntentionallyClosed && this.reconnectAttempts <= this.maxReconnectAttempts) {
                    console.log(`[WebSocket ${this.connectionId}] Executing reconnection attempt ${this.reconnectAttempts}`);
                    this.connect();
                } else {
                    console.log(`[WebSocket ${this.connectionId}] Skipping reconnection: intentionally closed=${this.isIntentionallyClosed}, attempts=${this.reconnectAttempts}`);
                }
            }, this.reconnectDelay);
        };

        this.ws.onerror = (error) => {
            console.error(`[WebSocket ${this.connectionId}] Error occurred:`, error);
            console.error(`[WebSocket ${this.connectionId}] WebSocket state:`, this.ws?.readyState);
        };

        return this.ws;
    }

    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const messageStr = JSON.stringify(message);
            console.log(`[WebSocket ${this.connectionId}] Sending message:`, message.type, message);
            this.ws.send(messageStr);
            return true;
        }
        console.warn(`[WebSocket ${this.connectionId}] Cannot send message - WebSocket not ready. State: ${this.ws?.readyState}`, message);
        return false;
    }

    disconnect() {
        console.log(`[WebSocket ${this.connectionId}] Intentionally disconnecting`);
        this.isIntentionallyClosed = true;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(1000, 'User disconnected');
        }
        this.ws = null;
    }

    isConnected() {
        const connected = this.ws && this.ws.readyState === WebSocket.OPEN;
        console.log(`[WebSocket ${this.connectionId}] Connection check: ${connected} (state: ${this.ws?.readyState})`);
        return connected;
    }
}

// Export functions for backward compatibility
export const connectWebSocket = (sessionId, onMessage) => {
    console.log(`[WebSocket] Creating new manager for session: ${sessionId}`);
    const manager = new WebSocketManager(sessionId, onMessage);
    manager.connect();
    return manager;
};

export const sendMessage = (wsManager, message) => {
    if (wsManager && wsManager.sendMessage) {
        return wsManager.sendMessage(message);
    }
    // Fallback for direct WebSocket usage
    if (wsManager && wsManager.readyState === WebSocket.OPEN) {
        wsManager.send(JSON.stringify(message));
        return true;
    }
    console.warn('[WebSocket] Cannot send message - manager not ready:', message);
    return false;
};