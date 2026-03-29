"""Scheduled SITREP execution.

Runs the daily_sitrep template at configured times and delivers to
configured channels (telegram, email, or both).

Configuration (env vars):
  SITREP_SCHEDULE     — Comma-separated UTC hours to run, e.g. "0,6,18"
                        or interval like "every:6" (every 6 hours).
                        Default: disabled (empty string).
  SITREP_DELIVER_TO   — Comma-separated delivery targets: "telegram,email"
                        Default: "telegram"
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

log = logging.getLogger("redalert.prompt-runner.scheduler")

SITREP_SCHEDULE = os.environ.get("SITREP_SCHEDULE", "")
SITREP_DELIVER_TO = os.environ.get("SITREP_DELIVER_TO", "telegram")


def parse_schedule(raw: str) -> list[int] | int | None:
    """Parse schedule config into a list of UTC hours or an interval.

    Returns:
        list[int]  — specific hours (e.g. [0, 6, 18])
        int        — interval in hours (e.g. 6 for every 6h)
        None       — disabled
    """
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("every:"):
        try:
            return int(raw.split(":")[1])
        except (IndexError, ValueError):
            log.error("Invalid interval schedule: %s", raw)
            return None
    try:
        hours = [int(h.strip()) for h in raw.split(",") if h.strip()]
        return hours if hours else None
    except ValueError:
        log.error("Invalid schedule hours: %s", raw)
        return None


def get_deliver_targets() -> list[str]:
    return [t.strip() for t in SITREP_DELIVER_TO.split(",") if t.strip()]


async def scheduler_loop(run_sitrep_fn):
    """Background loop that checks once per minute if a SITREP is due.

    Args:
        run_sitrep_fn: async callable(deliver_to: list[str]) that executes
                       the daily_sitrep template and delivers output.
    """
    schedule = parse_schedule(SITREP_SCHEDULE)
    if schedule is None:
        log.info("SITREP scheduler disabled (SITREP_SCHEDULE not set)")
        return

    targets = get_deliver_targets()

    if isinstance(schedule, int):
        log.info("SITREP scheduler: every %dh → %s", schedule, targets)
    else:
        log.info("SITREP scheduler: at UTC hours %s → %s", schedule, targets)

    last_run_hour = -1

    while True:
        now = datetime.now(timezone.utc)
        current_hour = now.hour

        should_run = False
        if isinstance(schedule, int):
            # Interval mode: run when current hour is divisible by interval
            should_run = (current_hour % schedule == 0) and (current_hour != last_run_hour)
        else:
            # Fixed hours mode
            should_run = (current_hour in schedule) and (current_hour != last_run_hour)

        if should_run and now.minute < 5:
            last_run_hour = current_hour
            log.info("Scheduled SITREP triggered at %s UTC", now.strftime("%H:%M"))
            try:
                await run_sitrep_fn(targets)
            except Exception as e:
                log.error("Scheduled SITREP failed: %s", e)

        await asyncio.sleep(60)
