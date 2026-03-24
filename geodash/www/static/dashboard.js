/**
 * Red Alert Geodash — Real-time alert map dashboard
 */

// ── Auth Check (no-op on local Docker deployment) ───────────────────────────

fetch('/api/check-auth').catch(() => {});

// ── Translations ──────────────────────────────────────────────────────────────

let areaTranslations = {};
let areaRegions = {};

async function loadTranslations() {
    try {
        const resp = await fetch("/api/translations");
        if (resp.ok) areaTranslations = await resp.json();
    } catch (e) {
        console.warn("Could not load translations:", e);
    }
}

async function loadAreaRegions() {
    try {
        const resp = await fetch("/api/area-regions");
        if (resp.ok) areaRegions = await resp.json();
    } catch (e) {
        console.warn("Could not load area regions:", e);
    }
}

function translateArea(hebrewName) {
    if (!hebrewName) return hebrewName;
    return areaTranslations[hebrewName] || hebrewName;
}

function getRegion(hebrewName) {
    if (!hebrewName || !areaRegions[hebrewName]) return '';
    return areaRegions[hebrewName].region_en || '';
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

const JERUSALEM_CENTER = [31.78, 35.22];
const JERUSALEM_WIDE_CENTER = [31.75, 35.10];
const ISRAEL_CENTER = [31.4, 34.8];

// Local area monitoring — Hebrew keys, English display names
const AREA_OPTIONS = [
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd", en: "South" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05e8\u05db\u05d6", en: "Center" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05e6\u05e4\u05d5\u05df", en: "North" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05e2\u05e8\u05d1", en: "West" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05d6\u05e8\u05d7", en: "East" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05db\u05e4\u05e8 \u05e2\u05e7\u05d1", en: "Kafr Aqab" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d0\u05d6\u05d5\u05e8 \u05ea\u05e2\u05e9\u05d9\u05d9\u05d4 \u05e2\u05d8\u05e8\u05d5\u05ea", en: "Atarot" },
];

// Default to saved preference or Jerusalem Center
const savedArea = localStorage.getItem("geodash-local-area");
let LOCAL_AREA = savedArea || AREA_OPTIONS[1].he;

const CATEGORY_COLORS = {
    1: "#e94560", 2: "#e94560", 3: "#e94560", 4: "#e94560",
    6: "#e94560",
    7: "#e94560", 8: "#e94560", 9: "#e94560", 10: "#e94560",
    11: "#e94560", 12: "#e94560",
    14: "#e65100",
    13: "#4ecca3",
};

const CATEGORY_LABELS = {
    1: "Rockets", 2: "UAV", 3: "Chemical", 4: "Warning",
    6: "UAV",
    7: "Earthquake", 8: "Earthquake", 9: "CBRNE", 10: "Infiltration",
    11: "Tsunami", 12: "Hazmat", 13: "All Clear", 14: "Early Warning",
};

// Shelter instruction titles — post-event messages that should show as all-clear
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

// ── National Severity Levels ────────────────────────────────────────────────

const SEVERITY_LEVELS = [
    { min: 0,   max: 0,   level: 0, label: "No Active Threats",    color: "#7eddb8" },
    { min: 1,   max: 10,  level: 1, label: "Low",                  color: "#ffeb3b" },
    { min: 11,  max: 50,  level: 2, label: "Moderate",             color: "#ff9800" },
    { min: 51,  max: 100, level: 3, label: "Elevated",             color: "#ff5722" },
    { min: 101, max: 200, level: 4, label: "High",                 color: "#e94560" },
    { min: 201, max: 300, level: 5, label: "Severe",               color: "#d32f2f" },
    { min: 301, max: 400, level: 6, label: "Critical",             color: "#b71c1c" },
    { min: 401, max: 500, level: 7, label: "Extreme",              color: "#880e4f" },
    { min: 501, max: 700, level: 8, label: "Maximum",              color: "#4a0072" },
];

function getSeverity(activeCount) {
    if (activeCount > 700) return SEVERITY_LEVELS[SEVERITY_LEVELS.length - 1];
    for (const s of SEVERITY_LEVELS) {
        if (activeCount >= s.min && activeCount <= s.max) return s;
    }
    return SEVERITY_LEVELS[0];
}

// Polygons are invisible by default — no outlines shown
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
let areaCenters = {};
let currentAlerts = new Map();
let localAlertActive = false;
let localAlertMinTimer = null; // minimum display timer
const LOCAL_ALERT_MIN_DURATION = 30000; // 30 seconds minimum display
let audioCtx = null;
let cache_alerts_raw = [];

// Alert history feed — keeps last 50 entries
let alertHistory = [];
const MAX_HISTORY = 50;


// ── Audio ──────────────────────────────────────────────────────────────────────

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
}

function isAudioEnabled() {
    return localStorage.getItem('geodash-audio') !== 'false';
}

function isSpeechEnabled() {
    return localStorage.getItem('geodash-speech') !== 'false';
}

function playRedAlertTone() {
    if (!isAudioEnabled()) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
        const offset = i * 0.8;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.value = 880;
        gain1.gain.value = 0.3;
        osc1.connect(gain1).connect(ctx.destination);
        osc1.start(now + offset);
        osc1.stop(now + offset + 0.35);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.value = 660;
        gain2.gain.value = 0.3;
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(now + offset + 0.4);
        osc2.stop(now + offset + 0.75);
    }
}

