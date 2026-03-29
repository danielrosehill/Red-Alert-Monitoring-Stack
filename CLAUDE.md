# Red Alert Monitoring Stack

## What This Is

A monorepo microservices stack for monitoring Israel's Homefront Command (Pikud HaOref) rocket alerts with real-time visualization, push notifications, AI situation reports, and home automation integration (smart lights + whole-house TTS audio).

**Important**: The Oref Alert Proxy must run from an Israeli IP address (geo-restricted API).

## Architecture

All services build from source in this monorepo. No external Docker Hub images required.

- **Oref Alert Proxy** (`oref-proxy/`) — Polls Pikud HaOref every 3s, single source of truth
- **Geodash** (`geodash/`) — Real-time map dashboard with 1,450 polygon overlays + InfluxDB
- **Pushover** (`pushover/`) — Volumetric threshold notifications (50, 100, 200+ areas)
- **Telegram Bot** (`telegram-bot/`) — On-demand `/sitrep` AI briefings via OpenRouter
- **Actuator** (`actuator/`) — HA bridge: sets `input_select.red_alert_state` in Home Assistant via REST API; HA automations handle lights, sirens, TTS
- **Prompt Runner** (`prompt-runner/`) — Templated AI prompt execution (immediate intel + daily SITREP)
- **RSS Cache** (`rss-cache/`) — News feed poller for AI context
- **Snapcast TTS** (`snapcast-tts/`) — TTS announcements via Snapcast speaker groups on alert events
- **MCP Server** (`mcp-server/`) — Streamable HTTP MCP exposing alert tools for AI agents
- **Management UI** (`management-ui/`) — Next.js dashboard: service health, SITREP management, geopolitical simulation (6-lens forecasting pipeline with PDF generation), settings management, Google Drive upload
- **InfluxDB** — Time-series storage (external image)
- **Mosquitto** — MQTT broker (optional bundled, or bring your own)

### Data Flow

```
Pikud HaOref API (Israeli IP only)
       |
Oref Alert Proxy (:8764)
       |----> Geodash (:8083) ---> InfluxDB (:8086)
       |----> Pushover (push notifications)
       |----> Telegram Bot (:8781)
       |----> Actuator (:8782) ---> Home Assistant (input_select)
       |         |----> Prompt Runner (:8787) ---> Telegram Bot
       |----> Snapcast TTS (:8783) ---> Snapcast Server (TCP audio)
       |----> MCP Server (:8786)
       |----> Management UI (:8888)

RSS Cache (:8785) ----> Geodash, MCP Server, Prompt Runner

Management UI (:8888) ---> Prompt Runner (SITREP triggers)
       |----> Actuator (test alerts)
       |----> All services (health checks)
       |----> OpenRouter + Gemini (simulation pipeline)
       |----> Google Drive (PDF upload)
       |----> Resend (email delivery)
```

## Service Ports (all env-configurable)

| Service | Default Port | Env Variable |
|---------|-------------|--------------|
| Oref Alert Proxy | 8764 | `OREF_PROXY_PORT` |
| Geodash | 8083 | `GEODASH_PORT` |
| InfluxDB | 8086 | `INFLUXDB_PORT` |
| Telegram Bot | 8781 | `TELEGRAM_BOT_PORT` |
| Actuator | 8782 | `ACTUATOR_PORT` |
| RSS Cache | 8785 | `RSS_CACHE_PORT` |
| MCP Server | 8786 | `MCP_SERVER_PORT` |
| Prompt Runner | 8787 | `PROMPT_RUNNER_PORT` |
| Management UI | 8888 | `MANAGEMENT_UI_PORT` |
| Snapcast TTS | 8783 | `SNAPCAST_TTS_PORT` |
| Mosquitto MQTT | 1883 | `MQTT_EXTERNAL_PORT` |

## Docker Compose Variants

All compose files live in `compose/`. Run from the repo root with `-f`:

| File | Use Case |
|------|----------|
| `compose/default.yml` | External MQTT broker on your LAN |
| `compose/with-broker.yml` | Self-contained with bundled Mosquitto |
| `compose/ha.yml` | Home Assistant users — no actuator, HA handles automations directly |

```bash
cp .env.example .env   # fill in your values
docker compose -f compose/default.yml up -d --build
```

## Customization via Override

The recommended way to customize the stack is with an override file:

