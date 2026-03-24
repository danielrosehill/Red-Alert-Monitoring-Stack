# Red Alert Stack

Microservices-based Docker stack for Israeli Home Front Command (Pikud HaOref) red alert monitoring, home automation integration, and real-time visualization.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   Pikud      │────▶│   Alert      │────▶│  Redis (pub/sub +    │
│   HaOref API │     │   Ingester   │     │  cache)              │
└─────────────┘     └──────┬───────┘     └──────┬───────────────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌──────────────────────┐
                    │  Postgres    │     │  Alert API           │
                    │  (history)   │◀───▶│  (REST + WebSocket)  │
                    └──────────────┘     └──────┬───────────────┘
                                                │
                           ┌────────────────────┼────────────────┐
                           ▼                    ▼                ▼
                    ┌──────────────┐     ┌────────────┐   ┌─────────────┐
                    │  Dashboard   │     │  Home      │   │ Notification│
                    │  (Next.js)   │     │  Automation│   │ Service     │
                    └──────────────┘     └────────────┘   └─────────────┘
```

## Services

| Service | Description | Status |
|---------|-------------|--------|
| **alert-ingester** | Polls Pikud HaOref API, stores in Postgres, publishes to Redis | Placeholder |
| **alert-api** | REST API + WebSocket server for alert data | Placeholder |
| **dashboard** | Real-time map + timeline visualization | Placeholder |
| **home-automation** | Home Assistant / MQTT bridge for smart home reactions | Placeholder |
| **notification-service** | Push notifications via ntfy, Telegram, Pushover | Placeholder |

## Quick Start

```bash
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

Access the dashboard at `http://localhost:8080`.

## Configuration

See `.env.example` for all available environment variables.
