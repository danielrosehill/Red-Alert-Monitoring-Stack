# Red Alert Monitoring Stack

Microservices stack for monitoring Israel's Homefront Command (Pikud HaOref) alerts with real-time visualization, push notifications, AI situation reports, and home automation integration.

## Architecture

Each component is a standalone service with its own repo, Docker config, and documentation. They communicate over HTTP and MQTT, sharing a single data source.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Pikud HaOref (Homefront Command)                     │
│                     Geo-restricted alert API (Israel only)               │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ polled every 3s
                               ▼
                  ┌────────────────────────┐
                  │    Oref Alert Proxy    │
                  │    (FastAPI, :8764)    │
                  │    Single poller,      │
                  │    dumb relay          │
                  └───────────┬────────────┘
                              │
            ┌─────────────────┼─────────────────┬──────────────────┐
            ▼                 ▼                 ▼                  ▼
   ┌────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────────┐
   │    Geodash     │ │   Pushover   │ │  Telegram    │ │   Actuator     │
   │  (Dashboard)   │ │  Notifier    │ │  Bot         │ │                │
   │                │ │              │ │              │ │  ┌──────────┐  │
   │  FastAPI +     │ │  Volumetric  │ │  On-demand   │ │  │Snapcast  │  │
   │  Leaflet maps  │ │  threshold   │ │  /sitrep +   │ │  │TTS       │  │
   │  + InfluxDB    │ │  alerts      │ │  AI chat     │ │  └──────────┘  │
   │                │ │              │ │              │ │  ┌──────────┐  │
   │  :8083         │ │  → Pushover  │ │  → Telegram  │ │  │MQTT      │──┼──▶ Smart Lights
   │                │ │    → Phone   │ │              │ │  │Lights    │  │
   └────────────────┘ └──────────────┘ └──────────────┘ │  └──────────┘  │
                                                        └────────────────┘
            ┌──────────────┐                                   │
            │ Management   │                                   ▼
            │ UI (:8888)   │                            ┌──────────────┐
            │              │                            │  Mosquitto   │
            │ + Portainer  │                            │  MQTT Broker │
            │   (:9000)    │                            └──────────────┘
            └──────────────┘
```

## Components

| Service | Repository | Port | Description |
|---------|-----------|------|-------------|
| **Oref Alert Proxy** | [Oref-Alert-Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) | 8764 | Lightweight local relay that polls Pikud HaOref every 3 seconds and serves raw alert data via HTTP. Single source of truth. |
| **Geodash** | [Red-Alert-Geodash](https://github.com/danielrosehill/Red-Alert-Geodash) | 8083 | Real-time multi-map dashboard with 1,450 polygon overlays, InfluxDB time-series storage, historical playback, and TV-optimized view. |
| **Pushover Notifier** | [Red-Alert-Pushover](https://github.com/danielrosehill/Red-Alert-Pushover) | — | Sends Pushover push notifications when nationwide alert count crosses thresholds (50, 100, 200, ... 1000 simultaneous areas). |
| **Telegram Bot** | [Red-Alert-Telegram-Bot](https://github.com/danielrosehill/Red-Alert-Telegram-Bot) | — | On-demand intelligence bot. `/sitrep` generates AI situation reports using dual-model synthesis via OpenRouter. |
| **Actuator** | [Red-Alert-Actuator](https://github.com/danielrosehill/Red-Alert-Actuator) | — | Physical alert outputs: TTS voice announcements via Snapcast whole-house audio, and smart light color control via MQTT. |
| **Management UI** | *(this repo)* | 8888 | Stack health dashboard showing status of all services, with links to Geodash and Portainer. |
| **Portainer** | [portainer-ce](https://hub.docker.com/r/portainer/portainer-ce) | 9000 | Docker container management UI. |
| **InfluxDB** | [influxdb](https://hub.docker.com/_/influxdb) | 8086 | Time-series database for alert history. |
| **Mosquitto** | [eclipse-mosquitto](https://hub.docker.com/_/eclipse-mosquitto) | 1883 | MQTT broker (bundled in `with-broker` compose, or bring your own). |

## Quick Start

### Prerequisites

- **Docker and Docker Compose** (v2+)
- **Israeli IP address** — the Oref Alert Proxy must run from within Israel (geo-restricted API)

### 1. Clone and configure

```bash
git clone https://github.com/danielrosehill/Red-Alert-Monitoring-Stack-Public.git
cd Red-Alert-Monitoring-Stack-Public
cp .env.example .env
```

Edit `.env` and fill in your values. See [Environment Variables](#environment-variables) below.

### 2. Choose your compose file

**Option A — You have an external MQTT broker** (e.g., Mosquitto already running on your LAN):

```bash
# Set MQTT_BROKER in .env to your broker IP (e.g., 10.0.0.4)
docker compose up -d
```

**Option B — You need a bundled MQTT broker:**

```bash
# Set MQTT_BROKER=mosquitto in .env
docker compose -f docker-compose.with-broker.yml up -d
```

### 3. Access the UIs

| UI | URL |
|----|-----|
| **Management Dashboard** | http://localhost:8888 |
| **Geodash Map** | http://localhost:8083 |
| **Portainer** | http://localhost:9000 |
| **InfluxDB** | http://localhost:8086 |

The management dashboard auto-refreshes every 30 seconds and shows the health status of all services.

## Environment Variables

All configuration is via `.env` (copy from `.env.example`). The file is gitignored.

### Required Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `MQTT_BROKER` | Actuator | IP of your MQTT broker (or `mosquitto` if using bundled broker) |
| `PUSHOVER_API_TOKEN` | Pushover | Your Pushover application token ([pushover.net](https://pushover.net/)) |
| `PUSHOVER_USER_KEY` | Pushover | Your Pushover user key |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot | Bot token from [@BotFather](https://t.me/BotFather) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OREF_PROXY_URL` | `http://oref-proxy:8764` | Override if proxy runs on a different host |
| `INFLUXDB_ORG` | `redalert` | InfluxDB organization name |
| `INFLUXDB_BUCKET` | `alerts` | InfluxDB bucket name |
| `INFLUXDB_TOKEN` | `redalert-dev-token` | InfluxDB admin token |
| `OPENROUTER_API_KEY` | *(empty)* | OpenRouter key for AI sitreps in Telegram bot |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MQTT_USER` | *(empty)* | MQTT username (if broker requires auth) |
| `MQTT_PASSWORD` | *(empty)* | MQTT password |
| `MQTT_LIGHT_TOPICS` | *(empty)* | Comma-separated MQTT topics for light control |
| `LOCAL_AREA` | *(empty)* | Your area name in Hebrew (triggers direct-threat response) |
| `SNAPCAST_FIFO` | `/tmp/snapfifo` | Path to Snapcast FIFO pipe on host |
| `STACK_NAME` | `Red Alert Monitoring Stack` | Display name in management UI |
| `GEODASH_EXTERNAL_URL` | `http://localhost:8083` | Geodash URL for management UI links |
| `PORTAINER_EXTERNAL_URL` | `http://localhost:9000` | Portainer URL for management UI links |

