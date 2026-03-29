FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY actuator.py .

ENV PORT=8782

EXPOSE ${PORT}

CMD ["python", "actuator.py"]
