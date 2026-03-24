/**
 * Red Alert Geodash — News feed page
 */

const NEWS_POLL_INTERVAL = 600000; // 10 minutes

function getSourceClass(source) {
    if (!source) return 'other';
    const s = source.toLowerCase();
    if (s.includes('times of israel') || s.includes('toi')) return 'toi';
    if (s.includes('jns')) return 'jns';
    return 'other';
}

function getSourceLabel(source) {
    if (!source) return '';
    const s = source.toLowerCase();
    if (s.includes('times of israel')) return 'TOI';
    if (s.includes('jns')) return 'JNS';
    return source;
}

async function fetchNews() {
    const container = document.getElementById("news-grid");
    try {
        const resp = await fetch("/api/news");
        if (!resp.ok) return;
        const articles = await resp.json();

        if (!articles || articles.length === 0) {
            container.innerHTML = '<div class="no-data">No news available</div>';
            return;
        }

        // Sort most recent first
        articles.sort((a, b) => {
            const da = a.pubDate ? new Date(a.pubDate) : new Date(0);
            const db = b.pubDate ? new Date(b.pubDate) : new Date(0);
            return db - da;
        });

        container.innerHTML = articles.map(article => {
            const srcClass = getSourceClass(article.source);
            const srcLabel = getSourceLabel(article.source);
            const timeAgo = relativeTime(article.pubDate);

            return `<div class="news-card">
                <a href="${escapeAttr(article.link)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>
                <div class="news-meta">
                    ${srcLabel ? `<span class="news-source ${srcClass}">${escapeHtml(srcLabel)}</span>` : ''}
                    <span class="news-time">${escapeHtml(timeAgo)}</span>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error("News fetch error:", err);
        container.innerHTML = '<div class="no-data">Failed to load news</div>';
    }
}

// ── Init ───────────────────────────────────────────────────────────────────────

fetchNews();
setInterval(fetchNews, NEWS_POLL_INTERVAL);
