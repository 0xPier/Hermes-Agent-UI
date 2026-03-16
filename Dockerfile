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

# Install system dependencies for Hermes CLI (example)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend from build-stage to /app/dist
COPY --from=build-stage /app/dist /app/dist

# Copy backend source
COPY backend/ .

# Expose port and start
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
