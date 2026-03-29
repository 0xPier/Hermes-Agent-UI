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
pip install fastapi uvicorn websockets pydantic pyyaml httpx python-multipart
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

On first launch you'll be asked to **choose your local LLM provider**:

| Provider | Default Port | Description |
|---|---|---|
| **Ollama** | `11434` | Most popular local model runner. Simple CLI. |
| **llama.cpp** | `8080` | Bare-metal C++ inference with GGUF models. |
| **LM Studio** | `1234` | Desktop GUI, download & serve models visually. |

Select your provider, test the connection, choose a model, and you're in.

> **All three backends run outside of Docker on your host machine.** The UI only connects to them over HTTP — nothing is bundled or containerized.

---

## 🐳 Docker (Production)

The Docker setup runs the backend and serves the built React frontend from a single container — no separate frontend server needed.

### Prerequisites

- **Docker** and **Docker Compose** installed
- One of the following running on your **host machine** (outside Docker):
  - **Ollama** (port 11434)
  - **llama.cpp** / llama-server (port 8080)
  - **LM Studio** (port 1234)
- **Hermes CLI** configured at `~/.hermes/config.yaml`

### 1. Start your local LLM provider

Make sure one of the three backends is running on your host before starting Docker:

```bash
# Ollama
ollama serve

# llama.cpp  
llama-server -m model.gguf --port 8080

# LM Studio
# Start via the desktop app, enable "Local Server" on port 1234
```

### 2. Build and run

```bash
docker-compose up --build
```

The UI will be available at **`http://localhost:8000`**. On first visit, select your provider through the setup wizard.

### 3. Notes

- Your `~/.hermes` directory is mounted into the container — config changes and sessions persist across restarts.
- Docker uses `host.docker.internal` to reach your host-side LLM server — this is configured automatically.
- To run in the background: `docker-compose up -d`
- To stop: `docker-compose down`
- If using a cloud provider (Anthropic, OpenAI, etc.), skip the local provider setup in the UI.
