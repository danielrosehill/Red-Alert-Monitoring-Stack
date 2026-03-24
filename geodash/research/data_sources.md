# Data Sources

## Polygon Data
- Source: [`amitfin/oref_alert`](https://github.com/amitfin/oref_alert) -> `metadata/area_to_polygon.json.zip`
- License: MIT (see [LICENSE](https://github.com/amitfin/oref_alert/blob/main/LICENSE))
- Author: [Amit Finkelstein](https://github.com/amitfin) — this is the polygon/area metadata from his Home Assistant integration for Israeli Oref Alerts
- Format: JSON dict mapping Hebrew area name -> array of [lat, lon] coordinate pairs
- 1,450 areas with polygon boundaries
- Polygons are closed (first point == last point)
- Saved locally: `research/area_to_polygon.json`

## Area Info (centroids)
- Source: [`amitfin/oref_alert`](https://github.com/amitfin/oref_alert) -> `metadata/area_info.py`
- License: MIT
- Contains lat/lon centroid and segment ID for each area
- Useful for labeling and quick point lookups

## Area to District Mapping
- Source: [`amitfin/oref_alert`](https://github.com/amitfin/oref_alert) -> `metadata/area_to_district.py`
- License: MIT
- Maps each area to its district (e.g., "אבו גוש" -> "בית שמש")
- Useful for grouping/filtering alerts by region

## Alert Area Coverage
- Today's live data: 676 unique areas appeared in alerts
- Polygon database: 1,450 areas
- Good coverage for mapping alerts to polygons

## Upstream Metadata URLs (for regenerating area data)
- Areas list: `https://alerts-history.oref.org.il/Shared/Ajax/GetCitiesMix.aspx`
- Districts: `https://alerts-history.oref.org.il/Shared/Ajax/GetDistricts.aspx`
- Segment coords: `https://dist-android.meser-hadash.org.il/smart-dist/services/anonymous/segments/android?instance=1544803905&locale=iw_IL`
- Polygon per segment: `https://services.meser-hadash.org.il/smart-dist/services/anonymous/polygon/id/android?instance=1544803905&id={segment_id}`
- Category definitions: `https://www.oref.org.il/alerts/alertCategories.json`

## Coordinate Order Note
- Polygon data uses [lat, lon] order (not GeoJSON's [lon, lat])
- Leaflet expects [lat, lng] natively, so this works directly without swapping

## Your Previous Notes
- Source: `danielrosehill/Israel-Red-Alert-Syntax-Notes`
- Contains sample payloads, endpoint docs, and a Python monitor script
- Endpoints confirmed still valid and structure unchanged
