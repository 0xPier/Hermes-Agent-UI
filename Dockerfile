FROM python:3.12-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    git clone --recurse-submodules https://github.com/NousResearch/hermes-agent.git /tmp/hermes-agent && \
    pip install --no-cache-dir /tmp/hermes-agent && \
    rm -rf /tmp/hermes-agent

# Copy backend source and frontend static files
COPY api/ api/
COPY static/ static/
COPY server.py .

# Create necessary directories
RUN mkdir -p /root/.hermes && chmod -R 755 /app

# Set environments for Hermes Web UI so it binds dynamically globally
ENV HERMES_WEBUI_HOST=0.0.0.0
ENV HERMES_WEBUI_PORT=8000

# Expose port and start
EXPOSE 8000

# Check health endpoint at port 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "server.py"]
