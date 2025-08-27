from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import json
from datetime import datetime
from typing import Dict, Any, List
import logging
from .database import get_database
from .websocket.manager import manager
from .models.session import Session, WhiteboardObject
import asyncio
from websockets.exceptions import ConnectionClosedError

app = FastAPI(title="Collaborative Whiteboard API")
logger = logging.getLogger("uvicorn.error")
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
    """WebSocket endpoint for real-time collaboration - Debug Version"""
    db = get_database()
    user_id = None
    connection_id = str(uuid.uuid4())[:8]
    
    logger.info(f"[DEBUG {connection_id}] New WebSocket connection attempt for session {session_id}")

    try:
        # Check if session exists
        logger.info(f"[DEBUG {connection_id}] Checking if session {session_id} exists...")
        session = await db.sessions.find_one({"session_id": session_id})
        if not session:
            logger.error(f"[DEBUG {connection_id}] Session {session_id} not found in database")
            await websocket.close(code=1008, reason="Session not found")
            return

        logger.info(f"[DEBUG {connection_id}] Session {session_id} found, accepting WebSocket connection...")

        # Connect user
        user_id = await manager.connect(websocket, session_id)
        logger.info(f"[DEBUG {connection_id}] User {user_id} connected to session {session_id}")

        # Send current session state
        logger.info(f"[DEBUG {connection_id}] Sending session state to user {user_id}...")
        current_state = {
            "type": "session_state",
            "objects": session.get("objects", []),
            "active_users": manager.get_session_users(session_id),
            "user_id": user_id,
        }
        
        try:
            await manager.send_personal_message(current_state, session_id, user_id)
            logger.info(f"[DEBUG {connection_id}] Session state sent successfully to user {user_id}")
        except Exception as e:
            logger.error(f"[DEBUG {connection_id}] Failed to send session state to user {user_id}: {e}")
            raise

        # Main receive loop
        logger.info(f"[DEBUG {connection_id}] Entering message receive loop for user {user_id}")
        message_count = 0
        
        while True:
            try:
                logger.debug(f"[DEBUG {connection_id}] Waiting for message from user {user_id}...")
                
                # Add a timeout to detect dead connections
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                message_count += 1
                
                logger.debug(f"[DEBUG {connection_id}] Received message #{message_count} from user {user_id}: {data[:100]}...")
                
                message = json.loads(data)
                message_type = message.get("type")

                logger.info(f"[DEBUG {connection_id}] Processing message type '{message_type}' from user {user_id}")

                # Handle ping/pong for connection keepalive
                if message_type == "ping":
                    logger.debug(f"[DEBUG {connection_id}] Responding to ping from user {user_id}")
                    await websocket.send_text(json.dumps({"type": "pong"}))
                    continue

                if message_type == "add_object":
                    logger.info(f"[DEBUG {connection_id}] Processing add_object from user {user_id}")
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
                    logger.info(f"[DEBUG {connection_id}] Object added and broadcasted from user {user_id}")

                elif message_type == "update_object":
                    logger.info(f"[DEBUG {connection_id}] Processing update_object from user {user_id}")
                    obj_id = message.get("object_id")
                    updates = message.get("updates") or {}

                    session_doc = await db.sessions.find_one({"session_id": session_id})
                    if not session_doc:
                        logger.warning(f"[DEBUG {connection_id}] Session {session_id} not found during object update")
                        continue

                    objects: List[dict] = session_doc.get("objects", [])
                    existing = next((o for o in objects if o.get("id") == obj_id), None)
                    if not existing:
                        logger.warning(f"[DEBUG {connection_id}] Object {obj_id} not found in session {session_id}")
                        continue

                    merged_data = {**(existing.get("data") or {}), **updates}

                    await db.sessions.update_one(
                        {"session_id": session_id, "objects.id": obj_id},
                        {
                            "$set": {
                                "objects.$.data": merged_data,
                                "last_activity": datetime.utcnow(),
                            }
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
                    logger.info(f"[DEBUG {connection_id}] Object updated and broadcasted from user {user_id}")

                elif message_type == "delete_object":
                    logger.info(f"[DEBUG {connection_id}] Processing delete_object from user {user_id}")
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
                    logger.info(f"[DEBUG {connection_id}] Object deleted and broadcasted from user {user_id}")

                elif message_type == "clear_canvas":
                    logger.info(f"[DEBUG {connection_id}] Processing clear_canvas from user {user_id}")
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
                    logger.info(f"[DEBUG {connection_id}] Canvas cleared and broadcasted from user {user_id}")

                else:
                    logger.warning(f"[DEBUG {connection_id}] Unknown message type '{message_type}' from user {user_id}")

            except asyncio.TimeoutError:
                logger.info(f"[DEBUG {connection_id}] Timeout waiting for message from user {user_id}, sending ping...")
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                    logger.debug(f"[DEBUG {connection_id}] Ping sent to user {user_id}")
                except Exception as ping_error:
                    logger.error(f"[DEBUG {connection_id}] Failed to send ping to user {user_id}: {ping_error}")
                    break
                    
            except WebSocketDisconnect:
                logger.info(f"[DEBUG {connection_id}] WebSocketDisconnect - User {user_id} disconnected from session {session_id}")
                break
                
            except json.JSONDecodeError as e:
                logger.error(f"[DEBUG {connection_id}] JSON decode error from user {user_id}: {e}")
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                except Exception:
                    break
                
            except Exception as e:
                logger.error(f"[DEBUG {connection_id}] Error handling message from user {user_id}: {e}", exc_info=True)
                try:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Internal server error"}))
                except Exception:
                    break

        logger.info(f"[DEBUG {connection_id}] Exiting message loop for user {user_id} (received {message_count} messages)")

    except Exception as e:
        logger.error(f"[DEBUG {connection_id}] Fatal error for user {user_id} in session {session_id}: {e}", exc_info=True)
        
    finally:
        # Always disconnect user if we have a user_id
        if user_id:
            logger.info(f"[DEBUG {connection_id}] Cleaning up user {user_id} from session {session_id}")
            manager.disconnect(session_id, user_id)
            
            # Only broadcast if there are still users in the session
            remaining_users = manager.get_session_users(session_id)
            if remaining_users:
                logger.info(f"[DEBUG {connection_id}] Broadcasting user_left for {user_id}, {len(remaining_users)} users remaining")
                await manager.broadcast_to_session(
                    session_id,
                    {
                        "type": "user_left",
                        "user_id": user_id,
                        "active_users": remaining_users,
                    },
                )
            else:
                logger.info(f"[DEBUG {connection_id}] No users remaining in session {session_id} after {user_id} left")
        
        logger.info(f"[DEBUG {connection_id}] Connection cleanup complete for user {user_id}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)