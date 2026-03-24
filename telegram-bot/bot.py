"""Red Alert Telegram Bot — On-demand situational intelligence for Israel Homefront Command alerts.

A purely reactive Telegram bot that responds to commands with current alert
data and AI-generated situation reports. It does NOT push automatic
notifications — alert pushing is handled by other services (Pushover for
volumetric alerts, Actuator for physical alerts).

The /sitrep command generates an AI situation report by querying two different
LLMs in parallel via OpenRouter, then synthesizing both into a single concise
briefing — optionally delivered as a voice note.

Architecture:
  This bot does NOT poll the Oref API directly. It reads from a local
  Oref Alert Proxy (https://github.com/danielrosehill/Oref-Alert-Proxy)
  which handles all Oref polling centrally. Data is fetched on-demand
  when a user issues a command.

Commands:
  /start      — Subscribe with default area (Jerusalem Center)
  /status     — Current alert summary
  /area       — View/change monitored area
  /sitrep     — AI situation report (dual-model synthesis + voice note)
  /subscribe  — Enable notifications
  /unsubscribe — Disable notifications
  /help       — Show commands

Environment variables:
  TELEGRAM_BOT_TOKEN     — Required. Bot token from @BotFather
  OPENROUTER_API_KEY     — Optional. Enables /sitrep and chat features
  OREF_PROXY_URL         — Required. URL of the Oref Alert Proxy
  DATA_DIR               — Subscriber data directory (default: ./data)
"""

import asyncio
import base64
import json
import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("redalert.bot")

# ── Configuration ────────────────────────────────────────────────────────────

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OREF_PROXY_URL = os.environ.get("OREF_PROXY_URL", "http://localhost:8764")
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))

# OpenRouter models
SITREP_MODEL_A = os.environ.get("SITREP_MODEL_A", "google/gemini-2.0-flash-lite-001")
SITREP_MODEL_B = os.environ.get("SITREP_MODEL_B", "meta-llama/llama-4-scout")
SITREP_SYNTHESIS_MODEL = os.environ.get("SITREP_SYNTHESIS_MODEL", "google/gemini-2.0-flash-001")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "google/gemini-2.0-flash-lite-001")
TTS_MODEL = os.environ.get("TTS_MODEL", "openai/gpt-4o-mini-audio-preview")

TELEGRAM_API = "https://api.telegram.org/bot{token}"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SUBSCRIBERS_FILE = DATA_DIR / "telegram_subscribers.json"

# ── Alert Categories ─────────────────────────────────────────────────────────

CATEGORY_NAMES = {
    1: "Rockets & Missiles",
    2: "Rockets & Missiles",
    3: "Rockets & Missiles",
    4: "Rockets & Missiles",
    6: "Unauthorized Aircraft",
    7: "Hostile Aircraft Intrusion",
    8: "Infiltration",
    9: "Tsunami",
    10: "Earthquake",
    11: "Radiological",
    12: "Hazardous Materials",
    13: "All Clear",
    14: "Pre-Warning",
}

ACTIVE_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14}

# ── Area Configuration ───────────────────────────────────────────────────────

AREA_CHOICES = {
    "center": "ירושלים - מרכז",
    "south": "ירושלים - דרום",
    "north": "ירושלים - צפון",
    "east": "ירושלים - מזרח",
    "west": "ירושלים - מערב",
    "all": "all",
}


AREA_FRIENDLY = {v: k.title() for k, v in AREA_CHOICES.items() if v != "all"}
DEFAULT_AREA = "center"


# ── Proxy Consumer ───────────────────────────────────────────────────────────

class ProxyConsumer:
    """Reads alert data from the Oref Alert Proxy on demand."""

    def __init__(self, http_client: httpx.AsyncClient):
        self.http_client = http_client
        self.alerts: list[dict] = []
        self.last_alert_time: float | None = None
        self.last_alert_areas: list[str] = []

    async def fetch_alerts(self) -> list[dict]:
        """Fetch current alerts from proxy. Updates internal state and returns alerts."""
        try:
            resp = await self.http_client.get(
                f"{OREF_PROXY_URL}/api/alerts", timeout=10
            )
            data = resp.json()
            alerts = data.get("alerts", [])
        except Exception as e:
            log.error("Proxy fetch error: %s", e)
            return self.alerts

        # Normalize category field
        for a in alerts:
            if "cat" in a and "category" not in a:
                a["category"] = a["cat"]

        if alerts:
            self.last_alert_time = time.time()
            self.last_alert_areas = [a.get("data", "") for a in alerts[:20]]

        self.alerts = alerts
        return alerts

    async def fetch_history(self) -> list[dict]:
        """Fetch today's history from proxy (on-demand, for sitrep context)."""
        try:
            resp = await self.http_client.get(
                f"{OREF_PROXY_URL}/api/history", timeout=15
            )
            data = resp.json()
            return data.get("history", [])
        except Exception as e:
            log.error("Proxy history error: %s", e)
            return []


