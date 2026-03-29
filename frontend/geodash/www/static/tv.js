/**
 * Red Alert Geodash — TV-optimized dashboard
 * Single Jerusalem map, ES5-compatible for Samsung Tizen
 * Deferred map init + invalidateSize for proper rendering
 */

// Auth check
fetch('/api/check-auth').then(function(r) {
    if (!r.ok) window.location.href = '/';
});

// Configuration
var POLL_INTERVAL = 3000;
var GREEN_DURATION = 60000;
var TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
var TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a>';
var JERUSALEM_CENTER = [31.75, 35.10];
var LOCAL_AREA = "\u05d9\u05e8\u05d5\u05e9\u05dc\u05d9\u05dd - \u05d3\u05e8\u05d5\u05dd";

var CATEGORY_COLORS = {
    1: "#e94560", 2: "#e94560", 3: "#e94560", 4: "#e94560",
    7: "#e94560", 8: "#e94560", 9: "#e94560", 10: "#e94560",
    11: "#e94560", 12: "#e94560",
    14: "#e65100",
    13: "#4ecca3"
};

// State
var polygonData = {};
var areaLayers = {};
var areaTimers = {};
var currentAlerts = {};
var localAlertActive = false;
var mapJerusalem = null;

// Clock
function updateClock() {
    var now = new Date();
    var israelTime = now.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Jerusalem',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
    var utcTime = now.toLocaleTimeString('en-GB', {
        timeZone: 'UTC',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('clock-local').textContent = israelTime;
    document.getElementById('clock-utc').textContent = utcTime;
}
setInterval(updateClock, 1000);
updateClock();

// Map init — deferred to ensure container has dimensions
function initMap() {
    mapJerusalem = L.map("map-jerusalem", {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true
    }).setView(JERUSALEM_CENTER, 10);

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(mapJerusalem);

    var legend = L.control({ position: "bottomleft" });
    legend.onAdd = function() {
        var div = L.DomUtil.create("div", "legend");
        div.innerHTML =
            '<div class="legend-item"><div class="legend-swatch" style="background:#e94560"></div> Active Alert</div>' +
            '<div class="legend-item"><div class="legend-swatch" style="background:#ff9800"></div> Pre-Warning</div>' +
            '<div class="legend-item"><div class="legend-swatch" style="background:#4ecca3"></div> All Clear</div>';
        return div;
    };
    legend.addTo(mapJerusalem);

    setTimeout(function() {
        mapJerusalem.invalidateSize();
    }, 500);
}

// Load polygons
function loadPolygons() {
    return fetch("/api/polygons").then(function(resp) {
        if (resp.status === 401) {
            window.location.href = '/';
            return {};
        }
        return resp.json();
    }).then(function(data) {
        if (!data) return;
        polygonData = data;
        var names = Object.keys(data);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var coords = data[name];
            var poly = L.polygon(coords, {
                color: "transparent",
                weight: 0,
                fillColor: "transparent",
                fillOpacity: 0
            }).addTo(mapJerusalem);
            poly.bindTooltip(name, { sticky: true, direction: "top" });
            areaLayers[name] = { poly: poly, _flashInterval: null };
        }
    });
}

// Area styling
function setAreaStyle(name, color, fillOpacity) {
    var layer = areaLayers[name];
    if (!layer) return;
    var style = {
        color: color === "transparent" ? "transparent" : color,
        weight: color === "transparent" ? 0 : 2,
        fillColor: color,
        fillOpacity: fillOpacity
    };
    layer.poly.setStyle(style);
    if (color !== "transparent") {
        layer.poly.bringToFront();
    }
}

function flashArea(name) {
    var layer = areaLayers[name];
    if (!layer) return;
    var on = true;
    var interval = setInterval(function() {
        var opacity = on ? 0.75 : 0.2;
        layer.poly.setStyle({ fillOpacity: opacity });
        on = !on;
    }, 500);
    layer._flashInterval = interval;
}

function stopFlash(name) {
    var layer = areaLayers[name];
    if (layer && layer._flashInterval) {
        clearInterval(layer._flashInterval);
        layer._flashInterval = null;
    }
}

// Local alert overlay
function showLocalAlert(type, title) {
    var overlay = document.getElementById('local-alert-overlay');
    var text = document.getElementById('local-alert-text');
    overlay.className = '';
    if (type === 'red') {
        text.textContent = 'RED ALERT \u2014 ' + title;
        overlay.className = 'active-red';
    } else if (type === 'warning') {
        text.textContent = 'WARNING \u2014 ' + title;
        overlay.className = 'active-warning';
    }
    localAlertActive = true;
}

function hideLocalAlert() {
    var overlay = document.getElementById('local-alert-overlay');
    overlay.className = '';
    localAlertActive = false;
}

// Ticker
function setTickerText(items) {
    var el = document.getElementById('ticker-text');
    if (!el) return;
    if (items.length > 0) {
        el.textContent = items.join('  |  ');
        el.className = 'ticker-text scrolling';
    } else {
        el.textContent = 'No alerts';
        el.className = 'ticker-text';
    }
}

// Process alerts
function processAlerts(alerts) {
    var newAlerts = {};
    var i, area, info;

    for (i = 0; i < alerts.length; i++) {
        newAlerts[alerts[i].data] = {
            category: alerts[i].category,
            title: alerts[i].title,
            alertDate: alerts[i].alertDate
        };
    }

    if (localAlertActive && !newAlerts[LOCAL_AREA]) {
        hideLocalAlert();
    }

    var oldAreas = Object.keys(currentAlerts);
    for (i = 0; i < oldAreas.length; i++) {
        area = oldAreas[i];
        if (!newAlerts[area]) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.6);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            (function(a) {
                areaTimers[a] = setTimeout(function() {
                    setAreaStyle(a, "transparent", 0);
                    delete areaTimers[a];
                }, GREEN_DURATION);
            })(area);
        }
    }

    var newAreas = Object.keys(newAlerts);
    var tickerItems = [];

    for (i = 0; i < newAreas.length; i++) {
        area = newAreas[i];
        info = newAlerts[area];
        var color = CATEGORY_COLORS[info.category] || "#e94560";
        var isNew = !currentAlerts[area];

        if (info.category === 13) {
            stopFlash(area);
            setAreaStyle(area, "#4ecca3", 0.6);
            if (areaTimers[area]) clearTimeout(areaTimers[area]);
            (function(a) {
                areaTimers[a] = setTimeout(function() {
                    setAreaStyle(a, "transparent", 0);
                    delete areaTimers[a];
                }, GREEN_DURATION);
            })(area);
        } else if (info.category === 14) {
            stopFlash(area);
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, "#e65100", 0.65);
            tickerItems.push(info.title + ' \u2014 ' + area);
            if (isNew && area === LOCAL_AREA) showLocalAlert('warning', info.title);
        } else {
            if (areaTimers[area]) { clearTimeout(areaTimers[area]); delete areaTimers[area]; }
            setAreaStyle(area, color, 0.75);
            flashArea(area);
            tickerItems.push(info.title + ' \u2014 ' + area);
            if (isNew && area === LOCAL_AREA) showLocalAlert('red', info.title);
        }
    }

    currentAlerts = newAlerts;
    setTickerText(tickerItems);

    var monStatus = document.getElementById('monitoring-status');
    if (newAlerts[LOCAL_AREA]) {
        var localInfo = newAlerts[LOCAL_AREA];
        if (localInfo.category !== 13) {
            monStatus.textContent = localInfo.title;
            monStatus.style.color = CATEGORY_COLORS[localInfo.category] || '#e94560';
        } else {
            monStatus.textContent = 'All clear';
            monStatus.style.color = '#4ecca3';
        }
    } else {
        monStatus.textContent = 'All clear';
        monStatus.style.color = '#4ecca3';
    }

    var activeCount = 0;
    for (i = 0; i < newAreas.length; i++) {
        var cat = newAlerts[newAreas[i]].category;
        if (cat !== 13 && cat !== 14) activeCount++;
    }
    var countEl = document.getElementById("alert-count");
    if (activeCount > 0) {
        countEl.textContent = activeCount + " active";
        countEl.className = "active";
    } else {
        countEl.className = "";
    }
}

// Poll
function pollAlerts() {
    var statusEl = document.getElementById("status-indicator");
    fetch("/api/alerts").then(function(resp) {
        if (resp.status === 401) {
            window.location.href = '/';
            return null;
        }
        return resp.json();
    }).then(function(data) {
        if (data === null) return;
        processAlerts(data);
        statusEl.className = "";
    }).catch(function(err) {
        console.error("Poll error:", err);
        statusEl.className = "error";
    });
}

// Init
function init() {
    var areaEl = document.getElementById("alert-area-display");
    if (areaEl) areaEl.textContent = LOCAL_AREA;

    initMap();

    loadPolygons().then(function() {
        mapJerusalem.invalidateSize();
        pollAlerts();
        setInterval(pollAlerts, POLL_INTERVAL);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
