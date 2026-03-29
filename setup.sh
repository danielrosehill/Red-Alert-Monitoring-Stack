#!/usr/bin/env bash
# =============================================================================
# Red Alert Monitoring Stack — First-Time Setup
# =============================================================================
# Interactive bootstrap script for new installations. Walks you through:
#   1. Copying .env.example → .env
#   2. Configuring required variables (alert area, API keys)
#   3. Choosing a compose variant
#   4. Pulling pre-built images and starting the stack
#
# Usage:
#   ./setup.sh
#
# After setup, use ./deploy.sh for subsequent deployments.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
COMPOSE_DIR="$SCRIPT_DIR/compose"

# ── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}→${NC} $1"; }

# ── Pre-flight checks ──────────────────────────────────────────────────────

echo -e "\n${BOLD}Red Alert Monitoring Stack — First-Time Setup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Docker
if ! command -v docker &>/dev/null; then
    fail "Docker not found. Install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi
ok "Docker found: $(docker --version | head -1)"

if ! docker compose version &>/dev/null; then
    fail "Docker Compose v2 not found. Update Docker or install the compose plugin."
    exit 1
fi
ok "Docker Compose found: $(docker compose version --short)"

# ── Step 1: Create .env ────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Step 1: Environment configuration${NC}"

if [[ -f "$ENV_FILE" ]]; then
    warn ".env already exists"
    read -p "  Overwrite with fresh copy from .env.example? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        ok "Fresh .env created from .env.example"
    else
        ok "Keeping existing .env"
    fi
else
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    ok "Created .env from .env.example"
fi

# ── Step 2: Configure required variables ───────────────────────────────────

echo ""
echo -e "${BOLD}Step 2: Required configuration${NC}"
echo "  Fill in the essential variables. Press Enter to skip (you can edit .env later)."
echo ""

set_env_var() {
    local var_name="$1"
    local prompt_text="$2"
    local current_val=""

    # Read current value from .env
    current_val=$(grep "^${var_name}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)

    if [[ -n "$current_val" ]]; then
        echo -e "  ${CYAN}${var_name}${NC} currently: ${current_val}"
        read -p "  New value (Enter to keep): " new_val
    else
        read -p "  ${prompt_text}: " new_val
    fi

    if [[ -n "$new_val" ]]; then
        if grep -q "^${var_name}=" "$ENV_FILE" 2>/dev/null; then
            sed -i "s|^${var_name}=.*|${var_name}=${new_val}|" "$ENV_FILE"
        elif grep -q "^# *${var_name}=" "$ENV_FILE" 2>/dev/null; then
            sed -i "s|^# *${var_name}=.*|${var_name}=${new_val}|" "$ENV_FILE"
        else
            echo "${var_name}=${new_val}" >> "$ENV_FILE"
        fi
        ok "${var_name} set"
    else
        if [[ -n "$current_val" ]]; then
            ok "${var_name} kept as-is"
        else
            warn "${var_name} skipped (you'll need to set this in .env)"
        fi
    fi
}

echo -e "${BOLD}Alert Area${NC} (your location in Hebrew, e.g. ירושלים - דרום)"
set_env_var "ALERT_AREA" "Your alert area in Hebrew"

echo ""
echo -e "${BOLD}Pushover${NC} (push notifications — get tokens from pushover.net)"
set_env_var "PUSHOVER_API_TOKEN" "Pushover API token"
set_env_var "PUSHOVER_USER_KEY" "Pushover user/group key"

echo ""
echo -e "${BOLD}AI / LLM${NC} (for situation reports and intelligence)"
set_env_var "OPENROUTER_API_KEY" "OpenRouter API key (openrouter.ai)"

echo ""
echo -e "${BOLD}Home Assistant${NC} (optional — for smart home actuation)"
set_env_var "HASS_HOST" "HA URL, e.g. http://10.0.0.3:8123 (Enter to skip)"
set_env_var "HASS_TOKEN" "HA long-lived access token (Enter to skip)"

echo ""
echo -e "${BOLD}Telegram Bot${NC} (optional — for on-demand sitreps)"
set_env_var "TELEGRAM_BOT_TOKEN" "Telegram bot token from @BotFather (Enter to skip)"

# ── Step 3: Choose compose variant ─────────────────────────────────────────

echo ""
echo -e "${BOLD}Step 3: Choose deployment variant${NC}"
echo ""
echo "  1) default     — External MQTT broker (you have Mosquitto on your LAN)"
echo "  2) with-broker — Bundled Mosquitto (self-contained, no external MQTT needed)"
echo "  3) ha          — Home Assistant edition (HA handles all automations)"
echo ""
read -p "  Choose [1/2/3] (default: 1): " variant_choice

case "${variant_choice:-1}" in
    2) VARIANT="with-broker"; ok "Using with-broker variant (bundled Mosquitto)" ;;
    3) VARIANT="ha"; ok "Using HA variant" ;;
    *) VARIANT="default"; ok "Using default variant (external MQTT)" ;;
esac

COMPOSE_FILE="$COMPOSE_DIR/$VARIANT.yml"

# ── Step 4: Pull and start ─────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Step 4: Pull images and start stack${NC}"
echo ""

COMPOSE_ARGS=("--env-file" "$ENV_FILE" "-f" "$COMPOSE_FILE")

# Check for override file
OVERRIDE_FILE="$COMPOSE_DIR/override.yml"
if [[ -f "$OVERRIDE_FILE" ]]; then
    COMPOSE_ARGS+=("-f" "$OVERRIDE_FILE")
    ok "Override file found: $OVERRIDE_FILE"
fi

read -p "  Ready to pull images and start the stack? [Y/n] " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo ""
    info "Setup saved. Start the stack later with:"
    echo "    ./deploy.sh --variant $VARIANT"
    exit 0
fi

echo ""
info "Pulling pre-built images..."
docker compose "${COMPOSE_ARGS[@]}" pull 2>&1 || true

echo ""
info "Starting services..."
docker compose "${COMPOSE_ARGS[@]}" up -d

# ── Post-setup ─────────────────────────────────────────────────────────────

echo ""
sleep 3
echo -e "${BOLD}Service Status${NC}"
docker compose "${COMPOSE_ARGS[@]}" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker compose "${COMPOSE_ARGS[@]}" ps

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo "  Dashboard:     http://localhost:8083"
echo "  Management UI: http://localhost:8888"
echo "  MCP Server:    http://localhost:8786/mcp"
echo ""
echo "  Edit config:   nano .env"
echo "  Redeploy:      ./deploy.sh --variant $VARIANT"
echo "  View logs:     docker compose ${COMPOSE_ARGS[*]} logs -f"
echo ""

# Check for crash-looping containers
UNHEALTHY=$(docker compose "${COMPOSE_ARGS[@]}" ps --format json 2>/dev/null | grep -c '"Restarting"' || true)
if [[ "$UNHEALTHY" -gt 0 ]]; then
    echo -e "${YELLOW}Warning: $UNHEALTHY container(s) restarting — check logs:${NC}"
    echo "  docker compose ${COMPOSE_ARGS[*]} logs --tail 20 <service>"
fi

echo -e "${CYAN}Important:${NC} The Oref Alert Proxy must run from an Israeli IP address."
echo "  If deploying remotely, ensure the host has an Israeli IP or use a VPN."
echo ""
