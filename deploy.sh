#!/usr/bin/env bash
# =============================================================================
# Red Alert Monitoring Stack — Deploy Helper
# =============================================================================
# Validates environment, checks for required variables, and brings up the stack.
#
# Usage:
#   ./deploy.sh                          # deploy all services
#   ./deploy.sh --service management-ui  # rebuild single service
#   ./deploy.sh --check-only             # just validate, don't deploy
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/compose"
ENV_FILE="$SCRIPT_DIR/.env"
OVERRIDE_FILE="$SCRIPT_DIR/compose/override.yml"

# Also check parent dir for override (private repo pattern)
if [[ ! -f "$OVERRIDE_FILE" && -f "$SCRIPT_DIR/../docker-compose.override.yml" ]]; then
    OVERRIDE_FILE="$SCRIPT_DIR/../docker-compose.override.yml"
fi

SERVICE=""
CHECK_ONLY=false
ENV_FILE_OVERRIDE=""

# ── Parse args ──────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --service|-s)   SERVICE="$2"; shift 2 ;;
        --check-only)   CHECK_ONLY=true; shift ;;
        --env-file)     ENV_FILE_OVERRIDE="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --service, -s NAME    Rebuild only this service"
            echo "  --env-file PATH       Use a specific .env file"
            echo "  --check-only          Validate env vars without deploying"
            echo "  --help, -h            Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1 (try --help)"
            exit 1
            ;;
    esac
done

if [[ -n "$ENV_FILE_OVERRIDE" ]]; then
    ENV_FILE="$ENV_FILE_OVERRIDE"
fi

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

# ── Validate .env ───────────────────────────────────────────────────────────

echo -e "\n${BOLD}Red Alert Monitoring Stack — Deploy${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "\n${BOLD}Checking environment...${NC}"

if [[ ! -f "$ENV_FILE" ]]; then
    fail ".env file not found at $ENV_FILE"
    echo "  Run: cp .env.example .env"
    exit 1
fi
ok ".env file found: $ENV_FILE"

# Source the env file for validation
set -a
source "$ENV_FILE"
set +a

ERRORS=0
WARNINGS=0

# Required variables
check_required() {
    local var_name="$1"
    local description="$2"
    local value="${!var_name:-}"
    if [[ -z "$value" ]]; then
        fail "$var_name — $description"
        ((ERRORS++))
    else
        # Mask sensitive values
        if [[ "$var_name" == *TOKEN* || "$var_name" == *KEY* || "$var_name" == *PASSWORD* || "$var_name" == *SECRET* ]]; then
            ok "$var_name — set (${value:0:8}...)"
        else
            ok "$var_name — $value"
        fi
    fi
}

# Optional but recommended
check_optional() {
    local var_name="$1"
    local description="$2"
    local value="${!var_name:-}"
    if [[ -z "$value" ]]; then
        warn "$var_name — not set ($description)"
        ((WARNINGS++))
    else
        if [[ "$var_name" == *TOKEN* || "$var_name" == *KEY* || "$var_name" == *PASSWORD* || "$var_name" == *SECRET* ]]; then
            ok "$var_name — set (${value:0:8}...)"
        else
            ok "$var_name — $value"
        fi
    fi
}

echo ""
echo -e "${BOLD}Core${NC}"
check_required ALERT_AREA "Your alert area in Hebrew"

echo ""
echo -e "${BOLD}Push Notifications (Pushover)${NC}"
check_required PUSHOVER_API_TOKEN "Pushover app token — get from pushover.net"
check_required PUSHOVER_USER_KEY "Pushover user/group key"

echo ""
echo -e "${BOLD}AI / LLM${NC}"
check_required OPENROUTER_API_KEY "OpenRouter API key for AI reports"
check_optional GEMINI_API_KEY "Google Gemini key for simulation pipeline"

echo ""
echo -e "${BOLD}Home Assistant${NC}"
check_optional HASS_HOST "HA URL (e.g. http://10.0.0.3:8123)"
check_optional HASS_TOKEN "HA long-lived access token"

echo ""
echo -e "${BOLD}Email Delivery (Resend)${NC}"
check_optional RESEND_API_KEY "Resend API key for email SITREPs"
check_optional SITREP_EMAIL_FROM "Sender address (verified in Resend)"
check_optional SITREP_EMAIL_TO "Recipient address(es)"

echo ""
echo -e "${BOLD}Google Drive${NC}"
check_optional GOOGLE_DRIVE_FOLDER_ID "Drive folder ID for report uploads"
check_optional GOOGLE_SERVICE_ACCOUNT_KEY_PATH "Path to service account JSON"

echo ""
echo -e "${BOLD}Telegram${NC}"
check_optional TELEGRAM_BOT_TOKEN "Telegram bot token"

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}${BOLD}$ERRORS required variable(s) missing${NC}"
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}$WARNINGS optional variable(s) not set${NC}"
    fi
    echo ""
    echo "Fill in missing values in: $ENV_FILE"
    if $CHECK_ONLY; then
        exit 1
    fi
    echo ""
    read -p "Deploy anyway? Some services will fail. [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${GREEN}${BOLD}All required variables set${NC} (${YELLOW}$WARNINGS optional missing${NC})"
else
    echo -e "${GREEN}${BOLD}All variables set${NC}"
fi

if $CHECK_ONLY; then
    exit 0
fi

# ── Compose file resolution ─────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Compose configuration${NC}"

COMPOSE_FILE="$COMPOSE_DIR/default.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
    fail "Compose file not found: $COMPOSE_FILE"
    exit 1
fi
ok "Compose: $COMPOSE_FILE"

COMPOSE_ARGS=("--env-file" "$ENV_FILE" "-f" "$COMPOSE_FILE")

if [[ -f "$OVERRIDE_FILE" ]]; then
    COMPOSE_ARGS+=("-f" "$OVERRIDE_FILE")
    ok "Override: $OVERRIDE_FILE"
else
    info "No override file (optional)"
fi

# ── Deploy ──────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}Deploying...${NC}"

BUILD_ARGS=("up" "-d" "--build")
if [[ -n "$SERVICE" ]]; then
    BUILD_ARGS+=("$SERVICE")
    info "Rebuilding service: $SERVICE"
else
    info "Rebuilding all services"
fi

docker compose "${COMPOSE_ARGS[@]}" "${BUILD_ARGS[@]}"

# ── Post-deploy health check ───────────────────────────────────────────────

echo ""
echo -e "${BOLD}Post-deploy status${NC}"
sleep 3

docker compose "${COMPOSE_ARGS[@]}" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
    docker compose "${COMPOSE_ARGS[@]}" ps

echo ""
echo -e "${GREEN}${BOLD}Deploy complete${NC}"

# Check for crash-looping containers
UNHEALTHY=$(docker compose "${COMPOSE_ARGS[@]}" ps --format json 2>/dev/null | grep -c '"Restarting"' || true)
if [[ "$UNHEALTHY" -gt 0 ]]; then
    echo -e "${YELLOW}Warning: $UNHEALTHY container(s) restarting — check logs:${NC}"
    echo "  docker compose ${COMPOSE_ARGS[*]} logs --tail 20 <service>"
fi
