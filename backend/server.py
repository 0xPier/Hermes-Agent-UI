from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
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
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import httpx

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
    """Extract model name from config — handles both flat and nested formats."""
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


def parse_relative_date(date_str: str) -> str:
    """Convert relative dates like '9h ago', 'yesterday', '4d ago' to ISO format.
    
    Falls back to returning the original string if parsing fails.
    """
    date_str = date_str.strip()
    now = datetime.now()
    
    try:
        if date_str == "just now":
            return now.isoformat()
        
        if date_str == "yesterday":
            return (now - timedelta(days=1)).isoformat()
        
        # Match patterns like "9h ago", "4d ago", "30m ago", "2w ago"
        match = re.match(r'^(\d+)\s*(s|m|h|d|w)\s*ago$', date_str)
        if match:
            amount = int(match.group(1))
            unit = match.group(2)
            
            delta_map = {
                's': timedelta(seconds=amount),
                'm': timedelta(minutes=amount),
                'h': timedelta(hours=amount),
                'd': timedelta(days=amount),
                'w': timedelta(weeks=amount),
            }
            
            delta = delta_map.get(unit)
            if delta:
                return (now - delta).isoformat()
    except Exception:
        pass
    
    return date_str


VALID_PROVIDERS = [
    "auto", "openrouter", "nous", "openai-codex",
    "zai", "kimi-coding", "minimax", "minimax-cn",
]


# ---------------------------------------------------------------------------
# Health / Status endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    hermes_cmd = get_hermes_cmd()

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
                if "✓" in stripped:
                    name = stripped.split("✓")[0].strip().lower()
                    api_keys[name] = True
                elif "✗" in stripped:
                    name = stripped.split("✗")[0].strip().lower()
                    api_keys[name] = False
    except Exception:
        pass

    agent_cfg = hermes_cfg.get("agent", {})
    personalities = list(agent_cfg.get("personalities", hermes_cfg.get("personalities", {})).keys())

    # Include memory and stt/tts/voice config for Settings modal
    memory_cfg = hermes_cfg.get("memory", {})
    stt_cfg = hermes_cfg.get("stt", {})
    tts_cfg = hermes_cfg.get("tts", {})
    voice_cfg = hermes_cfg.get("voice", {})

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
        "memory": {
            "memory_enabled": memory_cfg.get("memory_enabled", True),
            "memory_char_limit": memory_cfg.get("memory_char_limit", 2200),
        },
        "stt": {
            "enabled": stt_cfg.get("enabled", False),
            "provider": stt_cfg.get("provider", "local"),
        },
        "tts": {
            "provider": tts_cfg.get("provider", "edge"),
        },
        "voice": {
            "auto_tts": voice_cfg.get("auto_tts", False),
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


@app.post("/api/config/update")
async def update_config_deep(body: ConfigUpdate):
    """Update configuration with nested key-value pairs via `hermes config set` commands."""
    hermes_cmd = get_hermes_cmd()
    config_updates = body.config
    
    try:
        for key_path, value in config_updates.items():
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
# Local LLM provider configuration
# ---------------------------------------------------------------------------

LOCAL_PROVIDER_PRESETS = {
    "ollama": {
        "label": "Ollama",
        "default_port": 11434,
        "api_key": "ollama",
        "model_placeholder": "qwen3.5:9b",
    },
    "llamacpp": {
        "label": "llama.cpp",
        "default_port": 8080,
        "api_key": "no-key",
        "model_placeholder": "Qwen3.5-9B.Q5_K_M.gguf",
    },
    "lmstudio": {
        "label": "LM Studio",
        "default_port": 1234,
        "api_key": "lm-studio",
        "model_placeholder": "qwen3.5-9b",
    },
}


def _detect_provider_type(entry: dict) -> str:
    """Guess which local provider type a custom_providers entry represents."""
    base_url = (entry.get("base_url") or "").lower()
    api_key = (entry.get("api_key") or "").lower()
    name = (entry.get("name") or "").lower()
    # Port-based detection is most reliable
    if ":11434" in base_url:
        return "ollama"
    if ":1234" in base_url:
        return "lmstudio"
    if ":8080" in base_url:
        return "llamacpp"
    # Fall back to api_key / name heuristics
    if api_key == "ollama" or "ollama" in name:
        return "ollama"
    if api_key == "lm-studio" or "lm studio" in name or "lmstudio" in name:
        return "lmstudio"
    # Default to llamacpp for unknown
    return "llamacpp"


def _parse_host_port(base_url: str) -> tuple:
    """Extract host and port from a base_url like http://localhost:8080/v1."""
    import re as _re
    m = _re.search(r'https?://([^:/]+):(\d+)', base_url)
    if m:
        return m.group(1), int(m.group(2))
    return "localhost", 8080


def _write_hermes_config(cfg: dict):
    """Write config dict back to ~/.hermes/config.yaml."""
    config_path = Path.home() / ".hermes" / "config.yaml"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False, allow_unicode=True)


