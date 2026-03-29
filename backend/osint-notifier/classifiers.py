"""Keyword-based message classifiers for English and Hebrew Telegram channels.

Each classifier returns a dict:
  - missile_launch: bool — active launch detected
  - local_targeted: bool — user's configured location mentioned as target
"""

import re


def classify_en(message_text: str, local_keywords_en: list[str]) -> dict:
    """Classify English channel message (e.g. @manniefabian).

    Args:
        message_text: Raw message text.
        local_keywords_en: English keywords for local area targeting
            (e.g. ["jerusalem", "central israel"]).

    Credit: Mannie Fabian, Times of Israel military correspondent
    https://www.timesofisrael.com/writers/emanuel-fabian/
    """
    text = message_text.lower()

    # Exclude aftermath / summary messages
    aftermath_patterns = [
        r"no injuries",
        r"no casualties",
        r"all clear",
        r"since (this )?morning",
        r"in the (past|last) \d+",
    ]
    is_aftermath = any(re.search(p, text) for p in aftermath_patterns)

    has_ballistic = "ballistic missile" in text
    has_launch_verb = any(w in text for w in ["detected", "identified", "launch"])
    has_sirens = "sirens" in text and ("expected" in text or "sound" in text)

    missile_launch = (has_ballistic and has_launch_verb) or (has_ballistic and has_sirens)
    if is_aftermath and "sirens" not in text:
        missile_launch = False

    local_targeted = False
    if missile_launch and local_keywords_en:
        local_targeted = any(kw.lower() in text for kw in local_keywords_en)

    return {"missile_launch": missile_launch, "local_targeted": local_targeted}


def classify_he(message_text: str, local_keywords_he: list[str]) -> dict:
    """Classify Hebrew channel message (e.g. @news0404il).

    Args:
        message_text: Raw message text.
        local_keywords_he: Hebrew keywords for local area targeting
            (e.g. ["ירושלים", "מרכז הארץ"]).

    Looks for שיגור (launch) as the primary trigger.
    """
    text = message_text

    aftermath_patterns = [
        r"ללא נפגעים",
        r"אין נפגעים",
        r"הכל בסדר",
    ]
    is_aftermath = any(re.search(p, text) for p in aftermath_patterns)

    has_launch = "שיגור" in text
    has_context = any(w in text for w in ["טיל בליסטי", "טילים", "איראן", "צבאות", "אזעקות"])

    missile_launch = has_launch and has_context
    if is_aftermath:
        missile_launch = False

    local_targeted = False
    if missile_launch and local_keywords_he:
        local_targeted = any(kw in text for kw in local_keywords_he)

    return {"missile_launch": missile_launch, "local_targeted": local_targeted}
