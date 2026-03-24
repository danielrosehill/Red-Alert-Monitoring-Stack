#!/usr/bin/env bash
# =============================================================================
# Red Alert Monitoring Stack — Bootstrap Script
# =============================================================================
# One-liner install:
#   curl -fsSL https://raw.githubusercontent.com/danielrosehill/Red-Alert-Monitoring-Stack-Public/main/bootstrap.sh | bash
#
# Or clone first and run:
#   ./bootstrap.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPO_URL="https://github.com/danielrosehill/Red-Alert-Monitoring-Stack-Public.git"
INSTALL_DIR="red-alert-stack"

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Preflight checks ─────────────────────────────────────────────────────────

echo ""
echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
echo -e "${RED}║   Red Alert Monitoring Stack Bootstrap   ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
    err "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
    exit 1
fi
ok "Docker found: $(docker --version | head -1)"

# Check Docker Compose v2
if ! docker compose version &>/dev/null; then
    err "Docker Compose v2 is required. Install it from https://docs.docker.com/compose/install/"
    exit 1
fi
ok "Docker Compose found: $(docker compose version | head -1)"

# ── Clone or detect existing repo ────────────────────────────────────────────

if [ -f "docker-compose.yml" ] && [ -f ".env.example" ]; then
    info "Already inside the Red Alert stack directory."
    INSTALL_DIR="."
elif [ -d "$INSTALL_DIR" ]; then
    info "Directory '$INSTALL_DIR' exists. Pulling latest..."
    cd "$INSTALL_DIR"
    git pull --ff-only || warn "Git pull failed — continuing with existing files."
    INSTALL_DIR="."
else
    if ! command -v git &>/dev/null; then
        err "Git is not installed."
        exit 1
    fi
    info "Cloning repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    INSTALL_DIR="."
fi

# ── Create .env if it doesn't exist ──────────────────────────────────────────

if [ ! -f ".env" ]; then
    cp .env.example .env
    ok "Created .env from .env.example"
else
    ok ".env already exists"
fi

# ── Create override if it doesn't exist ──────────────────────────────────────

if [ ! -f "docker-compose.override.yml" ] && [ -f "docker-compose.override.example.yml" ]; then
    cp docker-compose.override.example.yml docker-compose.override.yml
    ok "Created docker-compose.override.yml from example"
fi

# ── Interactive configuration ─────────────────────────────────────────────────

echo ""
echo -e "${BLUE}── Configuration ──────────────────────────────────${NC}"
echo ""

# Alert area
read -rp "Your alert area in Hebrew (e.g., ירושלים - דרום): " alert_area
if [ -n "$alert_area" ]; then
    sed -i "s|^ALERT_AREA=.*|ALERT_AREA=${alert_area}|" .env
    ok "Set ALERT_AREA"
fi

# MQTT broker
echo ""
echo "MQTT Broker options:"
echo "  1) I have an existing Mosquitto broker on my network"
echo "  2) Use the bundled Mosquitto broker"
echo "  3) Skip (Home Assistant handles automations)"
read -rp "Choose [1/2/3]: " mqtt_choice

COMPOSE_FILE="docker-compose.yml"

case "$mqtt_choice" in
    1)
        read -rp "Broker IP address: " broker_ip
        sed -i "s|^MQTT_BROKER=.*|MQTT_BROKER=${broker_ip}|" .env
        ok "Set MQTT_BROKER=${broker_ip}"
        read -rp "Broker requires authentication? [y/N]: " mqtt_auth
        if [[ "$mqtt_auth" =~ ^[Yy] ]]; then
            read -rp "MQTT username: " mqtt_user
            read -rsp "MQTT password: " mqtt_pass
            echo ""
            sed -i "s|^# MQTT_USERNAME=.*|MQTT_USERNAME=${mqtt_user}|" .env
            sed -i "s|^# MQTT_PASSWORD=.*|MQTT_PASSWORD=${mqtt_pass}|" .env
            ok "Set MQTT credentials"
        fi
        ;;
    2)
        sed -i "s|^MQTT_BROKER=.*|MQTT_BROKER=mosquitto|" .env
        COMPOSE_FILE="docker-compose.with-broker.yml"
        ok "Using bundled Mosquitto broker"
        ;;
    3)
        COMPOSE_FILE="docker-compose.ha.yml"
        ok "Using Home Assistant compose (no actuator)"
        ;;
    *)
        warn "Invalid choice — defaulting to bundled broker"
        sed -i "s|^MQTT_BROKER=.*|MQTT_BROKER=mosquitto|" .env
        COMPOSE_FILE="docker-compose.with-broker.yml"
        ;;
