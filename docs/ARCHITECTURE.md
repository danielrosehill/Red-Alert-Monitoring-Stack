# Architecture & Actuation Pathways

## What This Stack Is

The Red Alert Monitoring Stack is a collection of microservices for monitoring Israel's Homefront Command (Pikud HaOref) rocket alerts. It has been built up gradually over a couple of years, with each component solving a specific need — visualization, notifications, AI intelligence reports, home automation, and audio alerting.

The unified backend API ties these components together into a cohesive system, but each service remains independently deployable. You can run the full stack or pick the pieces that fit your setup.

## The Core Problem

Pikud HaOref publishes a geo-restricted alert API. This stack's **Oref Alert Proxy** polls that API every 3 seconds and serves the raw data over HTTP on your local network. Every other service in the stack consumes from this single proxy — no redundant polling, no API key sharing, no geo-restriction headaches beyond the proxy host itself.

## Relationship to oref_alert (Home Assistant Integration)

For Home Assistant users, [oref_alert](https://github.com/amitfin/oref_alert) by Amit Finkelstein is an excellent native HA integration that provides Pikud HaOref alerts directly within Home Assistant. If you're already running oref_alert, you have two options:

1. **Use oref_alert for alerting, this stack for everything else.** Let oref_alert handle your HA automations (lights, sirens, TTS via HA) and use this stack as an orchestration layer for the components oref_alert doesn't cover: the real-time map dashboard, AI situation reports, Telegram bot, Pushover notifications, and the MCP server for AI agents.

2. **Use this stack's actuator as your HA bridge.** The actuator sets an `input_select` entity in HA via the REST API, and your HA automations trigger off that state. This is the built-in path if you don't want to run oref_alert.

Both approaches work. The stack is designed to complement existing setups, not replace them.

## Actuation Pathways

The stack provides multiple independent pathways for physical alerting. These are not mutually exclusive — mix and match based on your hardware and preferences.

```
                    Oref Alert Proxy
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
          ▼              ▼                  ▼
     Actuator      Snapcast TTS        Direct MQTT
    (HA Bridge)    (Multi-room)       (Mosquitto)
          │              │                  │
          ▼              ▼                  ▼
   Home Assistant   Snapcast Server    Any MQTT client
   automations      speaker groups     (lights, sirens,
   (lights, TTS,    (whole-house       custom scripts)
    sirens, etc.)    announcements)
```

### Path 1: Home Assistant (via Actuator)

The **actuator** polls the proxy and sets an `input_select` entity in Home Assistant to reflect the current alert state (`idle`, `warning`, `active`, `clear`, `threshold_50` through `threshold_1000`). HA automations then handle all physical responses.

**When to use this:** You already run Home Assistant and want to leverage its automation engine, device integrations, and UI.

**Two sub-options:**

- **Via the actuator (this stack):** The actuator calls HA's REST API to set state. Your HA automations trigger on `input_select` changes. See `config/ha/` for setup and example automations.

- **Via oref_alert:** Install [oref_alert](https://github.com/amitfin/oref_alert) as a native HA integration. It creates its own sensor entities that you can automate against directly. Skip the actuator service entirely and use this stack only for visualization, intelligence, and notifications.

### Path 2: Snapcast TTS (Direct Audio)

The **snapcast-tts** service connects directly to a Snapcast server's TCP source and streams TTS audio. This bypasses Home Assistant entirely — it talks to Snapcast's JSON-RPC API for group/client management and pushes raw PCM audio to a TCP source.

**When to use this:** You want whole-house multi-room audio alerts and either don't run HA or prefer a direct audio path with zero-latency pre-recorded clips.

Features:
- Pre-recorded WAV files for instant playback (no TTS generation delay for critical alerts)
- Microsoft Edge TTS for dynamic announcements (area names, threshold counts)
- Per-group volume control via Snapcast's native API
- Independent of HA — runs standalone

### Path 3: Direct MQTT (Mosquitto)

The stack includes an optional bundled Mosquitto broker (or you can point to an existing one on your LAN). Services can publish alert state changes to MQTT topics, which any MQTT client can subscribe to.

**When to use this:** You have MQTT-native devices (smart lights, custom ESP32 controllers, Node-RED flows) and want the lowest-latency, most direct path from alert detection to device actuation.

Examples:
- Zigbee2MQTT lights that respond to MQTT messages directly
- Custom Arduino/ESP32 siren controllers
- Node-RED flows for complex conditional logic

### Path 4: Extend It Yourself

The proxy exposes a simple HTTP API (`GET /api/alerts`). You can poll it from any custom service. The architecture is intentionally simple — a dumb relay serving JSON — so adding new consumers is trivial.

Ideas:
- Direct MPD calls for music player-based alerting
- Desktop notification daemons (see [Red-Alert-MQTT-Desktop-Notifier](https://github.com/danielrosehill/Red-Alert-MQTT-Desktop-Notifier-Public))
- Custom webhook integrations
- Matrix/Discord bots

## Intelligence & Notifications Layer

Independent of which actuation path you choose, the stack provides:

| Service | Purpose |
|---------|---------|
| **Geodash** | Real-time map with 1,450 polygon overlays + historical playback |
| **Prompt Runner** | AI-generated intelligence reports (immediate intel on attack, daily SITREPs) |
| **Telegram Bot** | On-demand `/sitrep` briefings with web search and RSS context |
| **Pushover** | Volume-based threshold push notifications |
| **RSS Cache** | News feed aggregation for AI context |
| **MCP Server** | Exposes alert tools for AI agents (Claude Code, Claude Desktop, etc.) |
| **Management UI** | Dashboard for service health, SITREP management, geopolitical simulation |

These services consume from the same proxy and operate independently. If the actuator goes down, you still get map visualizations, notifications, and intelligence reports.

## Design Philosophy

- **Single source of truth.** One proxy, one connection to Pikud HaOref. Every consumer reads from it.
- **Dumb relay.** The proxy passes through raw data. Each service applies its own logic.
- **Graceful degradation.** Every service runs independently. If one goes down, the rest keep working.
- **Adapt, don't prescribe.** Multiple actuation pathways because everyone's home setup is different. Use HA, use Snapcast, use MQTT directly, or write your own consumer.
- **No external image dependencies.** All services build from source in this monorepo. The only upstream images are InfluxDB and Mosquitto.
