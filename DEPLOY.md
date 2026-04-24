# Deploying Trade Signal AI on fly.io

One URL, one app — the FastAPI backend serves the React frontend as static files.

## Prerequisites

1. Install fly CLI: <https://fly.io/docs/hands-on/install-flyctl/>
2. Log in: `fly auth login`

---

## One-time setup

Run these commands from the **project root** (the folder that contains both `backend/` and `frontend/`):

```bash
# 1. Set your secrets (only needed once — fly.io stores them)
fly secrets set \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_KEY="your-supabase-anon-key" \
  OPENAI_API_KEY="sk-your-openai-key" \
  ALLOWED_ORIGINS="https://trade-signal-ai.fly.dev" \
  -a trade-signal-ai

# 2. Deploy with 1 machine only (fly.io creates 2 by default for HA)
fly deploy --ha=false
```

Your app will be live at: **<https://trade-signal-ai.fly.dev>**

---

## Redeploy after code changes

```bash
# From the project root
fly deploy --ha=false
```

That's it — both frontend and backend are rebuilt and redeployed together.

---

## Useful commands

```bash
# View live logs
fly logs -a trade-signal-ai

# SSH into the container
fly ssh console -a trade-signal-ai

# Scale memory if training is slow
fly scale memory 1024 -a trade-signal-ai
```

---

## Notes

- The model (`model_xgb.pkl`) is regenerated on each CSV upload — ephemeral filesystem is fine.
- The app auto-sleeps when idle (cold start ~2 s). To keep it always-on:
  `fly scale count 1 -a trade-signal-ai`
- `backend/fly.toml` and `frontend/fly.toml` are kept for the old two-app approach.
  The root `fly.toml` + `Dockerfile` are what `fly deploy` uses now.
