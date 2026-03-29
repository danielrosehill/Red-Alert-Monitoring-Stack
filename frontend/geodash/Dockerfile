FROM python:3.12-slim

WORKDIR /app

# Install curl for Docker healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

# Copy dependency spec first (Docker cache layer)
COPY backend/pyproject.toml backend/
RUN cd backend && uv pip install --system -r pyproject.toml

# Copy application code
COPY backend/ backend/
COPY www/ www/
COPY research/area_to_polygon.json research/area_to_polygon.json
COPY research/area_translations.json research/area_translations.json
COPY research/area_regions.json research/area_regions.json

ENV PORT=8083

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8083}/api/health || exit 1

CMD uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}
