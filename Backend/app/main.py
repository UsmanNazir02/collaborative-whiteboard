from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import json
from datetime import datetime
from typing import Dict, Any, List

from .database import get_database
from .websocket.manager import manager
from .models.session import Session, WhiteboardObject

app = FastAPI(title="Collaborative Whiteboard API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React app URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Collaborative Whiteboard API"}

@app.post("/api/sessions")
async def create_session():
    """Create a new whiteboard session"""
    db = get_database()
    session_id = str(uuid.uuid4())[:8].upper()  # Short session ID
    
    session = Session(
        session_id=session_id,
        objects=[],
        active_users=[],
    )
    
    # Convert to dict and handle datetime serialization
    session_dict = session.dict()
    session_dict["_id"] = session_id
    
    await db.sessions.insert_one(session_dict)
    
    return {"session_id": session_id, "message": "Session created successfully"}

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session details and whiteboard data"""
    db = get_database()
    
    session = await db.sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update last activity
    await db.sessions.update_one(
        {"session_id": session_id},
        {"$set": {"last_activity": datetime.utcnow()}}
    )
    
    return {
        "session_id": session_id,
        "objects": session.get("objects", []),
        "active_users": manager.get_session_users(session_id)
    }

@app.post("/api/sessions/{session_id}/export")
async def export_session(session_id: str):
    """Export session data"""
    db = get_database()
    
    session = await db.sessions.find_one({"session_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    export_data = {
        "session_id": session_id,
        "objects": session.get("objects", []),
        "exported_at": datetime.utcnow().isoformat(),
        "total_objects": len(session.get("objects", []))
    }
    
    return export_data

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time collaboration"""
    db = get_database()

    try:
        # Check if session exists
        session = await db.sessions.find_one({"session_id": session_id})
        if not session:
            await websocket.close(code=404, reason="Session not found")
            return

        # Connect user
        user_id = await manager.connect(websocket, session_id)
        logger.info(f"[WS] User {user_id} connected to session {session_id}")

        # Send current session state
        current_state = {
            "type": "session_state",
            "objects": session.get("objects", []),
            "active_users": manager.get_session_users(session_id),
            "user_id": user_id,
        }
        await manager.send_personal_message(current_state, session_id, user_id)

        # Main receive loop
        while True:
            try:
                data = await websocket.receive_text()
                message = json.loads(data)
                message_type = message.get("type")

                logger.debug(f"[WS] Received {message_type} from {user_id} in {session_id}")

                if message_type == "add_object":
                    obj_data = message.get("object")
                    whiteboard_obj = WhiteboardObject(
                        id=obj_data.get("id", str(uuid.uuid4())),
                        type=obj_data.get("type"),
                        data=obj_data.get("data", {}),
                        created_by=user_id,
                    )

                    await db.sessions.update_one(
                        {"session_id": session_id},
                        {
                            "$push": {"objects": whiteboard_obj.dict()},
                            "$set": {"last_activity": datetime.utcnow()},
                        },
                    )

                    await manager.broadcast_to_session(
                        session_id,
                        {
                            "type": "object_added",
                            "object": whiteboard_obj.dict(),
                            "user_id": user_id,
                        },
                        exclude_user=user_id,
                    )

                elif message_type == "update_object":
                    obj_id = message.get("object_id")
                    updates = message.get("updates")

                    await db.sessions.update_one(
                        {"session_id": session_id, "objects.id": obj_id},
                        {
                            "$set": {"objects.$.data": updates, "last_activity": datetime.utcnow()},
                        },
                    )

                    await manager.broadcast_to_session(
                        session_id,
                        {
                            "type": "object_updated",
                            "object_id": obj_id,
                            "updates": updates,
                            "user_id": user_id,
                        },
                        exclude_user=user_id,
                    )

                elif message_type == "delete_object":
                    obj_id = message.get("object_id")

                    await db.sessions.update_one(
                        {"session_id": session_id},
                        {
                            "$pull": {"objects": {"id": obj_id}},
                            "$set": {"last_activity": datetime.utcnow()},
                        },
                    )

                    await manager.broadcast_to_session(
                        session_id,
                        {
                            "type": "object_deleted",
                            "object_id": obj_id,
                            "user_id": user_id,
                        },
                        exclude_user=user_id,
                    )

                elif message_type == "clear_canvas":
                    await db.sessions.update_one(
                        {"session_id": session_id},
                        {
                            "$set": {"objects": [], "last_activity": datetime.utcnow()},
                        },
                    )

                    await manager.broadcast_to_session(
                        session_id,
                        {
                            "type": "canvas_cleared",
                            "user_id": user_id,
                        },
                        exclude_user=user_id,
                    )

                elif message_type == "tool_change":
                    await manager.broadcast_to_session(
                        session_id,
                        {
                            "type": "tool_changed",
                            "tool": message.get("tool"),
                            "user_id": user_id,
                        },
                        exclude_user=user_id,
                    )

            except WebSocketDisconnect:
                logger.info(f"[WS] User {user_id} disconnected from session {session_id}")
                break
            except Exception as e:
                logger.error(f"[WS] Error handling message from {user_id} in {session_id}: {e}", exc_info=True)
                # optional: send error to client
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                except Exception:
                    pass

    finally:
        # Always disconnect user
        manager.disconnect(session_id, user_id)
        await manager.broadcast_to_session(
            session_id,
            {
                "type": "user_left",
                "user_id": user_id,
                "active_users": manager.get_session_users(session_id),
            },
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)