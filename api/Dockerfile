FROM node:22-slim

# Install typst for PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates xz-utils && \
    curl -fsSL https://github.com/typst/typst/releases/latest/download/typst-x86_64-unknown-linux-musl.tar.xz \
    | tar -xJ --strip-components=1 -C /usr/local/bin && \
    apt-get purge -y xz-utils && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV DB_PATH=/app/data/management.db
ENV PORT=8890

RUN mkdir -p /app/data

EXPOSE 8890

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD curl -f http://localhost:${PORT:-8890}/health || exit 1

CMD ["npx", "tsx", "src/server.ts"]
