/**
 * scores.js — Score management
 * Loads scores.json, updates user points, saves back via GitHub Contents API.
 */

const SCORES_PATH = 'data/scores.json';

/** Load scores from the repo via raw GitHub content URL */
async function loadScores(repoOwner, repoName) {
    const url = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${SCORES_PATH}?t=${Date.now()}`;
    const res = await fetch(url);
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
            };
        }
        scores.users[uid].points += pointsPerComment;
        scores.users[uid].commentCount += 1;
        // Update name/avatar in case they changed
        scores.users[uid].name = comment.authorDisplayName;
        if (comment.authorProfileImageUrl) {
            scores.users[uid].avatar = comment.authorProfileImageUrl;
        }
        added++;
    }

    scores.processedCommentIds = Array.from(processedSet);
    scores.lastUpdated = new Date().toISOString();
    return { scores, added };
}

/**
 * Save scores.json back to GitHub via Contents API (requires PAT).
 * Fetches the current file SHA first (needed for PUT).
 */
async function saveScoresToGitHub(scores, repoOwner, repoName, pat, onProgress) {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${SCORES_PATH}`;
    const headers = {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    // Get current SHA
    onProgress('GitHub\'dan mevcut sha alınıyor…');
    let sha = null;
    try {
        const getRes = await fetch(apiUrl, { headers });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }
    } catch (e) { /* file may not exist yet */ }

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(scores, null, 2))));
    const body = {
        message: `chore: update scores [${new Date().toISOString()}]`,
        content,
        ...(sha ? { sha } : {}),
    };

    onProgress('scores.json GitHub\'a yükleniyor…');
    const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
    });

    if (!putRes.ok) {
        const err = await putRes.json();
        throw new Error(`GitHub kaydetme hatası: ${err.message}`);
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
