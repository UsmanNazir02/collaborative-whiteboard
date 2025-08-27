from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from bson import ObjectId

class WhiteboardObject(BaseModel):
    id: str
    type: str
    data: Dict[str, Any]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None

class Session(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    session_id: str = Field(..., unique=True)
    objects: List[WhiteboardObject] = []
    active_users: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    class Config:
        allow_population_by_field_name = True
        json_encoders = {ObjectId: str}