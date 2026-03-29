/**
 * Red Alert Geodash — Full-screen interactive map page
 * Freeform scroll/zoom over the entire country with alert overlays.
 */

fetch('/api/check-auth').catch(() => {});

// ── Translations ──────────────────────────────────────────────────────────────

let areaTranslations = {};

async function loadTranslations() {
    try {
        const resp = await fetch("/api/translations");
        if (resp.ok) areaTranslations = await resp.json();
    } catch (e) {
        console.warn("Could not load translations:", e);
    }
}

function translateArea(hebrewName) {
    if (!hebrewName) return hebrewName;
    return areaTranslations[hebrewName] || hebrewName;
}

const TITLE_TRANSLATIONS = {
    "ירי רקטות וטילים": "Rockets",
    "חדירת כלי טיס עוין": "UAV",
    "חדירת כלי טיס": "Aircraft Intrusion",
    "חדירת מחבלים": "Terrorist Infiltration",
    "רעידת אדמה": "Earthquake",
    "צונאמי": "Tsunami",
    "חומרים מסוכנים": "Hazardous Materials",
    "אירוע רדיולוגי": "Radiological Event",
    "התרעת קדם": "Pre-Warning",
    "ירי רקטות": "Rocket Fire",
    "טיל בליסטי": "Ballistic Missile",
    "כלי טיס עוין": "UAV",
    "היכנסו למרחב המוגן": "Enter Protected Space",
    "היכנס למרחב המוגן": "Enter Protected Space",
    "הגיעו למרחב המוגן": "Reach Protected Space",
    "התרחקו מהחוף": "Move Away From Shore",
    "סיום שהייה בסמיכות למרחב המוגן": "End Shelter Proximity",
    "יש לשהות בסמיכות למרחב המוגן": "Stay Near Protected Space",
    "ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו": "May Leave Shelter - Stay Nearby",
    "מגן אך יש להישאר בקרבתו": "Shield - Stay Nearby",
    "בדקות הקרובות צפויות להתקבל התרעות באזורך": "Early Warning - Alerts Expected Shortly",
    "האירוע הסתיים": "All Clear",
};

function translateTitle(hebrewTitle) {
    if (!hebrewTitle) return hebrewTitle;
    if (TITLE_TRANSLATIONS[hebrewTitle]) return TITLE_TRANSLATIONS[hebrewTitle];
    for (const [he, en] of Object.entries(TITLE_TRANSLATIONS)) {
        if (hebrewTitle.includes(he) || he.includes(hebrewTitle.replace(/\.\.\./g, ''))) {
            return en;
        }
    }
    return hebrewTitle;
}

// ── Configuration ──────────────────────────────────────────────────────────────

const POLL_INTERVAL = 15000;
const GREEN_DURATION = 60000;
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const ISRAEL_CENTER = [31.5, 35.0];

const CATEGORY_COLORS = {
    1: "#e94560", 2: "#e94560", 3: "#e94560", 4: "#e94560",
    6: "#e94560",
    7: "#e94560", 8: "#e94560", 9: "#e94560", 10: "#e94560",
    11: "#e94560", 12: "#e94560",
    14: "#ff9800",
    13: "#4ecca3",
};

const CATEGORY_LABELS = {
    1: "Rockets", 2: "Drone", 3: "Chemical", 4: "Warning",
    6: "UAV",
    7: "Earthquake", 8: "Earthquake", 9: "CBRNE", 10: "Infiltration",
    11: "Tsunami", 12: "Hazmat", 13: "All Clear", 14: "Early Warning",
};

const SHELTER_TITLES_HE = [
    "האירוע הסתיים",
    "ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו",
    "סיום שהייה בסמיכות למרחב המוגן",
    "יש לשהות בסמיכות למרחב המוגן",
    "מגן אך יש להישאר בקרבתו",
];

function isShelterInstruction(title) {
    if (!title) return false;
    return SHELTER_TITLES_HE.some(t => title.includes(t) || t.includes(title));
}

const DEFAULT_STYLE = {
    color: "transparent",
    weight: 0,
    fillColor: "transparent",
    fillOpacity: 0,
};

// ── State ──────────────────────────────────────────────────────────────────────

let polygonData = {};
let areaLayers = {};
let areaTimers = {};
let currentAlerts = new Map();

// ── Map ────────────────────────────────────────────────────────────────────────

const map = L.map("map-full", {
    zoomControl: true,
    attributionControl: false,
}).setView(ISRAEL_CENTER, 8);

L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(map);

const legend = L.control({ position: "bottomleft" });
legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
        <div class="legend-item"><div class="legend-swatch" style="background:#e94560"></div> Active Alert</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#ff9800"></div> Pre-Warning</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#4ecca3"></div> All Clear</div>
    `;
    return div;
};
legend.addTo(map);

// ── Polygon Loading ────────────────────────────────────────────────────────────

async function loadPolygons() {
    const resp = await fetch("/api/polygons");
    if (!resp.ok) { console.error('API error', resp.status); return; }
    polygonData = await resp.json();

    for (const [name, coords] of Object.entries(polygonData)) {
        const poly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(map);
        const displayName = translateArea(name) || name;
        poly.bindTooltip(displayName, { sticky: true, direction: "top" });
        areaLayers[name] = poly;
    }
}

// ── Alert Processing ───────────────────────────────────────────────────────────

function formatAlertAge(epochSec) {
    const diffMs = Date.now() - epochSec * 1000;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    if (diffMin < 1) return 'Just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} mins ago`;
    if (diffHr === 1) return '1 hour ago';
    return `${diffHr} hours ago`;
}

