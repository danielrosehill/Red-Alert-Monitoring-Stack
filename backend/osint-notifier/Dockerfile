FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY main.py classifiers.py intel.py news_context.py notifier.py oref_monitor.py sitrep.py telegram_monitor.py ./

CMD ["python", "main.py"]
