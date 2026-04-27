import os
import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
from app.limiter import limiter
from app.routes.api import router
from app.services.socket_manager import manager, market_broadcast_task
from fastapi import WebSocket, WebSocketDisconnect

load_dotenv()

from contextlib import asynccontextmanager
from app.services.scheduler import scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    broadcast_task = asyncio.create_task(market_broadcast_task())
    yield
    # Shutdown logic
    broadcast_task.cancel()
    if scheduler.running:
        scheduler.shutdown(wait=False)

app = FastAPI(title="Trade Signal AI API", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes — must be registered BEFORE the static file catch-all
app.include_router(router, prefix="/api")

@app.websocket("/ws/market")
async def websocket_market(websocket: WebSocket):
    # For WebSockets, we manually check origin if needed, or rely on middleware if supported
    # But usually, simply connecting is fine if CORS is permissive enough
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "Trade Signal AI is running."}


# Serve the built React frontend for every non-API route.
# Only active when the dist folder exists (i.e. inside Docker / after npm run build).
_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="static")
