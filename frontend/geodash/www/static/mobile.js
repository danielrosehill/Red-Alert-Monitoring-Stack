/**
 * Red Alert Geodash — Mobile-optimized map view
 * Full-screen map with auto-zoom to alerts, local area monitoring, and compact UI.
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
    "\u05d9\u05e8\u05d9 \u05e8\u05e7\u05d8\u05d5\u05ea \u05d5\u05d8\u05d9\u05dc\u05d9\u05dd": "Rockets",
    "\u05d7\u05d3\u05d9\u05e8\u05ea \u05db\u05dc\u05d9 \u05d8\u05d9\u05e1 \u05e2\u05d5\u05d9\u05df": "UAV",
    "\u05d7\u05d3\u05d9\u05e8\u05ea \u05db\u05dc\u05d9 \u05d8\u05d9\u05e1": "Aircraft Intrusion",
    "\u05d7\u05d3\u05d9\u05e8\u05ea \u05de\u05d7\u05d1\u05dc\u05d9\u05dd": "Terrorist Infiltration",
    "\u05e8\u05e2\u05d9\u05d3\u05ea \u05d0\u05d3\u05de\u05d4": "Earthquake",
    "\u05e6\u05d5\u05e0\u05d0\u05de\u05d9": "Tsunami",
    "\u05d7\u05d5\u05de\u05e8\u05d9\u05dd \u05de\u05e1\u05d5\u05db\u05e0\u05d9\u05dd": "Hazardous Materials",
    "\u05d0\u05d9\u05e8\u05d5\u05e2 \u05e8\u05d3\u05d9\u05d5\u05dc\u05d5\u05d2\u05d9": "Radiological Event",
    "\u05d4\u05ea\u05e8\u05e2\u05ea \u05e7\u05d3\u05dd": "Pre-Warning",
    "\u05d9\u05e8\u05d9 \u05e8\u05e7\u05d8\u05d5\u05ea": "Rocket Fire",
    "\u05d8\u05d9\u05dc \u05d1\u05dc\u05d9\u05e1\u05d8\u05d9": "Ballistic Missile",
    "\u05db\u05dc\u05d9 \u05d8\u05d9\u05e1 \u05e2\u05d5\u05d9\u05df": "UAV",
    "\u05d4\u05d9\u05db\u05e0\u05e1\u05d5 \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df": "Enter Protected Space",
    "\u05d4\u05d9\u05db\u05e0\u05e1 \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df": "Enter Protected Space",
    "\u05d4\u05d2\u05d9\u05e2\u05d5 \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df": "Reach Protected Space",
    "\u05d4\u05ea\u05e8\u05d7\u05e7\u05d5 \u05de\u05d4\u05d7\u05d5\u05e3": "Move Away From Shore",
    "\u05e1\u05d9\u05d5\u05dd \u05e9\u05d4\u05d9\u05d9\u05d4 \u05d1\u05e1\u05de\u05d9\u05db\u05d5\u05ea \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df": "End Shelter Proximity",
    "\u05d9\u05e9 \u05dc\u05e9\u05d4\u05d5\u05ea \u05d1\u05e1\u05de\u05d9\u05db\u05d5\u05ea \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df": "Stay Near Protected Space",
    "\u05e0\u05d9\u05ea\u05df \u05dc\u05e6\u05d0\u05ea \u05de\u05d4\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df \u05d0\u05da \u05d9\u05e9 \u05dc\u05d4\u05d9\u05e9\u05d0\u05e8 \u05d1\u05e7\u05e8\u05d1\u05ea\u05d5": "May Leave Shelter - Stay Nearby",
    "\u05de\u05d2\u05df \u05d0\u05da \u05d9\u05e9 \u05dc\u05d4\u05d9\u05e9\u05d0\u05e8 \u05d1\u05e7\u05e8\u05d1\u05ea\u05d5": "Shield - Stay Nearby",
    "\u05d1\u05d3\u05e7\u05d5\u05ea \u05d4\u05e7\u05e8\u05d5\u05d1\u05d5\u05ea \u05e6\u05e4\u05d5\u05d9\u05d5\u05ea \u05dc\u05d4\u05ea\u05e7\u05d1\u05dc \u05d4\u05ea\u05e8\u05e2\u05d5\u05ea \u05d1\u05d0\u05d6\u05d5\u05e8\u05da": "Early Warning - Alerts Expected Shortly",
    "\u05d4\u05d0\u05d9\u05e8\u05d5\u05e2 \u05d4\u05e1\u05ea\u05d9\u05d9\u05dd": "All Clear",
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

const AREA_OPTIONS = [
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd", en: "South" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05e8\u05db\u05d6", en: "Center" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05e6\u05e4\u05d5\u05df", en: "North" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05e2\u05e8\u05d1", en: "West" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05de\u05d6\u05e8\u05d7", en: "East" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05db\u05e4\u05e8 \u05e2\u05e7\u05d1", en: "Kafr Aqab" },
    { he: "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d0\u05d6\u05d5\u05e8 \u05ea\u05e2\u05e9\u05d9\u05d9\u05d4 \u05e2\u05d8\u05e8\u05d5\u05ea", en: "Atarot" },
];

const savedArea = localStorage.getItem("geodash-local-area");
let LOCAL_AREA = savedArea || AREA_OPTIONS[0].he;

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
    "\u05d4\u05d0\u05d9\u05e8\u05d5\u05e2 \u05d4\u05e1\u05ea\u05d9\u05d9\u05dd",
    "\u05e0\u05d9\u05ea\u05df \u05dc\u05e6\u05d0\u05ea \u05de\u05d4\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df \u05d0\u05da \u05d9\u05e9 \u05dc\u05d4\u05d9\u05e9\u05d0\u05e8 \u05d1\u05e7\u05e8\u05d1\u05ea\u05d5",
    "\u05e1\u05d9\u05d5\u05dd \u05e9\u05d4\u05d9\u05d9\u05d4 \u05d1\u05e1\u05de\u05d9\u05db\u05d5\u05ea \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df",
    "\u05d9\u05e9 \u05dc\u05e9\u05d4\u05d5\u05ea \u05d1\u05e1\u05de\u05d9\u05db\u05d5\u05ea \u05dc\u05de\u05e8\u05d7\u05d1 \u05d4\u05de\u05d5\u05d2\u05df",
    "\u05de\u05d2\u05df \u05d0\u05da \u05d9\u05e9 \u05dc\u05d4\u05d9\u05e9\u05d0\u05e8 \u05d1\u05e7\u05e8\u05d1\u05ea\u05d5",
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
let areaCenters = {};
let currentAlerts = new Map();
let localAlertActive = false;
let localAlertMinTimer = null;
const LOCAL_ALERT_MIN_DURATION = 30000;
let audioCtx = null;

// ── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
    const now = new Date();
    const cl = document.getElementById('clock-local');
    if (cl) cl.textContent = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit', minute: '2-digit',
    });
}
updateClock();
setInterval(updateClock, 1000);

// ── Nav Drawer ──────────────────────────────────────────────────────────────

document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('nav-drawer-backdrop').classList.add('open');
});

document.getElementById('nav-drawer-backdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('nav-drawer-backdrop')) {
        document.getElementById('nav-drawer-backdrop').classList.remove('open');
    }
});

// ── Audio ────────────────────────────────────────────────────────────────────

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

function playAllClearTone() {
    if (!isAudioEnabled()) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const notes = [523, 659, 784];
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

// ── Local Alert Overlay ──────────────────────────────────────────────────────

function getEnglishName(hebrewArea) {
    const match = AREA_OPTIONS.find(a => a.he === hebrewArea);
    return match ? match.en : hebrewArea;
}

function showLocalAlert(type, title) {
    const overlay = document.getElementById('local-alert-overlay');
    const text = document.getElementById('local-alert-text');
    overlay.classList.remove('active-red', 'active-warning', 'active-allclear');

    const areaEn = getEnglishName(LOCAL_AREA);

    if (type === 'red') {
        text.textContent = `RED ALERT \u2014 ${translateTitle(title) || title}`;
        overlay.classList.add('active-red');
        playRedAlertTone();
        setTimeout(() => speakAlert(`Red alert. ${translateTitle(title) || title}. Jerusalem ${areaEn}. Take shelter immediately.`), 2500);
    } else if (type === 'warning') {
        text.textContent = `WARNING \u2014 ${translateTitle(title) || title}`;
        overlay.classList.add('active-warning');
        playWarningTone();
        setTimeout(() => speakAlert(`Warning. ${translateTitle(title) || title}. Jerusalem ${areaEn}. Be prepared.`), 1800);
    } else if (type === 'allclear') {
        text.textContent = `ALL CLEAR`;
        overlay.classList.add('active-allclear');
        playAllClearTone();
        setTimeout(() => speakAlert(`All clear. The event in Jerusalem ${areaEn} has concluded.`), 1000);
    }

    localAlertActive = true;

    if (localAlertMinTimer) clearTimeout(localAlertMinTimer);
    localAlertMinTimer = setTimeout(() => {
        localAlertMinTimer = null;
        if (!currentAlerts.has(LOCAL_AREA)) {
            hideLocalAlert();
        }
    }, LOCAL_ALERT_MIN_DURATION);

    // Vibrate if supported
    if (type === 'red' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 400]);
    } else if (type === 'warning' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
    }
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
    if (localAlertMinTimer) return;
    const overlay = document.getElementById('local-alert-overlay');
    overlay.classList.remove('active-red', 'active-warning', 'active-allclear');
    localAlertActive = false;
}

document.getElementById('local-alert-dismiss').addEventListener('click', dismissLocalAlert);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && localAlertActive) dismissLocalAlert();
});

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
        <div class="legend-item"><div class="legend-swatch" style="background:#e94560"></div> Active</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#ff9800"></div> Warning</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#4ecca3"></div> Clear</div>
    `;
    return div;
};
legend.addTo(map);

// Track user interaction to pause auto-zoom
let userInteractedWithMap = false;
let userInteractionTimer = null;
map.on('dragstart zoomstart', (e) => {
    if (e.originalEvent || e.type === 'dragstart') {
        userInteractedWithMap = true;
        if (userInteractionTimer) clearTimeout(userInteractionTimer);
        userInteractionTimer = setTimeout(() => {
            userInteractedWithMap = false;
        }, 90000); // 90s before resuming auto-zoom (shorter for mobile)
    }
});

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
        const poly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(map);
        const displayName = translateArea(name) || name;
        poly.bindTooltip(displayName, { sticky: true, direction: "top" });
        areaLayers[name] = poly;

        const center = getPolygonCenter(coords);
        if (center) areaCenters[name] = center;
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

    // Check if local area alert has cleared
    if (localAlertActive && !newAlerts.has(LOCAL_AREA)) {
        hideLocalAlert();
        speakAlert('All clear. The event in your area has concluded.');
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

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('allclear', info.title);
            }
        } else if (info.category === 14) {
            stopFlash(area);
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, "#ff9800", 0.45);
            updateTooltip(area, info);

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('warning', info.title);
            }
        } else {
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, color, 0.6);
            if (!info.presumed) {
                flashArea(area);
            }
            updateTooltip(area, info);

            if (isNew && area === LOCAL_AREA) {
                showLocalAlert('red', info.title);
            }
        }
    }

    currentAlerts = newAlerts;
    autoZoomToAlerts(newAlerts);
    updateFlashBar(newAlerts);
    updateAlertCount(newAlerts);
}

// ── Auto-Zoom ──────────────────────────────────────────────────────────────────

let mapIsAutoZoomed = false;

function autoZoomToAlerts(alerts) {
    if (userInteractedWithMap) return;

    const activeAreas = [];
    for (const [area, info] of alerts) {
        if (info.category !== 13 && info.category !== 14 && info.category < 15) {
            if (areaCenters[area]) activeAreas.push(areaCenters[area]);
        }
    }

    if (activeAreas.length > 0) {
        const bounds = L.latLngBounds(activeAreas);
        map.fitBounds(bounds.pad(0.5), { maxZoom: 12, animate: true, duration: 0.8 });
        mapIsAutoZoomed = true;
    } else if (mapIsAutoZoomed) {
        map.setView(ISRAEL_CENTER, 8, { animate: true, duration: 0.8 });
        mapIsAutoZoomed = false;
    }
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
        const typeSummary = Object.entries(byType).map(([t, n]) => `${t}: ${n}`).join(' | ');
        label.textContent = 'ALERT';
        text.textContent = typeSummary;
        count.textContent = `${redAlerts.length}`;
    } else if (warnings.length > 0) {
        bar.classList.add('warning-active');
        const areaNames = warnings.slice(0, 3).map(a => translateArea(a.area)).join(', ');
        const more = warnings.length > 3 ? ` +${warnings.length - 3}` : '';
        label.textContent = 'WARNING';
        text.textContent = areaNames + more;
        count.textContent = `${warnings.length}`;
    } else if (allClears.length > 0) {
        bar.classList.add('allclear-active');
        label.textContent = 'CLEAR';
        text.textContent = allClears.slice(0, 3).map(a => translateArea(a)).join(', ');
    } else {
        label.textContent = 'LIVE';
        text.textContent = 'No active alerts';
    }
}

function updateAlertCount(alerts) {
    const activeCount = [...alerts.values()].filter(
        a => a.category !== 13 && a.category !== 14 && a.category < 15
    ).length;

    const countEl = document.getElementById("alert-count");
    if (activeCount > 0) {
        countEl.textContent = `${activeCount} alert${activeCount > 1 ? 's' : ''}`;
        countEl.classList.add("active");
    } else {
        countEl.classList.remove("active");
    }
}

// ── Area Selector ──────────────────────────────────────────────────────────────

function buildAreaSelector() {
    const bar = document.getElementById('area-selector-bar');
    if (!bar) return;

    for (const opt of AREA_OPTIONS) {
        const btn = document.createElement('button');
        btn.className = 'area-btn' + (opt.he === LOCAL_AREA ? ' active' : '');
        btn.textContent = opt.en;
        btn.dataset.he = opt.he;

        btn.addEventListener('click', () => {
            LOCAL_AREA = opt.he;
            localStorage.setItem('geodash-local-area', opt.he);
            // Update active state
            bar.querySelectorAll('.area-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        bar.appendChild(btn);
    }
}

// ── Polling ────────────────────────────────────────────────────────────────────

async function pollAlerts() {
    const statusEl = document.getElementById("status-indicator");

    try {
        const resp = await fetch("/api/alerts");
        if (!resp.ok) { console.error('API error', resp.status); return; }
        const data = await resp.json();
        processAlerts(data);
        statusEl.classList.remove("error");
    } catch (err) {
        console.error("Poll error:", err);
        statusEl.classList.add("error");
    }
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
    await loadTranslations();
    buildAreaSelector();
    await loadPolygons();
    await pollAlerts();

    map.invalidateSize();
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 1000);
    window.addEventListener('resize', () => map.invalidateSize());
    setInterval(pollAlerts, POLL_INTERVAL);

    // Enable audio on first interaction
    document.addEventListener('click', () => { getAudioCtx(); }, { once: true });
    document.addEventListener('touchstart', () => { getAudioCtx(); }, { once: true });
}

init();
