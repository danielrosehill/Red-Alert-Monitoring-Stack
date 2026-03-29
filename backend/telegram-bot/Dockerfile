FROM python:3.12-slim

WORKDIR /app

# ffmpeg for converting TTS audio to OGG/Opus voice notes
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY telegram-bot/pyproject.toml .
RUN pip install --no-cache-dir .

COPY shared/alert_constants.py .
COPY telegram-bot/bot.py .

VOLUME /app/data

CMD ["python", "bot.py"]