esac

# Light topics
if [ "$mqtt_choice" != "3" ]; then
    echo ""
    read -rp "MQTT light topics (comma-separated, or Enter to skip): " light_topics
    if [ -n "$light_topics" ]; then
        sed -i "s|^# MQTT_LIGHT_TOPICS=.*|MQTT_LIGHT_TOPICS=${light_topics}|" .env
        ok "Set MQTT_LIGHT_TOPICS"
    fi
fi

# Pushover
echo ""
read -rp "Pushover API token (or Enter to skip): " pushover_token
if [ -n "$pushover_token" ]; then
    read -rp "Pushover user key: " pushover_key
    sed -i "s|^PUSHOVER_API_TOKEN=.*|PUSHOVER_API_TOKEN=${pushover_token}|" .env
    sed -i "s|^PUSHOVER_USER_KEY=.*|PUSHOVER_USER_KEY=${pushover_key}|" .env
    ok "Set Pushover credentials"
fi

# Telegram
echo ""
read -rp "Telegram bot token (or Enter to skip): " telegram_token
if [ -n "$telegram_token" ]; then
    sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${telegram_token}|" .env
    ok "Set Telegram bot token"
fi

# OpenRouter
echo ""
read -rp "OpenRouter API key for AI sitreps (or Enter to skip): " openrouter_key
if [ -n "$openrouter_key" ]; then
    sed -i "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=${openrouter_key}|" .env
    ok "Set OpenRouter API key"
fi

# ── TTS Audio Generation ─────────────────────────────────────────────────────

if [ "$mqtt_choice" != "3" ]; then
    echo ""
    if [ -z "$(ls -A actuator/audio/*.wav 2>/dev/null)" ]; then
        read -rp "Generate TTS audio files? Requires OpenAI API key. [y/N]: " gen_tts
        if [[ "$gen_tts" =~ ^[Yy] ]]; then
            read -rsp "OpenAI API key: " openai_key
            echo ""
            if command -v python3 &>/dev/null; then
                pip3 install --quiet httpx 2>/dev/null || true
                OPENAI_API_KEY="$openai_key" python3 actuator/generate_audio.py
                ok "TTS audio files generated"
            else
                warn "Python 3 not found — you can generate audio later with:"
                echo "  OPENAI_API_KEY=... python3 actuator/generate_audio.py"
            fi
        fi
    else
        ok "TTS audio files already present"
    fi
fi

# ── Launch ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}── Launch ─────────────────────────────────────────${NC}"
echo ""
info "Using compose file: ${COMPOSE_FILE}"
echo ""
read -rp "Pull images and start the stack now? [Y/n]: " do_launch

if [[ ! "$do_launch" =~ ^[Nn] ]]; then
    info "Pulling images..."
    docker compose -f "$COMPOSE_FILE" pull 2>/dev/null || true

    info "Starting stack..."
    docker compose -f "$COMPOSE_FILE" up -d

    echo ""
    ok "Stack is starting!"
    echo ""
    echo -e "  ${GREEN}Management UI${NC}  → http://localhost:8888"
    echo -e "  ${GREEN}Geodash Map${NC}    → http://localhost:8083"
    echo -e "  ${GREEN}InfluxDB${NC}       → http://localhost:8086"
    echo -e "  ${GREEN}MCP Server${NC}     → http://localhost:8786/mcp"
    echo -e "  ${GREEN}RSS Cache${NC}      → http://localhost:8785/api/news"
    echo ""
    info "Run 'docker compose -f ${COMPOSE_FILE} logs -f' to watch logs."
else
    echo ""
    info "To start later:"
    echo "  docker compose -f ${COMPOSE_FILE} up -d"
fi

echo ""
echo -e "${BLUE}── Next Steps ─────────────────────────────────────${NC}"
echo ""
echo "  • Customize the stack: edit docker-compose.override.yml"
echo "  • Secure remote access: set up a Cloudflare Tunnel"
echo "  • Connect AI agents: claude mcp add --transport http red-alert http://localhost:8786/mcp"
echo "  • Claude Code users: run /setup-tunnel for guided tunnel setup"
echo ""
