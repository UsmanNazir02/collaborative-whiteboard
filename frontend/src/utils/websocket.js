// src/utils/websocket.js

export const connectWebSocket = (sessionId, onMessage) => {
    const wsUrl = `ws://localhost:8000/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected to session:', sessionId);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            onMessage(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);

        // Attempt to reconnect after a delay
        setTimeout(() => {
            if (ws.readyState === WebSocket.CLOSED) {
                console.log('Attempting to reconnect...');
                connectWebSocket(sessionId, onMessage);
            }
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    return ws;
};

export const sendMessage = (ws, message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        return true;
    }
    console.warn('WebSocket not ready, message not sent:', message);
    return false;
};