class LocalProviderSetup(BaseModel):
    provider: str  # "ollama" | "llamacpp" | "lmstudio"
    host: str = "localhost"
    port: int
    model: str


@app.get("/api/config/local-provider/status")
async def local_provider_status():
    """Check whether a local LLM provider is configured in custom_providers."""
    cfg = get_hermes_config()
    custom = cfg.get("custom_providers", [])

    if not custom:
        return {"configured": False, "provider": None}

    entry = custom[0]  # Use first entry
    ptype = _detect_provider_type(entry)
    host, port = _parse_host_port(entry.get("base_url", ""))

    return {
        "configured": True,
        "provider": ptype,
        "label": LOCAL_PROVIDER_PRESETS.get(ptype, {}).get("label", ptype),
        "host": host,
        "port": port,
        "model": entry.get("model", ""),
        "base_url": entry.get("base_url", ""),
    }


@app.post("/api/config/local-provider")
async def set_local_provider(body: LocalProviderSetup):
    """Configure a local LLM provider (Ollama / llama.cpp / LM Studio).

    Writes the correct custom_providers entry into ~/.hermes/config.yaml.
    """
    preset = LOCAL_PROVIDER_PRESETS.get(body.provider)
    if not preset:
        return {"status": "error", "message": f"Unknown provider '{body.provider}'"}

    host = body.host.strip() or "localhost"
    port = body.port or preset["default_port"]
    model = body.model.strip()
    if not model:
        return {"status": "error", "message": "Model name cannot be empty."}

    base_url = f"http://{host}:{port}/v1"
    api_key = preset["api_key"]

    # Read current config
    cfg = get_hermes_config()

    # Set custom_providers (replace any existing local entry)
    cfg["custom_providers"] = [{
        "name": f"{preset['label']} ({host}:{port})",
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
    }]

    # Also set the top-level model so hermes uses it
    cfg["model"] = model

    try:
        _write_hermes_config(cfg)
        return {
            "status": "success",
            "provider": body.provider,
            "base_url": base_url,
            "model": model,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/config/local-provider/test")
async def test_local_provider(host: str = "localhost", port: int = 8080):
    """Test connectivity to a local LLM provider and discover available models.

    Makes a GET to http://{host}:{port}/v1/models (OpenAI-compatible endpoint)
    and returns the list of model IDs if successful.
    """
    url = f"http://{host}:{port}/v1/models"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                models = []
                if isinstance(data, dict) and "data" in data:
                    models = [m.get("id", "") for m in data["data"] if m.get("id")]
                return {
                    "status": "ok",
                    "reachable": True,
                    "models": models,
                }
            else:
                return {
                    "status": "error",
                    "reachable": True,
                    "models": [],
                    "message": f"Server returned HTTP {resp.status_code}",
                }
    except httpx.ConnectError:
        return {
            "status": "error",
            "reachable": False,
            "models": [],
            "message": f"Cannot connect to {host}:{port}. Is the service running?",
        }
    except Exception as e:
        return {
            "status": "error",
            "reachable": False,
            "models": [],
            "message": str(e),
        }


# ---------------------------------------------------------------------------
# Sessions endpoint
# ---------------------------------------------------------------------------

@app.get("/api/sessions")
async def list_sessions():
    """List sessions from `hermes sessions list` with proper date parsing."""
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

        lines = raw.splitlines()
        header_idx = -1
        col_positions = {}
        for i, line in enumerate(lines):
            if "ID" in line and ("Preview" in line or "Last Active" in line):
                header_idx = i
                for col_name in ["Preview", "Last Active", "Src", "ID"]:
                    pos = line.find(col_name)
                    if pos >= 0:
                        col_positions[col_name] = pos
                break

        if header_idx < 0 or "ID" not in col_positions:
            return {"sessions": sessions}

        for line in lines[header_idx + 1:]:
            if not line.strip() or all(c in "─ " for c in line.strip()):
                continue

            id_pos = col_positions.get("ID", 0)
            last_active_pos = col_positions.get("Last Active", 0)
            src_pos = col_positions.get("Src", 0)

            session_id = line[id_pos:].strip() if id_pos < len(line) else ""
            if not session_id:
                continue

            preview = line[:last_active_pos].strip() if last_active_pos else ""
            last_active = line[last_active_pos:src_pos].strip() if last_active_pos and src_pos else ""

            # Convert relative dates to ISO for frontend groupSessions()
            iso_date = parse_relative_date(last_active) if last_active else ""

            sessions.append({
                "id": session_id,
                "title": preview or "Untitled Session",
                "date": iso_date,
                "relativeDate": last_active,  # Keep original for display
                "messages": "",
                "duration": "",
            })
    except Exception:
        pass

    return {"sessions": sessions}


# ---------------------------------------------------------------------------
# Tools management endpoints
# ---------------------------------------------------------------------------

TOOL_LINE_PATTERN = re.compile(
    r'^\s*(✓|✗)\s+(enabled|disabled)\s+(\S+)\s+(.+)$'
)


@app.get("/api/tools")
async def list_tools():
    """Parse `hermes tools list` and return structured tool data."""
    hermes_cmd = get_hermes_cmd()
    tools = []

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "tools", "list",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        raw = strip_ansi(stdout.decode())

        for line in raw.splitlines():
            match = TOOL_LINE_PATTERN.match(line)
            if match:
                enabled = match.group(1) == "✓"
                name = match.group(3)
                description = match.group(4).strip()
                # Split emoji from description
                emoji = ""
                desc_text = description
                if description and not description[0].isascii():
                    parts = description.split(" ", 1)
                    if len(parts) == 2:
                        emoji = parts[0]
                        desc_text = parts[1]
                    else:
                        emoji = parts[0]
                        desc_text = ""

                tools.append({
                    "name": name,
                    "enabled": enabled,
                    "emoji": emoji,
                    "description": desc_text,
                })
    except Exception:
        pass

    return {"tools": tools}


class ToolToggle(BaseModel):
    name: str


@app.post("/api/tools/enable")
async def enable_tool(body: ToolToggle):
    """Enable a toolset via `hermes tools enable <name>`."""
    hermes_cmd = get_hermes_cmd()
    tool_name = body.name.strip()
    if not tool_name:
        return {"status": "error", "message": "Tool name cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "tools", "enable", tool_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to enable {tool_name}: {err}"}
        return {"status": "success", "tool": tool_name, "enabled": True}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/tools/disable")
async def disable_tool(body: ToolToggle):
    """Disable a toolset via `hermes tools disable <name>`."""
    hermes_cmd = get_hermes_cmd()
    tool_name = body.name.strip()
    if not tool_name:
        return {"status": "error", "message": "Tool name cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "tools", "disable", tool_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to disable {tool_name}: {err}"}
        return {"status": "success", "tool": tool_name, "enabled": False}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Skills management endpoints
# ---------------------------------------------------------------------------

@app.get("/api/skills")
async def list_skills():
    """Parse `hermes skills list` and return structured skill data."""
    hermes_cmd = get_hermes_cmd()
    skills = []

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "skills", "list",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
        raw = strip_ansi(stdout.decode())

        # Parse table rows: │ name │ category │ source │ origin │
        for line in raw.splitlines():
            line = line.strip()
            if not line.startswith("│"):
                continue
            cols = [c.strip() for c in line.split("│") if c.strip()]
            if len(cols) >= 3:
                name = cols[0]
                # Skip header row
                if name.lower() in ("name", "skill"):
                    continue
                # Skip separator rows
                if all(c in "─┼" for c in name):
                    continue
                skills.append({
                    "name": name,
                    "category": cols[1] if len(cols) > 1 else "",
                    "source": cols[2] if len(cols) > 2 else "",
                    "origin": cols[3] if len(cols) > 3 else "",
                })
    except Exception:
        pass

    return {"skills": skills}


# ---------------------------------------------------------------------------
# Session management endpoints (delete, rename, stats)
# ---------------------------------------------------------------------------

class SessionDelete(BaseModel):
    session_id: str


class SessionRename(BaseModel):
    session_id: str
    title: str


@app.post("/api/sessions/delete")
async def delete_session(body: SessionDelete):
    """Delete a session via `hermes sessions delete <id>`."""
    hermes_cmd = get_hermes_cmd()
    sid = body.session_id.strip()
    if not sid:
        return {"status": "error", "message": "Session ID cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "sessions", "delete", sid,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        # Auto-confirm if prompted
        stdout, stderr = await asyncio.wait_for(proc.communicate(input=b"y\n"), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to delete session: {err}"}
        return {"status": "success", "session_id": sid}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/sessions/rename")
async def rename_session(body: SessionRename):
    """Rename a session via `hermes sessions rename <id> <title>`."""
    hermes_cmd = get_hermes_cmd()
    sid = body.session_id.strip()
    title = body.title.strip()
    if not sid or not title:
        return {"status": "error", "message": "Session ID and title cannot be empty."}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "sessions", "rename", sid, title,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Failed to rename session: {err}"}
        return {"status": "success", "session_id": sid, "title": title}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/sessions/stats")
async def session_stats():
    """Parse `hermes sessions stats` and return structured stats."""
    hermes_cmd = get_hermes_cmd()
    stats = {}

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "sessions", "stats",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        raw = strip_ansi(stdout.decode())

        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("Total sessions:"):
                try:
                    stats["total_sessions"] = int(line.split(":")[1].strip())
                except (ValueError, IndexError):
                    pass
            elif line.startswith("Total messages:"):
                try:
                    stats["total_messages"] = int(line.split(":")[1].strip())
                except (ValueError, IndexError):
                    pass
            elif line.startswith("Database size:"):
                stats["db_size"] = line.split(":")[1].strip()
    except Exception:
        pass

    return stats


# ---------------------------------------------------------------------------
# Ingestion endpoint
# ---------------------------------------------------------------------------

@app.post("/api/ingest")
async def ingest_file(file: UploadFile = File(...)):
    """Accept an uploaded file and process it with `hermes ingest <file>`."""
    if not file.filename:
        return {"status": "error", "message": "No file uploaded."}
    
    hermes_cmd = get_hermes_cmd()
    
    # Save the file to a temporary location
    temp_dir = Path("/tmp/arca_ingest")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', file.filename)
    file_path = temp_dir / safe_name
    
    try:
        content = await file.read()
        file_path.write_bytes(content)
        
        # Execute hermes ingest
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "ingest", str(file_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy()
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        
        if proc.returncode != 0:
            err = strip_ansi(stderr.decode().strip() or stdout.decode().strip())
            return {"status": "error", "message": f"Ingestion failed: {err}"}
            
        return {"status": "success", "message": f"File {file.filename} ingested successfully"}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass


# ---------------------------------------------------------------------------
# Status endpoint
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
    hermes_cmd = get_hermes_cmd()
    hermes_cfg = get_hermes_config()

    status_data = {
        "status": "online",
        "model": get_model_from_config(hermes_cfg),
        "provider": get_provider_from_config(hermes_cfg),
        "uptime": time.time(),
    }

    try:
        proc = await asyncio.create_subprocess_exec(
            hermes_cmd, "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=os.environ.copy(),
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        raw = strip_ansi(stdout.decode())

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
# WebSocket chat  (with session tracking & activity monitor)
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
        try:
            await websocket.send_text(message)
            return True
        except (RuntimeError, WebSocketDisconnect, Exception):
            self.disconnect(websocket)
            return False


manager = ConnectionManager()


async def run_hermes_agent(
    message: str,
    run_id: str,
    websocket: WebSocket,
    session_id: Optional[str] = None,
):
    """Spawn `hermes chat -q <message>` and stream output over WS.
    
    Key changes from original:
    1. Captures session_id from hermes output and sends it to frontend
    2. Parses structured tool events from hermes verbose output
    3. Properly filters noise while preserving useful data
    """
    hermes_cmd = get_hermes_cmd()
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    # Build command: -q for single query, -v for verbose (tool activity)
    cmd_args = [hermes_cmd, "chat", "-q", message, "-v"]

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

        # ── Noise filter ──
        # These patterns are CLI chrome/metadata that should never reach the user
        NOISE_PATTERNS = [
            "Exit code:", "hermes --resume", "hermes -r ",
            "Resume this session", "Duration:", "Messages:",
            "/help for commands", "commits behind", "run hermes update",
            "tools ·", "skills ·",
        ]

        def is_noise(line: str) -> bool:
            s = line.strip()
            if not s:
                return True
            # Box-drawing / banner
            if s.startswith(("│", "┌", "└", "├", "┤", "┐", "┘", "─", "╭", "╰", "╮", "╯", "|", "──")):
                return True
            if all(c in "│┌└├┤┐┘─╭╰╮╯| ─" for c in s):
                return True
            for pattern in NOISE_PATTERNS:
                if pattern in s:
                    return True
            # Category listings
            if ":" in s and any(cat in s.lower() for cat in [
                "leisure:", "mcp:", "media:", "mlops:", "note-taking:", "productivity:",
                "research:", "domain-intel:", "smart-home:", "social-media:", "software-development:",
                "requesting-", "youtube-content", "axolotl,", "nano-pdf,",
            ]):
                return True
            return False

        # ── Verbose output patterns for activity monitor ──
        # These patterns appear in `-v` mode and indicate tool/agent activity
        TOOL_CALL_PATTERN = re.compile(r'🔧\s*(?:Tool call|Calling|Using|Available tools):\s*(.*)', re.IGNORECASE)
        API_CALL_PATTERN = re.compile(r'🔄\s*Making API call\s*#?(\d+)?/?(\d+)?', re.IGNORECASE)
        TOOLSET_PATTERN = re.compile(r'✅\s*Enabled toolset\s+[\'"]?(\w+)[\'"]?:\s*(.*)', re.IGNORECASE)
        TOOL_EXEC_PATTERN = re.compile(r'🛠️\s*(.*)', re.IGNORECASE)
        RESULT_PATTERN = re.compile(r'(?:✅|✓|🎉)\s*(.*completed|.*result|.*finished|.*done)(.*)', re.IGNORECASE)
        THINKING_PATTERN = re.compile(r'\[thinking\]\s*(.*)', re.IGNORECASE)  
        SESSION_ID_PATTERN = re.compile(r'Session:\s+(\S+)')
        QUERY_LINE_PATTERN = re.compile(r'^Query:\s+')
        AI_INIT_PATTERN = re.compile(r'🤖\s*AI Agent initialized with model:\s*(.*)')
        CONTEXT_PATTERN = re.compile(r'📊\s*Context limit:\s*(.*)')

        # Track state
        captured_session_id = None
        in_think_block = False   # True while inside <think>...</think>
        in_assistant_block = False  # True once we've seen 🤖 Assistant:

        # ── Disclaimer / boilerplate patterns to strip ──
        # These are LLM self-referential phrases that add no value
        DISCLAIMER_PATTERNS = [
            re.compile(r"(please note|keep in mind|it('s| is) (important|worth noting)|i('m| am) an? (ai|artificial intelligence|language model|llm)|as an? (ai|llm|language model)|i should (mention|note|clarify|point out)|disclaimer:|note that i|remember that i)[^.!?\n]*[.!?]?", re.IGNORECASE),
            re.compile(r"^(note:|please note:|disclaimer:)\s*", re.IGNORECASE),
        ]

        def strip_disclaimers(text: str) -> str:
            """Remove AI self-referential boilerplate from a line of text."""
            for pat in DISCLAIMER_PATTERNS:
                text = pat.sub("", text)
            return text.strip()

        def is_pure_disclaimer(line: str) -> bool:
            """Return True if the entire line is just LLM boilerplate."""
            cleaned = strip_disclaimers(line.strip())
            # If stripping leaves nothing or just punctuation, it was pure boilerplate
            return len(cleaned) < 5

        # Stream stderr — suppress from chat, only log internally
        async def stream_stderr():
            while True:
                line = await process.stderr.readline()
                if not line:
                    break
                # Intentionally not forwarding stderr to chat — it's system noise

        stderr_task = asyncio.create_task(stream_stderr())

        # Process stdout line by line
        while True:
            line = await process.stdout.readline()
            if not line:
                break

            text = strip_ansi(line.decode("utf-8"))
            stripped = text.strip()

            # ── 1. Capture session ID ──
            session_match = SESSION_ID_PATTERN.match(stripped)
            if session_match:
                captured_session_id = session_match.group(1)
                continue
            if stripped.startswith("Session:"):
                parts = stripped.split(":", 1)
                if len(parts) > 1 and parts[1].strip():
                    captured_session_id = parts[1].strip()
                continue

            # ── 2. <think> block state machine ──
            # Handle multi-line think blocks — qwen and similar models
            if in_think_block:
                if "</think>" in stripped:
                    in_think_block = False
                    # Emit anything after </think> on the same line
                    after = stripped.split("</think>", 1)[1].strip()
                    if after and not is_pure_disclaimer(after):
                        after = strip_disclaimers(after)
                        if after:
                            ok = await manager.safe_send(json.dumps({
                                "type": "stream_chunk",
                                "runId": run_id,
                                "chunk": after + "\n",
                            }), websocket)
                            if not ok:
                                process.kill()
                                return
                continue  # Still inside think block, skip line

            # Detect opening of think block (may be on a line with other content)
            if "<think>" in stripped:
                if "</think>" in stripped:
                    # Entire think block on one line — skip it
                    # But emit anything before/after
                    before = stripped.split("<think>", 1)[0].strip()
                    after_part = stripped.split("</think>", 1)[-1].strip() if "</think>" in stripped else ""
                    for part in [before, after_part]:
                        if part and not is_pure_disclaimer(part):
                            part = strip_disclaimers(part)
                            if part:
                                ok = await manager.safe_send(json.dumps({
                                    "type": "stream_chunk",
                                    "runId": run_id,
                                    "chunk": part + "\n",
                                }), websocket)
                                if not ok:
                                    process.kill()
                                    return
                else:
                    in_think_block = True
                continue

            # ── 3. Verbose tool/agent events (send as agent_event, never to chat) ──
            api_match = API_CALL_PATTERN.match(stripped)
            if api_match:
                call_num = api_match.group(1) or "?"
                max_calls = api_match.group(2) or "?"
                await manager.safe_send(json.dumps({
                    "type": "agent_event",
                    "event": "tool_call",
                    "tool": "API",
                    "params": f"Call #{call_num}/{max_calls}",
                    "runId": run_id,
                }), websocket)
                continue

            if stripped.startswith("📊") and "Request size:" in stripped:
                continue  # Noise

            if stripped.startswith("⏱️") and "completed" in stripped:
                continue  # Noise

            ai_match = AI_INIT_PATTERN.match(stripped)
            if ai_match:
                continue  # Noise

            toolset_match = TOOLSET_PATTERN.search(stripped)
            if toolset_match:
                continue  # Noise

            tool_exec_match = TOOL_EXEC_PATTERN.match(stripped)
            if tool_exec_match:
                continue  # Noise

            if stripped.startswith("💬") or stripped.startswith("🎉"):
                continue  # Noise

            thinking_match = THINKING_PATTERN.match(stripped)
            if thinking_match:
                continue  # Noise

            if CONTEXT_PATTERN.match(stripped):
                continue  # Noise

            # ── 4. 🤖 Assistant: marker — enter response mode ──
            if stripped.startswith("🤖 Assistant:"):
                in_assistant_block = True
                content = stripped[len("🤖 Assistant:"):].strip()
                if content and not is_pure_disclaimer(content):
                    content = strip_disclaimers(content)
                    if content:
                        ok = await manager.safe_send(json.dumps({
                            "type": "stream_chunk",
                            "runId": run_id,
                            "chunk": content + "\n",
                        }), websocket)
                        if not ok:
                            process.kill()
                            return
                continue

            # ── 5. Skip verbose/noise prefix lines ──
            if any(stripped.startswith(prefix) for prefix in [
                "✅ Enabled", "⚠️", "🔗", "🔒", "🛡️",
            ]):
                continue
            if QUERY_LINE_PATTERN.match(stripped):
                continue
            if stripped.startswith("────") or stripped.startswith("═══"):
                continue
            if is_noise(text):
                continue

            # ── 6. Send response text ──
            # Only forward lines once we're in the assistant response block
            # to prevent pre-response CLI chrome from leaking through.
            if not in_assistant_block:
                continue

            # Apply disclaimer filter
            if is_pure_disclaimer(stripped):
                continue
            cleaned = strip_disclaimers(text.rstrip("\n"))
            if not cleaned.strip():
                continue

            ok = await manager.safe_send(json.dumps({
                "type": "stream_chunk",
                "runId": run_id,
                "chunk": cleaned + "\n",
            }), websocket)
            if not ok:
                process.kill()
                return

        await stderr_task
        await process.wait()

        # ── 4. Send session_id to frontend for resume tracking ──
        if captured_session_id:
            await manager.safe_send(json.dumps({
                "type": "session_info",
                "runId": run_id,
                "sessionId": captured_session_id,
            }), websocket)

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
