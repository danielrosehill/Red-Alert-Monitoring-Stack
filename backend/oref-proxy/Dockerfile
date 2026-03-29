FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

COPY server.py .

ENV PORT=8764

EXPOSE ${PORT}

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT}
