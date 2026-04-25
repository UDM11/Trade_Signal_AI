# ── Stage 1: Build React frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci --prefer-offline

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + serve frontend ───────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
# Install everything except the git-based package first
RUN pip install --no-cache-dir $(grep -v 'git+' requirements.txt | tr '\n' ' ')
# Install NepseUnofficialApi separately with retries
RUN pip install --no-cache-dir --retries 3 \
    git+https://github.com/basic-bgnr/NepseUnofficialApi || \
    pip install --no-cache-dir --retries 3 \
    git+https://github.com/basic-bgnr/NepseUnofficialApi

# Copy backend source
COPY backend/app/ ./app/

# Copy the built frontend — FastAPI will serve it as static files
COPY --from=frontend-builder /frontend/dist ./frontend/dist

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
