# Trade Signal AI

A full-stack quantitative trading AI system that predicts BUY/SELL/HOLD from historical OHLCV data using XGBoost / RandomForest, and generates textual analysis using OpenAI.

## Prerequisites

1. Set up a Supabase project at [supabase.com](https://supabase.com/).
2. Run the SQL located in `database/schema.sql` inside your Supabase SQL editor.
3. Obtain an OpenAI API key from [platform.openai.com](https://platform.openai.com/).

## Environment Setup

Fill in your API keys in `backend/.env`:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
```

## Running the Application

### 1. Start the Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Activate venv:
# Window: .\venv\Scripts\Activate.ps1
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API runs at [http://localhost:8000](http://localhost:8000)

### 2. Start the Frontend (React + Vite)
Open a new terminal.
```bash
cd frontend
npm install
npm run dev
```
Dashboard runs at [http://localhost:5173](http://localhost:5173)

Enjoy predicting market signals!