# ── OpenRouter Client ────────────────────────────────────────────────────────

class OpenRouterClient:
    """Minimal OpenRouter chat completions client."""

    def __init__(self, api_key: str, http_client: httpx.AsyncClient):
        self.api_key = api_key
        self.http_client = http_client
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/danielrosehill/Red-Alert-Telegram-Bot",
            "X-Title": "Red Alert Telegram Bot",
        }

    async def chat(self, model: str, system: str, user: str,
                   timeout: float = 30) -> str | None:
        """Generate a text completion. Returns the response text or None."""
        if not self.api_key:
            return None
        try:
            body = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
            resp = await self.http_client.post(
                OPENROUTER_URL, json=body, headers=self.headers, timeout=timeout
            )
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content")
            log.warning("OpenRouter empty response: %s", data.get("error", data))
        except Exception as e:
            log.error("OpenRouter chat error (%s): %s", model, e)
        return None

    async def tts(self, text: str, timeout: float = 60) -> bytes | None:
        """Generate speech audio via OpenRouter TTS model.
        Returns raw audio bytes or None."""
        if not self.api_key:
            return None
        try:
            body = {
                "model": TTS_MODEL,
                "messages": [
                    {"role": "user", "content": text},
                ],
                "modalities": ["text", "audio"],
                "audio": {"voice": "coral", "format": "wav"},
            }
            resp = await self.http_client.post(
                OPENROUTER_URL, json=body, headers=self.headers, timeout=timeout
            )
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                audio_data = choices[0].get("message", {}).get("audio", {})
                b64 = audio_data.get("data")
                if b64:
                    return base64.b64decode(b64)
            log.warning("TTS empty response: %s", data.get("error", data))
        except Exception as e:
            log.error("TTS error: %s", e)
        return None


# ── Telegram Bot ─────────────────────────────────────────────────────────────

