/**
 * Red Alert Geodash — Shared header/footer components
 * Include this before page-specific scripts.
 */

// ── Shared CSS (injected into <head>) ──────────────────────────────────────

const COMPONENT_CSS = `
/* ── Header ──────────────────────────────────────────── */
.geodash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: clamp(6px, 0.6vh, 14px) clamp(12px, 1vw, 28px);
    background: #16213e;
    border-bottom: 2px solid #0f3460;
    flex-shrink: 0;
    gap: 12px;
}

.geodash-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
}

.geodash-header-icon {
    width: clamp(28px, 2.5vw, 48px);
    height: clamp(28px, 2.5vw, 48px);
    border-radius: 6px;
    flex-shrink: 0;
}

.geodash-header h1 {
    font-size: clamp(1.2rem, 1.4vw, 2rem);
    color: #7eddb8;
    margin: 0;
}

.geodash-nav {
    display: flex;
    gap: 2px;
    background: #0f3460;
    border-radius: 6px;
    padding: 2px;
}

.geodash-nav a {
    color: #ccd;
    padding: clamp(7px, 0.6vh, 14px) clamp(18px, 1.2vw, 32px);
    border-radius: 4px;
    font-size: clamp(0.88rem, 1vw, 1.4rem);
    font-weight: 700;
    cursor: pointer;
    letter-spacing: 1px;
    text-decoration: none;
    transition: all 0.2s;
    white-space: nowrap;
}

.geodash-nav a.active {
    background: #7eddb8;
    color: #1a1a2e;
}

.geodash-nav a:not(.active):hover {
    color: #fff;
}

.geodash-clocks {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    flex-shrink: 1;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
}

.geodash-clock-date-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    justify-content: flex-end;
    margin-bottom: 2px;
}

.geodash-clock-date {
    color: #889;
    font-size: clamp(0.72rem, 0.85vw, 1.1rem);
    font-weight: 600;
    white-space: nowrap;
}

.geodash-clock-hebrew {
    color: #7a8a6a;
    font-size: clamp(0.68rem, 0.8vw, 1rem);
    font-weight: 600;
    white-space: nowrap;
    direction: rtl;
}

.geodash-clock-shabbat {
    color: #c9a84c;
    font-size: clamp(0.65rem, 0.75vw, 0.95rem);
    font-weight: 600;
    white-space: nowrap;
}

.geodash-clock-separator {
    color: #334;
    font-size: 1.4rem;
    font-weight: 300;
    margin: 0 14px;
}

.geodash-clock-block.utc .geodash-clock-label {
    color: #2a7a4a;
}

.geodash-clock-block.utc .geodash-clock-time {
    color: #3a9a5a;
    font-size: clamp(1.4rem, 1.8vw, 2.6rem);
    font-weight: 600;
}

.geodash-clock-block {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-variant-numeric: tabular-nums;
}

.geodash-clock-label {
    color: #bbc;
    font-size: clamp(0.78rem, 0.9vw, 1.3rem);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
}

.geodash-clock-time {
    color: #7eddb8;
    font-size: clamp(2.2rem, 2.8vw, 4rem);
    font-weight: 800;
    letter-spacing: 2px;
}

.geodash-refresh-btn {
    font-size: 1.1rem;
}

.geodash-nav-separator {
    color: #334;
    font-size: 1.2rem;
    font-weight: 300;
    margin: 0 8px;
    user-select: none;
}

.geodash-ext-links {
    display: flex;
    gap: 4px;
}

.geodash-ext-link {
    color: #aab;
    font-size: clamp(0.82rem, 0.9vw, 1.3rem);
    font-weight: 600;
    padding: clamp(5px, 0.5vh, 12px) clamp(12px, 1vw, 24px);
    border-radius: 4px;
    text-decoration: none;
    border: 1px solid #1a3a6e;
    transition: all 0.2s;
    white-space: nowrap;
}

.geodash-ext-link:hover {
    color: #7eddb8;
    border-color: #7eddb8;
}

/* ── Header Dropdown Menus ────────────────────────────── */
.geodash-dropdown-wrap {
    position: relative;
}

.geodash-dropdown-btn {
    color: #aab;
    font-size: clamp(0.82rem, 0.9vw, 1.3rem);
    font-weight: 600;
    padding: clamp(5px, 0.5vh, 12px) clamp(10px, 0.8vw, 20px);
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #1a3a6e;
    background: none;
    transition: all 0.2s;
    white-space: nowrap;
}

.geodash-dropdown-btn:hover,
.geodash-dropdown-wrap.open .geodash-dropdown-btn {
    color: #7eddb8;
    border-color: #7eddb8;
}

.geodash-dropdown-menu {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 140px;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 6px;
    z-index: 3000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    overflow: hidden;
}

.geodash-dropdown-wrap.open .geodash-dropdown-menu {
    display: block;
}

.geodash-dropdown-menu a {
    display: block;
    padding: 8px 16px;
    color: #ccd;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 600;
    border-bottom: 1px solid #0f3460;
    transition: background 0.15s;
    white-space: nowrap;
}

.geodash-dropdown-menu a:last-child {
    border-bottom: none;
}

.geodash-dropdown-menu a:hover,
.geodash-dropdown-menu a.active {
    background: #0f3460;
    color: #7eddb8;
}

/* ── Fullscreen Button ─────────────────────────────────── */
.geodash-fullscreen-btn {
    color: #aab;
    font-size: clamp(0.82rem, 0.9vw, 1.3rem);
    font-weight: 600;
    padding: clamp(5px, 0.5vh, 12px) clamp(10px, 0.8vw, 20px);
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #1a3a6e;
    background: none;
    transition: all 0.2s;
    white-space: nowrap;
}

.geodash-fullscreen-btn:hover {
    color: #7eddb8;
    border-color: #7eddb8;
}

/* ── HFC Status (footer) ──────────────────────────────── */
.geodash-hfc-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #667;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.geodash-hfc-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #444;
    transition: background 0.15s;
}

.geodash-hfc-dot.flash {
    background: #6a9;
    box-shadow: 0 0 3px #6a9;
}

.geodash-tts-toggle {
    color: #aab;
    font-size: clamp(1.1rem, 1.3vw, 2rem);
    padding: clamp(5px, 0.5vh, 12px) clamp(10px, 0.8vw, 20px);
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid #1a3a6e;
    background: none;
    transition: all 0.2s;
    line-height: 1;
}

.geodash-tts-toggle:hover {
    border-color: #7eddb8;
}

.geodash-tts-toggle.tts-on {
    color: #7eddb8;
    border-color: #7eddb8;
}

.geodash-tts-toggle.tts-off {
    color: #665;
    opacity: 0.6;
}

/* ── Active Alert Counter (footer) ────────────────────── */
.geodash-alert-counter-wrap {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
}

.geodash-alert-counter {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 14px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 0.85rem;
    letter-spacing: 1px;
    text-transform: uppercase;
    white-space: nowrap;
    transition: all 0.3s;
    border: 1px solid transparent;
    cursor: default;
}

.geodash-alert-counter.has-alerts {
    cursor: pointer;
}

.geodash-alert-counter.quiet {
    background: rgba(126, 221, 184, 0.1);
    color: #7eddb8;
    border-color: rgba(126, 221, 184, 0.25);
}

.geodash-alert-counter.active-red {
    background: #e94560;
    color: #fff;
    border-color: #ff2244;
    animation: header-alert-pulse 1.5s infinite;
}

.geodash-alert-counter.active-warning {
    background: #ff9800;
    color: #fff;
    border-color: #ffb300;
}

.geodash-alert-counter .counter-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

.geodash-alert-counter.quiet .counter-dot {
    background: #7eddb8;
}

.geodash-alert-counter.active-red .counter-dot {
    background: #fff;
    animation: counter-dot-blink 0.8s infinite;
}

.geodash-alert-counter.active-warning .counter-dot {
    background: #fff;
}

.counter-chevron {
    font-size: 0.6em;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    margin-left: 2px;
}

.geodash-alert-counter.has-alerts .counter-chevron {
    opacity: 0.7;
}

.geodash-alert-counter-wrap.open .counter-chevron {
    transform: rotate(180deg);
}

/* ── Alert Dropdown ───────────────────────────────────── */
.geodash-alert-dropdown {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%) scaleY(0);
    transform-origin: bottom center;
    min-width: 260px;
    background: #16213e;
    border: 2px solid #0f3460;
    border-radius: 8px;
    margin-top: 6px;
    padding: 0;
    z-index: 2000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    transition: transform 0.2s ease, opacity 0.2s ease;
    opacity: 0;
    overflow: hidden;
}

.geodash-alert-counter-wrap.open .geodash-alert-dropdown {
    transform: translateX(-50%) scaleY(1);
    opacity: 1;
}

.alert-dropdown-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid #0f3460;
    font-size: clamp(0.82rem, 0.9vw, 1.2rem);
}

.alert-dropdown-row:last-child {
    border-bottom: none;
}

.alert-dropdown-type {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
}

.alert-dropdown-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.alert-dropdown-dot.red { background: #e94560; }
.alert-dropdown-dot.orange { background: #ff9800; }

.alert-dropdown-count {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 24px;
    text-align: right;
}

.alert-dropdown-row.red-row {
    color: #f0a0b0;
}

.alert-dropdown-row.warning-row {
    color: #ffc870;
}

.alert-dropdown-header {
    padding: 6px 16px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #667;
    background: rgba(15, 52, 96, 0.4);
    border-bottom: 1px solid #0f3460;
}

@keyframes header-alert-pulse {
    0%, 100% { background: #e94560; }
    50% { background: #c0243a; }
}

@keyframes counter-dot-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}

/* ── Footer ──────────────────────────────────────────── */
.geodash-footer {
    padding: 4px 16px 6px;
    border-top: 1px solid #0f3460;
    font-size: 0.7rem;
    color: #556;
    text-align: center;
    flex-shrink: 0;
    background: #16213e;
    direction: rtl;
}

.geodash-footer a {
    color: #667;
    text-decoration: none;
}

.geodash-footer .motto {
    color: #7eddb8;
    font-weight: 700;
    font-size: 0.85rem;
    letter-spacing: 1px;
}

.geodash-footer-row {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
}

.geodash-footer-meta {
    direction: rtl;
}

.geodash-footer-credit {
    margin-top: 3px;
    font-size: 0.8rem;
    color: #667;
    direction: ltr;
    letter-spacing: 0.3px;
}

.geodash-footer-credit a {
    color: #7eddb8;
    text-decoration: none;
    font-weight: 600;
}

.geodash-footer-credit a:hover {
    text-decoration: underline;
}
`;

