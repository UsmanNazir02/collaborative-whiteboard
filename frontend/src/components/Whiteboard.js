// src/components/Whiteboard.js - Fixed Version
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from "fabric";
import Toolbar from './Toolbar';
import { connectWebSocket, sendMessage } from '../utils/websocket';

const Whiteboard = ({ sessionId, userId: initialUserId, onLeaveSession }) => {
    const canvasRef = useRef(null);
    const fabricRef = useRef(null);
    const wsManagerRef = useRef(null);
    const isInitializedRef = useRef(false); // Prevent multiple initializations
    const cleanupRef = useRef(null);

    const [isConnected, setIsConnected] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [userId, setUserId] = useState(initialUserId);
    const [currentTool, setCurrentTool] = useState('pen');
    const [currentColor, setCurrentColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [isDrawing, setIsDrawing] = useState(false);

    // Send WebSocket message helper
    const sendWebSocketMessage = useCallback((message) => {
        if (wsManagerRef.current) {
            return sendMessage(wsManagerRef.current, message);
        }
        return false;
    }, []);

    // WebSocket message handlers
    const handleWebSocketMessage = useCallback((data) => {
        console.log('[Whiteboard] Received WebSocket message:', data.type);
        const canvas = fabricRef.current;
        if (!canvas) return;

        switch (data.type) {
            case 'session_state':
                setUserId(data.user_id);
                setActiveUsers(data.active_users || []);
                setIsConnected(true);

                // Clear canvas first, then load existing objects
                canvas.clear();
                canvas.backgroundColor = 'white';

                // Load existing objects
                if (data.objects && data.objects.length > 0) {
                    console.log('[Whiteboard] Loading', data.objects.length, 'existing objects');
                    data.objects.forEach(obj => {
                        addObjectToCanvas(obj);
                    });
                }
                canvas.renderAll();
                break;

            case 'object_added':
                if (data.user_id !== userId) {
                    console.log('[Whiteboard] Adding object from another user:', data.object.type);
                    addObjectToCanvas(data.object);
                }
                break;

            case 'object_updated':
                if (data.user_id !== userId) {
                    console.log('[Whiteboard] Updating object from another user:', data.object_id);
                    updateObjectOnCanvas(data.object_id, data.updates);
                }
                break;

            case 'object_deleted':
                if (data.user_id !== userId) {
                    console.log('[Whiteboard] Deleting object from another user:', data.object_id);
                    removeObjectFromCanvas(data.object_id);
                }
                break;

            case 'canvas_cleared':
                if (data.user_id !== userId) {
                    console.log('[Whiteboard] Canvas cleared by another user');
                    canvas.clear();
                    canvas.backgroundColor = 'white';
                    canvas.renderAll();
                }
                break;

            case 'user_joined':
            case 'user_left':
                console.log('[Whiteboard] User list updated:', data.active_users);
                setActiveUsers(data.active_users || []);
                break;

            case 'error':
                console.error('[Whiteboard] WebSocket error:', data.message);
                break;

            default:
                console.log('[Whiteboard] Unknown message type:', data.type);
                break;
        }
    }, [userId]);

    // Initialize Fabric.js canvas (only once)
    const initCanvas = useCallback(() => {
        if (fabricRef.current || !canvasRef.current) {
            console.log('[Whiteboard] Canvas already initialized or canvas ref not ready');
            return null;
        }

        console.log('[Whiteboard] Initializing Fabric.js canvas');
        const canvas = new fabric.Canvas(canvasRef.current, {
            width: window.innerWidth - 300,
            height: window.innerHeight - 100,
            backgroundColor: 'white',
            isDrawingMode: true,
        });

        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = brushSize;

        fabricRef.current = canvas;

        // Handle path creation (drawing)
        canvas.on('path:created', (e) => {
            const path = e.path;
            const pathId = `path_${Date.now()}_${Math.random()}`;
            path.set({ id: pathId });

            const pathData = {
                id: pathId,
                type: 'path',
                data: {
                    path: path.path,
                    stroke: path.stroke,
                    strokeWidth: path.strokeWidth,
                    fill: path.fill || '',
                    left: path.left,
                    top: path.top,
                    scaleX: path.scaleX,
                    scaleY: path.scaleY,
                    angle: path.angle,
                }
            };

            sendWebSocketMessage({
                type: 'add_object',
                object: pathData
            });
        });

        // Handle object modifications (move, resize, rotate)
        canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (!obj.id) return;

            const updates = {
                left: obj.left,
                top: obj.top,
                scaleX: obj.scaleX,
                scaleY: obj.scaleY,
                angle: obj.angle,
            };

            // Add type-specific properties
            if (obj.type === 'rect') {
                updates.width = obj.width;
                updates.height = obj.height;
            } else if (obj.type === 'circle') {
                updates.radius = obj.radius;
            } else if (obj.type === 'textbox') {
                updates.text = obj.text;
                updates.fontSize = obj.fontSize;
            }

            sendWebSocketMessage({
                type: 'update_object',
                object_id: obj.id,
                updates: updates
            });
        });

        // Handle text editing
        canvas.on('text:changed', (e) => {
            const obj = e.target;
            if (!obj.id) return;

            sendWebSocketMessage({
                type: 'update_object',
                object_id: obj.id,
                updates: { text: obj.text }
            });
        });

        const handleResize = () => {
            canvas.setDimensions({
                width: window.innerWidth - 300,
                height: window.innerHeight - 100
            });
            canvas.renderAll();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            console.log('[Whiteboard] Cleaning up canvas');
            window.removeEventListener('resize', handleResize);
            canvas.dispose();
            fabricRef.current = null;
        };
    }, [currentColor, brushSize, sendWebSocketMessage]);

    // Add object to canvas
    const addObjectToCanvas = (objData) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        let fabricObject;

        if (objData.type === 'path') {
            fabricObject = new fabric.Path(objData.data.path, {
                id: objData.id,
                stroke: objData.data.stroke,
                strokeWidth: objData.data.strokeWidth,
                fill: objData.data.fill || '',
                left: objData.data.left,
                top: objData.data.top,
                scaleX: objData.data.scaleX || 1,
                scaleY: objData.data.scaleY || 1,
                angle: objData.data.angle || 0,
            });
        } else if (objData.type === 'rect') {
            fabricObject = new fabric.Rect({
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                width: objData.data.width,
                height: objData.data.height,
                fill: objData.data.fill,
                stroke: objData.data.stroke,
                strokeWidth: objData.data.strokeWidth,
                scaleX: objData.data.scaleX || 1,
                scaleY: objData.data.scaleY || 1,
                angle: objData.data.angle || 0,
            });
        } else if (objData.type === 'circle') {
            fabricObject = new fabric.Circle({
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                radius: objData.data.radius,
                fill: objData.data.fill,
                stroke: objData.data.stroke,
                strokeWidth: objData.data.strokeWidth,
                scaleX: objData.data.scaleX || 1,
                scaleY: objData.data.scaleY || 1,
                angle: objData.data.angle || 0,
            });
        } else if (objData.type === 'text' || objData.type === 'textbox') {
            fabricObject = new fabric.Textbox(objData.data.text, {
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                fontSize: objData.data.fontSize,
                fill: objData.data.fill,
                fontFamily: objData.data.fontFamily || 'Arial',
                scaleX: objData.data.scaleX || 1,
                scaleY: objData.data.scaleY || 1,
                angle: objData.data.angle || 0,
                editable: true,
            });
        }

        if (fabricObject) {
            canvas.add(fabricObject);
            canvas.renderAll();
        }
    };

    // Update object on canvas
    const updateObjectOnCanvas = (objectId, updates) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        const obj = objects.find(o => o.id === objectId);

        if (obj) {
            obj.set(updates);
            canvas.renderAll();
        }
    };

    // Remove object from canvas
    const removeObjectFromCanvas = (objectId) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        const obj = objects.find(o => o.id === objectId);

        if (obj) {
            canvas.remove(obj);
            canvas.renderAll();
        }
    };

    // Tool handlers
    const handleToolChange = (tool) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        setCurrentTool(tool);

        switch (tool) {
            case 'pen':
                canvas.isDrawingMode = true;
                canvas.selection = false;
                setIsDrawing(true);
                break;

            case 'select':
                canvas.isDrawingMode = false;
                canvas.selection = true;
                setIsDrawing(false);
                break;

            case 'rect':
            case 'circle':
            case 'text':
                canvas.isDrawingMode = false;
                canvas.selection = true;
                setIsDrawing(false);
                addShape(tool);
                break;

            default:
                break;
        }
    };

    // Add shape
    const addShape = (shapeType) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        let shape;
        const shapeId = `${shapeType}_${Date.now()}_${Math.random()}`;

        switch (shapeType) {
            case 'rect':
                shape = new fabric.Rect({
                    id: shapeId,
                    left: 100,
                    top: 100,
                    width: 200,
                    height: 100,
                    fill: 'transparent',
                    stroke: currentColor,
                    strokeWidth: 2,
                });
                break;
            case 'circle':
                shape = new fabric.Circle({
                    id: shapeId,
                    left: 100,
                    top: 100,
                    radius: 50,
                    fill: 'transparent',
                    stroke: currentColor,
                    strokeWidth: 2,
                });
                break;
            case 'text':
                shape = new fabric.Textbox('Type here...', {
                    id: shapeId,
                    left: 100,
                    top: 100,
                    fontSize: 20,
                    fill: currentColor,
                    fontFamily: 'Arial',
                    editable: true,
                });
                break;

            default:
                return;
        }

        if (shape) {
            canvas.add(shape);
            canvas.setActiveObject(shape);
            canvas.renderAll();

            // For text, enter editing mode immediately
            if (shapeType === 'text' && shape.enterEditing) {
                shape.enterEditing();
                shape.hiddenTextarea?.focus();
            }

            // Send to other users
            const shapeData = {
                id: shapeId,
                type: shapeType,
                data: shape.toObject()
            };

            sendWebSocketMessage({
                type: 'add_object',
                object: shapeData
            });
        }
    };

    // Delete selected object
    const deleteSelectedObject = () => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.id) {
            canvas.remove(activeObject);
            canvas.renderAll();

            sendWebSocketMessage({
                type: 'delete_object',
                object_id: activeObject.id
            });
        }
    };

    // Clear canvas
    const clearCanvas = () => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        canvas.clear();
        canvas.backgroundColor = 'white';
        canvas.renderAll();

        sendWebSocketMessage({
            type: 'clear_canvas'
        });
    };

    // Export session
    const exportSession = async () => {
        try {
            const response = await fetch(`http://localhost:8000/api/sessions/${sessionId}/export`, {
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `whiteboard_session_${sessionId}_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    };

    // Color and brush size handlers
    const handleColorChange = (color) => {
        setCurrentColor(color);
        const canvas = fabricRef.current;
        if (canvas && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = color;
        }
    };

    const handleBrushSizeChange = (size) => {
        setBrushSize(size);
        const canvas = fabricRef.current;
        if (canvas && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = size;
        }
    };

    // Update brush color
    useEffect(() => {
        const canvas = fabricRef.current;
        if (canvas && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = currentColor;
        }
    }, [currentColor]);

    // Update brush size
    useEffect(() => {
        const canvas = fabricRef.current;
        if (canvas && canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.width = brushSize;
        }
    }, [brushSize]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                deleteSelectedObject();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Main initialization effect - runs only once
    useEffect(() => {
        // Prevent multiple initializations (React StrictMode protection)
        if (isInitializedRef.current || !sessionId) {
            console.log('[Whiteboard] Skipping initialization - already initialized or no sessionId');
            return;
        }

        console.log('[Whiteboard] Starting initialization for session:', sessionId);
        isInitializedRef.current = true;

        // Initialize canvas
        const canvasCleanup = initCanvas();

        // Connect to WebSocket using the new manager
        console.log('[Whiteboard] Connecting to WebSocket...');
        wsManagerRef.current = connectWebSocket(sessionId, handleWebSocketMessage);

        // Store cleanup function
        cleanupRef.current = () => {
            console.log('[Whiteboard] Running cleanup...');
            setIsConnected(false);

            if (wsManagerRef.current) {
                wsManagerRef.current.disconnect();
                wsManagerRef.current = null;
            }

            if (canvasCleanup) {
                canvasCleanup();
            }

            isInitializedRef.current = false;
        };

        // Cleanup on unmount or sessionId change
        return cleanupRef.current;
    }, [sessionId]); // Only depend on sessionId

    // Separate effect for connection monitoring (to avoid recreating WebSocket)
    useEffect(() => {
        const checkConnection = () => {
            if (wsManagerRef.current && wsManagerRef.current.isConnected()) {
                setIsConnected(true);
            } else {
                setIsConnected(false);
            }
        };

        const connectionInterval = setInterval(checkConnection, 2000);
        return () => clearInterval(connectionInterval);
    }, []);

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Toolbar */}
            <Toolbar
                sessionId={sessionId}
                activeUsers={activeUsers}
                isConnected={isConnected}
                currentTool={currentTool}
                currentColor={currentColor}
                brushSize={brushSize}
                onToolChange={handleToolChange}
                onColorChange={handleColorChange}
                onBrushSizeChange={handleBrushSizeChange}
                onAddShape={addShape}
                onClearCanvas={clearCanvas}
                onExportSession={exportSession}
                onLeaveSession={onLeaveSession}
            />

            {/* Canvas Container */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="bg-white shadow-sm px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <h1 className="text-xl font-semibold text-gray-800">
                            Session: {sessionId}
                        </h1>
                        <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm text-gray-600">
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">
                            {activeUsers.length} user{activeUsers.length !== 1 ? 's' : ''} online
                        </span>
                        {userId && (
                            <span className="text-xs text-gray-500">
                                (You: {userId.slice(-4)})
                            </span>
                        )}
                    </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 overflow-hidden bg-white">
                    <canvas ref={canvasRef} className="border border-gray-200" />
                </div>
            </div>
        </div>
    );
};

export default Whiteboard;