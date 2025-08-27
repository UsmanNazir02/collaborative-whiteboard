// src/App.js
import React, { useState } from 'react';
import SessionManager from './components/SessionManager';
import Whiteboard from './components/Whiteboard';
import './App.css';

function App() {
  const [currentSession, setCurrentSession] = useState(null);
  const [userId, setUserId] = useState(null);

  const handleSessionJoin = (sessionId, userId) => {
    setCurrentSession(sessionId);
    setUserId(userId);
  };

  const handleLeaveSession = () => {
    setCurrentSession(null);
    setUserId(null);
  };

  return (
    <div className="App min-h-screen bg-gray-100">
      {!currentSession ? (
        <SessionManager onSessionJoin={handleSessionJoin} />
      ) : (
        <Whiteboard
          sessionId={currentSession}
          userId={userId}
          onLeaveSession={handleLeaveSession}
        />
      )}
    </div>
  );
}

export default App;