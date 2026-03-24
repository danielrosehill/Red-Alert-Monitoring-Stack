Walk the user through full Red Alert Monitoring Stack setup. Run each section interactively:

## 1. Prerequisites Check
- Confirm Docker and Docker Compose v2+ are installed
- Confirm the host has an Israeli IP address (required for Oref API)
- Check if `.env` exists; if not, copy from `.env.example`

## 2. MQTT Broker Setup
Ask the user: "Do you have an existing Mosquitto MQTT broker on your network, or should we use the bundled one?"

**If existing broker:**
- Ask for the broker IP address
- Ask if the broker requires authentication
- Recommend creating a dedicated user for the Red Alert stack (run `/setup-mqtt` for guided steps)
- Set `MQTT_BROKER` in `.env` to the broker IP

**If bundled broker:**
- Set `MQTT_BROKER=mosquitto` in `.env`
- Note they'll use `docker-compose.with-broker.yml`

## 3. Smart Light Configuration
Run the `/setup-lights` flow:
- Ask which lights the user wants to control during alerts
- Help them identify the correct MQTT topics (Zigbee2MQTT, Tasmota, etc.)
- Set `MQTT_LIGHT_TOPICS` in `.env`

## 4. Local Area Configuration
- Ask the user which area they live in (must match Pikud HaOref area names in Hebrew)
- Set `LOCAL_AREA` in `.env`
- Explain this triggers the direct-threat shelter response

## 5. Snapcast TTS (Optional)
Ask: "Do you want whole-house TTS announcements via Snapcast?"
- If yes, run `/setup-snapcast`
- If no, set `TTS_ENABLED=false` in `.env`

## 6. Notification Services
- Ask for Pushover credentials (or skip if not wanted)
- Ask for Telegram bot token (or skip if not wanted)
- Ask for OpenRouter API key for AI sitreps (optional)

## 7. Cloudflare Tunnel (Optional)
Ask: "Do you want to set up a Cloudflare Tunnel for secure remote access?"
- If yes, run `/setup-tunnel`

## 8. Home Assistant Users
Ask: "Are you using Home Assistant for your automations?"
- If yes, recommend `docker-compose.ha.yml` (no actuator) and explain how to set up HA REST sensors pointing at the proxy
- If no, proceed with standard compose

## 9. TTS Audio Generation
If TTS is enabled:
- Ask if user has an OpenAI API key for generating TTS audio
- If yes, run `OPENAI_API_KEY=... python actuator/generate_audio.py`
- Explain this is a one-time step

## 10. Launch
- Determine the correct compose file based on choices
- Run `docker compose -f <chosen-file> up -d`
- Verify all services are healthy via the management UI at :8888