function playWarningTone() {
    if (!isAudioEnabled()) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
        const offset = i * 0.5;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 520;
        gain.gain.setValueAtTime(0.25, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.35);
    }
}

function speakAlert(message) {
    if (!isSpeechEnabled()) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9;
        utterance.volume = 1;
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);
    }
}

// ── Local Area Alert ──────────────────────────────────────────────────────────

function playAllClearTone() {
    if (!isAudioEnabled()) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Pleasant ascending chime
    const notes = [523, 659, 784]; // C5, E5, G5
    for (let i = 0; i < notes.length; i++) {
        const offset = i * 0.25;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = notes[i];
        gain.gain.setValueAtTime(0.2, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.6);
    }
}

function showLocalAlert(type, title) {
    const overlay = document.getElementById('local-alert-overlay');
    const text = document.getElementById('local-alert-text');
    overlay.classList.remove('active-red', 'active-warning', 'active-allclear');

    const areaEn = getEnglishName(LOCAL_AREA);

    if (type === 'red') {
        text.textContent = `RED ALERT \u2014 ${title}`;
        overlay.classList.add('active-red');
        playRedAlertTone();
        setTimeout(() => {
            speakAlert(`Red alert. ${title}. Jerusalem ${areaEn}. Take shelter immediately.`);
        }, 2500);
    } else if (type === 'warning') {
        text.textContent = `WARNING \u2014 ${title}`;
        overlay.classList.add('active-warning');
        playWarningTone();
        setTimeout(() => {
            speakAlert(`Warning. ${title}. Jerusalem ${areaEn}. Be prepared.`);
        }, 1800);
    } else if (type === 'allclear') {
        text.textContent = `ALL CLEAR \u2014 Event Concluded`;
        overlay.classList.add('active-allclear');
        playAllClearTone();
        setTimeout(() => {
            speakAlert(`All clear. The event in Jerusalem ${areaEn} has concluded. You may leave the shelter.`);
        }, 1000);
    }

    localAlertActive = true;

    // Enforce minimum display duration
    if (localAlertMinTimer) clearTimeout(localAlertMinTimer);
    localAlertMinTimer = setTimeout(() => {
        localAlertMinTimer = null;
        // If alert already cleared by backend, hide now
        if (!currentAlerts.has(LOCAL_AREA)) {
            hideLocalAlert();
        }
    }, LOCAL_ALERT_MIN_DURATION);
}

function dismissLocalAlert() {
    const overlay = document.getElementById('local-alert-overlay');
    overlay.classList.remove('active-red', 'active-warning', 'active-allclear');
    localAlertActive = false;
    if (localAlertMinTimer) {
        clearTimeout(localAlertMinTimer);
        localAlertMinTimer = null;
    }
}

function hideLocalAlert() {
    // Respect minimum display duration — don't hide too early
    if (localAlertMinTimer) return; // timer still running, will hide when it fires
    const overlay = document.getElementById('local-alert-overlay');
    overlay.classList.remove('active-red', 'active-warning', 'active-allclear');
    localAlertActive = false;
}

// Clock handled by components.js renderHeader()

// ── Refresh Button (handled by header component) ─────────────────────────────

// ── Test Alert Buttons ────────────────────────────────────────────────────────

async function sendTestAlert(category, duration) {
    const clearBtn = document.getElementById('test-clear-btn');
    try {
        const title = category === 1 ? 'ירי רקטות וטילים'
            : category === 14 ? 'בדקות הקרובות צפויות להתקבל התרעות באזורך'
            : 'האירוע הסתיים';
        const resp = await fetch('/api/test-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ area: LOCAL_AREA, category, title, duration }),
        });
        if (resp.ok) {
            clearBtn.style.display = 'inline-block';
            setTimeout(() => {
                clearBtn.style.display = 'none';
            }, duration * 1000);
            pollAlerts();
        }
    } catch (e) {
        console.error('Failed to send test alert:', e);
    }
}

document.getElementById('test-red-btn').addEventListener('click', () => sendTestAlert(1, 30));
document.getElementById('test-warning-btn').addEventListener('click', () => sendTestAlert(14, 30));
document.getElementById('test-allclear-btn').addEventListener('click', () => {
    // All-clear shows the overlay directly (no backend injection needed)
    showLocalAlert('allclear', 'האירוע הסתיים');
});

document.getElementById('test-clear-btn').addEventListener('click', async () => {
    try {
        await fetch('/api/test-alert', { method: 'DELETE' });
    } catch (e) {
        console.error('Failed to clear test alerts:', e);
    }
    document.getElementById('test-clear-btn').style.display = 'none';
    pollAlerts();
});

// ── Alert Dismiss ────────────────────────────────────────────────────────────

document.getElementById('local-alert-dismiss').addEventListener('click', () => {
    dismissLocalAlert();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && localAlertActive) {
        dismissLocalAlert();
    }
});

// ── Maps (3 maps: country, jerusalem wide, jerusalem city) ────────────────────

const lockedMapOptions = {
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false,
    touchZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false,
};

const mapJerusalem = L.map("map-jerusalem", lockedMapOptions).setView(JERUSALEM_CENTER, 13);

