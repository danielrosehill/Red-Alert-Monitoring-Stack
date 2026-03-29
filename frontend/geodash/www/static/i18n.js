/**
 * Red Alert Geodash — Lightweight i18n module
 * Supports English (en) and Hebrew (he).
 * Include this BEFORE components.js and page-specific scripts.
 */

const GEODASH_TRANSLATIONS = {
    en: {
        // App
        "app.title": "Red Alert Geodash",
        "app.title.short": "Red Alert",
        "app.title.tv": "Red Alert Dashboard — TV",

        // Nav
        "nav.live": "LIVE",
        "nav.history": "HISTORY",
        "nav.news": "NEWS",
        "nav.alertsNews": "ALERTS+NEWS",

        // Clock
        "clock.israel": "Israel",
        "clock.utc": "UTC",

        // Dashboard
        "dash.refresh": "Refresh",
        "dash.testRed": "Test Red",
        "dash.testWarning": "Test Warning",
        "dash.testAllClear": "Test All Clear",
        "dash.clearTests": "Clear Tests",
        "dash.noActiveAlerts": "No active alerts",
        "dash.activeAlerts": "ACTIVE ALERTS",
        "dash.preWarning": "PRE-WARNING",
        "dash.allClear": "ALL CLEAR",
        "dash.live": "LIVE",
        "dash.allClearStatus": "All clear",
        "dash.active": "active",
        "dash.allIsrael": "All Israel",
        "dash.yourArea": "Your area",

        // Maps
        "map.countryView": "Israel — Country View",
        "map.jerusalemSurroundings": "Jerusalem & Surroundings",
        "map.jerusalemDetail": "Jerusalem — City Detail",

        // Legend
        "legend.activeAlert": "Active Alert",
        "legend.preWarning": "Pre-Warning",
        "legend.allClear": "All Clear",

        // Sidebar
        "sidebar.monitoringArea": "Monitoring Area",
        "sidebar.recentAlerts": "Recent Alerts",
        "sidebar.noRecentAlerts": "No recent alerts",

        // Alert overlay
        "alert.redAlert": "RED ALERT",
        "alert.warning": "WARNING",
        "alert.allClearEvent": "ALL CLEAR — Event Concluded",
        "alert.dismiss": "Dismiss alert (Esc key also works)",

        // Speech
        "speech.redAlert": "Red alert. {title}. Jerusalem {area}. Take shelter immediately.",
        "speech.warning": "Warning. {title}. Jerusalem {area}. Be prepared.",
        "speech.allClear": "All clear. The event in Jerusalem {area} has concluded. You may leave the shelter.",
        "speech.allClearLocal": "All clear. The event in your area has concluded.",
        "speech.alertsAcross": "{count} alert{plural} across Israel, including {areas}{more}.",
        "speech.allClearIn": "All clear in {areas}.",

        // History
        "history.alertEvents": "Alert Events",
        "history.allAlerts": "All Alerts",
        "history.inYourArea": "In Your Area",
        "history.allAreas": "All Areas",
        "history.myArea": "★ My Area ({area})",
        "history.playback": "PLAYBACK",
        "history.events": "events",
        "history.moments": "moments",
        "history.loading": "Loading from database...",
        "history.failedLoad": "Failed to load",
        "history.noEvents": "No alert events in database",
        "history.noFilter": "No events for this filter",
        "history.showing": "Showing {count} areas in {region}",
        "history.setArea": "Set your area on the Live dashboard to use this filter",
        "history.loadingHistory": "Loading alert history from database...",

        // News
        "news.loadingNews": "Loading news...",
        "news.noNews": "No news available",
        "news.liveStreamPlay": "i24NEWS Live Stream — click to play",
        "news.liveStreamStop": "i24NEWS Live Stream — click to stop",
        "news.i24Play": "i24NEWS — play",
        "news.i24Stop": "i24NEWS — stop",

        // Alerts+News
        "alertsNews.recentAlerts": "Recent Alerts (3 days)",
        "alertsNews.news": "News",
        "alertsNews.noAlerts3d": "No alerts in last 3 days",
        "alertsNews.loadingAlerts": "Loading alerts...",
        "alertsNews.monitoring": "Monitoring...",
        "alertsNews.activeCount": "{count} active: {areas}",

        // Settings
        "settings.title": "Settings — Red Alert Geodash",
        "settings.disclaimer.title": "⚠ Important Disclaimer",
        "settings.disclaimer.line1": "This is not an official Home Front Command (Pikud HaOref) resource.",
        "settings.disclaimer.line2": "Do not rely on this dashboard as your primary alert or emergency preparedness tool. Always use the official Red Alert app and follow Pikud HaOref instructions.",
        "settings.disclaimer.line3": "This dashboard is intended to make it easier to visualize what is happening across Israel from the public Red Alert feed, providing a country-level situational awareness view.",
        "settings.alertArea": "Alert Area",
        "settings.yourMonitoringArea": "Your Monitoring Area",
        "settings.monitoringDesc": "Local alerts, audio, and speech will trigger for this area",
        "settings.notifications": "Notifications",
        "settings.alertAudio": "Alert Audio",
        "settings.alertAudioDesc": "Play siren tone when your area is under alert",
        "settings.speechAnnouncements": "Speech Announcements",
        "settings.speechDesc": "Speak alert type and area name aloud",
        "settings.save": "Save Settings",
        "settings.saved": "Saved!",
        "settings.language": "Language",
        "settings.languageSetting": "Dashboard Language",
        "settings.languageDesc": "Choose the display language for the dashboard",

        // Footer
        "footer.settings": "Settings",

        // Categories
        "cat.1": "🚀 Rockets",
        "cat.2": "🛩️ Drone",
        "cat.3": "☣️ Chemical",
        "cat.4": "⚠️ Warning",
        "cat.6": "🛩️ Hostile Aircraft",
        "cat.7": "🌍 Earthquake",
        "cat.8": "🌍 Earthquake",
        "cat.9": "☢️ CBRNE",
        "cat.10": "🔫 Infiltration",
        "cat.11": "🌊 Tsunami",
        "cat.12": "⚠️ Hazmat",
        "cat.13": "✅ All Clear",
        "cat.14": "⏳ Early Warning",

        // Categories (plain, no emoji — for history page)
        "cat.plain.1": "Rockets",
        "cat.plain.2": "Drone",
        "cat.plain.3": "Chemical",
        "cat.plain.4": "Warning",
        "cat.plain.6": "Hostile Aircraft",
        "cat.plain.7": "Earthquake",
        "cat.plain.8": "Earthquake",
        "cat.plain.9": "CBRNE",
        "cat.plain.10": "Infiltration",
        "cat.plain.11": "Tsunami",
        "cat.plain.12": "Hazmat",
        "cat.plain.13": "All Clear",
        "cat.plain.14": "Early Warning",

        // TV
        "tv.desktop": "Desktop",
        "tv.monitoring": "MONITORING:",
        "tv.noAlerts": "No alerts",
        "tv.version": "v1.2.0 TV",
    },

    he: {
        // App
        "app.title": "ג'אודש התרעה אדומה",
        "app.title.short": "התרעה אדומה",
        "app.title.tv": "לוח התרעה אדומה — TV",

        // Nav
        "nav.live": "שידור חי",
        "nav.history": "היסטוריה",
        "nav.news": "חדשות",
        "nav.alertsNews": "התרעות+חדשות",

        // Clock
        "clock.israel": "ישראל",
        "clock.utc": "UTC",

        // Dashboard
        "dash.refresh": "רענון",
        "dash.testRed": "בדיקה אדום",
        "dash.testWarning": "בדיקה אזהרה",
        "dash.testAllClear": "בדיקה ירוק",
        "dash.clearTests": "ניקוי בדיקות",
        "dash.noActiveAlerts": "אין התרעות פעילות",
        "dash.activeAlerts": "התרעות פעילות",
        "dash.preWarning": "התרעת קדם",
        "dash.allClear": "ירוק",
        "dash.live": "שידור חי",
        "dash.allClearStatus": "ירוק",
        "dash.active": "פעיל",
        "dash.allIsrael": "כל ישראל",
        "dash.yourArea": "האזור שלך",

        // Maps
        "map.countryView": "ישראל — מפת ארץ",
        "map.jerusalemSurroundings": "ירושלים והסביבה",
        "map.jerusalemDetail": "ירושלים — תצוגת עיר",

        // Legend
        "legend.activeAlert": "התרעה פעילה",
        "legend.preWarning": "התרעת קדם",
        "legend.allClear": "ירוק",

        // Sidebar
        "sidebar.monitoringArea": "אזור ניטור",
        "sidebar.recentAlerts": "התרעות אחרונות",
        "sidebar.noRecentAlerts": "אין התרעות אחרונות",

        // Alert overlay
        "alert.redAlert": "צבע אדום",
        "alert.warning": "אזהרה",
        "alert.allClearEvent": "ירוק — האירוע הסתיים",
        "alert.dismiss": "סגירת ההתרעה (גם מקש Esc)",

        // Speech (Hebrew mode still speaks English for clarity)
        "speech.redAlert": "Red alert. {title}. Jerusalem {area}. Take shelter immediately.",
        "speech.warning": "Warning. {title}. Jerusalem {area}. Be prepared.",
        "speech.allClear": "All clear. The event in Jerusalem {area} has concluded. You may leave the shelter.",
        "speech.allClearLocal": "All clear. The event in your area has concluded.",
        "speech.alertsAcross": "{count} alert{plural} across Israel, including {areas}{more}.",
        "speech.allClearIn": "All clear in {areas}.",

        // History
        "history.alertEvents": "אירועי התרעה",
        "history.allAlerts": "כל ההתרעות",
        "history.inYourArea": "באזור שלך",
        "history.allAreas": "כל האזורים",
        "history.myArea": "★ האזור שלי ({area})",
        "history.playback": "ניגון",
        "history.events": "אירועים",
        "history.moments": "רגעים",
        "history.loading": "טוען מבסיס הנתונים...",
        "history.failedLoad": "טעינה נכשלה",
        "history.noEvents": "אין אירועי התרעה בבסיס הנתונים",
        "history.noFilter": "אין אירועים למסנן זה",
        "history.showing": "מציג {count} אזורים ב{region}",
        "history.setArea": "הגדר את האזור שלך בלוח השידור החי",
        "history.loadingHistory": "טוען היסטוריית התרעות מבסיס הנתונים...",

        // News
        "news.loadingNews": "טוען חדשות...",
        "news.noNews": "אין חדשות זמינות",
        "news.liveStreamPlay": "i24NEWS שידור חי — לחץ להפעלה",
        "news.liveStreamStop": "i24NEWS שידור חי — לחץ לעצירה",
        "news.i24Play": "i24NEWS — הפעלה",
        "news.i24Stop": "i24NEWS — עצירה",

        // Alerts+News
        "alertsNews.recentAlerts": "התרעות אחרונות (3 ימים)",
        "alertsNews.news": "חדשות",
        "alertsNews.noAlerts3d": "אין התרעות ב-3 ימים האחרונים",
        "alertsNews.loadingAlerts": "טוען התרעות...",
        "alertsNews.monitoring": "מנטר...",
        "alertsNews.activeCount": "{count} פעיל: {areas}",

        // Settings
        "settings.title": "הגדרות — ג'אודש התרעה אדומה",
        "settings.disclaimer.title": "⚠ הערה חשובה",
        "settings.disclaimer.line1": "זהו לא משאב רשמי של פיקוד העורף.",
        "settings.disclaimer.line2": "אין להסתמך על לוח זה ככלי ההתרעה או המוכנות העיקרי שלך. השתמש תמיד באפליקציה הרשמית של צבע אדום ופעל לפי הנחיות פיקוד העורף.",
        "settings.disclaimer.line3": "לוח זה נועד להקל על הצגת המצב בכל רחבי ישראל מתוך עדכון ההתרעות הציבורי.",
        "settings.alertArea": "אזור התרעה",
        "settings.yourMonitoringArea": "אזור הניטור שלך",
        "settings.monitoringDesc": "התרעות, שמע ודיבור יופעלו עבור אזור זה",
        "settings.notifications": "התראות",
        "settings.alertAudio": "שמע התרעה",
        "settings.alertAudioDesc": "הפעלת צפירה כשהאזור שלך בהתרעה",
        "settings.speechAnnouncements": "הכרזות דיבור",
        "settings.speechDesc": "הקראת סוג ההתרעה ושם האזור",
        "settings.save": "שמירת הגדרות",
        "settings.saved": "!נשמר",
        "settings.language": "שפה",
        "settings.languageSetting": "שפת הלוח",
        "settings.languageDesc": "בחר את שפת התצוגה של הלוח",

        // Footer
        "footer.settings": "הגדרות",

        // Categories
        "cat.1": "🚀 רקטות",
        "cat.2": "🛩️ כלי טיס בלתי מאויש",
        "cat.3": "☣️ כימי",
        "cat.4": "⚠️ אזהרה",
        "cat.6": "🛩️ כלי טיס עוין",
        "cat.7": "🌍 רעידת אדמה",
        "cat.8": "🌍 רעידת אדמה",
        "cat.9": "☢️ קרינה",
        "cat.10": "🔫 חדירת מחבלים",
        "cat.11": "🌊 צונאמי",
        "cat.12": "⚠️ חומרים מסוכנים",
        "cat.13": "✅ ירוק",
        "cat.14": "⏳ התרעת קדם",

        // Categories (plain, no emoji)
        "cat.plain.1": "רקטות",
        "cat.plain.2": "כלי טיס בלתי מאויש",
        "cat.plain.3": "כימי",
        "cat.plain.4": "אזהרה",
        "cat.plain.6": "כלי טיס עוין",
        "cat.plain.7": "רעידת אדמה",
        "cat.plain.8": "רעידת אדמה",
        "cat.plain.9": "קרינה",
        "cat.plain.10": "חדירת מחבלים",
        "cat.plain.11": "צונאמי",
        "cat.plain.12": "חומרים מסוכנים",
        "cat.plain.13": "ירוק",
        "cat.plain.14": "התרעת קדם",

        // TV
        "tv.desktop": "שולחן עבודה",
        "tv.monitoring": ":ניטור",
        "tv.noAlerts": "אין התרעות",
        "tv.version": "v1.2.0 TV",
    },
};