// ── Inject CSS ─────────────────────────────────────────────────────────────

(function injectComponentCSS() {
    const style = document.createElement('style');
    style.textContent = COMPONENT_CSS;
    document.head.appendChild(style);
})();

// ── Header Component ───────────────────────────────────────────────────────

function renderHeader(activePage) {
    const sep = '<span class="geodash-nav-separator">|</span>';

    // Pages
    const pageLinks = [
        { href: '/', label: 'HOME', id: 'live' },
        { href: '/map', label: 'MAP', id: 'map' },
        { href: '/history', label: 'HISTORY', id: 'history' },
        { href: '/news', label: 'NEWS', id: 'news' },
        { href: '/alerts-news', label: 'ALERTS+NEWS', id: 'alerts-news' },
    ];

    // Display type
    const displayLinks = [
        { href: '/', label: 'Web', id: 'live' },
        { href: '/mobile', label: 'Mobile', id: 'mobile' },
        { href: '/tablet', label: 'Tablet', id: 'tablet' },
        { href: '/tv', label: 'TV', id: 'tv' },
    ];

    // TV links
    const tvLinks = [
        { href: 'https://www.oref.org.il/eng', label: 'HFC' },
        { href: 'https://www.kan.org.il/live/', label: 'KAN' },
        { href: 'https://video.i24news.tv/live/brightcove/en', label: 'i24' },
    ];

    const makeNav = (links) => links.map(p =>
        `<a href="${p.href}" class="${p.id === activePage ? 'active' : ''}">${p.label}</a>`
    ).join('');

    const pagesHtml = makeNav(pageLinks);

    const displayMenuHtml = displayLinks.map(p =>
        `<a href="${p.href}" class="${p.id === activePage ? 'active' : ''}">${p.label}</a>`
    ).join('');

    const tvMenuHtml = tvLinks.map(l =>
        `<a href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`
    ).join('');

    const speechOn = localStorage.getItem('geodash-speech') !== 'false';
    const ttsClass = speechOn ? 'tts-on' : 'tts-off';
    const ttsIcon = speechOn ? '\u25B6' : '\u25A0';
    const ttsTitle = speechOn ? 'TTS: ON (click to disable)' : 'TTS: OFF (click to enable)';
    const ttsBtnHtml = `<button class="geodash-tts-toggle ${ttsClass}" id="tts-toggle-btn" title="${ttsTitle}">${ttsIcon}</button>`;

    const refreshHtml = `<a href="#" class="geodash-refresh-btn" onclick="event.preventDefault();window.location.reload();" title="Refresh page">↻</a>`;
    const settingsHtml = `<a href="/settings" class="${activePage === 'settings' ? 'active' : ''}">⚙</a>`;
    const fullscreenHtml = `<button class="geodash-fullscreen-btn" id="fullscreen-btn" title="Toggle fullscreen">Fullscreen</button>`;

    const el = document.getElementById('geodash-header');
    if (!el) return;

    el.className = 'geodash-header';
    el.innerHTML = `
        <div class="geodash-header-left">
            <a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none">
                <img src="/static/icon.png" alt="" class="geodash-header-icon">
                <h1>Red Alert Geodash</h1>
            </a>
            <nav class="geodash-nav">${pagesHtml}</nav>
            ${sep}
            <div class="geodash-dropdown-wrap" id="display-dropdown">
                <button class="geodash-dropdown-btn" title="Display mode">Display ▾</button>
                <div class="geodash-dropdown-menu">${displayMenuHtml}</div>
            </div>
            <div class="geodash-dropdown-wrap" id="tv-dropdown">
                <button class="geodash-dropdown-btn" title="Live TV channels">TV ▾</button>
                <div class="geodash-dropdown-menu">${tvMenuHtml}</div>
            </div>
            ${sep}
            ${ttsBtnHtml}
            ${fullscreenHtml}
            ${sep}
            <nav class="geodash-nav">${refreshHtml}${settingsHtml}</nav>
        </div>
        <div class="geodash-clocks">
            <div class="geodash-clock-date-row">
                <span class="geodash-clock-date" id="clock-date"></span>
                <span class="geodash-clock-hebrew" id="clock-hebrew"></span>
                <span class="geodash-clock-shabbat" id="clock-shabbat"></span>
            </div>
            <div class="geodash-clock-block">
                <span class="geodash-clock-label">Israel</span>
                <span class="geodash-clock-time" id="clock-local">--:--</span>
            </div>
            <span class="geodash-clock-separator">|</span>
            <div class="geodash-clock-block utc">
                <span class="geodash-clock-label">UTC</span>
                <span class="geodash-clock-time" id="clock-utc">--:--</span>
            </div>
        </div>
    `;

    // Start clock
    function updateClock() {
        const now = new Date();
        const cl = document.getElementById('clock-local');
        const cu = document.getElementById('clock-utc');
        const cd = document.getElementById('clock-date');
        if (cl) cl.textContent = now.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Jerusalem', hour12: false, hour: '2-digit', minute: '2-digit',
        });
        if (cu) cu.textContent = now.toLocaleTimeString('en-GB', {
            timeZone: 'UTC', hour12: false, hour: '2-digit', minute: '2-digit',
        });
        if (cd) cd.textContent = now.toLocaleDateString('en-GB', {
            timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'short',
        });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Fetch Hebrew date and Shabbat times from Hebcal (respects settings)
    (async function fetchHebcalData() {
        const showHebrew = localStorage.getItem('geodash-hebrew-date') !== 'false';
        const showShabbat = localStorage.getItem('geodash-shabbat') !== 'false';

        if (showHebrew) {
            try {
                const resp = await fetch('https://www.hebcal.com/converter?cfg=json&date=today&g2h=1&strict=1');
                if (resp.ok) {
                    const data = await resp.json();
                    const he = document.getElementById('clock-hebrew');
                    if (he && data.hebrew) he.textContent = data.hebrew;
                }
            } catch (e) { /* ignore */ }
        }

        if (showShabbat) {
            try {
                // Fetch this week's Shabbat times for Jerusalem
                const now = new Date();
                const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
                // Show on Friday and Saturday (or always for testing)
                if (day === 5 || day === 6) {
                    const resp = await fetch('https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&m=50');
                    if (resp.ok) {
                        const data = await resp.json();
                        let candles = '', havdalah = '';
                        for (const item of (data.items || [])) {
                            if (item.category === 'candles') candles = item.date ? new Date(item.date).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
                            if (item.category === 'havdalah') havdalah = item.date ? new Date(item.date).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }) : '';
                        }
                        const shEl = document.getElementById('clock-shabbat');
                        if (shEl) {
                            const parts = [];
                            if (candles) parts.push('\u{1F56F}\uFE0F ' + candles);
                            if (havdalah) parts.push('\u2728 ' + havdalah);
                            shEl.textContent = parts.join(' · ');
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        }
    })();

    // TTS toggle handler
    const ttsBtn = document.getElementById('tts-toggle-btn');
    if (ttsBtn) {
        ttsBtn.addEventListener('click', () => {
            const isOn = localStorage.getItem('geodash-speech') !== 'false';
            const newState = !isOn;
            localStorage.setItem('geodash-speech', newState ? 'true' : 'false');
            ttsBtn.textContent = newState ? '\u25B6' : '\u25A0';
            ttsBtn.className = `geodash-tts-toggle ${newState ? 'tts-on' : 'tts-off'}`;
            ttsBtn.title = newState ? 'TTS: ON (click to disable)' : 'TTS: OFF (click to enable)';
            if (!newState) window.speechSynthesis?.cancel();
        });
    }

    // Dropdown toggle handlers
    document.querySelectorAll('.geodash-dropdown-wrap').forEach(wrap => {
        const btn = wrap.querySelector('.geodash-dropdown-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = wrap.classList.contains('open');
                document.querySelectorAll('.geodash-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
                if (!wasOpen) wrap.classList.add('open');
            });
        }
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.geodash-dropdown-wrap.open').forEach(w => w.classList.remove('open'));
    });

    // Fullscreen toggle
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });
        document.addEventListener('fullscreenchange', () => {
            fsBtn.textContent = document.fullscreenElement ? 'Exit FS' : 'Fullscreen';
            fsBtn.title = document.fullscreenElement ? 'Exit fullscreen' : 'Toggle fullscreen';
        });
    }
}

