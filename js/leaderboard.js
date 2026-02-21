/**
 * leaderboard.js — Renders the top-10 leaderboard on index.html
 */

const LS_SCORES_CACHE = 'ytcp_scores_cache';
const LS_CACHE_TIME = 'ytcp_cache_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function initLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    const lastUpdateEl = document.getElementById('last-update');
    const statCommentEl = document.getElementById('stat-comments');
    const statUsersEl = document.getElementById('stat-users');

    // Clear stale cache so we don't serve old empty data
    localStorage.removeItem(LS_SCORES_CACHE);
    localStorage.removeItem(LS_CACHE_TIME);

    showLoading(container);

    // Always fetch fresh
    try {
        const cfg = await loadConfig();
        const scores = await fetchScores(cfg);

        // Cache it
        localStorage.setItem(LS_SCORES_CACHE, JSON.stringify(scores));
        localStorage.setItem(LS_CACHE_TIME, Date.now().toString());

        renderLeaderboard(scores, container, lastUpdateEl, statCommentEl, statUsersEl);
    } catch (e) {
        showError(container, e.message);
    }

    // Auto-refresh every 5 minutes
    setInterval(async () => {
        try {
            const cfg = await loadConfig();
            const scores = await fetchScores(cfg);
            localStorage.setItem(LS_SCORES_CACHE, JSON.stringify(scores));
            localStorage.setItem(LS_CACHE_TIME, Date.now().toString());
            renderLeaderboard(scores, container, lastUpdateEl, statCommentEl, statUsersEl);
        } catch (e) { /* silent */ }
    }, CACHE_TTL_MS);
}

async function loadConfig() {
    const res = await fetch(`data/config.json?t=${Date.now()}`);
    return res.ok ? res.json() : {};
}

/**
 * Fetch scores — tries same-origin relative path first (GitHub Pages, always
 * up-to-date), then raw.githubusercontent.com as fallback.
 */
async function fetchScores(cfg) {
    // 1) Same-origin relative path — always fresh when hosted on GitHub Pages
    try {
        const res = await fetch(`data/scores.json?t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data && Object.keys(data.users || {}).length > 0) return data;
            // If users is empty, try raw.githubusercontent in case of stale Pages cache
        }
    } catch (_) { }

    // 2) raw.githubusercontent.com fallback
    const owner = cfg.repoOwner;
    const repo = cfg.repoName;
    if (owner && repo) {
        try {
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/scores.json?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) return res.json();
        } catch (_) { }
    }

    // 3) Return empty
    return { lastUpdated: '', processedCommentIds: [], users: {} };
}

function getTopUsers(scores, n = 10) {
    return Object.entries(scores.users || {})
        .map(([id, u]) => ({ id, ...u }))
        .sort((a, b) => b.points - a.points)
        .slice(0, n);
}

function renderLeaderboard(scores, container, lastUpdateEl, statCommentEl, statUsersEl) {
    const topUsers = getTopUsers(scores);

    // Stats
    const totalComments = Object.values(scores.users || {}).reduce((s, u) => s + (u.commentCount || 0), 0);
    const totalUsers = Object.keys(scores.users || {}).length;
    if (statCommentEl) statCommentEl.textContent = totalComments.toLocaleString('tr-TR');
    if (statUsersEl) statUsersEl.textContent = totalUsers.toLocaleString('tr-TR');

    // Last updated
    if (lastUpdateEl && scores.lastUpdated) {
        const d = new Date(scores.lastUpdated);
        lastUpdateEl.textContent = `Son güncelleme: ${d.toLocaleString('tr-TR')}`;
    }

    if (topUsers.length === 0) {
        container.innerHTML = `
      <li class="empty-state">
        <div class="empty-state-icon">⚔️</div>
        <p class="empty-state-text">Henüz hiçbir kahraman bu listede yer almıyor.<br>İlk olarak sen ol!</p>
      </li>`;
        return;
    }

    container.innerHTML = '';
    topUsers.forEach((user, idx) => {
        const rank = idx + 1;
        const entry = document.createElement('li');
        entry.className = `leaderboard-entry ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''}`;
        entry.style.animationDelay = `${idx * 0.06}s`;

        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const rankLabel = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

        const avatarHtml = user.avatar
            ? `<img class="user-avatar" src="${escHtml(user.avatar)}" alt="${escHtml(user.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'avatar-placeholder\\'>${escHtml(user.name.charAt(0))}</div>'">`
            : `<div class="avatar-placeholder">${escHtml(user.name.charAt(0))}</div>`;

        entry.innerHTML = `
      <div class="rank-badge ${rankClass}">${rankLabel}</div>
      ${avatarHtml}
      <div class="user-info">
        <span class="user-name">${escHtml(user.name)}</span>
        <span class="user-comments">${user.commentCount || 0} yorum</span>
      </div>
      <div class="user-points">
        <span class="points-value" data-target="${user.points}">0</span>
        <span class="points-label">Puan</span>
      </div>`;

        container.appendChild(entry);
    });

    // Animate points count-up
    container.querySelectorAll('.points-value').forEach(el => {
        animateCount(el, 0, parseInt(el.dataset.target, 10), 700);
    });
}

function animateCount(el, from, to, duration) {
    const start = performance.now();
    const update = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(from + (to - from) * eased).toLocaleString('tr-TR');
        if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

function showLoading(container) {
    container.innerHTML = `
    <li class="loading-state">
      <div class="loading-rune">⚙️</div>
      <p>Liderlik tablosu yükleniyor…</p>
    </li>`;
}

function showError(container, message) {
    container.innerHTML = `
    <li class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <p class="empty-state-text">Veri yüklenemedi: ${escHtml(message)}</p>
    </li>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', initLeaderboard);
