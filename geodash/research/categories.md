# Alert Categories Reference

Source: `amitfin/oref_alert` (categories.py), based on https://www.oref.org.il/alerts/alertCategories.json

## History Categories (what we see in the JSON feeds)

| Cat | Type | Icon | Is Alert | Description |
|-----|------|------|----------|-------------|
| 1 | Missile | rocket-launch | YES | Rocket and missile fire |
| 2 | UAV | airplane-alert | YES | Hostile aircraft intrusion |
| 3 | Non-conventional | chemical-weapon | YES | Unconventional missile (chemical) |
| 4 | Warning | alert | YES | General warning |
| 7 | Earthquake | earth | YES | Earthquake alert (type 1) |
| 8 | Earthquake | earth | YES | Earthquake alert (type 2) |
| 9 | CBRNE | nuke | YES | Radiological event |
| 10 | Terror | shield-home | YES | Terrorist infiltration |
| 11 | Tsunami | home-flood | YES | Tsunami warning |
| 12 | Hazmat | biohazard | YES | Hazardous materials |
| 13 | Update/End | message-alert | NO | Event ended (all clear) |
| 14 | Flash/Pre-alert | flash-alert | NO | Pre-alert / alerts expected soon |
| 15-28 | Drills | alert-circle-check | NO | Various drill types |

## Dashboard Color Mapping

| Condition | Color | Categories |
|-----------|-------|------------|
| Pre-warning (alerts expected) | ORANGE | 14 |
| Active alert (any threat) | RED | 1, 2, 3, 4, 7, 8, 9, 10, 11, 12 |
| All clear (event ended) | GREEN (1 min, then default) | 13 |
| Drill | BLUE or ignore | 15-28 |

## Real-Time vs History Categories

The real-time feed uses different category numbers than the history feed.
Real-time category 10 with title containing "בדקות" = pre-alert (14 in history).
Real-time category 10 without "בדקות" = end alert (13 in history).

Real-time to history mapping:
- 1 -> 1 (missile)
- 3 -> 7 (earthquake)
- 4 -> 9 (radiological)
- 5 -> 11 (tsunami)
- 6 -> 2 (aircraft intrusion)
- 7 -> 12 (hazardous materials)
- 13 -> 10 (terrorist infiltration)

## Third Endpoint (History v2)

URL: `https://alerts-history.oref.org.il/Shared/Ajax/GetAlarmsHistory.aspx?lang=he&mode=1`
This provides additional historical data beyond the main history endpoint.
