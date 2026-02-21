#!/usr/bin/env node
/**
 * check-comments.mjs — GitHub Actions server-side comment checker
 * Run via: node scripts/check-comments.mjs
 *
 * Env vars required:
 *   YT_API_KEY    — YouTube Data API v3 key (GitHub Secret)
 *   GITHUB_TOKEN  — auto-provided by GitHub Actions
 *   REPO_OWNER    — GitHub username
 *   REPO_NAME     — repository name
 */

import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const API_KEY = process.env.YT_API_KEY;
const GH_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const API_BASE = 'https://www.googleapis.com/youtube/v3';

if (!API_KEY) { console.error('❌ YT_API_KEY eksik'); process.exit(1); }

// ——— Load config ———
let config = {};
try {
    config = JSON.parse(readFileSync(resolve(ROOT, 'data/config.json'), 'utf8'));
} catch (e) { console.warn('⚠ config.json okunamadı, varsayılanlar kullanılıyor.'); }

const CHANNEL_URL = config.channelUrl || '';
const POINTS_COMMENT = config.pointsPerComment || 30;

if (!CHANNEL_URL) {
    console.log('ℹ️  Kanal URL ayarlanmamış. Çıkılıyor.');
    process.exit(0);
}

// ——— Load scores ———
let scores = { lastUpdated: '', processedCommentIds: [], users: {} };
try {
    scores = JSON.parse(readFileSync(resolve(ROOT, 'data/scores.json'), 'utf8'));
} catch (e) { console.warn('⚠ scores.json okunamadı, sıfırdan başlanıyor.'); }

const processedSet = new Set(scores.processedCommentIds || []);

// ——— YouTube helpers ———
async function ytFetch(endpoint, params) {
    const url = new URL(`${API_BASE}/${endpoint}`);
    Object.entries({ ...params, key: API_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data;
}

async function resolveChannelId(input) {
    input = input.trim();
    if (/^UC[\w-]{22}$/.test(input)) return input;

    let match = input.match(/\/channel\/(UC[\w-]{22})/);
    if (match) return match[1];

    match = input.match(/\/@([\w.-]+)/);
    if (match) {
        const d = await ytFetch('channels', { part: 'id', forHandle: match[1] });
        if (d.items?.[0]) return d.items[0].id;
    }

    match = input.match(/\/(?:c|user)\/([\w.-]+)/);
    if (match) {
        const d = await ytFetch('channels', { part: 'id', forUsername: match[1] });
        if (d.items?.[0]) return d.items[0].id;
    }
    throw new Error('Kanal ID çözümlenemedi: ' + input);
}

async function getUploadsPlaylist(channelId) {
    const d = await ytFetch('channels', { part: 'contentDetails', id: channelId });
    return d.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
}

async function getAllVideoIds(playlistId) {
    const ids = [];
    let pageToken = '';
    do {
        const params = { part: 'contentDetails', playlistId, maxResults: 50 };
        if (pageToken) params.pageToken = pageToken;
        const d = await ytFetch('playlistItems', params);
        for (const item of d.items || []) ids.push(item.contentDetails.videoId);
        pageToken = d.nextPageToken || '';
    } while (pageToken);
    return ids;
}

async function getVideoComments(videoId) {
    const comments = [];
    let pageToken = '';
    do {
        const params = { part: 'snippet', videoId, maxResults: 100 };
        if (pageToken) params.pageToken = pageToken;
        let d;
        try {
            d = await ytFetch('commentThreads', params);
        } catch (e) {
            if (e.message.includes('disabled')) return comments;
            throw e;
        }
        for (const item of d.items || []) {
            if (processedSet.has(item.id)) continue;
            const top = item.snippet.topLevelComment.snippet;
            comments.push({
                id: item.id,
                authorChannelId: top.authorChannelId?.value || '',
                authorDisplayName: top.authorDisplayName || 'Anonim',
                authorProfileImageUrl: top.authorProfileImageUrl || '',
            });
        }
        pageToken = d.nextPageToken || '';
    } while (pageToken);
    return comments;
}

// ——— Main ———
(async () => {
    try {
        console.log('🔍 Kanal ID çözümleniyor…');
        const channelId = await resolveChannelId(CHANNEL_URL);
        console.log('✅ Kanal ID:', channelId);

        const uploadsId = await getUploadsPlaylist(channelId);
        const videoIds = await getAllVideoIds(uploadsId);
        console.log(`📹 ${videoIds.length} video bulundu.`);

        let totalNew = 0;
        for (let i = 0; i < videoIds.length; i++) {
            console.log(`  Video ${i + 1}/${videoIds.length} işleniyor…`);
            try {
                const comments = await getVideoComments(videoIds[i]);
                for (const c of comments) {
                    processedSet.add(c.id);
                    const uid = c.authorChannelId || c.authorDisplayName;
                    if (!scores.users[uid]) {
                        scores.users[uid] = { name: c.authorDisplayName, avatar: c.authorProfileImageUrl, points: 0, commentCount: 0 };
                    }
                    scores.users[uid].points += POINTS_COMMENT;
                    scores.users[uid].commentCount += 1;
                    scores.users[uid].name = c.authorDisplayName;
                    if (c.authorProfileImageUrl) scores.users[uid].avatar = c.authorProfileImageUrl;
                    totalNew++;
                }
            } catch (e) {
                console.warn(`  ⚠ Video ${videoIds[i]}: ${e.message}`);
            }
        }

        scores.processedCommentIds = Array.from(processedSet);
        scores.lastUpdated = new Date().toISOString();

        writeFileSync(resolve(ROOT, 'data/scores.json'), JSON.stringify(scores, null, 2), 'utf8');
        console.log(`✅ Bitti! ${totalNew} yeni yorum işlendi. scores.json güncellendi.`);
    } catch (e) {
        console.error('❌ Hata:', e.message);
        process.exit(1);
    }
})();