// ── Language State ──────────────────────────────────────────────────────────

function getLanguage() {
    return localStorage.getItem('geodash-lang') || 'en';
}

function setLanguage(lang) {
    localStorage.setItem('geodash-lang', lang);
}

/**
 * Translate a key, with optional interpolation.
 * Usage: t('speech.redAlert', { title: 'Rockets', area: 'South' })
 */
function t(key, params) {
    const lang = getLanguage();
    const dict = GEODASH_TRANSLATIONS[lang] || GEODASH_TRANSLATIONS.en;
    let str = dict[key];
    if (str === undefined) {
        // Fallback to English
        str = GEODASH_TRANSLATIONS.en[key];
    }
    if (str === undefined) return key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
        }
    }
    return str;
}

/**
 * Get the category label (with emoji) for a category number.
 */
function getCategoryLabel(cat) {
    return t(`cat.${cat}`) || `Cat ${cat}`;
}

/**
 * Get the plain category label (no emoji) for a category number.
 */
function getCategoryLabelPlain(cat) {
    return t(`cat.plain.${cat}`) || `Cat ${cat}`;
}

/**
 * Apply dir="rtl" or dir="ltr" to <html> based on current language.
 */
function applyDirection() {
    const lang = getLanguage();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

/**
 * In Hebrew mode, area names are already in Hebrew from the API — return as-is.
 * In English mode, translate using the area translations dictionary.
 */
function translateAreaI18n(hebrewName, areaTranslationsDict) {
    if (!hebrewName) return hebrewName;
    if (getLanguage() === 'he') return hebrewName;
    return (areaTranslationsDict && areaTranslationsDict[hebrewName]) || hebrewName;
}

/**
 * In Hebrew mode, alert titles are already in Hebrew from the API — return as-is.
 * In English mode, translate using TITLE_TRANSLATIONS.
 */
function translateTitleI18n(hebrewTitle, titleTranslationsDict) {
    if (!hebrewTitle) return hebrewTitle;
    if (getLanguage() === 'he') return hebrewTitle;
    if (!titleTranslationsDict) return hebrewTitle;
    if (titleTranslationsDict[hebrewTitle]) return titleTranslationsDict[hebrewTitle];
    for (const [he, en] of Object.entries(titleTranslationsDict)) {
        if (hebrewTitle.includes(he) || he.includes(hebrewTitle.replace(/\.\.\./g, ''))) {
            return en;
        }
    }
    return hebrewTitle;
}

// Apply direction on load
applyDirection();
