/**
 * leaderboard.js — Renders the top-10 leaderboard on index.html
 * Loads site texts from data/texts.json, fetches scores from data/scores.json.
 * Supports click-to-open profile panel with comment history.
 */

const LS_SCORES_CACHE = 'ytcp_scores_cache';
const LS_CACHE_TIME = 'ytcp_cache_time';
const LS_TEXTS_CACHE = 'ytcp_texts_cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

let TEXTS = {};

// ——— Bootstrap ———
document.addEventListener('DOMContentLoaded', async () => {
    await loadTexts();
    applyTexts();
    await initLeaderboard();
    initProfilePanel();
});

// ——— Texts ———
async function loadTexts() {
    // Try localStorage first for instant paint
    const cached = localStorage.getItem(LS_TEXTS_CACHE);
    if (cached) TEXTS = JSON.parse(cached);

    try {
        const res = await fetch(`data/texts.json?t=${Date.now()}`);
        if (res.ok) {
            TEXTS = await res.json();
            localStorage.setItem(LS_TEXTS_CACHE, JSON.stringify(TEXTS));
        }
    } catch (_) { }
}

function t(key, fallback = '') {
    return TEXTS[key] !== undefined ? TEXTS[key] : fallback;
}

function applyTexts() {
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
    set('txt-site-title', t('siteTitle'));
    set('txt-site-title-footer', t('siteTitle'));
    set('txt-site-subtitle', t('siteSubtitle'));
    set('txt-board-title', t('boardTitle'));
    set('txt-stat-comments-label', (t('statComments') || 'Toplam Yorum') + ':');
    set('txt-stat-users-label', (t('statUsers') || 'Katılımcı Sayısı') + ':');
    set('txt-admin-link', '⚙ ' + (t('adminLink') || 'Yönetici'));
    set('txt-profile-points-label', t('profilePointsLabel') || 'Puan:');
    set('txt-profile-comments-label', t('profileCommentsLabel') || 'Yorum:');
    set('txt-comments-title', t('profileCommentsTitle') || 'Yorumlar');
    set('txt-profile-empty', t('profileNoComments') || 'Yorum geçmişi bulunamadı.');
    // Update page title
    if (t('siteTitle')) document.title = t('siteTitle');
}

// ——— Leaderboard init ———
async function initLeaderboard() {
    const container = document.getElementById('leaderboard-list');
    const lastUpdateEl = document.getElementById('last-update');
    const statCommentEl = document.getElementById('stat-comments');
    const statUsersEl = document.getElementById('stat-users');

    // Clear stale cache
    localStorage.removeItem(LS_SCORES_CACHE);
    localStorage.removeItem(LS_CACHE_TIME);

    showLoading(container);

    try {
        const cfg = await loadConfig();
        const scores = await fetchScores(cfg);

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
        } catch (_) { }
    }, CACHE_TTL_MS);
}

async function loadConfig() {
    try {
        const res = await fetch(`data/config.json?t=${Date.now()}`);
        return res.ok ? res.json() : {};
    } catch (_) { return {}; }
}

