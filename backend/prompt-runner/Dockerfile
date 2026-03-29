FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV PORT=8787

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8787}/health || exit 1

CMD uvicorn app:app --host 0.0.0.0 --port ${PORT}
