FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY snapcast-tts/pyproject.toml .
RUN pip install --no-cache-dir .

COPY shared/alert_constants.py .
COPY snapcast-tts/ .

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8783}/health || exit 1

CMD ["python", "snapcast_tts.py"]