// ── Footer Component ───────────────────────────────────────────────────────

function renderFooter() {
    const el = document.getElementById('geodash-footer');
    if (!el) return;

    el.className = 'geodash-footer';
    el.innerHTML = `
        <div class="geodash-footer-row">
            <div class="geodash-alert-counter-wrap" id="geodash-alert-counter-wrap">
                <div class="geodash-alert-counter quiet" id="geodash-alert-counter">
                    <span class="counter-dot"></span>
                    <span id="geodash-alert-counter-text">0 ALERTS</span>
                    <span class="counter-chevron" id="counter-chevron">&#9660;</span>
                </div>
                <div class="geodash-alert-dropdown" id="geodash-alert-dropdown"></div>
            </div>
        </div>
        <div class="geodash-footer-meta">
            <span class="motto">\u05d1\u05d9\u05d7\u05d3 \u05e0\u05e0\u05e6\u05d7</span> · <span class="geodash-hfc-status" title="Flashes when new data received from HFC">HFC <span class="geodash-hfc-dot" id="hfc-dot"></span></span> · <a href="/settings">Settings</a> · v1.8.0
        </div>
        <div class="geodash-footer-credit">
            An open source Red Alert display dashboard by <a href="https://danielrosehill.com" target="_blank" rel="noopener">Daniel Rosehill</a>
        </div>
    `;
}

// ── Relative Time Helper ───────────────────────────────────────────────────

function relativeTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' });
    } catch {
        return dateStr;
    }
}

// ── Shared Helpers ─────────────────────────────────────────────────────────

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
