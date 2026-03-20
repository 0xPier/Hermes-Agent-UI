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

---

## 🐳 Docker (Production)

The Docker setup runs the backend and serves the built React frontend from a single container — no separate frontend server needed.

### Prerequisites

- **Docker** and **Docker Compose** installed
- **Ollama** running on the host machine (if using a local model)
- **Hermes CLI** configured at `~/.hermes/config.yaml`

### 1. Update your Ollama URL (local models only)

If `~/.hermes/config.yaml` points to `http://localhost:11434`, update it to use the host gateway so Docker can reach Ollama on your machine:

```yaml
# ~/.hermes/config.yaml
custom_providers:
  - name: Local (localhost:11434)
    base_url: http://host.docker.internal:11434/v1   # ← change this
    api_key: ollama
    model: qwen3.5:9b
```

### 2. Build and run

```bash
docker-compose up --build
```

The UI will be available at **`http://localhost:8000`**.

### 3. Notes

- Your `~/.hermes` directory is mounted into the container — config changes and sessions persist across restarts.
- To run in the background: `docker-compose up -d`
- To stop: `docker-compose down`
- If using a cloud provider (Anthropic, OpenAI, etc.) instead of Ollama, no URL changes are needed.