const mapJerusalemWide = L.map("map-jerusalem-wide", lockedMapOptions).setView(JERUSALEM_WIDE_CENTER, 11);

const mapCountry = L.map("map-country", lockedMapOptions).setView(ISRAEL_CENTER, 8.5);

// Track user interaction to pause auto-zoom
let userInteractedWithMap = false;
let userInteractionTimer = null;
mapCountry.on('dragstart zoomstart', (e) => {
    // Ignore programmatic zoom/pan (from autoZoomToAlerts)
    if (e.originalEvent || e.type === 'dragstart') {
        userInteractedWithMap = true;
        if (userInteractionTimer) clearTimeout(userInteractionTimer);
        // Resume auto-zoom after 2 minutes of no interaction
        userInteractionTimer = setTimeout(() => {
            userInteractedWithMap = false;
        }, 120000);
    }
});

L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(mapJerusalem);
L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(mapJerusalemWide);
L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(mapCountry);

// ── Israel Border Outline ─────────────────────────────────────────────────────
// Simplified border polygon (clockwise from Eilat)
const ISRAEL_BORDER = [
    [29.490, 34.893], // Eilat / Taba
    [29.520, 34.950],
    [30.020, 34.750],
    [30.500, 34.580],
    [30.890, 34.370],
    [31.100, 34.270],
    [31.230, 34.270],
    [31.330, 34.250],
    [31.370, 34.310],
    [31.530, 34.490], // Gaza border N
    [31.590, 34.490],
    [31.680, 34.570], // Ashkelon coast
    [31.800, 34.630],
    [32.000, 34.720],
    [32.150, 34.790], // Tel Aviv
    [32.330, 34.840],
    [32.500, 34.880], // Netanya
    [32.700, 34.940],
    [32.820, 35.010], // Haifa
    [32.920, 35.070],
    [33.050, 35.100], // Nahariya
    [33.100, 35.110],
    [33.270, 35.200], // Rosh HaNikra / Lebanon border
    [33.290, 35.460],
    [33.310, 35.570],
    [33.290, 35.620], // Golan NW
    [33.250, 35.660],
    [33.100, 35.620],
    [33.000, 35.750],
    [32.910, 35.790],
    [32.830, 35.840], // Golan E / Syria border
    [32.750, 35.800],
    [32.640, 35.730],
    [32.560, 35.600],
    [32.480, 35.560],
    [32.370, 35.560], // Beit She'an
    [32.210, 35.560],
    [32.110, 35.540],
    [31.950, 35.500],
    [31.830, 35.510],
    [31.770, 35.520], // Jordan Valley
    [31.640, 35.470],
    [31.500, 35.470], // Dead Sea N
    [31.330, 35.480],
    [31.150, 35.400],
    [31.000, 35.400], // Dead Sea S
    [30.900, 35.400],
    [30.600, 35.290],
    [30.350, 35.150],
    [30.100, 35.050],
    [29.800, 34.970],
    [29.550, 34.960],
    [29.490, 34.893], // Close at Eilat
];

const borderStyle = {
    color: '#111',
    weight: 2.5,
    opacity: 0.7,
    fill: false,
    interactive: false,
};

L.polyline(ISRAEL_BORDER, borderStyle).addTo(mapCountry);
L.polyline(ISRAEL_BORDER, borderStyle).addTo(mapJerusalemWide);
L.polyline(ISRAEL_BORDER, borderStyle).addTo(mapJerusalem);