## Docker Images

All images are published to Docker Hub under [`danielrosehill`](https://hub.docker.com/u/danielrosehill):

| Image | Source |
|-------|--------|
| `danielrosehill/red-alert-proxy` | [Oref-Alert-Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) |
| `danielrosehill/red-alert-geodash` | [Red-Alert-Geodash](https://github.com/danielrosehill/Red-Alert-Geodash) |
| `danielrosehill/red-alert-pushover` | [Red-Alert-Pushover](https://github.com/danielrosehill/Red-Alert-Pushover) |
| `danielrosehill/red-alert-telegram` | [Red-Alert-Telegram-Bot](https://github.com/danielrosehill/Red-Alert-Telegram-Bot) |
| `danielrosehill/red-alert-actuator` | [Red-Alert-Actuator](https://github.com/danielrosehill/Red-Alert-Actuator) |
| `danielrosehill/red-alert-management` | *(this repo, `management-ui/`)* |

## Building & Pushing the Management UI Image

```bash
# Login to Docker Hub
docker login -u danielrosehill

# Build and push
docker build -t danielrosehill/red-alert-management:latest ./management-ui
docker push danielrosehill/red-alert-management:latest
```

## Design Principles

- **Microservices** — Each service does one thing. The proxy polls, the dashboard visualizes, the notifier pushes, the bot responds, the actuator controls physical devices.
- **Single data source** — One proxy, one connection to Pikud HaOref. No redundant polling.
- **Dumb relay** — The proxy passes through raw data with no interpretation. Each consumer applies its own logic.
- **No secrets in code** — Everything configured via `.env` files, which are gitignored.
- **Graceful degradation** — Each service runs independently. If one goes down, the rest keep working.
- **Two compose options** — Core compose for users with existing MQTT infrastructure; `with-broker` variant bundles Mosquitto for self-contained deployment.

## Alert Flow Example

When a rocket barrage triggers 150+ simultaneous alerts:

1. **Proxy** picks it up within 3 seconds, serves via `/api/alerts`
2. **Geodash** colors 150 polygons red on the map, writes to InfluxDB
3. **Pushover** sends "150 areas under active alert" to your phone
4. **Actuator** turns smart lights red, plays "Nationwide alert..." on Snapcast
5. **Telegram Bot** waits for you to ask — `/sitrep` generates a dual-model AI briefing
6. **Management UI** shows all services green (or flags any that went down)

When your local area (e.g., Jerusalem South) gets a direct alert:

1. **Actuator** turns lights red, plays "Red alert. Seek shelter immediately."
2. **Geodash** shows your area flashing red with siren audio
3. When all-clear arrives: lights go green, TTS says "All clear", lights turn off after 2 minutes

## Related

- [Awesome-Red-Alerts](https://github.com/danielrosehill/Awesome-Red-Alerts) — Curated list of Pikud HaOref API wrappers and alert projects

## License

MIT

## Author

Daniel Rosehill ([danielrosehill.com](https://danielrosehill.com))
