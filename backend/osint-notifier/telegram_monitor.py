"""Poll public Telegram channel web views for new messages."""

import hashlib
import logging
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

log = logging.getLogger("osint-notifier")

CHANNEL_URL = "https://t.me/s/{channel}"


@dataclass
class ChannelMessage:
    channel: str
    msg_id: str
    text: str


def fetch_latest_messages(channel: str) -> list[ChannelMessage]:
    """Fetch the most recent messages from a public Telegram channel."""
    url = CHANNEL_URL.format(channel=channel)
    resp = httpx.get(url, timeout=15, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    })
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    messages = []

    for widget in soup.select(".tgme_widget_message_wrap"):
        msg_div = widget.select_one(".tgme_widget_message")
        text_div = widget.select_one(".tgme_widget_message_text")
        if not msg_div or not text_div:
            continue

        msg_id = msg_div.get("data-post", "")
        text = text_div.get_text(separator="\n").strip()
        if text:
            messages.append(ChannelMessage(channel=channel, msg_id=msg_id, text=text))

    return messages


class ChannelPoller:
    """Polls a public Telegram channel and tracks new messages."""

    def __init__(self, channel: str):
        self.channel = channel
        self._seen: set[str] = set()

    def _msg_hash(self, msg: ChannelMessage) -> str:
        return msg.msg_id or hashlib.sha256(msg.text.encode()).hexdigest()[:16]

    def seed(self):
        """Fetch current messages and mark as seen (no alert on startup)."""
        try:
            messages = fetch_latest_messages(self.channel)
            for msg in messages:
                self._seen.add(self._msg_hash(msg))
            log.info("Seeded %d existing messages from @%s", len(messages), self.channel)
        except Exception:
            log.exception("Failed to seed @%s", self.channel)

    def poll_once(self) -> list[ChannelMessage]:
        """Fetch and return only new messages since last poll."""
        new_messages = []
        try:
            messages = fetch_latest_messages(self.channel)
            for msg in messages:
                h = self._msg_hash(msg)
                if h not in self._seen:
                    self._seen.add(h)
                    new_messages.append(msg)
        except Exception:
            log.exception("Poll failed for @%s", self.channel)
        return new_messages
