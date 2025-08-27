from typing import Dict, List, Set
from fastapi import WebSocket
import json
import uuid
from datetime import datetime
import logging
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger("uvicorn.error")


class ConnectionManager:
    def __init__(self):
        # session_id -> {user_id -> websocket}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # session_id -> set of user_ids
        self.session_users: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, session_id: str, user_id: str = None):
        """Accept a new WebSocket connection and register the user in the session."""
        await websocket.accept()

        if user_id is None:
            user_id = str(uuid.uuid4())

        if session_id not in self.active_connections:
            self.active_connections[session_id] = {}
            self.session_users[session_id] = set()
            logger.info(f"[Connect] Created new session {session_id}")

        self.active_connections[session_id][user_id] = websocket
        self.session_users[session_id].add(user_id)

        logger.info(f"[Connect] User {user_id} connected to session {session_id}")

        # Notify others about new user
        await self.broadcast_to_session(
            session_id,
            {
                "type": "user_joined",
                "user_id": user_id,
                "active_users": list(self.session_users[session_id]),
            },
            exclude_user=user_id,
        )

        return user_id

    def disconnect(self, session_id: str, user_id: str):
        """Remove a user from a session and clean up if empty."""
        if session_id not in self.active_connections:
            logger.warning(f"[Disconnect] Tried to disconnect user {user_id}, but session {session_id} not found")
            return

        if user_id in self.active_connections[session_id]:
            del self.active_connections[session_id][user_id]
            logger.info(f"[Disconnect] User {user_id} removed from active connections in session {session_id}")

        if session_id in self.session_users and user_id in self.session_users[session_id]:
            self.session_users[session_id].remove(user_id)
            logger.info(f"[Disconnect] User {user_id} removed from session users in session {session_id}")

        # Clean up empty sessions
        if not self.active_connections[session_id]:
            del self.active_connections[session_id]
            if session_id in self.session_users:
                del self.session_users[session_id]
            logger.info(f"[Disconnect] Session {session_id} is now empty and removed")

    async def send_personal_message(self, message: dict, session_id: str, user_id: str):
        """Send a direct message to a specific user in a session."""
        if session_id in self.active_connections and user_id in self.active_connections[session_id]:
            websocket = self.active_connections[session_id][user_id]
            try:
                await websocket.send_text(json.dumps(jsonable_encoder(message)))
                logger.debug(f"[Send] Sent personal message to {user_id} in session {session_id}")
            except Exception as e:
                logger.warning(f"[Send] Failed to send personal message to {user_id} in session {session_id}: {e}")
                self.disconnect(session_id, user_id)

    async def broadcast_to_session(self, session_id: str, message: dict, exclude_user: str = None):
        """Broadcast a message to all users in a session (optionally exclude one user)."""
        disconnected_users = []

        if session_id not in self.active_connections:
            logger.warning(f"[Broadcast] Session {session_id} not found. Skipping message.")
            return

        for user_id, websocket in list(self.active_connections[session_id].items()):
            if exclude_user and user_id == exclude_user:
                continue

            try:
                await websocket.send_text(json.dumps(jsonable_encoder(message)))
                logger.debug(f"[Broadcast] Sent message to {user_id} in session {session_id}")
            except Exception as e:
                logger.warning(f"[Broadcast] Failed to send to {user_id} in session {session_id}: {e}")
                disconnected_users.append(user_id)

        # Clean up disconnected users
        for user_id in disconnected_users:
            try:
                self.disconnect(session_id, user_id)
                logger.info(f"[Broadcast] Disconnected user {user_id} from session {session_id}")
            except Exception as e:
                logger.error(f"[Broadcast] Error disconnecting user {user_id} in session {session_id}: {e}")

    def get_session_users(self, session_id: str) -> List[str]:
        """Get list of active users in a session."""
        return list(self.session_users.get(session_id, set()))


manager = ConnectionManager()
