from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import asyncio
import json
import uuid
import time
import os
import re
import shutil
import yaml
from pathlib import Path
from typing import Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_hermes_cmd():
    """Return the hermes executable path, respecting env override."""
    return os.environ.get("HERMES_AGENT_CMD", "hermes")


def get_hermes_config() -> dict:
    """Read the user's ~/.hermes/config.yaml and return as dict."""
    config_path = Path.home() / ".hermes" / "config.yaml"
    try:
        if config_path.exists():
            with open(config_path) as f:
                return yaml.safe_load(f) or {}
    except Exception:
        pass
    return {}


def get_model_from_config(cfg: dict) -> str:
    """Extract model name from config — handles both flat and nested formats.
    
    Flat:   model: "anthropic/claude-sonnet-4"
    Nested: model: { default: "qwen3.5:9b", provider: "custom", base_url: "..." }
    """
    model_val = cfg.get("model", "")
    if isinstance(model_val, dict):
        return model_val.get("default", "")
    return model_val or ""


def get_provider_from_config(cfg: dict) -> str:
    """Extract provider from config — checks model.provider then top-level provider."""
    model_val = cfg.get("model")
    if isinstance(model_val, dict) and model_val.get("provider"):
        return model_val.get("provider", "auto")
    return cfg.get("provider", "auto")


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from text."""
    return re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])').sub('', text)


VALID_PROVIDERS = [
    "auto", "openrouter", "nous", "openai-codex",
    "zai", "kimi-coding", "minimax", "minimax-cn",
]


# ---------------------------------------------------------------------------
# Health / Status endpoints  (REAL — no mocks)
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    """
    Run `hermes doctor` (or at minimum check the binary exists) and return
    structured health information so the frontend can show real status.
    """
    hermes_cmd = get_hermes_cmd()

    # 1. Check binary exists
    binary_path = shutil.which(hermes_cmd)
    if not binary_path:
        return {
            "installed": False,
            "status": "not_installed",
            "binary": None,
            "model": None,
            "provider": None,
            "version": None,
            "details": [],
        }

    # 2. Get version
    version = None
    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        version = strip_ansi(stdout.decode().strip()) or None
    except Exception:
        pass

    # 3. Run `hermes doctor` for real diagnostics
    details: list[dict] = []
    doctor_ok = True
    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "doctor",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        raw = strip_ansi(stdout.decode())
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("✓"):
                details.append({"ok": True, "text": line[1:].strip()})
            elif line.startswith("✗"):
                details.append({"ok": False, "text": line[1:].strip()})
                doctor_ok = False
            elif line.startswith("⚠"):
                details.append({"ok": True, "warn": True, "text": line[1:].strip()})
    except Exception:
        doctor_ok = False

    # 4. Read model & provider from config
    hermes_cfg = get_hermes_config()
    model = get_model_from_config(hermes_cfg)
    provider = get_provider_from_config(hermes_cfg)

    return {
        "installed": True,
        "status": "ready" if doctor_ok else "degraded",
        "binary": binary_path,
        "model": model,
        "provider": provider,
        "version": version,
        "details": details,
    }


# ---------------------------------------------------------------------------
# Configuration endpoints
# ---------------------------------------------------------------------------

@app.get("/api/config/full")
async def get_full_config():
    """Return the full parsed Hermes config + API key status from `hermes status`."""
    hermes_cmd = get_hermes_cmd()
    hermes_cfg = get_hermes_config()

    # Parse API key status from `hermes status`
    api_keys = {}
    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        raw = strip_ansi(stdout.decode())
        in_api_keys = False
        for line in raw.splitlines():
            stripped = line.strip()
            if "API Keys" in stripped:
                in_api_keys = True
                continue
            if in_api_keys:
                if stripped.startswith("◆") or not stripped:
                    if stripped.startswith("◆") and "API Keys" not in stripped:
                        in_api_keys = False
                    continue
                # Parse lines like "OpenRouter    ✗ (not set)" or "OpenAI        ✓ ***"
                if "✓" in stripped:
                    name = stripped.split("✓")[0].strip()
                    api_keys[name] = True
                elif "✗" in stripped:
                    name = stripped.split("✗")[0].strip()
                    api_keys[name] = False
    except Exception:
        pass

    # Get personalities from config (can be under agent.personalities or top-level)
    agent_cfg = hermes_cfg.get("agent", {})
    personalities = list(agent_cfg.get("personalities", hermes_cfg.get("personalities", {})).keys())

    return {
        "model": get_model_from_config(hermes_cfg),
        "provider": get_provider_from_config(hermes_cfg),
        "max_turns": agent_cfg.get("max_turns", hermes_cfg.get("max_turns", 60)),
        "personality": hermes_cfg.get("display", {}).get("personality", ""),
        "personalities": personalities,
        "terminal_backend": hermes_cfg.get("terminal", {}).get("backend", "local"),
        "compression": {
            "enabled": hermes_cfg.get("compression", {}).get("enabled", True),
            "threshold": hermes_cfg.get("compression", {}).get("threshold", 0.85),
            "model": hermes_cfg.get("compression", {}).get("summary_model", ""),
        },
        "api_keys": api_keys,
        "valid_providers": VALID_PROVIDERS,
    }


class ModelUpdate(BaseModel):
    model: str


class ProviderUpdate(BaseModel):
    provider: str


class ProviderKeyUpdate(BaseModel):
    provider: str
    key: str


class ConfigUpdate(BaseModel):
    config: Dict[str, Any]


def deep_update_dict(target: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """Deep update a dictionary with nested values."""
    for key, value in updates.items():
        if key in target and isinstance(target[key], dict) and isinstance(value, dict):
            deep_update_dict(target[key], value)
        else:
            target[key] = value
    return target


@app.post("/api/config/update")
async def update_config_deep(body: ConfigUpdate):
    """Update configuration with nested key-value pairs via `hermes config set` commands."""
    hermes_cmd = get_hermes_cmd()
    config_updates = body.config
    
    try:
        # Process each configuration update
        for key_path, value in config_updates.items():
            # Convert dot notation to hermes config set format
            # e.g., "memory.char_limit" -> "memory.char_limit"
            cmd_args = [hermes_cmd, "config", "set", key_path, str(value)]
            
            proc = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy(),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
            
            if proc.returncode != 0:
                err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
                return {"status": "error", "message": f"Failed to set {key_path}: {err}"}
        
        return {"status": "success", "updated_config": config_updates}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/config/model")
async def update_model(body: ModelUpdate):
    """Set default model via `hermes config set model <value>`."""
    hermes_cmd = get_hermes_cmd()
    model_val = body.model.strip()
    if not model_val:
        return {"status": "error", "message": "Model name cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "config", "set", "model", model_val,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to set model: {err}"}
        return {"status": "success", "model": model_val}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/config/provider")
async def update_provider(body: ProviderUpdate):
    """Set default provider via `hermes config set provider <value>`."""
    hermes_cmd = get_hermes_cmd()
    prov_val = body.provider.strip()
    
    if prov_val not in VALID_PROVIDERS:
        return {"status": "error", "message": f"Invalid provider '{prov_val}'"}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "config", "set", "provider", prov_val,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to set provider: {err}"}
        return {"status": "success", "provider": prov_val}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/config/apikey")
async def update_apikey(body: ProviderKeyUpdate):
    """Set provider API key via `hermes config set api_keys.<provider> <key>`."""
    hermes_cmd = get_hermes_cmd()
    prov_val = body.provider.strip().lower()
    key_val = body.key.strip()
    
    if not prov_val or not key_val:
        return {"status": "error", "message": "Provider and key cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "config", "set", f"api_keys.{prov_val}", key_val,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to set API key: {err}"}
        return {"status": "success", "provider": prov_val}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Sessions endpoint
# ---------------------------------------------------------------------------

@app.get("/api/sessions")
async def list_sessions():
    """List sessions from `hermes sessions list`."""
    hermes_cmd = get_hermes_cmd()
    sessions = []

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "sessions", "list",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        raw = strip_ansi(stdout.decode())

        # Parse table output: ID | Title | Date | Messages | Duration
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("─") or line.startswith("│") is False:
                # Skip non-table lines but try to parse tabular data
                pass
            # Try to parse space-separated or pipe-separated columns
            # Format varies, so be flexible
            parts = [p.strip() for p in line.split("│") if p.strip()]
            if len(parts) >= 3:
                # Skip header rows
                if parts[0].lower() in ("id", "session"):
                    continue
                session = {
                    "id": parts[0],
                    "title": parts[1] if len(parts) > 1 else "",
                    "date": parts[2] if len(parts) > 2 else "",
                    "messages": parts[3] if len(parts) > 3 else "",
                    "duration": parts[4] if len(parts) > 4 else "",
                }
                sessions.append(session)
    except Exception:
        pass

    return {"sessions": sessions}


# ---------------------------------------------------------------------------
# Legacy config/status endpoints (kept for compatibility)
# ---------------------------------------------------------------------------

class ConfigModel(BaseModel):
    provider: str
    apiKey: str


current_config = {"provider": "local", "apiKey": ""}


@app.post("/api/config")
async def update_config(config: ConfigModel):
    current_config["provider"] = config.provider
    current_config["apiKey"] = config.apiKey
    return {"status": "success", "message": "Configuration updated."}


@app.get("/api/status")
async def get_status():
    """Return full hermes status output as structured data."""
    hermes_cmd = get_hermes_cmd()
    hermes_cfg = get_hermes_config()

    status_data = {
        "status": "online",
        "model": get_model_from_config(hermes_cfg),
        "provider": get_provider_from_config(hermes_cfg),
        "uptime": time.time(),
    }

    # Get richer status from `hermes status`
    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        raw = strip_ansi(stdout.decode())

        # Parse gateway status
        for line in raw.splitlines():
            stripped = line.strip()
            if "Gateway" in stripped and "Status:" in stripped:
                if "✓" in stripped:
                    status_data["gateway"] = "running"
                else:
                    status_data["gateway"] = "stopped"
            if "Sessions" in stripped:
                parts = stripped.split(":")
                if len(parts) > 1:
                    try:
                        status_data["active_sessions"] = int(parts[1].strip())
                    except ValueError:
                        pass
            if "Jobs" in stripped:
                parts = stripped.split(":")
                if len(parts) > 1:
                    try:
                        status_data["scheduled_jobs"] = int(parts[1].strip())
                    except ValueError:
                        pass
    except Exception:
        pass

    return status_data


# ---------------------------------------------------------------------------
# WebSocket chat  (robust — handles disconnects, long-running hermes)
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def safe_send(self, message: str, websocket: WebSocket) -> bool:
        """Send a message, returning False if the socket is already closed."""
        try:
            await websocket.send_text(message)
            return True
        except (RuntimeError, WebSocketDisconnect, Exception):
            # Socket already closed — swallow the error
            self.disconnect(websocket)
            return False


manager = ConnectionManager()


async def run_hermes_agent(
    message: str,
    run_id: str,
    websocket: WebSocket,
    session_id: Optional[str] = None,
):
    """Spawn `hermes chat -q <message>` and stream output over WS with tool events.

    Captures both response text and tool execution events for the activity monitor.
    """
    hermes_cmd = get_hermes_cmd()
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    # Build command args: Remove -Q flag to capture tool events and responses
    # -Q = quiet mode: no banner, no spinner, no tool previews — just response text
    cmd_args = [hermes_cmd, "chat", "-q", message, "-Q"]

    # Session resume support
    if session_id:
        cmd_args.extend(["--resume", session_id])

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        ok = await manager.safe_send(json.dumps({
            "type": "stream_start",
            "runId": run_id,
        }), websocket)
        if not ok:
            process.kill()
            return

        # Track tool events for activity monitor
        current_tool = None
        tool_output = []
        banner_done = False  # Track whether we've passed any CLI banner noise

        # Patterns that indicate CLI noise (banner, tables, metadata) to filter
        NOISE_PATTERNS = [
            "session_id:", "Exit code:", "hermes --resume", "hermes -r ",
            "Resume this session", "Session:", "Duration:", "Messages:",
            "Query:", "/help for commands", "commits behind", "run hermes update",
            "tools ·", "skills ·",
        ]

        def is_noise(line: str) -> bool:
            """Return True if the line looks like CLI banner/metadata noise."""
            s = line.strip()
            if not s:
                return True
            # Table borders and box-drawing characters
            if s.startswith(("│", "┌", "└", "├", "┤", "┐", "┘", "─", "╭", "╰", "╮", "╯", "|")):
                return True
            # Lines that are just box-drawing/pipe characters and whitespace
            if all(c in "│┌└├┤┐┘─╭╰╮╯| " for c in s):
                return True
            # Known noise patterns
            for pattern in NOISE_PATTERNS:
                if pattern in s:
                    return True
            # Hermes category listings (e.g., "leisure: find-nearby")
            if ":" in s and any(cat in s.lower() for cat in [
                "leisure:", "mcp:", "media:", "mlops:", "note-taking:", "productivity:",
                "research:", "domain-intel:", "smart-home:", "social-media:", "software-development:",
                "requesting-", "youtube-content", "axolotl,", "nano-pdf,",
            ]):
                return True
            return False

        # Stream stderr for error messages
        async def stream_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                text = strip_ansi(line.decode("utf-8")).strip()
                if text:
                    # Check if this is a tool-related message
                    if any(keyword in text.lower() for keyword in ['tool', 'executing', 'calling', 'result']):
                        await manager.safe_send(json.dumps({
                            "type": "agent_event",
                            "event": "tool_call",
                            "tool": "system",
                            "result": text,
                            "runId": run_id,
                        }), websocket)
                    
                    await manager.safe_send(json.dumps({
                        "type": "stream_chunk",
                        "runId": run_id,
                        "chunk": f"⚠ {text}\n",
                        "isError": True,
                    }), websocket)

        stderr_task = asyncio.create_task(stream_stderr())

        # Process stdout line by line
        while True:
            line = await process.stdout.readline()
            if not line:
                break

            text = strip_ansi(line.decode("utf-8"))
            stripped = text.strip()

            # Skip all noise (banner, tables, session metadata)
            if is_noise(text):
                continue

            # Detect tool calls
            if any(pattern in stripped.lower() for pattern in [
                'calling', 'executing', 'tool:', 'using', 'running', 'searching', 
                'browsing', 'reading', 'writing', 'creating', 'deleting', 'modifying'
            ]) and any(tool in stripped.lower() for tool in [
                'web_search', 'browse', 'read_file', 'write_file', 'shell', 'execute',
                'google', 'search', 'browser', 'file', 'code', 'terminal'
            ]):
                tool_parts = stripped.split(':')
                if len(tool_parts) > 1:
                    tool_name = tool_parts[0].replace('Calling', '').replace('Executing', '').strip()
                    tool_params = ':'.join(tool_parts[1:]).strip()
                    
                    await manager.safe_send(json.dumps({
                        "type": "agent_event",
                        "event": "tool_call",
                        "tool": tool_name,
                        "params": tool_params,
                        "runId": run_id,
                    }), websocket)
                    
                    current_tool = tool_name
                    tool_output = []
                continue
            
            # Detect tool results
            if any(pattern in stripped.lower() for pattern in [
                'result:', 'output:', 'response:', 'completed', 'returned', 'found'
            ]):
                await manager.safe_send(json.dumps({
                    "type": "agent_event",
                    "event": "tool_result",
                    "tool": current_tool or "unknown",
                    "result": stripped,
                    "runId": run_id,
                }), websocket)
                current_tool = None
                continue

            # Send actual response text
            ok = await manager.safe_send(json.dumps({
                "type": "stream_chunk",
                "runId": run_id,
                "chunk": text,
            }), websocket)
            if not ok:
                process.kill()
                return

        await stderr_task
        await process.wait()

        await manager.safe_send(json.dumps({
            "type": "stream_end",
            "runId": run_id,
            "status": "ok",
        }), websocket)

    except Exception as e:
        await manager.safe_send(json.dumps({
            "type": "error",
            "runId": run_id,
            "message": str(e),
        }), websocket)


@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            if payload.get("action") == "chat.send":
                run_id = str(uuid.uuid4())
                user_msg = payload.get("message", "")
                session_id = payload.get("sessionId")

                await manager.safe_send(json.dumps({
                    "type": "ack",
                    "runId": run_id,
                    "status": "started",
                }), websocket)

                # Run hermes in a background task
                asyncio.create_task(
                    run_hermes_agent(user_msg, run_id, websocket, session_id)
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Static file serving (MUST be last — catches all unmatched routes)
# ---------------------------------------------------------------------------
dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
