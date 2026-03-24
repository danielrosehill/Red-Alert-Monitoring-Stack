# Red Alert Monitoring Stack

## What This Is

A microservices stack for monitoring Israel's Homefront Command (Pikud HaOref) rocket alerts with real-time visualization, push notifications, AI situation reports, and home automation integration (smart lights + whole-house TTS audio).

**Important**: The Oref Alert Proxy must run from an Israeli IP address (geo-restricted API).

## Architecture

- **Oref Alert Proxy** (:8764) — Polls Pikud HaOref every 3s, single source of truth
- **Geodash** (:8083) — Real-time map dashboard with 1,450 polygon overlays + InfluxDB
- **Pushover** — Volumetric threshold notifications (50, 100, 200+ areas)
- **Telegram Bot** — On-demand `/sitrep` AI briefings via OpenRouter
- **Actuator** (`actuator/`) — TTS via Snapcast + smart light control via MQTT
- **RSS Cache** (:8785) — News feed poller for AI context
- **MCP Server** (:8786) — Streamable HTTP MCP exposing alert tools for AI agents
- **Management UI** (:8888) — Stack health dashboard
- **InfluxDB** (:8086) — Time-series storage
- **Mosquitto** (:1883) — MQTT broker (optional bundled, or bring your own)

## Docker Compose Variants

All compose files live in `compose/`. Run from the repo root with `-f`:

| File | Use Case |
|------|----------|
| `compose/default.yml` | External MQTT broker on your LAN |
| `compose/with-broker.yml` | Self-contained with bundled Mosquitto |
| `compose/ha.yml` | Home Assistant users — no actuator, HA handles automations directly |

## Customization via Override

The recommended way to customize the stack is with an override file:

```bash
cp compose/override.example.yml compose/override.yml
docker compose -f compose/default.yml -f compose/override.yml up -d
```

Use it for:
- Adding services (Cloudflare Tunnel, Grafana, etc.)
- Overriding environment variables per-service
- Pinning image versions
- Setting resource limits
- Adding extra volumes or ports

The override file is gitignored so your customizations survive `git pull`.

## Setup Slash Commands

Use these slash commands to walk through interactive setup:

| Command | Purpose |
|---------|---------|
| `/setup` | Full guided setup — MQTT, lights, Snapcast, Cloudflare Tunnel |
| `/setup-mqtt` | Create a dedicated MQTT user in your Mosquitto broker for the stack |
| `/setup-lights` | Choose which smart lights to include in alert automations |
| `/setup-snapcast` | Configure Snapcast whole-house audio integration |
| `/setup-tunnel` | Set up Cloudflare Tunnel for secure remote access |

## Key Files

- `.env.example` — All configuration variables with documentation
- `.env` — Your actual config (gitignored)
- `compose/` — All Docker Compose files (default, with-broker, ha, override)
- `mosquitto/mosquitto.conf` — MQTT broker config (used by bundled broker variant)
- `actuator/actuator.py` — Automation logic (lights + TTS), editable directly

## Environment Variables

All config is in `.env`. The `ALERT_AREA` variable is passed to every service:

- `ALERT_AREA` — Your area in Hebrew (e.g., `ירושלים - דרום`). Used by actuator for shelter mode, and available to all services for local context.
- `MQTT_BROKER` — Broker IP or `mosquitto` (bundled)
- `PUSHOVER_API_TOKEN` / `PUSHOVER_USER_KEY` — For push notifications
- `TELEGRAM_BOT_TOKEN` — For Telegram bot

Key optional variables:
- `MQTT_LIGHT_TOPICS` — Comma-separated MQTT topics for light control
- `SNAPCAST_FIFO` — Path to Snapcast FIFO pipe (default: `/tmp/snapfifo`)
- `OPENROUTER_API_KEY` — For AI situation reports
- `OPENAI_API_KEY` — For TTS audio generation

## Working on This Repo

- All services with source code: `actuator/`, `rss-cache/`, `mcp-server/`, `management-ui/`
- External services are pulled as Docker images from `danielrosehill/red-alert-*`
- Network: all services share a `redalert` bridge network
- Never commit `.env` or `compose/override.yml` — they contain local config

## Alternative Components

| Component | Replaces | Repository |
|-----------|----------|------------|
| **Oref Map** | Geodash | https://github.com/maorcc/oref-map |

To swap Geodash for Oref Map, replace the `geodash` service in your compose override with the oref-map image and configure accordingly.

## MCP Server

Connect to the stack's MCP server for AI agent access to alert data:

```bash
claude mcp add --transport http red-alert http://localhost:8786/mcp
```

Tools: `get_current_alerts`, `get_area_alerts`, `get_alert_history`, `get_news`, `get_sample_payloads`, `get_proxy_status`
