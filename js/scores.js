/**
 * scores.js — Score management
 * Loads scores.json, updates user points, saves back via GitHub Contents API.
 */

const SCORES_PATH = 'data/scores.json';

/**
 * Safe UTF-8 aware base64 encoding using TextEncoder.
 * Replaces btoa(unescape(encodeURIComponent())) which can fail on
 * certain Unicode characters (e.g. emoji in YouTube usernames).
 */
function toBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    // Process in chunks to avoid call-stack limits on large strings
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/** Load scores from the repo via raw GitHub content URL */
async function loadScores(repoOwner, repoName) {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${SCORES_PATH}?t=${Date.now()}`;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return { lastUpdated: '', processedCommentIds: [], users: {} };
    return await res.json();
}

/** Apply new comments to scores object and return updated data */
function applyComments(scores, newComments, pointsPerComment) {
    const processedSet = new Set(scores.processedCommentIds || []);
    let added = 0;

    for (const comment of newComments) {
        if (processedSet.has(comment.id)) continue;
        processedSet.add(comment.id);

        const uid = comment.authorChannelId || comment.authorDisplayName;
        if (!scores.users[uid]) {
            scores.users[uid] = {
                name: comment.authorDisplayName,
                avatar: comment.authorProfileImageUrl,
                points: 0,
                commentCount: 0,
                comments: [],
            };
        }
        const u = scores.users[uid];
        u.points += pointsPerComment;
        u.commentCount += 1;
        u.name = comment.authorDisplayName;
        if (comment.authorProfileImageUrl) u.avatar = comment.authorProfileImageUrl;

        // Store comment history (keep latest 50 per user to limit file size)
        if (comment.textDisplay) {
            u.comments = u.comments || [];
            u.comments.unshift({
                id: comment.id,
                text: comment.textDisplay,
                videoId: comment.videoId || '',
                date: comment.publishedAt || '',
            });
            if (u.comments.length > 50) u.comments = u.comments.slice(0, 50);
        }
        added++;
    }

    scores.processedCommentIds = Array.from(processedSet);
    scores.lastUpdated = new Date().toISOString();
    return { scores, added };
}

/**
 * Save scores.json back to GitHub via Contents API (requires PAT).
 */
async function saveScoresToGitHub(scores, repoOwner, repoName, pat, onProgress) {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${SCORES_PATH}`;
    const headers = {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    // Get current SHA (needed for updating existing file)
    onProgress('GitHub\'dan mevcut sha alınıyor…');
    let sha = null;
    try {
        const getRes = await fetch(apiUrl, { method: 'GET', headers, mode: 'cors' });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
            onProgress(`SHA alındı: ${sha.slice(0, 7)}…`);
        } else {
            onProgress(`SHA alınamadı (HTTP ${getRes.status}) — yeni dosya olarak kaydedilecek.`);
        }
    } catch (e) {
        onProgress(`SHA isteği başarısız: ${e.message} — yeni dosya olarak denenecek.`);
    }

    // Encode content safely (handles emoji, Turkish chars, etc.)
    let content;
    try {
        content = toBase64Utf8(JSON.stringify(scores, null, 2));
    } catch (encErr) {
        throw new Error(`İçerik kodlama hatası: ${encErr.message}`);
    }

    const body = {
        message: `chore: update scores [${new Date().toISOString()}]`,
        content,
        ...(sha ? { sha } : {}),
    };

    onProgress('scores.json GitHub\'a yükleniyor…');
    let putRes;
    try {
        putRes = await fetch(apiUrl, {
            method: 'PUT',
            mode: 'cors',
            headers,
            body: JSON.stringify(body),
        });
    } catch (netErr) {
        // Network-level failure — diagnose
        throw new Error(
            `Ağ hatası (GitHub API erişilemiyor): ${netErr.message}. ` +
            `Lütfen şunları kontrol edin: 1) PAT geçerli mi? 2) Repo adı doğru mu (${repoOwner}/${repoName})? ` +
            `3) Tarayıcı uzantısı (reklam engelleyici) API'yi engelliyor olabilir.`
        );
    }

    if (!putRes.ok) {
        let errMsg = `HTTP ${putRes.status}`;
        try {
            const errBody = await putRes.json();
            errMsg += `: ${errBody.message}`;
        } catch (_) { }
        throw new Error(`GitHub kaydetme hatası: ${errMsg}`);
    }

    onProgress('✅ scores.json başarıyla güncellendi!');
}

/** Get top N users sorted by points */
function getTopUsers(scores, n = 10) {
    return Object.entries(scores.users || {})
        .map(([id, u]) => ({ id, ...u }))
        .sort((a, b) => b.points - a.points)
        .slice(0, n);
}
