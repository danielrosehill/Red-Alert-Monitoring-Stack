/**
 * Red Alert Geodash — History page with timeline playback
 */

// ── Configuration ──────────────────────────────────────────────────────────────

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
const ISRAEL_CENTER = [31.5, 35.0];
const HISTORY_MINUTES = 4320; // 3 days

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

const DEFAULT_STYLE = {
    color: "transparent",
    weight: 0,
    fillColor: "transparent",
    fillOpacity: 0,
};

// ── Translations ──────────────────────────────────────────────────────────────

let areaTranslations = {};

const TITLE_TRANSLATIONS = {
    "ירי רקטות וטילים": "Rockets",
    "חדירת כלי טיס עוין": "UAV",
    "חדירת כלי טיס": "Aircraft Intrusion",
    "חדירת מחבלים": "Terrorist Infiltration",
    "רעידת אדמה": "Earthquake",
    "צונאמי": "Tsunami",
    "חומרים מסוכנים": "Hazardous Materials",
    "אירוע חומרים מסוכנים": "Hazardous Materials Event",
    "אירוע רדיולוגי": "Radiological Event",
    "התרעת קדם": "Pre-Warning",
    "ירי רקטות": "Rocket Fire",
    "טיל בליסטי": "Ballistic Missile",
    "כלי טיס עוין": "UAV",
    "היכנסו למרחב המוגן": "Enter Protected Space",
    "...היכנסו למרחב המוגן": "Enter Protected Space",
    "היכנס למרחב המוגן": "Enter Protected Space",
    "...היכנס למרחב המוגן": "Enter Protected Space",
    "הגיעו למרחב המוגן": "Reach Protected Space",
    "התרחקו מהחוף": "Move Away From Shore",
    "מגן אך יש להישאר בקרבתו": "Shield - Stay Nearby",
    "...מגן אך יש להישאר בקרבתו": "Shield - Stay Nearby",
    "סיום שהייה בסמיכות למרחב המוגן": "End Shelter Proximity",
    "יש לשהות בסמיכות למרחב המוגן": "Stay Near Protected Space",
    "ניתן לצאת מהמרחב המוגן אך יש להישאר בקרבתו": "May Leave Shelter - Stay Nearby",
    "בדקות הקרובות צפויות להתקבל התרעות באזורך": "Early Warning - Alerts Expected Shortly",
    "האירוע הסתיים": "All Clear",
};

