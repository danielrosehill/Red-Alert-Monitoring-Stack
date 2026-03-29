FROM python:3.12-slim

WORKDIR /app

COPY pushover/pyproject.toml .
RUN pip install --no-cache-dir .

COPY shared/alert_constants.py .
COPY pushover/notifier.py .

CMD ["python", "notifier.py"]
