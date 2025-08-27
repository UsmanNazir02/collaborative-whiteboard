// src/components/Whiteboard.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from "fabric";
import Toolbar from './Toolbar';
import { connectWebSocket } from '../utils/websocket';

const Whiteboard = ({ sessionId, userId: initialUserId, onLeaveSession }) => {
    const canvasRef = useRef(null);
    const fabricRef = useRef(null);
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [userId, setUserId] = useState(initialUserId);
    const [currentTool, setCurrentTool] = useState('pen');
    const [currentColor, setCurrentColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [isDrawing, setIsDrawing] = useState(false);

    // Initialize Fabric.js canvas
    const initCanvas = useCallback(() => {
        const canvas = new fabric.Canvas(canvasRef.current, {
            width: window.innerWidth - 300, // Account for toolbar
            height: window.innerHeight - 100,
            backgroundColor: 'white',
            isDrawingMode: true,
        });

        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = brushSize;
        canvas.freeDrawingBrush.color = currentColor;

        fabricRef.current = canvas;

        // Handle object creation
        canvas.on('path:created', (e) => {
            if (!isDrawing) return;

            const path = e.path;
            const pathData = {
                id: `path_${Date.now()}_${Math.random()}`,
                type: 'path',
                data: {
                    path: path.path,
                    stroke: path.stroke,
                    strokeWidth: path.strokeWidth,
                    fill: path.fill,
                    left: path.left,
                    top: path.top,
                    scaleX: path.scaleX,
                    scaleY: path.scaleY,
                    angle: path.angle,
                }
            };

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'add_object',
                    object: pathData
                }));
            }
        });

        // Handle object modifications
        canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (obj.id) {
                const updates = {
                    left: obj.left,
                    top: obj.top,
                    scaleX: obj.scaleX,
                    scaleY: obj.scaleY,
                    angle: obj.angle,
                };

                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'update_object',
                        object_id: obj.id,
                        updates: updates
                    }));
                }
            }
        });

        // Handle window resize
        const handleResize = () => {
            canvas.setDimensions({
                width: window.innerWidth - 300,
                height: window.innerHeight - 100
            });
            canvas.renderAll();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            canvas.dispose();
        };
    }, [brushSize, currentColor, isDrawing]);

    // WebSocket message handlers
    const handleWebSocketMessage = useCallback((data) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        switch (data.type) {
            case 'session_state':
                setUserId(data.user_id);
                setActiveUsers(data.active_users || []);

                // Load existing objects
                data.objects.forEach(obj => {
                    addObjectToCanvas(obj);
                });
                break;

            case 'object_added':
                if (data.user_id !== userId) {
                    addObjectToCanvas(data.object);
                }
                break;

            case 'object_updated':
                if (data.user_id !== userId) {
                    updateObjectOnCanvas(data.object_id, data.updates);
                }
                break;

            case 'object_deleted':
                if (data.user_id !== userId) {
                    removeObjectFromCanvas(data.object_id);
                }
                break;

            case 'canvas_cleared':
                if (data.user_id !== userId) {
                    canvas.clear();
                    canvas.backgroundColor = 'white';
                    canvas.renderAll();
                }
                break;

            case 'user_joined':
            case 'user_left':
                setActiveUsers(data.active_users || []);
                break;

            default:
                break;
        }
    }, [userId]);

    // Add object to canvas
    const addObjectToCanvas = (objData) => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        if (objData.type === 'path') {
            const path = new fabric.Path(objData.data.path, {
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
            canvas.add(path);
        } else if (objData.type === 'rect') {
            const rect = new fabric.Rect({
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                width: objData.data.width,
                height: objData.data.height,
                fill: objData.data.fill,
                stroke: objData.data.stroke,
                strokeWidth: objData.data.strokeWidth,
            });
            canvas.add(rect);
        } else if (objData.type === 'circle') {
            const circle = new fabric.Circle({
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                radius: objData.data.radius,
                fill: objData.data.fill,
                stroke: objData.data.stroke,
                strokeWidth: objData.data.strokeWidth,
            });
            canvas.add(circle);
        } else if (objData.type === 'text') {
            const text = new fabric.Text(objData.data.text, {
                id: objData.id,
                left: objData.data.left,
                top: objData.data.top,
                fontSize: objData.data.fontSize,
                fill: objData.data.fill,
                fontFamily: objData.data.fontFamily || 'Arial',
            });
            canvas.add(text);
        }

        canvas.renderAll();
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
                canvas.selection = false;
                setIsDrawing(false);
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
                shape = new fabric.Text('Double click to edit', {
                    id: shapeId,
                    left: 100,
                    top: 100,
                    fontSize: 20,
                    fill: currentColor,
                    fontFamily: 'Arial',
                });
                break;
            default:
                return;
        }

        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.renderAll();

        // Send to other users
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const shapeData = {
                id: shapeId,
                type: shapeType,
                data: shape.toObject()
            };

            wsRef.current.send(JSON.stringify({
                type: 'add_object',
                object: shapeData
            }));
        }
    };

    // Clear canvas
    const clearCanvas = () => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        canvas.clear();
        canvas.backgroundColor = 'white';
        canvas.renderAll();

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'clear_canvas'
            }));
        }
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

    // Initialize canvas and WebSocket
    useEffect(() => {
        const cleanup = initCanvas();

        // Connect to WebSocket
        wsRef.current = connectWebSocket(sessionId, handleWebSocketMessage);

        wsRef.current.onopen = () => {
            setIsConnected(true);
        };

        wsRef.current.onclose = () => {
            setIsConnected(false);
        };

        wsRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            setIsConnected(false);
        };

        return () => {
            if (cleanup) cleanup();
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [sessionId, initCanvas, handleWebSocketMessage]);

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