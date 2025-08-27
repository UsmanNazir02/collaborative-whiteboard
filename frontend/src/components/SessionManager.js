// src/components/SessionManager.js
import React, { useState } from 'react';
import { Plus, LogIn, Users, Palette } from 'lucide-react';

const SessionManager = ({ onSessionJoin }) => {
    const [sessionId, setSessionId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const API_BASE = 'http://localhost:8000/api';

    const createNewSession = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE}/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to create session');
            }

            const data = await response.json();
            onSessionJoin(data.session_id, null);
        } catch (err) {
            setError('Failed to create session. Please try again.');
            console.error('Error creating session:', err);
        } finally {
            setLoading(false);
        }
    };

    const joinExistingSession = async () => {
        if (!sessionId.trim()) {
            setError('Please enter a session ID');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE}/sessions/${sessionId.trim()}`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Session not found');
                }
                throw new Error('Failed to join session');
            }

            onSessionJoin(sessionId.trim(), null);
        } catch (err) {
            setError(err.message || 'Failed to join session. Please check the session ID.');
            console.error('Error joining session:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            joinExistingSession();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border border-gray-200">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
                        <Palette className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">
                        Collaborative Whiteboard
                    </h1>
                    <p className="text-gray-600">
                        Create or join a session to start collaborating in real-time
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-600 text-sm">{error}</p>
                    </div>
                )}

                {/* Create New Session */}
                <div className="mb-6">
                    <button
                        onClick={createNewSession}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none"
                    >
                        <Plus className="w-5 h-5" />
                        <span>{loading ? 'Creating...' : 'Create New Session'}</span>
                    </button>
                </div>

                {/* Divider */}
                <div className="relative mb-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-white text-gray-500 font-medium">OR</span>
                    </div>
                </div>

                {/* Join Existing Session */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="sessionId" className="block text-sm font-medium text-gray-700 mb-2">
                            Session ID
                        </label>
                        <input
                            id="sessionId"
                            type="text"
                            value={sessionId}
                            onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                            onKeyPress={handleKeyPress}
                            placeholder="Enter session ID (e.g., ABC123)"
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 text-center font-mono text-lg tracking-wider"
                            maxLength={8}
                        />
                    </div>

                    <button
                        onClick={joinExistingSession}
                        disabled={loading || !sessionId.trim()}
                        className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none"
                    >
                        <LogIn className="w-5 h-5" />
                        <span>{loading ? 'Joining...' : 'Join Session'}</span>
                    </button>
                </div>

                {/* Features */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        Features
                    </h3>
                    <ul className="text-sm text-gray-600 space-y-2">
                        <li className="flex items-center">
                            <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                            Real-time collaboration
                        </li>
                        <li className="flex items-center">
                            <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
                            Drawing and shapes
                        </li>
                        <li className="flex items-center">
                            <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
                            Session persistence
                        </li>
                        <li className="flex items-center">
                            <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></div>
                            Export capabilities
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SessionManager;