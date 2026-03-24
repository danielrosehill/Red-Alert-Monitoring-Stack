# Red Alert Monitoring Stack

![Red Alert Monitoring Stack](screenshots/banner.jpg)

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
   │  (Dashboard)   │ │  Notifier    │ │  Bot         │ │  (HA Bridge)   │
   │                │ │              │ │              │ │                │
   │  FastAPI +     │ │  Volumetric  │ │  On-demand   │ │  Sets state    │
   │  Leaflet maps  │ │  threshold   │ │  /sitrep +   │ │  via HA REST   │──▶ Home Assistant
   │  + InfluxDB    │ │  alerts      │ │  AI chat     │ │  API           │   (lights, sirens,
   │                │ │              │ │              │ │                │    TTS, automations)
   │  :8083         │ │  → Pushover  │ │  → Telegram  │ │  :8782         │
   │                │ │    → Phone   │ │              │ │                │
   └────────────────┘ └──────────────┘ └──────────────┘ └────────────────┘

            ┌──────────────┐   ┌──────────────┐
            │ Management   │   │  RSS Cache   │
            │ UI (:8888)   │   │  (:8785)     │
            └──────────────┘   └──────────────┘
            ┌──────────────┐
            │  MCP Server  │
            │  (:8786)     │
            │  AI tools    │
            └──────────────┘
```

## Components

| Service | Repository | Port | Description |
|---------|-----------|------|-------------|
| **Oref Alert Proxy** | [Oref-Alert-Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) | 8764 | Lightweight local relay that polls Pikud HaOref every 3 seconds and serves raw alert data via HTTP. Single source of truth. |
| **Geodash** | [Red-Alert-Geodash](https://github.com/danielrosehill/Red-Alert-Geodash) | 8083 | Real-time multi-map dashboard with 1,450 polygon overlays, InfluxDB time-series storage, historical playback, and TV-optimized view. |
| **Pushover Notifier** | [Red-Alert-Pushover](https://github.com/danielrosehill/Red-Alert-Pushover) | — | Sends Pushover push notifications when nationwide alert count crosses thresholds (50, 100, 200, ... 1000 simultaneous areas). |
| **Telegram Bot** | [Red-Alert-Telegram-Bot](https://github.com/danielrosehill/Red-Alert-Telegram-Bot) | — | On-demand intelligence bot. `/sitrep` generates AI situation reports using dual-model synthesis via OpenRouter. |
| **Actuator** | *(this repo, `actuator/`)* | 8782 | HA bridge: polls proxy and sets `input_select` state in Home Assistant. HA automations handle lights, sirens, TTS. See `ha/` for examples. |
| **RSS Cache** | *(this repo, `rss-cache/`)* | 8785 | Polls news feeds on a schedule, serves cached articles. Used by Geodash dashboard and available to Telegram bot for AI sitreps. |
| **MCP Server** | *(this repo, `mcp-server/`)* | 8786 | Streamable HTTP MCP server exposing alert tools (`get_current_alerts`, `get_area_alerts`, `get_news`, etc.) for AI agents. Stores sample payloads every 3h. |
| **Management UI** | *(this repo, `management-ui/`)* | 8888 | Stack health dashboard showing status of all services with links to Geodash. |
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
| **InfluxDB** | http://localhost:8086 |
| **MCP Server** | http://localhost:8786/mcp |
| **RSS Cache** | http://localhost:8785/api/news |

The management dashboard auto-refreshes every 30 seconds and shows the health status of all services.

## Environment Variables

All configuration is via `.env` (copy from `.env.example`). The file is gitignored.

### Required Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `HASS_HOST` | Actuator | Home Assistant URL (e.g. `http://10.0.0.3:8123`) |
| `HASS_TOKEN` | Actuator | HA long-lived access token |
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
| `HASS_ENTITY` | `input_select.red_alert_state` | HA input_select entity ID |
| `STACK_NAME` | `Red Alert Monitoring Stack` | Display name in management UI |
| `GEODASH_EXTERNAL_URL` | `http://localhost:8083` | Geodash URL for management UI links |


## Building from Source

All services build from source in this monorepo — no external Docker Hub images are required (previous `danielrosehill/red-alert-*` images have been removed). The only upstream images used are `influxdb:2` and `eclipse-mosquitto:2`.

| Service | Source Directory |
|---------|-----------------|
| Oref Alert Proxy | `oref-proxy/` |
| Geodash | `geodash/` |
| Pushover | `pushover/` |
| Telegram Bot | `telegram-bot/` |
| Actuator | `actuator/` |
| Prompt Runner | `prompt-runner/` |
| RSS Cache | `rss-cache/` |
| MCP Server | `mcp-server/` |
| Management UI | `management-ui/` |

## MCP Server (AI Agent Integration)

The stack includes an MCP server that exposes alert data as tools for AI agents (Claude Code, Claude Desktop, etc.).

### Available Tools

| Tool | Description |
|------|-------------|
| `get_current_alerts` | All currently active alerts nationwide |
| `get_area_alerts` | Alerts within a radius of a lat/lon point |
| `get_alert_history` | Recent alert history including resolved alerts |
| `get_news` | Cached news articles from RSS feeds |
| `get_sample_payloads` | Stored sample alert payloads for development |
| `get_proxy_status` | Health check of the Oref Alert Proxy |

### Connect from Claude Code

```bash
claude mcp add --transport http red-alert http://localhost:8786/mcp
```

### Connect from Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "red-alert": {
      "url": "http://localhost:8786/mcp"
    }
  }
}
```

### Sample Payload Storage

The MCP server automatically captures one real alert payload every 3 hours (when alerts are active) and stores it in a persistent volume. This builds a reference library of real payload structures for development. Access via the `get_sample_payloads` tool.

## Building Images

All services are built automatically by Docker Compose. To rebuild everything:

```bash
docker compose -f compose/default.yml build
```

To rebuild a single service:

```bash
docker compose -f compose/default.yml build geodash
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
4. **Actuator** sets HA state to `threshold_150`, HA automations announce via TTS
5. **Telegram Bot** waits for you to ask — `/sitrep` generates a dual-model AI briefing
6. **Management UI** shows all services green (or flags any that went down)

When your local area (e.g., Jerusalem South) gets a direct alert:

1. **Actuator** sets HA state to `active`, HA automations flash lights red, sound sirens, TTS "Seek shelter"
2. **Geodash** shows your area flashing red with siren audio
3. When all-clear arrives: actuator sets `clear`, HA automations turn lights green, silence sirens, TTS "All clear"
4. After 2 minutes: actuator sets `idle`, HA automations restore normal lighting

## Related

- [Awesome-Red-Alerts](https://github.com/danielrosehill/Awesome-Red-Alerts) — Curated list of Pikud HaOref API wrappers and alert projects

## License

MIT

## Author

Daniel Rosehill ([danielrosehill.com](https://danielrosehill.com))