class TelegramBot:
    def __init__(self, token: str, http_client: httpx.AsyncClient,
                 proxy: ProxyConsumer, llm: OpenRouterClient):
        self.token = token
        self.http_client = http_client
        self.proxy = proxy
        self.llm = llm
        self.api_base = TELEGRAM_API.format(token=token)

        self.subscribers: dict[int, dict] = {}

        self._load_subscribers()

    # ── Persistence ──────────────────────────────────────────────────────

    def _load_subscribers(self):
        try:
            if SUBSCRIBERS_FILE.exists():
                data = json.loads(SUBSCRIBERS_FILE.read_text())
                if "subscribers" in data:
                    self.subscribers = {
                        int(k): v for k, v in data["subscribers"].items()
                    }
                log.info("Loaded %d subscribers", len(self.subscribers))
        except Exception as e:
            log.warning("Could not load subscribers: %s", e)

    def _save_subscribers(self):
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            SUBSCRIBERS_FILE.write_text(json.dumps({
                "subscribers": {str(k): v for k, v in self.subscribers.items()},
                "updated": time.time(),
            }))
        except Exception as e:
            log.warning("Could not save subscribers: %s", e)

    # ── Telegram API ─────────────────────────────────────────────────────

    async def _api(self, method: str, http_timeout: float = 10, **kwargs) -> dict | None:
        try:
            resp = await self.http_client.post(
                f"{self.api_base}/{method}", json=kwargs, timeout=http_timeout
            )
            data = resp.json()
            if not data.get("ok"):
                log.warning("Telegram %s: %s", method, data.get("description"))
            return data
        except Exception as e:
            log.error("Telegram %s failed: %s", method, e)
            return None

    async def send_message(self, chat_id: int, text: str, parse_mode: str = "HTML"):
        return await self._api("sendMessage", chat_id=chat_id, text=text, parse_mode=parse_mode)

    async def send_voice(self, chat_id: int, ogg_bytes: bytes, caption: str = ""):
        try:
            resp = await self.http_client.post(
                f"{self.api_base}/sendVoice",
                data={"chat_id": chat_id, "caption": caption},
                files={"voice": ("sitrep.ogg", ogg_bytes, "audio/ogg")},
                timeout=30,
            )
            data = resp.json()
            if not data.get("ok"):
                log.warning("sendVoice error: %s", data.get("description"))
            return data
        except Exception as e:
            log.error("sendVoice failed: %s", e)
            return None

    # ── Subscriber management ────────────────────────────────────────────

    def subscribe(self, chat_id: int) -> bool:
        if chat_id in self.subscribers:
            return False
        self.subscribers[chat_id] = {"area": DEFAULT_AREA}
        self._save_subscribers()
        return True

    def unsubscribe(self, chat_id: int) -> bool:
        if chat_id not in self.subscribers:
            return False
        del self.subscribers[chat_id]
        self._save_subscribers()
        return True

    def get_area(self, chat_id: int) -> str:
        return self.subscribers.get(chat_id, {}).get("area", DEFAULT_AREA)

    def set_area(self, chat_id: int, area: str):
        if chat_id in self.subscribers:
            self.subscribers[chat_id]["area"] = area
            self._save_subscribers()

    # ── Alert Context Builder ────────────────────────────────────────────

    def _build_alert_context(self) -> str:
        alerts = self.proxy.alerts
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_names = {a.get("data", "") for a in active}

        lines = [
            f"Current time: {time.strftime('%Y-%m-%d %H:%M:%S IST')}",
            f"Active alert areas: {len(active_names)}",
        ]

        if self.proxy.last_alert_time:
            elapsed = time.time() - self.proxy.last_alert_time
            lines.append(f"Time since last alert: {_human_duration(elapsed)}")
        if self.proxy.last_alert_areas:
            lines.append(f"Last alerted areas: {', '.join(self.proxy.last_alert_areas[:10])}")

        if active:
            by_cat: dict[str, list[str]] = {}
            for a in active:
                cat = a.get("category", 0)
                cat_name = CATEGORY_NAMES.get(cat, f"Category {cat}")
                by_cat.setdefault(cat_name, []).append(a.get("data", ""))
            for cat_name, areas in by_cat.items():
                if len(areas) <= 20:
                    lines.append(f"{cat_name}: {', '.join(areas)}")
                else:
                    lines.append(f"{cat_name}: {', '.join(areas[:15])} ... +{len(areas)-15} more")

        return "\n".join(lines)

    # ── Command Handlers ─────────────────────────────────────────────────

    async def handle_update(self, update: dict):
        message = update.get("message", {})
        text = message.get("text", "").strip()
        chat_id = message.get("chat", {}).get("id")

        if not chat_id or not text:
            return

        if text == "/start" or text.startswith("/start "):
            self.subscribe(chat_id)
            await self.send_message(chat_id, (
                "<b>Red Alert Israel — On-Demand Intelligence Bot</b>\n\n"
                "Get on-demand situational intelligence about Israel's Homefront "
                "Command alerts. This bot responds to your commands — it does not "
                "push automatic notifications.\n\n"
                "<b>Commands:</b>\n"
                "/status — Current alert summary\n"
                "/area — View/change monitored area\n"
                "/sitrep — AI situation report (voice note)\n"
                "/help — Show commands\n\n"
                "Or just type a question about the current situation."
            ))
            return

        if text == "/subscribe":
            if self.subscribe(chat_id):
                await self.send_message(chat_id, "Subscribed to alert notifications.")
            else:
                await self.send_message(chat_id, "You're already subscribed.")
            return

        if text == "/unsubscribe":
            if self.unsubscribe(chat_id):
                await self.send_message(chat_id, "Unsubscribed. Use /subscribe to re-enable.")
            else:
                await self.send_message(chat_id, "You're not currently subscribed.")
            return

        if text == "/status":
            await self._send_status(chat_id)
            return

        if text.startswith("/area"):
            await self._handle_area(chat_id, text)
            return

        if text == "/sitrep":
            await self._handle_sitrep(chat_id)
            return

        if text == "/help":
            await self.send_message(chat_id, (
                "<b>Commands:</b>\n"
                "/status — Current alert summary\n"
                "/area — View/change area (center, south, north, east, west, all)\n"
                "/sitrep — AI situation report with voice note\n"
                "/subscribe — Enable notifications\n"
                "/unsubscribe — Disable notifications\n\n"
                "Or just send a message to chat about the current situation."
            ))
            return

        await self._handle_chat(chat_id, text)

    async def _handle_area(self, chat_id: int, text: str):
        parts = text.split(maxsplit=1)
        if len(parts) == 1:
            current = self.get_area(chat_id)
            if current == "all":
                en = "All Jerusalem areas"
            else:
                he = AREA_CHOICES.get(current, "")
                en = AREA_FRIENDLY.get(he, current.title())
            options = ", ".join(AREA_CHOICES.keys())
            await self.send_message(chat_id, (
                f"Current area: <b>{en}</b>\n\n"
                f"Change with: /area [option]\n"
                f"Options: {options}"
            ))
            return

        choice = parts[1].lower().strip()
        if choice not in AREA_CHOICES:
            options = ", ".join(AREA_CHOICES.keys())
            await self.send_message(chat_id, f"Unknown area. Options: {options}")
            return

        self.set_area(chat_id, choice)
        if choice == "all":
            en = "All Jerusalem areas"
        else:
            he = AREA_CHOICES[choice]
            en = AREA_FRIENDLY.get(he, choice.title())
        await self.send_message(chat_id, f"Area updated to: <b>{en}</b>")

    async def _send_status(self, chat_id: int):
        await self.proxy.fetch_alerts()
        alerts = self.proxy.alerts
        active = [a for a in alerts if a.get("category", 0) in ACTIVE_CATEGORIES]
        active_area_names = {a.get("data", "") for a in active}

        if not active:
            if self.proxy.last_alert_time:
                since = _human_duration(time.time() - self.proxy.last_alert_time)
                await self.send_message(chat_id, f"No active alerts.\nLast alert: {since} ago")
            else:
                await self.send_message(chat_id, "No active alerts.")
            return

        by_cat: dict[int, list[str]] = {}
        for a in active:
            cat = a.get("category", 0)
            by_cat.setdefault(cat, []).append(a.get("data", ""))

        lines = [f"<b>ACTIVE ALERTS: {len(active_area_names)} areas</b>\n"]
        for cat, areas in sorted(by_cat.items()):
            cat_name = CATEGORY_NAMES.get(cat, f"Category {cat}")
            lines.append(f"\n<b>{cat_name}:</b>")
            if len(areas) <= 15:
                for area in areas:
                    lines.append(f"  — {area}")
            else:
                for area in areas[:10]:
                    lines.append(f"  — {area}")
                lines.append(f"  ... and {len(areas) - 10} more")

        await self.send_message(chat_id, "\n".join(lines))

    # ── Sitrep: Dual-Model Synthesis ─────────────────────────────────────

    async def _handle_sitrep(self, chat_id: int):
        if not OPENROUTER_API_KEY:
            await self.send_message(chat_id, "Sitrep unavailable (OPENROUTER_API_KEY not set).")
            return

        await self.send_message(chat_id, "Generating situation report (querying two AI models)...")

        await self.proxy.fetch_alerts()
        context = self._build_alert_context()

        sitrep_system = (
            "You are a military-style situation report (sitrep) generator for Israel's "
            "Homefront Command alert system. Generate a concise, professional sitrep "
            "summarizing the current situation. "
            "Use clear, direct language. Structure: SITUATION, KEY DEVELOPMENTS, ASSESSMENT. "
            "Keep it under 200 words. Do not use markdown formatting — plain text only."
        )
        sitrep_prompt = f"Current alert data:\n{context}\n\nGenerate sitrep."

        # Query two models in parallel
        report_a, report_b = await asyncio.gather(
            self.llm.chat(SITREP_MODEL_A, sitrep_system, sitrep_prompt),
            self.llm.chat(SITREP_MODEL_B, sitrep_system, sitrep_prompt),
        )

        if not report_a and not report_b:
            await self.send_message(chat_id, "Failed to generate sitrep — both models returned empty.")
            return

        # If only one model responded, use it directly
        if not report_a or not report_b:
            final_sitrep = report_a or report_b
        else:
            # Synthesize both reports into one
            synthesis_system = (
                "You are an intelligence analyst. You will receive two independent "
                "situation reports about the same event from different AI models. "
                "Synthesize them into a single authoritative sitrep that draws the "
                "best analysis from each source. Resolve any contradictions by "
                "favoring the more specific/detailed claim. "
                "Structure: SITUATION, KEY DEVELOPMENTS, ASSESSMENT. "
                "Keep it under 200 words. Plain text only, no markdown."
            )
            synthesis_prompt = (
                f"Report A ({SITREP_MODEL_A}):\n{report_a}\n\n"
                f"Report B ({SITREP_MODEL_B}):\n{report_b}\n\n"
                f"Synthesize into one authoritative sitrep."
            )

            final_sitrep = await self.llm.chat(
                SITREP_SYNTHESIS_MODEL, synthesis_system, synthesis_prompt
            )
            if not final_sitrep:
                # Fallback to model A's report if synthesis fails
                final_sitrep = report_a

        await self.send_message(chat_id, f"<b>SITREP</b>\n\n{final_sitrep}", parse_mode="HTML")

        # Generate voice note via TTS
        tts_audio = await self.llm.tts(f"Situation report. {final_sitrep}")
        if tts_audio:
            ogg = await _audio_to_ogg(tts_audio)
            if ogg:
                await self.send_voice(chat_id, ogg, caption="Sitrep voice briefing")

    # ── Chat ─────────────────────────────────────────────────────────────

    async def _handle_chat(self, chat_id: int, user_message: str):
        if not OPENROUTER_API_KEY:
            await self.send_message(chat_id, "Chat unavailable. Use /help for commands.")
            return

        await self.proxy.fetch_alerts()
        context = self._build_alert_context()

        system = (
            "You are a helpful assistant for Israel's Red Alert system. "
            "You have access to real-time Homefront Command (Pikud HaOref) alert data. "
            "Answer questions about the current security situation, alert status, and areas under threat. "
            "Be concise and factual. Keep responses under 150 words. "
            "Do not use markdown — plain text only, for Telegram display."
        )
        prompt = f"Current alert data:\n{context}\n\nUser question: {user_message}"

        reply = await self.llm.chat(CHAT_MODEL, system, prompt)
        if reply:
            await self.send_message(chat_id, reply, parse_mode="")
        else:
            await self.send_message(chat_id, "Sorry, I couldn't process that. Try /status or /help.")

    # ── Telegram Polling ─────────────────────────────────────────────────

    async def start_telegram_polling(self):
        await self._api("deleteWebhook")
        log.info("Telegram polling started")

        offset = 0
        while True:
            try:
                result = await self._api(
                    "getUpdates", http_timeout=35, offset=offset, timeout=30
                )
            except Exception as e:
                log.error("Telegram poll error: %s", e)
                await asyncio.sleep(5)
                continue

            if result and result.get("ok"):
                for update in result.get("result", []):
                    offset = update["update_id"] + 1
                    try:
                        await self.handle_update(update)
                    except Exception as e:
                        log.error("Update handler error: %s", e)
            else:
                await asyncio.sleep(5)


