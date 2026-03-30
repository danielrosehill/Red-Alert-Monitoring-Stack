"""Shared alert constants for the Red Alert Monitoring Stack.

Defines Pikud HaOref alert categories, threshold levels, and category
metadata used across multiple services. Single source of truth — import
from here rather than redefining in each service.
"""

# Active threat categories — everything except 13 (all-clear) and drills (15-28)
ACTIVE_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14}

# Red (immediate threat) categories — active minus alerts-expected (14)
RED_CATEGORIES = {1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12}

# Nationwide volume thresholds, checked high-to-low
THRESHOLD_LEVELS = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50]

# Human-readable category names
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
    14: "Alerts Expected",
}


def normalize_category(alert: dict) -> int:
    """Return the integer category from an alert dict.

    The raw Oref data uses 'cat'; some services normalize to 'category'.
    """
    raw = alert.get("category") or alert.get("cat") or 0
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0
