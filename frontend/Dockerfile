# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Pass backend URL at build time so Vite bakes it into the bundle.
# fly.toml sets this via [build.args].
ARG  VITE_API_BASE
ENV  VITE_API_BASE=$VITE_API_BASE

COPY package*.json ./
RUN  npm ci --prefer-offline

COPY . .
RUN  npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist  /usr/share/nginx/html
COPY nginx.conf                /etc/nginx/conf.d/default.conf

# Remove default nginx config that listens on port 80
RUN rm -f /etc/nginx/conf.d/default.conf.bak

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
