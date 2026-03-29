# Hermes UI

A dynamic, web-based UI for the Hermes autonomous AI agent. This interface bridges the gap between terminal hackers and non-technical users, offering a beautiful, guided experience for configuring AI providers and interacting with the `hermes` CLI.

## Key Features

- **Guided Setup Wizard**: Seamlessly detects your installation and walks you through configuring either Cloud (OpenRouter, Anthropic, etc.) or Local (Ollama, llama.cpp, LM Studio) AI engines.
- **Messaging Integrations**: Quickly check the status of and get connection instructions for Telegram, Discord, and WhatsApp bridges.
- **Rich Chat Interface**: Real-time streaming, syntax highlighting, session management, and granular agent tool activity monitoring.
- **Under-the-hood Filtering**: Automatically strips out AI boilerplate, disclaimers, and verbose `<think>` reasoning chunks for a cleaner read.

## Prerequisites

- **Python 3.10+**
- **Node.js**
- **Hermes CLI agent** (Installed natively or via Docker)

## Setup

### 1. Backend

The backend is a FastAPI server that manages WebSockets to communicate with the Hermes CLI.

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload
```

### 2. Frontend

The frontend is a React application built with Vite.

```bash
# In a new terminal, from the root of the project:
npm install
npm run dev
```

### 3. Usage

Open `http://localhost:5173` in your browser. The Setup Wizard will automatically appear if you haven't configured Hermes yet, allowing you to choose between a Cloud provider API key or connecting your local inference engine.

---

## 🐳 Docker (Production)

The Docker setup runs the backend and serves the built React frontend from a single container. 

```bash
docker compose up -d --build
```

The UI will be available at **`http://localhost:8000`**.

> [!TIP]
> **Local Inference Compatibility**: If you use the setup wizard to connect to Ollama or llama.cpp while Hermes is running in Docker, you should use `host.docker.internal` as your hostname instead of `localhost`. The wizard's "Test Connection" button will verify if the container can reach your host machine's LLM engine.

- Your `~/.hermes` directory is mounted into the container so config changes and sessions persist across restarts.
