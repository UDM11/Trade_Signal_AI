import asyncio
import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: Any):
        if not self.active_connections:
            return
            
        # Ensure message is a string
        if not isinstance(message, str):
            message = json.dumps(message)
            
        disconnected_sockets = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to socket: {e}")
                disconnected_sockets.append(connection)
                
        for socket in disconnected_sockets:
            self.disconnect(socket)

manager = ConnectionManager()

async def market_broadcast_task():
    """
    Background task that periodically fetches market data and broadcasts it
    to all connected WebSocket clients.
    """
    from app.services.nepse_service import get_live_data
    
    logger.info("Starting Market Broadcast background task...")
    while True:
        try:
            if manager.active_connections:
                # Fetch full live data from NEPSE
                live_data = await get_live_data()
                if live_data:
                    await manager.broadcast({
                        "type": "MARKET_UPDATE",
                        "data": live_data
                    })
            
            # Broadcast every 5 seconds (matching the original polling rate)
            await asyncio.sleep(5)
            
        except asyncio.CancelledError:
            logger.info("Market Broadcast task cancelled.")
            break
        except Exception as e:
            logger.error(f"Market Broadcast error: {e}")
            await asyncio.sleep(10) # Wait a bit longer on error
