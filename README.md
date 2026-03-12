# Hermes UI

A dynamic, web-based UI for the Hermes autonomous AI agent. This interface replicates the OpenClaw Studio experience, interacting seamlessly with the `hermes` CLI.

## Prerequisites

- **Python 3.10+** (for the FastAPI backend)
- **Node.js** (for the React frontend)
- **Hermes CLI agent** installed globally (or path specified via environment variable)

## Setup

### 1. Backend

The backend is a FastAPI server that manages WebSockets to communicate with the Hermes CLI.

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn websockets pydantic
fastapi dev server.py
# Or run using uvicorn: uvicorn server:app --reload
```

If your `hermes` CLI is not installed globally or is in a custom path, you can set the `HERMES_AGENT_CMD` environment variable:
```bash
export HERMES_AGENT_CMD="/path/to/hermes"
fastapi dev server.py
```

### 2. Frontend

The frontend is a React application built with Vite. It automatically proxies `/api` and `/ws` requests to the local backend on port 8000.

```bash
# In a new terminal, from the root of the project:
npm install
npm run dev
```

### 3. Usage

Once both the backend and frontend are running, open the URL provided by Vite (usually `http://localhost:5173`) in your browser. 
Follow the Guided Installation to configure the provider, and then you'll enter the Main Chat to interact with Hermes!
