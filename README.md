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
                                                               │
                                                               ▼
                                                        ┌──────────────┐
                                                        │  Mosquitto   │
                                                        │  MQTT Broker │
                                                        └──────────────┘
```

## Components

| Service | Repository | Description |
|---------|-----------|-------------|
| **Oref Alert Proxy** | [Oref-Alert-Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) | Lightweight local relay that polls Pikud HaOref every 3 seconds and serves raw alert data via HTTP. Single source of truth — all other services consume from here. |
| **Geodash** | [Red-Alert-Geodash](https://github.com/danielrosehill/Red-Alert-Geodash) | Real-time multi-map dashboard with 1,450 polygon overlays, InfluxDB time-series storage, historical playback, news feed, and TV-optimized view. |
| **Pushover Notifier** | [Red-Alert-Pushover](https://github.com/danielrosehill/Red-Alert-Pushover) | Sends Pushover push notifications when nationwide alert count crosses thresholds (50, 100, 200, ... 1000 simultaneous areas). Designed for situational awareness of large-scale attacks. |
| **Telegram Bot** | [Red-Alert-Telegram-Bot](https://github.com/danielrosehill/Red-Alert-Telegram-Bot) | On-demand intelligence bot. `/sitrep` generates AI situation reports using dual-model synthesis via OpenRouter. `/status` and natural language chat for live alert queries. |
| **Actuator** | [Red-Alert-Actuator](https://github.com/danielrosehill/Red-Alert-Actuator) | Physical alert outputs: pre-recorded TTS voice announcements via Snapcast whole-house audio, and smart light color control (red/orange/green) via MQTT. |

## Prerequisites

- **Docker and Docker Compose** on each host running services
- **Israeli IP address** — the Oref Alert Proxy must run from within Israel (geo-restricted API)
- **Mosquitto MQTT broker** — required by the Actuator for smart light control. The stack assumes Mosquitto is already running and accessible on your network (default: `10.0.0.4:1883`). Install with `sudo apt install mosquitto` or run as a Docker container.
- **Snapcast** — required by the Actuator for TTS announcements. Assumes `snapserver` is running with a pipe source at `/tmp/snapfifo` (default Snapcast config).

## Deployment

Start the services in order — the proxy first, then consumers:

### 1. Oref Alert Proxy (start first)

```bash
git clone https://github.com/danielrosehill/Oref-Alert-Proxy.git
cd Oref-Alert-Proxy
docker compose up -d
```

Verify: `curl http://localhost:8764/api/status`

### 2. Geodash (dashboard)

```bash
git clone https://github.com/danielrosehill/Red-Alert-Geodash.git
cd Red-Alert-Geodash
cp .env.example .env
# Edit .env: set OREF_PROXY_URL=http://host.docker.internal:8764
docker compose up --build -d
```

Dashboard: `http://localhost:8083`

### 3. Pushover Notifier

```bash
git clone https://github.com/danielrosehill/Red-Alert-Pushover.git
cd Red-Alert-Pushover
cp .env.example .env
# Edit .env: set PUSHOVER_API_TOKEN and PUSHOVER_USER_KEY
docker compose up -d
```

### 4. Telegram Bot

```bash
git clone https://github.com/danielrosehill/Red-Alert-Telegram-Bot.git
cd Red-Alert-Telegram-Bot
cp .env.example .env
# Edit .env: set TELEGRAM_BOT_TOKEN and optionally OPENROUTER_API_KEY
docker compose up -d
```

### 5. Actuator (Snapcast TTS + MQTT Lights)

```bash
git clone https://github.com/danielrosehill/Red-Alert-Actuator.git
cd Red-Alert-Actuator

# Generate TTS audio files (one-time)
pip install httpx
OPENAI_API_KEY=sk-... python generate_audio.py

cp .env.example .env
# Edit .env: set MQTT_BROKER, MQTT_LIGHT_TOPICS, LOCAL_AREA
docker compose up -d
```

## Ports

| Service | Port | Access |
|---------|------|--------|
| Oref Alert Proxy | 8764 | Internal (LAN only) |
| Geodash Dashboard | 8083 | Web UI |
| InfluxDB | 8086 | Localhost only |
| Mosquitto MQTT | 1883 | LAN |
| Snapcast | 1704/1780 | LAN |
| Telegram Bot | — | Outbound only |
| Pushover Notifier | — | Outbound only |
| Actuator | — | Outbound only (MQTT + Snapcast FIFO) |

## Design Principles

- **Microservices** — Each service does one thing. The proxy polls, the dashboard visualizes, the notifier pushes, the bot responds, the actuator controls physical devices.
- **Single data source** — One proxy, one connection to Pikud HaOref. No redundant polling.
- **Dumb relay** — The proxy passes through raw data with no interpretation. Each consumer applies its own logic (category mapping, thresholds, persistence).
- **No secrets in code** — Everything configured via `.env` files, which are gitignored.
- **Graceful degradation** — Each service runs independently. If the Telegram bot is down, the dashboard and Pushover still work. If MQTT is unavailable, the actuator logs errors but doesn't crash.

## Alert Flow Example

When a rocket barrage triggers 150+ simultaneous alerts:

1. **Proxy** picks it up within 3 seconds, serves via `/api/alerts`
2. **Geodash** colors 150 polygons red on the map, writes to InfluxDB
3. **Pushover** sends "150 areas under active alert" to your phone
4. **Actuator** turns smart lights red, plays "Nationwide alert..." on Snapcast
5. **Telegram Bot** waits for you to ask — `/sitrep` generates a dual-model AI briefing

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
