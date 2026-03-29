FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

ENV PORT=8786

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT:-8786}/mcp | grep -q '[2-4][0-9][0-9]' || exit 1

CMD ["python", "server.py"]
