/**
 * api.js — YouTube Data API v3 integration
 * Fetches all video IDs from a channel, then all comments from each video.
 * Requires an API key stored in localStorage.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Resolve channel ID from various URL formats */
async function resolveChannelId(input, apiKey) {
    input = input.trim();

    // Already a raw channel ID
    if (/^UC[\w-]{22}$/.test(input)) return input;

    // Extract from URL patterns
    let match;

    // /channel/UC...
    match = input.match(/\/channel\/(UC[\w-]{22})/);
    if (match) return match[1];

    // /c/CustomName or /user/Username or /@handle
    match = input.match(/\/@([\w.-]+)/);
    const customName = match ? match[1] : null;

    if (!customName) {
        match = input.match(/\/(?:c|user)\/([\w.-]+)/);
        if (match) {
            const name = match[1];
            const res = await fetch(`${API_BASE}/channels?part=id&forUsername=${encodeURIComponent(name)}&key=${apiKey}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            if (data.items && data.items.length > 0) return data.items[0].id;
        }
    }

    // Handle @handle
    if (customName) {
        const res = await fetch(`${API_BASE}/channels?part=id&forHandle=${encodeURIComponent(customName)}&key=${apiKey}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        if (data.items && data.items.length > 0) return data.items[0].id;
    }

    throw new Error('Kanal ID çözümlenemedi. Lütfen geçerli bir YouTube kanal URL\'si girin.');
}

/** Get the uploads playlist ID for a channel */
async function getUploadsPlaylistId(channelId, apiKey) {
    const res = await fetch(
        `${API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.items || data.items.length === 0) throw new Error('Kanal bulunamadı.');
    return data.items[0].contentDetails.relatedPlaylists.uploads;
}

/** Get all video IDs from uploads playlist (paginated) */
async function getAllVideoIds(uploadsPlaylistId, apiKey, onProgress) {
    const videoIds = [];
    let pageToken = '';
    let page = 0;
    do {
        page++;
        const url = `${API_BASE}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        for (const item of (data.items || [])) {
            videoIds.push(item.contentDetails.videoId);
        }
        pageToken = data.nextPageToken || '';
        if (onProgress) onProgress(`Video sayfası ${page} çekildi (${videoIds.length} video)`);
    } while (pageToken);
    return videoIds;
}

/** Get all top-level comments for a single video (paginated) */
async function getVideoComments(videoId, apiKey, processedIds, onProgress) {
    const comments = [];
    let pageToken = '';
    do {
        const url = `${API_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&key=${apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            // comments disabled on this video
            if (data.error.errors && data.error.errors[0].reason === 'commentsDisabled') return comments;
            // quota exceeded or other error
            throw new Error(`Video ${videoId} yorumlar hatası: ${data.error.message}`);
        }

        for (const item of (data.items || [])) {
            const id = item.id;
            if (processedIds.has(id)) continue; // already counted

            const top = item.snippet.topLevelComment.snippet;
            comments.push({
                id,
                authorChannelId: top.authorChannelId?.value || '',
                authorDisplayName: top.authorDisplayName || 'Anonim',
                authorProfileImageUrl: top.authorProfileImageUrl || '',
            });
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);
    return comments;
}

/**
 * Main fetch function — fetches all new comments across all videos.
 * Returns array of comment objects.
 */
async function fetchAllNewComments(channelUrl, apiKey, processedIds, onProgress) {
    onProgress('Kanal ID çözümleniyor…');
    const channelId = await resolveChannelId(channelUrl, apiKey);
    onProgress(`Kanal ID: ${channelId}`);

    onProgress('Yüklemeler oynatma listesi alınıyor…');
    const uploadsId = await getUploadsPlaylistId(channelId, apiKey);

    onProgress('Tüm video ID\'leri çekiliyor…');
    const videoIds = await getAllVideoIds(uploadsId, apiKey, onProgress);
    onProgress(`Toplam ${videoIds.length} video bulundu.`);

    const allComments = [];
    for (let i = 0; i < videoIds.length; i++) {
        const vid = videoIds[i];
        onProgress(`Video ${i + 1}/${videoIds.length} yorumları çekiliyor…`);
        try {
            const comments = await getVideoComments(vid, apiKey, processedIds, onProgress);
            allComments.push(...comments);
        } catch (e) {
            onProgress(`⚠ Video ${vid}: ${e.message}`);
        }
    }
    onProgress(`Tamamlandı. Toplam ${allComments.length} yeni yorum bulundu.`);
    return allComments;
}
