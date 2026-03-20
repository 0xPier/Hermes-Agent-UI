# ── Build Stage (Frontend) ──
FROM node:20-slim AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Final Stage (Backend + Frontend) ──
FROM python:3.11-slim
WORKDIR /app/backend

# Install system dependencies for Hermes CLI and enhanced monitoring
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir hermes-agent

# Copy built frontend from build-stage to /app/dist
COPY --from=build-stage /app/dist /app/dist

# Copy backend source
COPY backend/ .

# Create necessary directories and set permissions
RUN mkdir -p /app/.hermes && \
    chmod -R 755 /app

# Expose port and start
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
