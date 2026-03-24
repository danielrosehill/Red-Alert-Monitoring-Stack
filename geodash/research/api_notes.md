# Oref Alert API Notes

Captured: 2026-03-05

## Endpoints

### Active Alerts
- **URL**: `https://www.oref.org.il/WarningMessages/alert/alerts.json`
- Returns current active alerts; empty (BOM only, 5 bytes) when no alerts active
- `cache-control: max-age=1` — refreshes every ~1 second
- Geo-restricted to Israel

### Alert History
- **URL**: `https://www.oref.org.il/WarningMessages/alert/History/AlertsHistory.json`
- Returns today's full alert history
- Geo-restricted to Israel

## Required Headers
```
Referer: https://www.oref.org.il/
X-Requested-With: XMLHttpRequest
User-Agent: <standard browser UA>
```

## Payload Structure

Each alert entry:
```json
{
  "alertDate": "2026-03-05 16:44:08",
  "title": "ירי רקטות וטילים",
  "data": "ברקן",
  "category": 1
}
```

- `alertDate` — timestamp (Israel local time)
- `title` — alert type description in Hebrew
- `data` — area name in Hebrew (matches Pikud HaOref area definitions)
- `category` — numeric alert type code

## Categories Observed

| Category | Hebrew Title | English | Dashboard Color |
|----------|-------------|---------|----------------|
| 1 | ירי רקטות וטילים | Rocket and missile fire (active) | RED |
| 13 | ירי רקטות וטילים - האירוע הסתיים | Event has ended (all clear) | GREEN (1 min) |
| 14 | בדקות הקרובות צפויות להתקבל התרעות באזורך | Alerts expected soon (pre-warning) | ORANGE |

## Stats from Today's Capture
- 1,610 total alert entries
- 676 unique area names
- 3 unique categories

### History v2
- **URL**: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1`
- Additional historical data endpoint

## Notes
- Active alerts endpoint returns empty JSON-like response (BOM character) when no alerts
- The area name in `data` field maps directly to polygon keys in `area_to_polygon.json`
- Full category reference: see `categories.md`
- Data source details: see `data_sources.md`
