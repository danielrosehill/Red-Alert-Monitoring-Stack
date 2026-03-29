# Red Alert OSINT Notifier

> **Part of the [Red Alert Monitoring Stack](https://github.com/danielrosehill/Red-Alert-Monitoring-Stack)** — a microservices Docker stack for Pikud HaOref red alert monitoring, home automation, and real-time visualization.
>
> **Requires:** [Oref Alert Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) for volumetric alert data.

Unified notification and OSINT intelligence module for Israel Red Alert monitoring. Monitors multiple sources for missile launch alerts and nationwide alert thresholds, delivers Pushover notifications, and generates AI-powered intelligence reports and situation reports when your configured location is targeted.

## Alert Sources

| Source | Type | Description |
|--------|------|-------------|
| `@manniefabian` | Telegram (EN) | Emanuel (Mannie) Fabian, [Times of Israel](https://www.timesofisrael.com/writers/emanuel-fabian/) military correspondent — reports ballistic missile launches often minutes before official sirens |
| `@news0404il` | Telegram (HE) | Hebrew news channel — שיגור (launch) reports with context keywords |
| Oref Alert Proxy | API | Volumetric nationwide alert thresholds (50, 100, 200... 1000 simultaneous areas) |
| Groq OSINT | AI/LLM | Immediate intelligence report when your location is targeted (rate-limited to 1 per 10 min) |
| OpenRouter Sitrep | AI/LLM | Dual-model synthesized situation report on local-area events |

## How It Works

1. **Telegram monitors** poll public channel web views every 15s for new messages
2. **Keyword classifiers** detect missile launches and local targeting:
   - English: `ballistic missile` + `detected`/`identified`/`launch`/`sirens`, then checks for your `LOCAL_KEYWORDS_EN`
   - Hebrew: `שיגור` + `טיל בליסטי`/`טילים`/`איראן`/`אזעקות`, then checks for your `LOCAL_KEYWORDS_HE`
3. **Pushover alerts** fire with priority levels:
   - **High (P1)** — your location is targeted (bypasses quiet hours)
   - **Normal (P0)** — missile launch detected elsewhere
   - **Lowest (P-1)** — volumetric threshold crossings
4. When your location is targeted, two AI follow-ups fire automatically:
   - **Groq intel report** — fast (~5s), immediate intelligence on origin, munitions, scale
   - **OpenRouter sitrep** — dual-model synthesis (~15-30s), queries Gemini 3 Flash and Grok 4.1 Fast in parallel, then synthesizes into a single authoritative situation report

## Location Configuration

Set your location via environment variables. The defaults are for Jerusalem:

```env
LOCATION_NAME=Jerusalem
LOCAL_KEYWORDS_EN=jerusalem,central israel
LOCAL_KEYWORDS_HE=ירושלים,מרכז הארץ
```

**Examples for other locations:**

| Location | `LOCAL_KEYWORDS_EN` | `LOCAL_KEYWORDS_HE` |
|----------|-------------------|-------------------|
| Tel Aviv | `tel aviv,gush dan,central israel` | `תל אביב,גוש דן,מרכז הארץ` |
| Haifa | `haifa,haifa bay,northern israel` | `חיפה,מפרץ חיפה,צפון הארץ` |
| Beer Sheva | `beer sheva,beersheba,negev,southern israel` | `באר שבע,נגב,דרום הארץ` |

When any keyword from your list appears in a missile launch report, the alert is elevated to emergency priority and AI reports are triggered.

## Deployment

```bash
cp .env.example .env
# Edit .env with your credentials and location
docker compose up -d
```

### Requirements

- [Pushover](https://pushover.net/) account with app token and delivery group
- [Oref Alert Proxy](https://github.com/danielrosehill/Oref-Alert-Proxy) running (for volumetric alerts)
- [Groq API key](https://console.groq.com/) (optional, for intel reports)
- [OpenRouter API key](https://openrouter.ai/) (optional, for dual-model sitreps)

### Integration with Red Alert Stack

This module is designed to run as a service within the [Red Alert Monitoring Stack](https://github.com/danielrosehill/Red-Alert-Monitoring-Stack). Add it as a submodule or copy the service into your stack's `docker-compose.yml`.

## Customisation

### Adding Telegram channels

Add more channels by extending `main.py` with additional pollers and classifiers. Each channel needs:
1. A classifier function in `classifiers.py` (keyword patterns for your language/source)
2. A handler function in `main.py`
3. A `ChannelPoller` instance wired into the main loop

### Adjusting thresholds

Set `OREF_AREA_THRESHOLDS` in `.env` to your preferred comma-separated values.

### Changing the intel prompt

Edit the system/user prompts in `intel.py` to customise what the AI reports on.

### Changing sitrep models

Override via environment variables:
```env
SITREP_MODEL_A=google/gemini-3-flash-preview
SITREP_MODEL_B=x-ai/grok-4.1-fast
SITREP_SYNTHESIS_MODEL=google/gemini-3-flash-preview
```

## Credits

- **Emanuel (Mannie) Fabian** — Times of Israel military correspondent whose Telegram reporting is a key data source for early missile launch alerts. [Profile](https://www.timesofisrael.com/writers/emanuel-fabian/)

## License

MIT