async function fetchScores(cfg) {
    // 1) Same-origin relative path — always fresh on GitHub Pages
    try {
        const res = await fetch(`data/scores.json?t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            if (data && Object.keys(data.users || {}).length > 0) return data;
        }
    } catch (_) { }

    // 2) raw.githubusercontent.com fallback
    const { repoOwner: owner, repoName: repo } = cfg;
    if (owner && repo) {
        try {
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/scores.json?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) return res.json();
        } catch (_) { }
    }

    return { lastUpdated: '', processedCommentIds: [], users: {} };
}

// ——— Render ———
let _scoresCache = null;

function renderLeaderboard(scores, container, lastUpdateEl, statCommentEl, statUsersEl) {
    _scoresCache = scores; // store for profile panel

    const topUsers = Object.entries(scores.users || {})
        .map(([id, u]) => ({ id, ...u }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10);

    const totalComments = Object.values(scores.users || {}).reduce((s, u) => s + (u.commentCount || 0), 0);
    const totalUsers = Object.keys(scores.users || {}).length;
    if (statCommentEl) statCommentEl.textContent = totalComments.toLocaleString('tr-TR');
    if (statUsersEl) statUsersEl.textContent = totalUsers.toLocaleString('tr-TR');

    if (lastUpdateEl && scores.lastUpdated) {
        const d = new Date(scores.lastUpdated);
        lastUpdateEl.textContent = `${t('lastUpdatePrefix') || 'Son güncelleme:'} ${d.toLocaleString('tr-TR')}`;
    }

    if (topUsers.length === 0) {
        container.innerHTML = `
      <li class="empty-state">
        <div class="empty-state-icon">🌿</div>
        <p class="empty-state-text">${escHtml(t('emptyTitle') || 'Henüz kimse yorum yapmamış')}<br><em>${escHtml(t('emptySubtitle') || 'İlk yorum yapan sen ol!')}</em></p>
      </li>`;
        return;
    }

    container.innerHTML = '';
    topUsers.forEach((user, idx) => {
        const rank = idx + 1;
        const entry = document.createElement('li');
        entry.className = `leaderboard-entry ${rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''}`;
        entry.style.animationDelay = `${idx * 0.06}s`;
        entry.setAttribute('data-uid', user.id);
        entry.setAttribute('role', 'button');
        entry.setAttribute('tabindex', '0');
        entry.title = 'Profili gör';

        const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
        const rankLabel = rank === 1 ? '🌟' : rank === 2 ? '🌙' : rank === 3 ? '🍂' : rank;

        const avatarHtml = user.avatar
            ? `<img class="user-avatar" src="${escHtml(user.avatar)}" alt="${escHtml(user.name)}" loading="lazy" onerror="this.outerHTML='<div class=\\'avatar-placeholder\\'>${escHtml(user.name.charAt(0))}</div>'">`
            : `<div class="avatar-placeholder">${escHtml(user.name.charAt(0))}</div>`;

        entry.innerHTML = `
      <div class="rank-badge ${rankClass}">${rankLabel}</div>
      ${avatarHtml}
      <div class="user-info">
        <span class="user-name">${escHtml(user.name)}</span>
        <span class="user-comments">${user.commentCount || 0} ${escHtml(t('commentsLabel') || 'yorum')}</span>
      </div>
      <div class="user-points">
        <span class="points-value" data-target="${user.points}">0</span>
        <span class="points-label">${escHtml(t('pointsLabel') || 'Puan')}</span>
      </div>`;

        container.appendChild(entry);
    });

    // Count-up animation
    container.querySelectorAll('.points-value').forEach(el => {
        animateCount(el, 0, parseInt(el.dataset.target, 10), 750);
    });

    // Click handlers → profile panel
    container.querySelectorAll('.leaderboard-entry').forEach(el => {
        el.addEventListener('click', () => openProfile(el.dataset.uid));
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openProfile(el.dataset.uid); });
    });
}

// ——— Profile Panel ———
function initProfilePanel() {
    const overlay = document.getElementById('profile-overlay');
    const closeBtn = document.getElementById('profile-close-btn');

    closeBtn.addEventListener('click', closeProfile);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeProfile(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfile(); });
}

function openProfile(uid) {
    if (!_scoresCache || !uid) return;
    const user = _scoresCache.users[uid];
    if (!user) return;

    // Avatar
    const avatarWrap = document.getElementById('profile-avatar-wrap');
    if (user.avatar) {
        avatarWrap.innerHTML = `<img class="profile-avatar" src="${escHtml(user.avatar)}" alt="${escHtml(user.name)}" onerror="this.outerHTML='<div class=\\'profile-avatar-placeholder\\'>${escHtml(user.name.charAt(0))}</div>'">`;
    } else {
        avatarWrap.innerHTML = `<div class="profile-avatar-placeholder">${escHtml(user.name.charAt(0))}</div>`;
    }

    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-points').textContent = (user.points || 0).toLocaleString('tr-TR');
    document.getElementById('profile-comment-count').textContent = (user.commentCount || 0).toLocaleString('tr-TR');

    // Comments list
    const listEl = document.getElementById('profile-comments-list');
    const comments = user.comments || [];
    if (comments.length === 0) {
        listEl.innerHTML = `<div class="profile-empty">${escHtml(t('profileNoComments') || 'Yorum geçmişi bulunamadı.')}</div>`;
    } else {
        listEl.innerHTML = comments.map((c, i) => {
            const dateStr = c.date ? new Date(c.date).toLocaleDateString('tr-TR') : '';
            const videoLink = c.videoId
                ? `<a href="https://www.youtube.com/watch?v=${escHtml(c.videoId)}&lc=${escHtml(c.id)}" target="_blank" rel="noopener">📺 Videoyu gör</a>`
                : '';
            return `<div class="profile-comment-item" style="animation-delay:${i * 0.04}s">
        <div class="comment-text">${escHtml(c.text)}</div>
        <div class="comment-meta">${dateStr ? `<span>${dateStr}</span>` : ''}${videoLink}</div>
      </div>`;
        }).join('');
    }

    const overlay = document.getElementById('profile-overlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeProfile() {
    const overlay = document.getElementById('profile-overlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

// ——— Helpers ———
function animateCount(el, from, to, duration) {
    const start = performance.now();
    const update = now => {
        const p = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(from + (to - from) * e).toLocaleString('tr-TR');
        if (p < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

function showLoading(container) {
    container.innerHTML = `<li class="loading-state"><div class="loading-rune">🍂</div><p>Yükleniyor…</p></li>`;
}

function showError(container, message) {
    container.innerHTML = `<li class="empty-state"><div class="empty-state-icon">🌿</div><p class="empty-state-text">Veri yüklenemedi: ${escHtml(message)}</p></li>`;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
