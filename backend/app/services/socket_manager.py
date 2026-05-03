import asyncio
import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.last_market_data: Any = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
        
        # Send initial snapshot immediately if available
        if self.last_market_data:
            try:
                await websocket.send_text(json.dumps(self.last_market_data))
            except RuntimeError as e:
                # Often raised by FastAPI/Starlette when socket is already closed
                logger.debug(f"Socket closed before initial snapshot could be sent: {e}")
            except Exception as e:
                logger.error(f"Error sending initial snapshot: {type(e).__name__} - {e}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: Any):
        # Update cache
        self.last_market_data = message
        
        if not self.active_connections:
            return
            
        # Ensure message is a string
        message_str = json.dumps(message) if not isinstance(message, str) else message
            
        disconnected_sockets = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except RuntimeError:
                # Connection dropped
                disconnected_sockets.append(connection)
            except Exception as e:
                logger.error(f"Error broadcasting to socket: {type(e).__name__} - {e}")
                disconnected_sockets.append(connection)
                
        for socket in disconnected_sockets:
            self.disconnect(socket)

manager = ConnectionManager()

async def market_broadcast_task():
    """
    Background task that periodically fetches market data and broadcasts it
    to all connected WebSocket clients.
    """
    from app.services.nepse_service import get_live_data, is_market_open
    
    logger.info("Starting Market Broadcast background task...")
    
    # Initial fetch to warm the cache immediately on startup
    try:
        live_data = await get_live_data()
        if live_data:
            await manager.broadcast({
                "type": "MARKET_UPDATE",
                "data": live_data
            })
    except Exception as e:
        logger.error(f"Initial Market Broadcast error: {e}")

    while True:
        try:
            # Fetch full live data from NEPSE only if we have active listeners
            # OR if the cache is empty (to ensure new connections get data)
            if manager.active_connections or not manager.last_market_data:
                live_data = await get_live_data()
                if live_data:
                    await manager.broadcast({
                        "type": "MARKET_UPDATE",
                        "data": live_data
                    })
            
            # Broadcast every 2 seconds if market open (Turbo Mode), otherwise every 60 seconds
            sleep_time = 2 if is_market_open() else 60
            await asyncio.sleep(sleep_time)
            
        except asyncio.CancelledError:
            logger.info("Market Broadcast task cancelled.")
            break
        except Exception as e:
            logger.error(f"Market Broadcast error: {e}")
            await asyncio.sleep(10) # Wait a bit longer on error