# ── Utilities ────────────────────────────────────────────────────────────────

def _human_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    h = s // 3600
    m = (s % 3600) // 60
    return f"{h}h {m}m"


async def _audio_to_ogg(raw_audio: bytes) -> bytes | None:
    """Convert WAV audio to OGG/Opus for Telegram voice notes."""
    in_path = out_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as inf:
            inf.write(raw_audio)
            in_path = inf.name
        out_path = in_path.replace(".wav", ".ogg")
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", in_path,
            "-c:a", "libopus", "-b:a", "48k",
            "-ar", "24000", "-ac", "1",
            out_path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode == 0 and os.path.exists(out_path):
            return Path(out_path).read_bytes()
        log.error("ffmpeg conversion failed (exit %s)", proc.returncode)
    except Exception as e:
        log.error("Audio conversion error: %s", e)
    finally:
        for p in [in_path, out_path]:
            try:
                if p:
                    os.unlink(p)
            except OSError:
                pass
    return None


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    if not TELEGRAM_BOT_TOKEN:
        log.error("TELEGRAM_BOT_TOKEN not set. Exiting.")
        return
    if not OREF_PROXY_URL:
        log.error("OREF_PROXY_URL not set. Exiting.")
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient() as http_client:
        proxy = ProxyConsumer(http_client)
        llm = OpenRouterClient(OPENROUTER_API_KEY, http_client)
        bot = TelegramBot(TELEGRAM_BOT_TOKEN, http_client, proxy, llm)

        log.info("Red Alert Telegram Bot starting (on-demand mode)...")
        log.info("Proxy: %s", OREF_PROXY_URL)
        log.info("AI features: %s", "enabled" if OPENROUTER_API_KEY else "disabled")
        log.info("Sitrep models: %s + %s → %s", SITREP_MODEL_A, SITREP_MODEL_B, SITREP_SYNTHESIS_MODEL)
        log.info("Subscribers: %d", len(bot.subscribers))

        await bot.start_telegram_polling()


if __name__ == "__main__":
    asyncio.run(main())