const legend = L.control({ position: "bottomleft" });
legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
        <div class="legend-item"><div class="legend-swatch" style="background:#e94560"></div> Active Alert</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#ff9800"></div> Warning</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#4ecca3"></div> All Clear</div>
    `;
    return div;
};
legend.addTo(mapCountry);

// ── Polygon Loading ────────────────────────────────────────────────────────────

function getPolygonCenter(coords) {
    let latSum = 0, lngSum = 0, count = 0;
    for (const ring of coords) {
        for (const pt of (Array.isArray(ring[0]) ? ring : [ring])) {
            if (Array.isArray(pt) && pt.length === 2) {
                latSum += pt[0];
                lngSum += pt[1];
                count++;
            }
        }
    }
    return count > 0 ? [latSum / count, lngSum / count] : null;
}

async function loadPolygons() {
    const resp = await fetch("/api/polygons");
    if (!resp.ok) { console.error('API error', resp.status); return; }
    polygonData = await resp.json();

    for (const [name, coords] of Object.entries(polygonData)) {
        const countryPoly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(mapCountry);
        const jerusalemWidePoly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(mapJerusalemWide);
        const jerusalemPoly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(mapJerusalem);

        const displayName = translateArea(name) || name;
        countryPoly.bindTooltip(displayName, { sticky: true, direction: "top" });
        jerusalemWidePoly.bindTooltip(displayName, { sticky: true, direction: "top" });
        jerusalemPoly.bindTooltip(displayName, { sticky: true, direction: "top" });

        areaLayers[name] = {
            country: countryPoly,
            jerusalemWide: jerusalemWidePoly,
            jerusalem: jerusalemPoly,
        };

        const center = getPolygonCenter(coords);
        if (center) areaCenters[name] = center;
    }
}

// ── Tooltip Helpers ─────────────────────────────────────────────────────────────

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

function updateAreaTooltip(name, alertInfo) {
    const layers = areaLayers[name];
    if (!layers) return;

    const englishName = translateArea(name);
    let content = englishName;

    if (alertInfo) {
        const label = translateTitle(alertInfo.title) || CATEGORY_LABELS[alertInfo.category] || 'Alert';
        const presumedStr = alertInfo.presumed ? ' (presumed)' : '';
        const ageStr = alertInfo.alertStartTime ? formatAlertAge(alertInfo.alertStartTime) : '';

        content = `<b>${englishName}</b><br>${label}${presumedStr}`;
        if (ageStr) content += `<br>${ageStr}`;
    }

    layers.country.setTooltipContent(content);
    layers.jerusalemWide.setTooltipContent(content);
    layers.jerusalem.setTooltipContent(content);
}

function resetAreaTooltip(name) {
    const layers = areaLayers[name];
    if (!layers) return;
    const content = translateArea(name);
    layers.country.setTooltipContent(content);
    layers.jerusalemWide.setTooltipContent(content);
    layers.jerusalem.setTooltipContent(content);
}

// ── Alert Processing ───────────────────────────────────────────────────────────

function setAreaStyle(name, color, fillOpacity) {
    const layers = areaLayers[name];
    if (!layers) return;

    const style = {
        color: color === "transparent" ? "transparent" : color,
        weight: color === "transparent" ? 0 : 2,
        fillColor: color,
        fillOpacity: fillOpacity,
    };

    layers.country.setStyle(style);
    layers.jerusalemWide.setStyle(style);
    layers.jerusalem.setStyle(style);

    if (color !== "transparent") {
        layers.country.bringToFront();
        layers.jerusalemWide.bringToFront();
        layers.jerusalem.bringToFront();
    }
}

function flashArea(name) {
    const layers = areaLayers[name];
    if (!layers) return;

    let on = true;
    const interval = setInterval(() => {
        const opacity = on ? 0.75 : 0.2;
        layers.country.setStyle({ fillOpacity: opacity });
        layers.jerusalemWide.setStyle({ fillOpacity: opacity });
        layers.jerusalem.setStyle({ fillOpacity: opacity });
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

// ── Alert History Feed ────────────────────────────────────────────────────────

function addToHistory(area, category, title, alert_type) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jerusalem', hour12: false,
        hour: '2-digit', minute: '2-digit',
    });

    alertHistory.unshift({
        time: timeStr,
        area: area,
        category: category,
        label: (alert_type === 'test' ? 'TEST ' : '') + (translateTitle(title) || CATEGORY_LABELS[category] || `Cat ${category}`),
        title: title,
        alert_type: alert_type,
    });

    if (alertHistory.length > MAX_HISTORY) {
        alertHistory.length = MAX_HISTORY;
    }
}

function addGroupedToHistory(areas, category, label) {
    if (areas.length === 0) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jerusalem', hour12: false,
        hour: '2-digit', minute: '2-digit',
    });

    alertHistory.unshift({
        time: timeStr,
        area: areas[0],
        areas: areas,
        category: category,
        label: label,
        title: '',
        grouped: true,
    });

    if (alertHistory.length > MAX_HISTORY) {
        alertHistory.length = MAX_HISTORY;
    }
}

function renderAlertFeed() {
    const feed = document.getElementById('alert-feed');
    if (!feed) return;

    if (alertHistory.length === 0) {
        feed.innerHTML = '<div class="no-alerts">No recent alerts</div>';
        return;
    }

    feed.innerHTML = alertHistory.map(entry => {
        const effectiveCat = (entry.category !== 13 && isShelterInstruction(entry.title)) ? 13 : entry.category;
        const catClass = effectiveCat === 13 ? 'cat-13' : effectiveCat === 14 ? 'cat-14' : '';

        // Grouped entry (e.g. "All Clear — Bnei Brak (+19 areas)")
        if (entry.grouped && entry.areas && entry.areas.length > 1) {
            const firstName = translateArea(entry.areas[0]);
            const extra = entry.areas.length - 1;
            const tooltip = entry.areas.map(a => escapeAttr(translateArea(a))).join('&#10;');
            return `<div class="alert-item" title="${tooltip}">
                <span class="alert-time">${entry.time}</span>
                <span class="alert-type ${catClass}">${escapeHtml(entry.label)}</span>
                <div class="alert-area">${escapeHtml(firstName)} <span class="alert-region">(+${extra} areas)</span></div>
            </div>`;
        }

        const regionHtml = getRegion(entry.area) ? ` <span class="alert-region">(${escapeHtml(getRegion(entry.area))})</span>` : '';
        return `<div class="alert-item">
            <span class="alert-time">${entry.time}</span>
            <span class="alert-type ${catClass}">${escapeHtml(entry.label)}</span>
            <div class="alert-area">${escapeHtml(translateArea(entry.area))}${regionHtml}</div>
        </div>`;
    }).join('');
}

function processAlerts(alerts) {
    const newAlerts = new Map();

    for (const alert of alerts) {
        let { data: area, category, title, alertDate, alert_type, alertStartTime, presumed } = alert;
        // Shelter instructions (e.g. "leave shelter, stay nearby") may arrive
        // with wrong category (e.g. 10). Remap to 13 (all-clear).
        if (category !== 13 && isShelterInstruction(title)) {
            category = 13;
        }
        // Don't let all-clear (cat 13) overwrite a pre-warning (cat 14).
        // All-clear is for the previous event; pre-warning is about incoming alerts.
        const existing = newAlerts.get(area);
        if (existing && existing.category === 14 && category === 13) {
            continue;
        }
        newAlerts.set(area, { category, title, alertDate, alert_type, alertStartTime, presumed });
    }

    // Check if local area alert has cleared — announce all-clear via TTS
    if (localAlertActive && !newAlerts.has(LOCAL_AREA)) {
        hideLocalAlert();
        speakAlert('All clear. The event in your area has concluded.');
    }

    // Track new areas for history feed
    const newAreas = [];

    for (const [area, info] of currentAlerts) {
        if (!newAlerts.has(area)) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.6);
            resetAreaTooltip(area);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            areaTimers[area] = setTimeout(() => {
                setAreaStyle(area, "transparent", 0);
                delete areaTimers[area];
            }, GREEN_DURATION);
        }
    }

    for (const [area, info] of newAlerts) {
        const color = CATEGORY_COLORS[info.category] || "#e94560";
        const isNew = !currentAlerts.has(area);

        if (isNew) {
            newAreas.push({ area, category: info.category, title: info.title, alert_type: info.alert_type });
        }

        if (info.category === 13) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.6);
            resetAreaTooltip(area);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            areaTimers[area] = setTimeout(() => {
                setAreaStyle(area, "transparent", 0);
                delete areaTimers[area];
            }, GREEN_DURATION);

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('allclear', info.title);
            }
        } else if (info.category === 14) {
            stopFlash(area);
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, "#e65100", 0.65);
            updateAreaTooltip(area, info);

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('warning', info.title);
            }
        } else {
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, color, 0.75);
            if (!info.presumed) {
                flashArea(area);
            }
            updateAreaTooltip(area, info);

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('red', info.title);
            }
        }
    }

    // Track areas that just cleared (were active/warning, now gone entirely)
    const clearedAreas = [];
    for (const [area, info] of currentAlerts) {
        if (!newAlerts.has(area) && info.category !== 13) {
            clearedAreas.push(area);
        }
    }

    currentAlerts = newAlerts;

    // Add new alerts to history feed — group by category
    const byCategory = {};
    for (const entry of newAreas) {
        const effectiveCat = (entry.category !== 13 && isShelterInstruction(entry.title)) ? 13 : entry.category;
        const label = (entry.alert_type === 'test' ? 'TEST ' : '') + (translateTitle(entry.title) || CATEGORY_LABELS[effectiveCat] || `Cat ${effectiveCat}`);
        const key = `${effectiveCat}|${label}`;
        if (!byCategory[key]) byCategory[key] = { category: effectiveCat, label, areas: [] };
        byCategory[key].areas.push(entry.area);
    }

    let historyChanged = false;

    for (const group of Object.values(byCategory)) {
        if (group.areas.length >= 3) {
            addGroupedToHistory(group.areas, group.category, group.label);
        } else {
            for (const area of group.areas) {
                addToHistory(area, group.category, group.label, '');
            }
        }
        historyChanged = true;
    }

    // Add implicit clears as grouped entry
    if (clearedAreas.length > 0) {
        if (clearedAreas.length >= 3) {
            addGroupedToHistory(clearedAreas, 13, 'All Clear');
        } else {
            for (const area of clearedAreas) {
                addToHistory(area, 13, 'האירוע הסתיים', '');
            }
        }
        historyChanged = true;
    }

    if (historyChanged) {
        renderAlertFeed();
    }

    // TTS for nationwide alerts (excludes local area which has its own TTS)
    if (newAreas.length > 0 && isSpeechEnabled()) {
        const nonLocalNew = newAreas.filter(e => e.area !== LOCAL_AREA && e.category !== 13 && e.category !== 14);
        if (nonLocalNew.length > 0) {
            const areaNames = nonLocalNew.slice(0, 5).map(e => translateArea(e.area)).join(', ');
            const more = nonLocalNew.length > 5 ? ` and ${nonLocalNew.length - 5} more` : '';
            const msg = `${nonLocalNew.length} alert${nonLocalNew.length > 1 ? 's' : ''} across Israel, including ${areaNames}${more}.`;
            // Delay to avoid overlapping with local area TTS
            setTimeout(() => speakAlert(msg), localAlertActive ? 6000 : 500);
        }
        // TTS for all-clear events nationwide
        const allClearNew = newAreas.filter(e => e.category === 13);
        if (allClearNew.length > 0 && nonLocalNew.length === 0) {
            const clearNames = allClearNew.slice(0, 3).map(e => translateArea(e.area)).join(', ');
            speakAlert(`All clear in ${clearNames}.`);
        }
    }

    // Update monitoring status
    const monStatus = document.getElementById('monitoring-status');
    if (newAlerts.has(LOCAL_AREA)) {
        const localInfo = newAlerts.get(LOCAL_AREA);
        if (localInfo.category !== 13) {
            monStatus.textContent = translateTitle(localInfo.title) || CATEGORY_LABELS[localInfo.category] || localInfo.title;
            monStatus.style.color = CATEGORY_COLORS[localInfo.category] || '#e94560';
        } else {
            monStatus.textContent = 'All clear';
            monStatus.style.color = '#7eddb8';
        }
    } else {
        monStatus.textContent = 'All clear';
        monStatus.style.color = '#7eddb8';
    }

    // Update floating alert counter (red + warning, excludes all-clear/drills)
    updateHeaderCounter(newAlerts);

    // Auto-zoom country map to active alerts
    autoZoomToAlerts(newAlerts);

    // Update the alert flash bar
    updateFlashBar(newAlerts);
}

// ── Auto-Zoom ──────────────────────────────────────────────────────────────

let mapIsAutoZoomed = false;
const MAP_DEFAULT_CENTER = ISRAEL_CENTER;
const MAP_DEFAULT_ZOOM = 8.5;

function autoZoomToAlerts(alerts) {
    // Skip auto-zoom when user is manually navigating the map
    if (userInteractedWithMap) return;

    const activeAreas = [];
    for (const [area, info] of alerts) {
        if (info.category !== 13 && info.category !== 14 && info.category < 15) {
            if (areaCenters[area]) activeAreas.push(areaCenters[area]);
        }
    }

    if (activeAreas.length > 0) {
        const bounds = L.latLngBounds(activeAreas);
        // Pad bounds so polygons aren't at the edge
        mapCountry.fitBounds(bounds.pad(0.5), { maxZoom: 12, animate: true, duration: 0.8 });
        mapIsAutoZoomed = true;
    } else if (mapIsAutoZoomed) {
        // Return to default view when alerts clear
        mapCountry.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { animate: true, duration: 0.8 });
        mapIsAutoZoomed = false;
    }
}


// ── Alert Flash Bar ─────────────────────────────────────────────────────────

function updateFlashBar(alerts) {
    const bar = document.getElementById('alert-flash-bar');
    const label = document.getElementById('flashbar-label');
    const text = document.getElementById('flashbar-text');
    const count = document.getElementById('flashbar-count');
    if (!bar) return;

    bar.classList.remove('alert-active', 'warning-active', 'allclear-active');

    // Categorize active alerts (exclude drills 15-28)
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

    // Update severity indicator
    const severityEl = document.getElementById('severity-indicator');

    if (redAlerts.length > 0) {
        bar.classList.add('alert-active');
        // Group by type for "by type" display
        const byType = {};
        for (const a of redAlerts) {
            const typeLabel = translateTitle(a.title) || CATEGORY_LABELS[a.category] || 'Alert';
            byType[typeLabel] = (byType[typeLabel] || 0) + 1;
        }
        const typeSummary = Object.entries(byType).map(([t, n]) => `${t}: ${n}`).join(' · ');

        // Count alerts in user's local area
        const localCount = redAlerts.filter(a => a.area === LOCAL_AREA).length;
        const localText = localCount > 0 ? ` | Your area: ${localCount}` : '';

        label.textContent = 'ACTIVE ALERTS';
        text.textContent = typeSummary;
        count.textContent = `All Israel: ${redAlerts.length}${localText}`;
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

    // Update national severity level
    if (severityEl) {
        const severity = getSeverity(redAlerts.length);
        severityEl.textContent = `Severity: ${severity.label} (${redAlerts.length})`;
        severityEl.style.color = severity.color;
        severityEl.style.borderColor = severity.color;
    }
}

// ── Header Alert Counter ──────────────────────────────────────────────────

function updateHeaderCounter(alerts) {
    const counter = document.getElementById('geodash-alert-counter');
    const textEl = document.getElementById('geodash-alert-counter-text');
    const dropdown = document.getElementById('geodash-alert-dropdown');
    if (!counter || !textEl) return;

    // Count red alerts and warnings (exclude all-clear cat 13 and drills 15+)
    const redAlerts = [];
    const warnings = [];
    for (const [area, info] of alerts) {
        if (info.category >= 15 || info.category === 13) continue;
        if (info.category === 14) {
            warnings.push({ area, title: info.title });
        } else {
            redAlerts.push({ area, title: info.title, category: info.category });
        }
    }

    const totalCount = redAlerts.length + warnings.length;

    counter.classList.remove('quiet', 'active-red', 'active-warning', 'has-alerts');

    if (redAlerts.length > 0) {
        counter.classList.add('active-red', 'has-alerts');
        textEl.textContent = `${totalCount} ALERT${totalCount !== 1 ? 'S' : ''}`;
    } else if (warnings.length > 0) {
        counter.classList.add('active-warning', 'has-alerts');
        textEl.textContent = `${warnings.length} WARNING${warnings.length !== 1 ? 'S' : ''}`;
    } else {
        counter.classList.add('quiet');
        textEl.textContent = '0 ALERTS';
    }

    // Build dropdown breakdown by type
    if (dropdown) {
        if (totalCount === 0) {
            dropdown.innerHTML = '';
            document.getElementById('geodash-alert-counter-wrap')?.classList.remove('open');
        } else {
            let html = '<div class="alert-dropdown-header">Breakdown by type</div>';

            // Group red alerts by translated title
            if (redAlerts.length > 0) {
                const byType = {};
                for (const a of redAlerts) {
                    const label = translateTitle(a.title) || CATEGORY_LABELS[a.category] || 'Alert';
                    byType[label] = (byType[label] || 0) + 1;
                }
                for (const [type, count] of Object.entries(byType)) {
                    html += `<div class="alert-dropdown-row red-row">
                        <span class="alert-dropdown-type"><span class="alert-dropdown-dot red"></span>${escapeHtml(type)}</span>
                        <span class="alert-dropdown-count">${count}</span>
                    </div>`;
                }
            }

            // Group warnings by translated title
            if (warnings.length > 0) {
                const byType = {};
                for (const w of warnings) {
                    const label = translateTitle(w.title) || 'Pre-Warning';
                    byType[label] = (byType[label] || 0) + 1;
                }
                for (const [type, count] of Object.entries(byType)) {
                    html += `<div class="alert-dropdown-row warning-row">
                        <span class="alert-dropdown-type"><span class="alert-dropdown-dot orange"></span>${escapeHtml(type)}</span>
                        <span class="alert-dropdown-count">${count}</span>
                    </div>`;
                }
            }

            dropdown.innerHTML = html;
        }
    }
}

// Toggle dropdown on click
(function initHeaderCounterToggle() {
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('geodash-alert-counter-wrap');
        const counter = document.getElementById('geodash-alert-counter');
        if (!wrap || !counter) return;

        if (counter.contains(e.target) && counter.classList.contains('has-alerts')) {
            wrap.classList.toggle('open');
        } else if (!wrap.contains(e.target)) {
            wrap.classList.remove('open');
        }
    });
})();

// escapeHtml provided by components.js

// ── Polling ────────────────────────────────────────────────────────────────────

async function pollAlerts() {
    const hfcDot = document.getElementById("hfc-dot");

    try {
        const resp = await fetch("/api/alerts");
        if (!resp.ok) { console.error('API error', resp.status); return; }
        const data = await resp.json();
        cache_alerts_raw = data;

        processAlerts(data);

        if (hfcDot) {
            hfcDot.classList.add("flash");
            setTimeout(() => hfcDot.classList.remove("flash"), 600);
        }
    } catch (err) {
        console.error("Poll error:", err);
    }
}

// ── Init ───────────────────────────────────────────────────────────────────────

function getEnglishName(hebrewArea) {
    const match = AREA_OPTIONS.find(a => a.he === hebrewArea);
    return match ? match.en : hebrewArea;
}

function buildAreaSelector() {
    const container = document.getElementById("area-selector");
    if (!container) return;

    container.innerHTML = "";
    for (let i = 0; i < AREA_OPTIONS.length; i++) {
        const opt = AREA_OPTIONS[i];
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "local-area";
        radio.id = `area-${i}`;
        radio.value = opt.he;
        radio.checked = opt.he === LOCAL_AREA;

        const label = document.createElement("label");
        label.htmlFor = `area-${i}`;
        label.textContent = opt.en;

        radio.addEventListener("change", () => {
            LOCAL_AREA = opt.he;
            localStorage.setItem("geodash-local-area", opt.he);
            // Update area name display
            const areaName = document.getElementById('monitoring-area-name');
            if (areaName) areaName.textContent = `Jerusalem — ${opt.en}`;
            // Update monitoring status immediately
            const monStatus = document.getElementById('monitoring-status');
            monStatus.textContent = 'All clear';
            monStatus.style.color = '#7eddb8';
            // Re-evaluate current alerts for the new area
            if (cache_alerts_raw.length > 0) {
                processAlerts(cache_alerts_raw);
            }
        });

        container.appendChild(radio);
        container.appendChild(label);
    }
}

async function init() {
    await Promise.all([loadTranslations(), loadAreaRegions()]);
    buildAreaSelector();

    // Set initial monitoring area name and status
    const areaNameEl = document.getElementById('monitoring-area-name');
    if (areaNameEl) {
        areaNameEl.textContent = `Jerusalem — ${getEnglishName(LOCAL_AREA)}`;
    }
    const monStatus = document.getElementById('monitoring-status');
    if (monStatus) {
        monStatus.textContent = 'All clear';
    }

    await loadPolygons();
    await pollAlerts();

    // Force Leaflet to recalculate map sizes after everything loads
    const resizeMaps = () => {
        mapCountry.invalidateSize();
        mapJerusalemWide.invalidateSize();
        mapJerusalem.invalidateSize();
    };
    resizeMaps();
    setTimeout(resizeMaps, 100);
    setTimeout(resizeMaps, 500);
    setTimeout(resizeMaps, 1500);
    setTimeout(resizeMaps, 3000);
    window.addEventListener('resize', resizeMaps);
    setInterval(pollAlerts, POLL_INTERVAL);

    // Load recent history from API — deduplicate and group by time+category
    try {
        const resp = await fetch("/api/alert-log?minutes=4320");
        if (resp.ok) {
            const history = await resp.json();
            // history is newest-first from API; reverse to process oldest-first
            const sorted = history.slice(0, 500).reverse();
            // Track last seen category per area to collapse repeated polls
            const lastSeen = new Map();
            const deduped = [];
            for (const entry of sorted) {
                const key = `${entry.area}|${entry.category}`;
                if (lastSeen.has(key)) {
                    const prev = lastSeen.get(key);
                    const gap = new Date(entry.ts) - new Date(prev.ts);
                    if (gap < 120000) { // within 2 min = same event
                        lastSeen.set(key, entry);
                        continue;
                    }
                }
                lastSeen.set(key, entry);
                deduped.push(entry);
            }

            // Group entries by minute + category for compact display
            const groups = [];
            for (const entry of deduped) {
                const ts = new Date(entry.ts);
                const timeStr = ts.toLocaleTimeString('en-GB', {
                    timeZone: 'Asia/Jerusalem', hour12: false,
                    hour: '2-digit', minute: '2-digit',
                });
                const effectiveCat = (entry.category !== 13 && isShelterInstruction(entry.title)) ? 13 : entry.category;
                const label = translateTitle(entry.title) || CATEGORY_LABELS[effectiveCat] || `Cat ${effectiveCat}`;
                const groupKey = `${timeStr}|${effectiveCat}|${label}`;

                const last = groups.length > 0 ? groups[groups.length - 1] : null;
                if (last && last.groupKey === groupKey) {
                    last.areas.push(entry.area);
                } else {
                    groups.push({
                        groupKey,
                        time: timeStr,
                        category: effectiveCat,
                        label,
                        title: entry.title,
                        areas: [entry.area],
                        area: entry.area,
                    });
                }
            }

            for (const group of groups) {
                if (group.areas.length >= 2) {
                    addGroupedToHistory(group.areas, group.category, group.label);
                } else {
                    alertHistory.push({
                        time: group.time,
                        area: group.area,
                        category: group.category,
                        label: group.label,
                        title: group.title,
                    });
                }
            }
            // Sort newest first
            alertHistory.sort((a, b) => b.time > a.time ? 1 : -1);
            if (alertHistory.length > MAX_HISTORY) alertHistory.length = MAX_HISTORY;
            renderAlertFeed();
        }
    } catch (e) {
        console.error("Failed to load alert history:", e);
    }

    document.addEventListener('click', () => { getAudioCtx(); }, { once: true });

    // ── News Ticker ─────────────────────────────────────────────────────────
    initNewsTicker();

    // ── Auto-refresh on new deployment ───────────────────────────────────────
    initVersionChecker();
}

// ── News Ticker ─────────────────────────────────────────────────────────────

let tickerArticles = [];
let tickerIndex = 0;
let tickerTimer = null;
const TICKER_INTERVAL = 15000; // 15 seconds
const TICKER_NEWS_POLL = 600000; // 10 minutes

function getTickerSourceClass(source) {
    if (!source) return 'other';
    const s = source.toLowerCase();
    if (s.includes('times of israel') || s.includes('toi')) return 'toi';
    if (s.includes('jns')) return 'jns';
    return 'other';
}

function getTickerSourceLabel(source) {
    if (!source) return '';
    const s = source.toLowerCase();
    if (s.includes('times of israel')) return 'TOI';
    if (s.includes('jns')) return 'JNS';
    return source;
}

async function fetchTickerNews() {
    try {
        const resp = await fetch('/api/news');
        if (!resp.ok) return;
        const articles = await resp.json();
        if (articles && articles.length > 0) {
            articles.sort((a, b) => {
                const da = a.pubDate ? new Date(a.pubDate) : new Date(0);
                const db = b.pubDate ? new Date(b.pubDate) : new Date(0);
                return db - da;
            });
            tickerArticles = articles;
        }
    } catch (e) {
        console.warn('Ticker news fetch error:', e);
    }
}

function showTickerItem() {
    if (tickerArticles.length === 0) return;

    const item = document.getElementById('ticker-item');
    if (!item) return;

    // Fade out
    item.classList.remove('visible');

    setTimeout(() => {
        const article = tickerArticles[tickerIndex % tickerArticles.length];
        const srcClass = getTickerSourceClass(article.source);
        const srcLabel = getTickerSourceLabel(article.source);
        const timeAgo = relativeTime(article.pubDate);

        const link = article.link ? `<a href="${escapeAttr(article.link)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>` : escapeHtml(article.title);

        item.innerHTML = `
            <span class="ticker-headline">${link}</span>
            ${srcLabel ? `<span class="ticker-source ${srcClass}">${escapeHtml(srcLabel)}</span>` : ''}
            <span class="ticker-time">${escapeHtml(timeAgo)}</span>
        `;

        // Fade in
        item.classList.add('visible');
        tickerIndex++;
    }, 800); // Wait for fade-out transition
}

function initNewsTicker() {
    fetchTickerNews().then(() => {
        showTickerItem();
        tickerTimer = setInterval(showTickerItem, TICKER_INTERVAL);
    });
    setInterval(fetchTickerNews, TICKER_NEWS_POLL);
}

// ── Auto-Refresh on New Deployment ────────────────────────────────────────────

let knownVersion = null;
const VERSION_CHECK_INTERVAL = 30000; // check every 30s

async function checkVersion() {
    try {
        const resp = await fetch('/api/version');
        if (!resp.ok) return;
        const data = await resp.json();
        if (knownVersion === null) {
            knownVersion = data.version;
        } else if (data.version !== knownVersion) {
            console.log(`New version detected (${knownVersion} → ${data.version}), reloading...`);
            window.location.reload();
        }
    } catch (e) {
        // ignore — server might be restarting
    }
}

function initVersionChecker() {
    checkVersion();
    setInterval(checkVersion, VERSION_CHECK_INTERVAL);
}

init();
