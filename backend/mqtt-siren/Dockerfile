FROM python:3.12-slim

WORKDIR /app

COPY mqtt-siren/pyproject.toml .
RUN pip install --no-cache-dir .

COPY shared/alert_constants.py .
COPY mqtt-siren/mqtt_siren.py .

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV PORT=8789

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8789}/health || exit 1

CMD ["python", "mqtt_siren.py"]
