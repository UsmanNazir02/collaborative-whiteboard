import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from "fabric";
import Toolbar from './Toolbar';
import { connectWebSocket, sendMessage } from '../utils/websocket';

const Whiteboard = ({ sessionId, userId: initialUserId, onLeaveSession }) => {
    const canvasRef = useRef(null);
    const fabricRef = useRef(null);
    const wsManagerRef = useRef(null);
    const isInitializedRef = useRef(false);
    const stageRef = useRef();
    const canvasContainerRef = useRef(null);

    const [isConnected, setIsConnected] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [userId, setUserId] = useState(initialUserId);
    const [currentTool, setCurrentTool] = useState('pen');
    const [currentColor, setCurrentColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
    const [objects, setObjects] = useState([]);
    const [selectedId, setSelectedId] = useState(null);

    // Fixed canvas dimensions for consistent drawing across all devices
    const CANVAS_WIDTH = 1920; // Fixed width
    const CANVAS_HEIGHT = 1080; // Fixed height

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

    // Calculate canvas display dimensions
    const calculateCanvasDisplaySize = useCallback(() => {
        if (!canvasContainerRef.current) return { width: CANVAS_WIDTH, height: CANVAS_HEIGHT };

        const container = canvasContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width - 20; // Padding
        const containerHeight = containerRect.height - 20; // Padding

        // Calculate scale to fit the fixed canvas size within the container
        const scaleX = containerWidth / CANVAS_WIDTH;
        const scaleY = containerHeight / CANVAS_HEIGHT;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

        return {
            width: CANVAS_WIDTH * scale,
            height: CANVAS_HEIGHT * scale,
            scale: scale
        };
    }, []);

    // Update canvas display size
    const updateCanvasDisplaySize = useCallback(() => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        const { width, height, scale } = calculateCanvasDisplaySize();

        // Update canvas display size
        canvas.setDimensions({ width, height });

        // Set zoom level to maintain fixed coordinate system
        canvas.setZoom(scale);

        canvas.renderAll();
    }, [calculateCanvasDisplaySize]);

    // Initialize Fabric.js canvas (only once)
    const initCanvas = useCallback(() => {
        if (fabricRef.current || !canvasRef.current) {
            console.log('[Whiteboard] Canvas already initialized or canvas ref not ready');
            return null;
        }

        console.log('[Whiteboard] Initializing Fabric.js canvas');

        // Calculate initial display size
        const { width, height, scale } = calculateCanvasDisplaySize();

        const canvas = new fabric.Canvas(canvasRef.current, {
            width: width,
            height: height,
            backgroundColor: 'white',
            isDrawingMode: true,
        });

        // Set up fixed coordinate system
        canvas.setZoom(scale);
        canvas.absolutePan = true;

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

        // Handle window resize
        const handleResize = () => {
            updateCanvasDisplaySize();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            console.log('[Whiteboard] Cleaning up canvas');
            window.removeEventListener('resize', handleResize);
            if (canvas && typeof canvas.dispose === 'function') {
                canvas.dispose();
            }
            fabricRef.current = null;
        };
    }, [currentColor, brushSize, sendWebSocketMessage, calculateCanvasDisplaySize, updateCanvasDisplaySize]);

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

        // Get canvas center in fixed coordinate system
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;

        switch (shapeType) {
            case 'rect':
                shape = new fabric.Rect({
                    id: shapeId,
                    left: centerX - 100,
                    top: centerY - 50,
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
                    left: centerX - 50,
                    top: centerY - 50,
                    radius: 50,
                    fill: 'transparent',
                    stroke: currentColor,
                    strokeWidth: 2,
                });
                break;
            case 'text':
                shape = new fabric.Textbox('Type here...', {
                    id: shapeId,
                    left: centerX - 50,
                    top: centerY - 10,
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
    // Export session as PNG (from Fabric.js canvas)
    const exportSession = () => {
        try {
            const canvas = fabricRef.current;
            if (!canvas) return;

            // Export to PNG (higher resolution possible by multiplying multiplier)
            const dataURL = canvas.toDataURL({
                format: 'png',
                multiplier: 2 // for higher resolution
            });

            const link = document.createElement("a");
            link.download = `whiteboard_session_${sessionId}_${new Date().toISOString().split("T")[0]}.png`;
            link.href = dataURL;
            link.click();
        } catch (error) {
            console.error("Export failed:", error);
            alert("Export failed. Please try again.");
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

    // Update canvas size when toolbar collapses/expands
    useEffect(() => {
        if (fabricRef.current) {
            setTimeout(() => {
                updateCanvasDisplaySize();
            }, 300); // Wait for transition to complete
        }
    }, [isToolbarCollapsed, updateCanvasDisplaySize]);

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
            if (e.key === 'Escape') {
                setIsToolbarCollapsed(!isToolbarCollapsed);
                return;
            }

            if (selectedId) {
                const obj = objects.find(o => o.id === selectedId);

                if (!obj) return;

                if (obj.type === 'textbox') {
                    if (e.key === 'Backspace') {
                        // remove last character
                        setObjects(prev =>
                            prev.map(o =>
                                o.id === selectedId
                                    ? { ...o, text: o.text.slice(0, -1) }
                                    : o
                            )
                        );
                    } else if (e.key.length === 1) {
                        // append typed character
                        setObjects(prev =>
                            prev.map(o =>
                                o.id === selectedId
                                    ? { ...o, text: o.text + e.key }
                                    : o
                            )
                        );
                    }
                } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    // normal delete for non-text objects
                    deleteSelectedObject();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, objects, isToolbarCollapsed]);


    // Main initialization effect - runs only once
    useEffect(() => {
        if (isInitializedRef.current || !sessionId) {
            console.log('[Whiteboard] Skipping initialization - already initialized or no sessionId');
            return;
        }

        console.log('[Whiteboard] Starting initialization for session:', sessionId);
        isInitializedRef.current = true;

        let canvasCleanup;

        setTimeout(() => {
            canvasCleanup = initCanvas();
            wsManagerRef.current = connectWebSocket(sessionId, handleWebSocketMessage);
        }, 100);

        return () => {
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
    }, [sessionId]);

    // Separate effect for connection monitoring (to avoid recreating WebSocket)
    useEffect(() => {
        const checkConnection = () => {
            const manager = wsManagerRef.current;
            if (manager && manager.ws && manager.ws.readyState === WebSocket.OPEN) {
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
                isCollapsed={isToolbarCollapsed}
                onToolChange={handleToolChange}
                onColorChange={handleColorChange}
                onBrushSizeChange={handleBrushSizeChange}
                onAddShape={addShape}
                onClearCanvas={clearCanvas}
                onExportSession={exportSession}
                onLeaveSession={onLeaveSession}
                onToggleCollapse={() => setIsToolbarCollapsed(!isToolbarCollapsed)}
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
                        <div className="text-xs text-gray-500">
                            Canvas: {CANVAS_WIDTH} × {CANVAS_HEIGHT}
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
                        <span className="text-xs text-gray-400">
                            Press ESC to toggle toolbar
                        </span>
                    </div>
                </div>

                {/* Canvas */}
                <div
                    ref={canvasContainerRef}
                    className="flex-1 overflow-hidden bg-white flex items-center justify-center p-2"
                >
                    <canvas
                        ref={canvasRef}
                        className="border border-gray-200 shadow-lg rounded-lg"
                        style={{ maxWidth: '100%', maxHeight: '100%' }}
                    />
                </div>
            </div>
        </div>
    );
};

export default Whiteboard;