// src/components/Toolbar.js - Updated with Collapsible Feature
import React, { useState } from 'react';
import {
    Pen,
    MousePointer,
    Square,
    Circle,
    Type,
    Trash2,
    Download,
    LogOut,
    Users,
    Palette,
    Settings,
    ChevronLeft,
    ChevronRight,
    Menu,
} from 'lucide-react';

const Toolbar = ({
    sessionId,
    activeUsers,
    isConnected,
    currentTool,
    currentColor,
    brushSize,
    isCollapsed,
    onToolChange,
    onColorChange,
    onBrushSizeChange,
    onAddShape,
    onClearCanvas,
    onExportSession,
    onLeaveSession,
    onToggleCollapse,
}) => {
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const tools = [
        { id: 'select', icon: MousePointer, label: 'Select' },
        { id: 'pen', icon: Pen, label: 'Draw' },
        { id: 'rect', icon: Square, label: 'Rectangle' },
        { id: 'circle', icon: Circle, label: 'Circle' },
        { id: 'text', icon: Type, label: 'Text' },
    ];

    const colors = [
        '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
        '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#A52A2A',
        '#808080', '#FFC0CB', '#90EE90', '#87CEEB', '#DDA0DD',
    ];

    const handleToolClick = (toolId) => {
        if (toolId === 'rect' || toolId === 'circle' || toolId === 'text') {
            onAddShape(toolId);
        } else {
            onToolChange(toolId);
        }
    };

    const handleClearCanvas = () => {
        if (window.confirm('Are you sure you want to clear the canvas? This action cannot be undone.')) {
            onClearCanvas();
        }
    };

    const handleLeaveSession = () => {
        if (window.confirm('Are you sure you want to leave this session?')) {
            onLeaveSession();
        }
    };

    // Collapsed toolbar (minimal version)
    if (isCollapsed) {
        return (
            <div className="bg-white shadow-lg border-r border-gray-200 w-16 flex flex-col transition-all duration-300">
                {/* Collapse Toggle */}
                <div className="p-2 border-b border-gray-200">
                    <button
                        onClick={onToggleCollapse}
                        className="w-12 h-12 flex items-center justify-center rounded-lg border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 transition-all"
                        title="Expand Toolbar"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Connection Status */}
                <div className="p-2 border-b border-gray-200 flex justify-center">
                    <div className={`w-4 h-4 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                </div>

                {/* Quick Tools */}
                <div className="p-2 space-y-2 flex-1">
                    {tools.slice(0, 3).map((tool) => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;

                        return (
                            <button
                                key={tool.id}
                                onClick={() => handleToolClick(tool.id)}
                                className={`w-12 h-12 rounded-lg border-2 transition-all duration-200 flex items-center justify-center ${isActive
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                                    }`}
                                title={tool.label}
                            >
                                <Icon className="w-5 h-5" />
                            </button>
                        );
                    })}

                    {/* Color indicator */}
                    <div className="w-12 h-12 flex items-center justify-center">
                        <div
                            className="w-8 h-8 rounded-lg border-2 border-gray-300 cursor-pointer"
                            style={{ backgroundColor: currentColor }}
                            onClick={onToggleCollapse}
                            title="Current Color - Click to expand toolbar"
                        />
                    </div>
                </div>

                {/* Users Count */}
                {activeUsers.length > 0 && (
                    <div className="p-2 border-t border-gray-200">
                        <div className="w-12 h-12 rounded-lg bg-blue-50 border-2 border-blue-200 flex flex-col items-center justify-center text-blue-700">
                            <Users className="w-4 h-4" />
                            <span className="text-xs font-semibold">{activeUsers.length}</span>
                        </div>
                    </div>
                )}

                {/* Leave Session */}
                <div className="p-2">
                    <button
                        onClick={handleLeaveSession}
                        className="w-12 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center transition-colors"
                        title="Leave Session"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    // Full toolbar (expanded version)
    return (
        <div className="bg-white shadow-lg border-r border-gray-200 w-72 flex flex-col transition-all duration-300 max-h-screen overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-gray-800">Whiteboard Tools</h2>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={onToggleCollapse}
                            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                            title="Collapse Toolbar (ESC)"
                        >
                            <ChevronLeft className="w-4 h-4 text-gray-500" />
                        </button>
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Session ID:</span>
                        <span className="font-mono font-semibold text-gray-800 truncate ml-2" title={sessionId}>
                            {sessionId.length > 8 ? `${sessionId.slice(0, 8)}...` : sessionId}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-600 flex items-center">
                            <Users className="w-4 h-4 mr-1" />
                            Online:
                        </span>
                        <span className="font-semibold text-blue-600">{activeUsers.length}</span>
                    </div>
                </div>
            </div>

            {/* Tools */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Drawing Tools</h3>
                <div className="grid grid-cols-2 gap-2">
                    {tools.map((tool) => {
                        const Icon = tool.icon;
                        const isActive = currentTool === tool.id;

                        return (
                            <button
                                key={tool.id}
                                onClick={() => handleToolClick(tool.id)}
                                className={`p-3 rounded-lg border-2 transition-all duration-200 flex flex-col items-center space-y-1 ${isActive
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                                    }`}
                                title={tool.label}
                            >
                                <Icon className="w-5 h-5" />
                                <span className="text-xs font-medium">{tool.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Color Picker */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Color</h3>
                    <button
                        onClick={() => setShowColorPicker(!showColorPicker)}
                        className="p-1 rounded-md hover:bg-gray-100"
                    >
                        <Palette className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="flex items-center space-x-3 mb-3">
                    <div
                        className="w-8 h-8 rounded-lg border-2 border-gray-300 cursor-pointer"
                        style={{ backgroundColor: currentColor }}
                        onClick={() => setShowColorPicker(!showColorPicker)}
                    />
                    <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => onColorChange(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer"
                    />
                </div>

                {showColorPicker && (
                    <div className="grid grid-cols-5 gap-2">
                        {colors.map((color) => (
                            <button
                                key={color}
                                onClick={() => {
                                    onColorChange(color);
                                    setShowColorPicker(false);
                                }}
                                className={`w-8 h-8 rounded-lg border-2 hover:scale-110 transition-transform ${currentColor === color ? 'border-gray-800' : 'border-gray-300'
                                    }`}
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Brush Settings */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Brush Size</h3>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-1 rounded-md hover:bg-gray-100"
                    >
                        <Settings className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="space-y-3">
                    <input
                        type="range"
                        min="1"
                        max="50"
                        value={brushSize}
                        onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
                        className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>1px</span>
                        <span className="font-semibold text-gray-700">{brushSize}px</span>
                        <span>50px</span>
                    </div>

                    {/* Brush Preview */}
                    <div className="flex justify-center">
                        <div
                            className="rounded-full border border-gray-300"
                            style={{
                                width: `${Math.min(brushSize * 2, 40)}px`,
                                height: `${Math.min(brushSize * 2, 40)}px`,
                                backgroundColor: currentColor,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                <div className="space-y-2">
                    <button
                        onClick={handleClearCanvas}
                        className="w-full p-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear Canvas</span>
                    </button>

                    <button
                        onClick={onExportSession}
                        className="w-full p-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        <span>Export Session</span>
                    </button>
                </div>
            </div>

            {/* Active Users - Scrollable if many users */}
            {activeUsers.length > 0 && (
                <div className="p-4 border-b border-gray-200 flex-1 min-h-0">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        Active Users ({activeUsers.length})
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {activeUsers.map((user, index) => (
                            <div
                                key={user}
                                className="flex items-center space-x-3 p-2 bg-gray-50 rounded-lg"
                            >
                                <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                                    style={{
                                        backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`,
                                    }}
                                >
                                    {index + 1}
                                </div>
                                <span className="text-sm font-medium text-gray-700 truncate">
                                    User {user.substring(0, 8)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Leave Session */}
            <div className="p-4 flex-shrink-0">
                <button
                    onClick={handleLeaveSession}
                    className="w-full p-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    <span>Leave Session</span>
                </button>
            </div>

            {/* Custom scrollbar styles */}
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 2px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 2px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
};

export default Toolbar;