```bash
cp compose/override.example.yml compose/override.yml
docker compose -f compose/default.yml -f compose/override.yml up -d
```

Use it for:
- Adding services (Cloudflare Tunnel, Grafana, etc.)
- Overriding environment variables per-service
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

## Alert Architecture

The actuator distinguishes between two types of alerting conditions:

### Localized Alerts
Specific to the user's configured `ALERT_AREA` (e.g., `ירושלים - דרום`). These are direct threats:
- **warning** (category 14): Early warning — seek shelter soon
- **active** (categories 1–12): Immediate threat — take cover now
- **clear** (category 13): Threat has passed

Localized alerts trigger the **full response**: lights, sirens/alarms, TTS, user scripts, and prompt runner for AI intelligence.

### General Alerts
Nationwide volume-based thresholds (50, 100, 200, ... 1000 simultaneous alert areas). These are situational awareness — not a direct threat to the user's location.

General alerts trigger **TTS announcements and scripts only**. Lights are set to red as an informational indicator only when no localized alert is already active.

The code for these lives in `AlertMonitor._process_localized_alerts()` and `AlertMonitor._process_general_alerts()` respectively.

## Key Files

- `.env.example` — All configuration variables with documentation
- `.env` — Your actual config (gitignored)
- `compose/` — All Docker Compose files (default, with-broker, ha, override)
- `mosquitto/mosquitto.conf` — MQTT broker config (used by bundled broker variant)
- `actuator/actuator.py` — HA bridge (sets input_select state + test alerts)
- `ha/` — HA input_select definition + example automations
- `archive/` — Retired code (old MQTT-direct actuator)
- `prompt-runner/templates/` — AI prompt templates (immediate_intel, daily_sitrep)
- `management-ui/src/lib/simulation/` — Geopolitical forecasting pipeline (gather, sitrep, forecast, summarize, PDF)
- `management-ui/src/lib/db.ts` — SQLite for settings + simulation sessions
- `management-ui/src/lib/drive.ts` — Google Drive upload via service account
- `management-ui/src/lib/email.ts` — Resend email delivery (shared by SITREP + simulation)

## Environment Variables

All config is in `.env`. The `ALERT_AREA` variable is passed to every service:

- `ALERT_AREA` — Your area in Hebrew (e.g., `ירושלים - דרום`). Used by actuator for shelter mode, prompt runner for immediate intel, and all services for local context.
- `HASS_HOST` — Home Assistant URL (e.g. `http://10.0.0.3:8123`)
- `HASS_TOKEN` — HA long-lived access token
- `PUSHOVER_API_TOKEN` / `PUSHOVER_USER_KEY` — For push notifications
- `TELEGRAM_BOT_TOKEN` — For Telegram bot

Key optional variables:
- `HASS_ENTITY` — HA input_select entity (default: `input_select.red_alert_state`)
- `OPENROUTER_API_KEY` — For AI situation reports and prompt runner
- `GROQ_API_KEY` — For fast immediate intelligence (prompt runner)

## Prompt Runner

The prompt runner executes templated AI prompts and delivers output to Telegram and/or email (via Resend).

**Templates** (in `prompt-runner/templates/`):
- `immediate_intel` — Auto-triggered by actuator on local red alert. Uses Groq for speed. Provides rapid intel on attacking party, munitions, and other areas under fire.
- `daily_sitrep` — Comprehensive daily SITREP modeled on ISW/Critical Threats style. Can be triggered manually, on a schedule, or on-demand via API.

**Scheduled SITREPs**:
Set `SITREP_SCHEDULE` to enable automatic SITREP generation:
- Fixed hours: `SITREP_SCHEDULE=0,6,18` (midnight, 06:00, 18:00 UTC)
- Interval: `SITREP_SCHEDULE=every:6` (every 6 hours)
- Delivery: `SITREP_DELIVER_TO=telegram,email` (or just one)
- Email requires: `RESEND_API_KEY`, `SITREP_EMAIL_FROM`, `SITREP_EMAIL_TO`

**API**:
- `GET /api/templates` — List available templates
- `POST /api/run` — Execute a template: `{"template": "daily_sitrep", "deliver_to": ["telegram", "email"]}`

## Working on This Repo

- All services have source code in this monorepo — no external Docker Hub image dependencies
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

## Local Deployment

See `CLAUDE_PRIVATE.md` for local deployment protocol and target host details.
