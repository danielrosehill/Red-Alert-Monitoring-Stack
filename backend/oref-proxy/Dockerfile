FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

COPY server.py .

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV PORT=8764

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8764}/api/health || exit 1

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