function setAreaStyle(name, color, fillOpacity) {
    const layer = areaLayers[name];
    if (!layer) return;

    layer.setStyle({
        color: color === "transparent" ? "transparent" : color,
        weight: color === "transparent" ? 0 : 2,
        fillColor: color,
        fillOpacity: fillOpacity,
    });

    if (color !== "transparent") {
        layer.bringToFront();
    }
}

function flashArea(name) {
    const layer = areaLayers[name];
    if (!layer) return;

    let on = true;
    const interval = setInterval(() => {
        const opacity = on ? 0.6 : 0.15;
        layer.setStyle({ fillOpacity: opacity });
        on = !on;
    }, 500);

    if (!areaLayers[name]._flashInterval) {
        areaLayers[name]._flashInterval = interval;
    }
}

function stopFlash(name) {
    if (areaLayers[name] && areaLayers[name]._flashInterval) {
        clearInterval(areaLayers[name]._flashInterval);
        delete areaLayers[name]._flashInterval;
    }
}

function updateTooltip(name, alertInfo) {
    const layer = areaLayers[name];
    if (!layer) return;

    const englishName = translateArea(name);
    let content = englishName;

    if (alertInfo) {
        const label = translateTitle(alertInfo.title) || CATEGORY_LABELS[alertInfo.category] || 'Alert';
        const presumedStr = alertInfo.presumed ? ' (presumed)' : '';
        const ageStr = alertInfo.alertStartTime ? formatAlertAge(alertInfo.alertStartTime) : '';
        content = `<b>${englishName}</b><br>${label}${presumedStr}`;
        if (ageStr) content += `<br>${ageStr}`;
    }

    layer.setTooltipContent(content);
}

function resetTooltip(name) {
    const layer = areaLayers[name];
    if (!layer) return;
    layer.setTooltipContent(translateArea(name));
}

function processAlerts(alerts) {
    const newAlerts = new Map();

    for (const alert of alerts) {
        let { data: area, category, title, alertDate, alert_type, alertStartTime, presumed } = alert;
        if (category !== 13 && isShelterInstruction(title)) {
            category = 13;
        }
        newAlerts.set(area, { category, title, alertDate, alert_type, alertStartTime, presumed });
    }

    // Clear areas no longer alerting
    for (const [area, info] of currentAlerts) {
        if (!newAlerts.has(area)) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.4);
            resetTooltip(area);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            areaTimers[area] = setTimeout(() => {
                setAreaStyle(area, "transparent", 0);
                delete areaTimers[area];
            }, GREEN_DURATION);
        }
    }

    // Apply new alerts
    for (const [area, info] of newAlerts) {
        const color = CATEGORY_COLORS[info.category] || "#e94560";
        const isNew = !currentAlerts.has(area);

        if (info.category === 13) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.4);
            resetTooltip(area);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            areaTimers[area] = setTimeout(() => {
                setAreaStyle(area, "transparent", 0);
                delete areaTimers[area];
            }, GREEN_DURATION);
        } else if (info.category === 14) {
            stopFlash(area);
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, "#ff9800", 0.45);
            updateTooltip(area, info);
        } else {
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, color, 0.6);
            if (!info.presumed) {
                flashArea(area);
            }
            updateTooltip(area, info);
        }
    }

    currentAlerts = newAlerts;
    updateFlashBar(newAlerts);
}

// ── Flash Bar ──────────────────────────────────────────────────────────────────

function updateFlashBar(alerts) {
    const bar = document.getElementById('alert-flash-bar');
    const label = document.getElementById('flashbar-label');
    const text = document.getElementById('flashbar-text');
    const count = document.getElementById('flashbar-count');
    if (!bar) return;

    bar.classList.remove('alert-active', 'warning-active', 'allclear-active');

    const redAlerts = [];
    const warnings = [];
    const allClears = [];

    for (const [area, info] of alerts) {
        if (info.category >= 15) continue;
        if (info.category === 13) {
            allClears.push(area);
        } else if (info.category === 14) {
            warnings.push({ area, title: info.title });
        } else {
            redAlerts.push({ area, title: info.title, category: info.category });
        }
    }

    if (redAlerts.length > 0) {
        bar.classList.add('alert-active');
        const byType = {};
        for (const a of redAlerts) {
            const typeLabel = translateTitle(a.title) || CATEGORY_LABELS[a.category] || 'Alert';
            byType[typeLabel] = (byType[typeLabel] || 0) + 1;
        }
        const typeSummary = Object.entries(byType).map(([t, n]) => `${t}: ${n}`).join(' · ');
        label.textContent = 'ACTIVE ALERTS';
        text.textContent = typeSummary;
        count.textContent = `All Israel: ${redAlerts.length}`;
    } else if (warnings.length > 0) {
        bar.classList.add('warning-active');
        const areaNames = warnings.map(a => translateArea(a.area)).join(' · ');
        label.textContent = 'PRE-WARNING';
        text.textContent = areaNames;
        count.textContent = `${warnings.length} area${warnings.length > 1 ? 's' : ''}`;
    } else if (allClears.length > 0) {
        bar.classList.add('allclear-active');
        label.textContent = 'ALL CLEAR';
        text.textContent = allClears.map(a => translateArea(a)).join(' · ');
    } else {
        label.textContent = 'LIVE';
        text.textContent = 'No active alerts';
    }
}

// ── Polling ────────────────────────────────────────────────────────────────────

async function pollAlerts() {
    try {
        const resp = await fetch("/api/alerts");
        if (!resp.ok) { console.error('API error', resp.status); return; }
        const data = await resp.json();
        processAlerts(data);
    } catch (err) {
        console.error("Poll error:", err);
    }
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
    await loadTranslations();
    await loadPolygons();
    await pollAlerts();

    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 200);
    window.addEventListener('resize', () => map.invalidateSize());
    setInterval(pollAlerts, POLL_INTERVAL);
}

init();