async function loadTranslations() {
    try {
        const resp = await fetch("/api/translations");
        if (resp.ok) areaTranslations = await resp.json();
    } catch (e) {
        console.warn("Could not load area translations:", e);
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

function buildLocalRegionAreas() {
    const savedArea = localStorage.getItem('geodash-local-area') || '';
    if (!savedArea || !areaRegions[savedArea]) {
        localRegionAreas = [];
        return;
    }
    const myRegion = areaRegions[savedArea].region_he;
    localRegionAreas = Object.keys(areaRegions).filter(
        a => areaRegions[a].region_he === myRegion
    );
}

function translateArea(hebrewName) {
    if (!hebrewName) return hebrewName;
    return areaTranslations[hebrewName] || hebrewName;
}

function translateTitle(hebrewTitle) {
    if (!hebrewTitle) return hebrewTitle;
    if (TITLE_TRANSLATIONS[hebrewTitle]) return TITLE_TRANSLATIONS[hebrewTitle];
    for (const [he, en] of Object.entries(TITLE_TRANSLATIONS)) {
        if (hebrewTitle.includes(he) || he.includes(hebrewTitle.replace('...', ''))) {
            return en;
        }
    }
    return hebrewTitle;
}

// ── State ──────────────────────────────────────────────────────────────────────

let polygonData = {};
let areaLayers = {};
let areaCenters = {};
let allEvents = [];       // full unfiltered dataset
let historyEvents = [];   // filtered view
let historyTimestamps = [];
let historyIndex = -1;
let currentAreaFilter = '';
let currentScope = 'all'; // 'all' or 'local'
let areaRegions = {};     // area → { region_he, region_en }
let localRegionAreas = []; // areas in the user's region

// Clock is handled by components.js renderHeader()

// ── Map ────────────────────────────────────────────────────────────────────────

const mapCountry = L.map("map-country", {
    zoomControl: true,
    attributionControl: false,
}).setView(ISRAEL_CENTER, 8);

L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(mapCountry);

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
    if (!resp.ok) return;
    polygonData = await resp.json();

    for (const [name, coords] of Object.entries(polygonData)) {
        const poly = L.polygon(coords, { ...DEFAULT_STYLE }).addTo(mapCountry);
        poly.bindTooltip(name, { sticky: true, direction: "top" });
        areaLayers[name] = poly;

        const center = getPolygonCenter(coords);
        if (center) areaCenters[name] = center;
    }
}

// ── Area Styling ───────────────────────────────────────────────────────────────

function setAreaStyle(name, color, fillOpacity) {
    const layer = areaLayers[name];
    if (!layer) return;
    layer.setStyle({
        color: color === "transparent" ? "transparent" : color,
        weight: color === "transparent" ? 0 : 2,
        fillColor: color,
        fillOpacity: fillOpacity,
    });
    if (color !== "transparent") layer.bringToFront();
}


// ── Area Filter ────────────────────────────────────────────────────────────────

function populateAreaFilter() {
    const select = document.getElementById('area-filter');
    // Get saved local area from settings
    const savedArea = localStorage.getItem('geodash-local-area') || '';

    // Collect unique areas from data
    const areas = new Set();
    for (const ev of allEvents) {
        areas.add(ev.area);
    }
    const sortedAreas = [...areas].sort((a, b) => translateArea(a).localeCompare(translateArea(b)));

    // Add "My Area" option if configured
    if (savedArea) {
        const opt = document.createElement('option');
        opt.value = savedArea;
        opt.textContent = `★ My Area (${translateArea(savedArea)})`;
        select.appendChild(opt);
    }

    for (const area of sortedAreas) {
        const opt = document.createElement('option');
        opt.value = area;
        opt.textContent = translateArea(area);
        select.appendChild(opt);
    }

    select.addEventListener('change', () => {
        currentAreaFilter = select.value;
        applyFilter();
    });
}

function applyFilter() {
    let filtered = allEvents;

    // Apply scope filter first
    if (currentScope === 'local' && localRegionAreas.length > 0) {
        const regionSet = new Set(localRegionAreas);
        filtered = filtered.filter(e => regionSet.has(e.area));
    }

    // Then apply specific area filter
    if (currentAreaFilter) {
        filtered = filtered.filter(e => e.area === currentAreaFilter);
    }

    historyEvents = filtered;
    rebuildTimeline();
}

function rebuildTimeline() {
    const countEl = document.getElementById('history-event-count');
    const slider = document.getElementById('timeline-slider');

    if (historyEvents.length === 0) {
        countEl.textContent = '0 events';
        document.getElementById('history-event-list').innerHTML =
            '<div class="no-data">No events for this filter</div>';
        slider.max = 0;
        slider.value = 0;
        // Clear map
        for (const name of Object.keys(areaLayers)) setAreaStyle(name, "transparent", 0);
        return;
    }

    const tsSet = new Set();
    for (const ev of historyEvents) tsSet.add(ev.ts.substring(0, 19));
    historyTimestamps = [...tsSet].sort();

    countEl.textContent = `${historyEvents.length} events`;

    slider.min = 0;
    slider.max = historyTimestamps.length - 1;
    slider.value = slider.max;
    document.getElementById('log-count').textContent = `${historyTimestamps.length} moments`;

    showHistoryMoment(historyTimestamps.length - 1);
}

// ── History Loading ────────────────────────────────────────────────────────────

async function loadHistoryEvents() {
    const container = document.getElementById('history-event-list');
    const countEl = document.getElementById('history-event-count');
    container.innerHTML = '<div class="no-data">Loading from database...</div>';

    try {
        const resp = await fetch(`/api/alert-log?minutes=${HISTORY_MINUTES}`);
        if (!resp.ok) { container.innerHTML = '<div class="no-data">Failed to load</div>'; return; }
        allEvents = await resp.json();

        if (allEvents.length === 0) {
            container.innerHTML = '<div class="no-data">No alert events in database</div>';
            return;
        }

        populateAreaFilter();
        historyEvents = [...allEvents];
        rebuildTimeline();
    } catch (err) {
        console.error('History load error:', err);
        container.innerHTML = '<div class="no-data">Error loading history</div>';
    }
}

function showHistoryMoment(index) {
    if (index < 0 || index >= historyTimestamps.length) return;
    historyIndex = index;

    const ts = historyTimestamps[index];
    const timeLabel = document.getElementById('timeline-time');

    try {
        const d = new Date(ts + 'Z');
        timeLabel.textContent = d.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Jerusalem', hour12: false,
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        timeLabel.textContent = ts.substring(11, 16);
    }

    document.getElementById('log-count').textContent = `${index + 1} / ${historyTimestamps.length}`;

    const eventsAtTime = historyEvents.filter(e => e.ts.startsWith(ts));

    // Clear map
    for (const name of Object.keys(areaLayers)) {
        setAreaStyle(name, "transparent", 0);
    }

    for (const ev of eventsAtTime) {
        const cat = ev.category;
        const color = CATEGORY_COLORS[cat] || "#e94560";
        if (cat === 13) {
            setAreaStyle(ev.area, "#4ecca3", 0.4);
        } else if (cat === 14) {
            setAreaStyle(ev.area, "#ff9800", 0.45);
        } else {
            setAreaStyle(ev.area, color, 0.6);
        }
    }

    renderHistoryEventList(index);
}

function renderHistoryEventList(highlightMomentIdx) {
    const container = document.getElementById('history-event-list');
    const currentTs = highlightMomentIdx >= 0 ? historyTimestamps[highlightMomentIdx] : null;

    let startIdx = 0;
    let endIdx = historyEvents.length;

    if (currentTs) {
        const centerEventIdx = historyEvents.findIndex(e => e.ts.startsWith(currentTs));
        if (centerEventIdx >= 0) {
            startIdx = Math.max(0, centerEventIdx - 40);
            endIdx = Math.min(historyEvents.length, centerEventIdx + 40);
        }
    } else {
        startIdx = Math.max(0, historyEvents.length - 80);
    }

    const html = [];
    for (let i = startIdx; i < endIdx; i++) {
        const ev = historyEvents[i];
        const evTs = ev.ts.substring(0, 19);
        const isActive = currentTs && evTs === currentTs;
        const catColor = CATEGORY_COLORS[ev.category] || '#e94560';

        let timeStr = '';
        try {
            const d = new Date(ev.ts);
            timeStr = d.toLocaleTimeString('en-GB', {
                timeZone: 'Asia/Jerusalem', hour12: false,
                hour: '2-digit', minute: '2-digit',
            });
        } catch {
            timeStr = evTs.substring(11, 16);
        }

        // Add date prefix if multi-day
        let datePrefix = '';
        try {
            const d = new Date(ev.ts);
            const day = d.toLocaleDateString('en-GB', {
                timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit',
            });
            datePrefix = `${day} `;
        } catch {}

        const areaDisplay = translateArea(ev.area);
        const titleDisplay = translateTitle(ev.title || '') || CATEGORY_LABELS[ev.category] || '';
        html.push(`<div class="history-event${isActive ? ' active' : ''}" data-ts="${escapeAttr(evTs)}">
            <span class="history-event-time">${datePrefix}${timeStr}</span>
            <span class="history-event-cat" style="background:${catColor}"></span>
            <span class="history-event-area">${escapeHtml(areaDisplay)}</span>
            <span class="history-event-title">${escapeHtml(titleDisplay)}</span>
        </div>`);
    }

    container.innerHTML = html.join('');

    container.querySelectorAll('.history-event').forEach(el => {
        el.addEventListener('click', () => {
            const ts = el.dataset.ts;
            const idx = historyTimestamps.indexOf(ts);
            if (idx >= 0) {
                document.getElementById('timeline-slider').value = idx;
                showHistoryMoment(idx);
            }
        });
    });

    const active = container.querySelector('.history-event.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
}

// escapeHtml and escapeAttr provided by components.js

// ── Init ───────────────────────────────────────────────────────────────────────

function setupScopeToggle() {
    const btnAll = document.getElementById('scope-all');
    const btnLocal = document.getElementById('scope-local');
    const scopeInfo = document.getElementById('scope-area-info');

    btnAll.addEventListener('click', () => {
        currentScope = 'all';
        btnAll.classList.add('active');
        btnLocal.classList.remove('active');
        scopeInfo.classList.remove('visible');
        applyFilter();
    });

    btnLocal.addEventListener('click', () => {
        currentScope = 'local';
        btnLocal.classList.add('active');
        btnAll.classList.remove('active');

        if (localRegionAreas.length > 0) {
            const savedArea = localStorage.getItem('geodash-local-area') || '';
            const regionInfo = areaRegions[savedArea];
            const regionName = regionInfo ? regionInfo.region_en : 'your region';
            scopeInfo.textContent = `Showing ${localRegionAreas.length} areas in ${regionName}`;
            scopeInfo.classList.add('visible');
        } else {
            scopeInfo.textContent = 'Set your area on the Live dashboard to use this filter';
            scopeInfo.classList.add('visible');
        }

        applyFilter();
    });
}

async function init() {
    setTimeout(() => { mapCountry.invalidateSize(); }, 100);

    try {
        await loadTranslations();
    } catch (e) { console.error('Failed to load translations:', e); }

    try {
        await loadAreaRegions();
        buildLocalRegionAreas();
    } catch (e) { console.error('Failed to load area regions:', e); }

    try {
        await loadPolygons();
    } catch (e) { console.error('Failed to load polygons:', e); }

    setupScopeToggle();

    await loadHistoryEvents();

    const slider = document.getElementById('timeline-slider');
    slider.addEventListener('input', () => {
        showHistoryMoment(parseInt(slider.value));
    });
}

init();
