const express = require('express');
const router = express.Router();
const addonManager = require('../core/addonManager');
const requestSigner = require('../core/requestSigner');
const transcode = require('./transcode');

const SAMPLE_ADDON_ID = 'org.streamflix.open-samples';

function clientId(req) {
  return addonManager.normalizeClientId(req.get('x-cvm-client-id'));
}

function normalizeType(type) {
  return type === 'tv' ? 'series' : type;
}

function safeWebURL(value) {
  if (typeof value !== 'string' || value.length > 4_000) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function safeMagnetURL(value) {
  if (typeof value !== 'string' || value.length > 8_000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'magnet:') return null;
    const exactTopic = String(url.searchParams.get('xt') || '');
    return /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(exactTopic) ? url : null;
  } catch {
    return null;
  }
}

function externalAppURL(stream) {
  const supplied = safeMagnetURL(stream.url);
  if (supplied) return supplied.href;

  const infoHash = String(stream.infoHash || '').trim();
  if (!/^(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(infoHash)) return null;
  const params = new URLSearchParams({ xt: `urn:btih:${infoHash}` });
  const displayName = String(stream.name || stream.title || '').trim().slice(0, 240);
  if (displayName) params.set('dn', displayName);
  return `magnet:?${params.toString()}`;
}

function formatFromToken(value) {
  const token = String(value || '').trim().toLowerCase().split(';')[0];
  if (!token) return '';
  if (['video/mp4', 'application/mp4', 'mp4', 'm4v'].includes(token)) return 'mp4';
  if (['video/webm', 'webm'].includes(token)) return 'webm';
  if ([
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/mpegurl',
    'audio/x-mpegurl',
    'hls',
    'm3u8'
  ].includes(token)) return 'hls';
  if (['video/x-matroska', 'video/mkv', 'mkv', 'matroska'].includes(token)) return 'mkv';
  if (['text/html', 'application/xhtml+xml', 'html', 'htm'].includes(token)) return 'html';
  if (['application/dash+xml', 'dash', 'mpd'].includes(token)) return 'dash';
  if (/^(application\/)?(zip|x-rar-compressed|x-7z-compressed|x-tar|gzip)$/.test(token)) return 'archive';
  return '';
}

function formatFromPath(value) {
  if (!value) return '';
  let pathname = '';
  const parsed = safeWebURL(value);
  if (parsed) {
    pathname = parsed.pathname.toLowerCase();
  } else {
    pathname = String(value).split(/[?#]/)[0].toLowerCase();
  }
  if (/\.m3u8$/.test(pathname)) return 'hls';
  if (/\.(mp4|m4v)$/.test(pathname)) return 'mp4';
  if (/\.webm$/.test(pathname)) return 'webm';
  if (/\.mkv$/.test(pathname)) return 'mkv';
  if (/\.mpd$/.test(pathname)) return 'dash';
  if (/\.(html?|xhtml)$/.test(pathname)) return 'html';
  if (/\.(zip|rar|7z|tar|tgz|gz)$/.test(pathname)) return 'archive';
  return '';
}

function inferFormat(stream, url) {
  const declaredFormats = [
    formatFromToken(stream.type),
    formatFromToken(stream.mimeType)
  ].filter(Boolean);
  const filename = formatFromPath(stream.behaviorHints?.filename);
  const pathname = formatFromPath(url);
  const unsafe = [...declaredFormats, filename, pathname]
    .find((format) => ['mkv', 'archive', 'html', 'dash'].includes(format));
  return unsafe || declaredFormats[0] || filename || pathname;
}

function normalizeStream(stream, addonId, addonName, originalIndex = 0, options = {}) {
  if (!stream || typeof stream !== 'object') return null;

  const parsedURL = safeWebURL(stream.url);
  const parsedExternalURL = safeWebURL(stream.externalUrl);
  const appURL = externalAppURL(stream);
  const externalOnly = options.externalOnly === true;
  const ytId = typeof stream.ytId === 'string' && /^[a-zA-Z0-9_-]{6,20}$/.test(stream.ytId)
    ? stream.ytId
    : null;
  const externalUrl = parsedExternalURL?.href || (ytId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`
    : null);
  const sourceURL = parsedURL?.href || null;

  const behaviorHints = stream.behaviorHints && typeof stream.behaviorHints === 'object'
    ? stream.behaviorHints
    : {};
  const requestHeaders = behaviorHints.proxyHeaders?.request;
  const headerPayload = requestHeaders && typeof requestHeaders === 'object' && Object.keys(requestHeaders).length
    ? Buffer.from(JSON.stringify(requestHeaders)).toString('base64url').slice(0, 6000)
    : null;
  const notWebReady = behaviorHints.notWebReady === true;
  const format = inferFormat(stream, sourceURL);

  let browserReady = false;
  let playbackMode = 'unsupported';
  let unsupportedReason = '';

  if (externalOnly && sourceURL) {
    playbackMode = 'external-player';
    unsupportedReason = headerPayload
      ? 'This source requires provider-specific headers and may not work in every external player.'
      : 'User-installed sources open directly on this device and are never relayed through TShow.';
  } else if (sourceURL) {
    if (notWebReady && format === 'archive') {
      unsupportedReason = 'Archive and download-pack sources cannot be played in the browser.';
    } else if (format === 'html') {
      unsupportedReason = 'This URL is a webpage, not a direct video stream.';
    } else if (format === 'dash') {
      unsupportedReason = 'DASH playback is not enabled in this player.';
    } else {
      browserReady = true;
      playbackMode = format === 'hls'
        ? 'hls'
        : (format === 'mp4' || format === 'webm') && !headerPayload && !notWebReady
          ? 'direct'
          : 'proxy';
    }
  } else if (appURL || stream.infoHash || stream.fileIdx !== undefined) {
    playbackMode = appURL ? 'external-app' : 'unsupported';
    unsupportedReason = appURL
      ? 'Torrent source available to an external app. TShow does not download, proxy, or transcode it.'
      : 'This torrent source did not include a valid magnet link or info hash.';
  } else if (
    Array.isArray(stream.zipUrls) ||
    Array.isArray(stream.rarUrls) ||
    Array.isArray(stream['7zipUrls']) ||
    Array.isArray(stream.tarUrls)
  ) {
    unsupportedReason = 'Archive and download-pack sources cannot be played in the browser.';
  }

  let playUrl = null;
  let transcodeUrl = null;
  let transcodeLowUrl = null;
  if (!externalOnly && browserReady && sourceURL) {
    if (playbackMode === 'direct') {
      playUrl = sourceURL;
    } else {
      const params = new URLSearchParams({ src: sourceURL });
      if (headerPayload) params.set('h', headerPayload);
      params.set('sig', requestSigner.signatureFor(sourceURL, headerPayload));
      playUrl = `/api/proxy/stream?${params.toString()}`;
    }
    if (playbackMode !== 'hls') {
      transcodeUrl = transcode.sessionPath({
        src: sourceURL,
        h: headerPayload,
        vc: 'copy'
      });
      transcodeLowUrl = transcode.sessionPath({
        src: sourceURL,
        h: headerPayload,
        vc: 'reencode'
      });
    }
  }

  const sizeBytes = Number(behaviorHints.videoSize) ||
    parseSizeHint(stream.name, stream.title, stream.description);
  const sizeLabel = formatSize(sizeBytes);

  if (!browserReady && externalUrl) {
    playbackMode = ytId ? 'youtube' : 'external';
    unsupportedReason = '';
  }

  if (!browserReady && !externalUrl && !sourceURL && !appURL && !unsupportedReason) return null;

  return {
    url: playUrl,
    externalPlayerUrl: sourceURL,
    externalAppUrl: appURL,
    attemptUrl: null,
    transcodeUrl,
    transcodeLowUrl,
    externalUrl,
    ytId,
    name: String(stream.name || stream.title || addonName || 'Stream').slice(0, 140),
    title: String(stream.title || stream.name || 'Web stream').slice(0, 240),
    description: String(stream.description || '').slice(0, 500),
    quality: String(stream.quality || '').slice(0, 20),
    sizeBytes: sizeBytes || null,
    sizeLabel,
    type: format === 'hls'
      ? 'application/vnd.apple.mpegurl'
      : format === 'mp4'
        ? 'video/mp4'
        : format === 'webm'
          ? 'video/webm'
          : format === 'mkv'
            ? 'video/x-matroska'
            : '',
    format,
    playbackMode,
    browserReady,
    requiresHeaders: Boolean(headerPayload),
    notWebReady,
    unsupportedReason: unsupportedReason || null,
    subtitles: externalOnly ? [] : normalizeSubtitles(stream.subtitles),
    behaviorHints,
    isDemo: addonId === SAMPLE_ADDON_ID,
    sourceAddon: addonId,
    sourceAddonName: addonName || addonId,
    _originalIndex: originalIndex
  };
}

function normalizeSubtitles(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((subtitle) =>
    subtitle && typeof subtitle.url === 'string' && safeWebURL(subtitle.url)
  ).slice(0, 30).map((subtitle) => ({
    id: String(subtitle.id || subtitle.url).slice(0, 200),
    url: subtitle.url,
    proxyUrl: subtitleProxyURL(subtitle.url),
    lang: String(subtitle.lang || '').slice(0, 12),
    label: String(subtitle.label || '').slice(0, 60)
  }));
}

function subtitleProxyURL(url) {
  const params = new URLSearchParams({
    src: url,
    sig: requestSigner.signatureFor(url)
  });
  return `/api/proxy/subtitle?${params.toString()}`;
}

const SIZE_UNITS = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };

function parseSizeHint(...texts) {
  const match = texts.join(' ').match(/(\d+(?:[.,]\d+)?)\s*(KB|MB|GB|TB)\b/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(',', '.'));
  const multiplier = SIZE_UNITS[match[2].toLowerCase()];
  return Number.isFinite(value) && value > 0 ? Math.round(value * multiplier) : null;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit <= 1 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

function qualityScore(stream) {
  const text = `${stream.quality || ''} ${stream.name || ''} ${stream.title || ''}`.toLowerCase();
  if (text.includes('2160') || text.includes('4k')) return 4;
  if (text.includes('1080')) return 3;
  if (text.includes('720')) return 2;
  if (text.includes('480')) return 1;
  return 0;
}

function readinessScore(stream) {
  if (stream.browserReady) {
    const modeBonus = stream.playbackMode === 'direct' ? 60 : stream.playbackMode === 'hls' ? 30 : 0;
    return (stream.isDemo ? 400 : 500) + modeBonus;
  }
  if (stream.externalUrl || stream.externalPlayerUrl || stream.externalAppUrl) {
    return stream.playbackMode === 'youtube' ? 350 : 300;
  }
  return 0;
}

function compareStreams(left, right) {
  const readiness = readinessScore(right) - readinessScore(left);
  if (readiness) return readiness;
  const quality = qualityScore(right) - qualityScore(left);
  if (quality) return quality;
  const secure = Number(String(right.url || right.externalPlayerUrl || right.externalUrl || '').startsWith('https:')) -
    Number(String(left.url || left.externalPlayerUrl || left.externalUrl || '').startsWith('https:'));
  if (secure) return secure;
  const source = String(left.sourceAddon).localeCompare(String(right.sourceAddon));
  if (source) return source;
  return left._originalIndex - right._originalIndex;
}

function supportsRequest(manifest, type, id) {
  if (!manifest?.resources?.includes('stream')) return false;
  if (manifest.types?.length && !manifest.types.includes(type)) return false;
  if (manifest.idPrefixes?.length && !manifest.idPrefixes.some((prefix) => id.startsWith(prefix))) {
    return false;
  }
  return true;
}

async function collectStreams(type, id, addonIds, browserId) {
  const normalizedType = normalizeType(type);
  const knownIds = new Set(addonManager.getAddonIds(browserId));
  const selectedIds = addonIds?.length
    ? addonIds.filter((addonId) => knownIds.has(addonId))
    : Array.from(knownIds).filter((addonId) =>
        supportsRequest(addonManager.getManifest(addonId, browserId), normalizedType, id)
      );

  selectedIds.sort((left, right) => {
    if (left === SAMPLE_ADDON_ID) return 1;
    if (right === SAMPLE_ADDON_ID) return -1;
    return String(left).localeCompare(String(right));
  });

  const sourceResults = await Promise.all(selectedIds.slice(0, 20).map(async (addonId) => {
    const manifest = addonManager.getManifest(addonId, browserId);
    const addonName = manifest?.name || addonId;
    try {
      const result = await addonManager.getStreams(addonId, normalizedType, id, browserId);
      const rawStreams = Array.isArray(result.streams) ? result.streams : [];
      const streams = rawStreams
        .map((stream, index) => normalizeStream(stream, addonId, addonName, index, {
          externalOnly: manifest?.isCustom === true
        }))
        .filter(Boolean)
        .slice(0, 100);
      return {
        addonId,
        addonName,
        streams,
        returned: rawStreams.length,
        actionable: streams.filter((stream) =>
          stream.browserReady || stream.externalUrl || stream.externalPlayerUrl || stream.externalAppUrl
        ).length,
        unsupported: streams.filter((stream) =>
          !stream.browserReady && !stream.externalUrl && !stream.externalPlayerUrl && !stream.externalAppUrl
        ).length +
          Math.max(0, rawStreams.length - streams.length)
      };
    } catch (error) {
      return {
        addonId,
        addonName,
        streams: [],
        returned: 0,
        actionable: 0,
        unsupported: 0,
        error: error.message
      };
    }
  }));

  const streams = sourceResults
    .flatMap((source) => source.streams)
    .sort(compareStreams)
    .map(({ _originalIndex, ...stream }) => stream);

  return { streams, sources: sourceResults.map(({ streams: ignored, ...source }) => source) };
}

router.get('/play/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const streamIndex = Math.max(0, Number.parseInt(req.query.streamIndex, 10) || 0);
    const addonIds = req.query.addonId ? [String(req.query.addonId)] : null;
    const { streams } = await collectStreams(type, id, addonIds, clientId(req));
    const selected = streams[streamIndex];

    if (!selected) {
      return res.status(404).json({ error: 'No usable source was found' });
    }

    res.json(selected);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/subtitles/:type/:id', async (req, res) => {
  try {
    const normalizedType = normalizeType(req.params.type);
    const { id } = req.params;
    if (!['movie', 'series'].includes(normalizedType) || !id || id.length > 180) {
      return res.status(400).json({ error: 'Type must be movie or series' });
    }

    const browserId = clientId(req);
    const providerIds = addonManager.getAddonIds(browserId)
      .filter((addonId) => {
        const manifest = addonManager.getManifest(addonId, browserId);
        return manifest?.isCustom !== true && manifest?.resources?.includes('subtitles');
      })
      .slice(0, 6);

    const results = await Promise.all(providerIds.map(async (addonId) => {
      const name = addonManager.getManifest(addonId, browserId)?.name || addonId;
      try {
        const data = await addonManager.fetchAddonResource(addonId, 'subtitles', normalizedType, id, {}, 15_000, browserId);
        const raw = Array.isArray(data?.subtitles) ? data.subtitles : [];
        return {
          addonId,
          name,
          subtitles: raw.filter((subtitle) =>
            subtitle &&
            typeof subtitle.url === 'string' &&
            /^https?:\/\//i.test(subtitle.url) &&
            subtitle.url.length <= 4000
          ).slice(0, 40)
        };
      } catch (error) {
        return { addonId, name, subtitles: [], error: error.message };
      }
    }));

    const seen = new Set();
    const subtitles = [];
    for (const provider of results) {
      for (const subtitle of provider.subtitles) {
        const key = `${String(subtitle.lang || '').toLowerCase()}|${subtitle.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        subtitles.push({
          id: String(subtitle.id || subtitle.url).slice(0, 200),
          url: subtitle.url,
          proxyUrl: subtitleProxyURL(subtitle.url),
          lang: String(subtitle.lang || '').slice(0, 12),
          label: String(subtitle.label || '').slice(0, 60),
          provider: provider.name
        });
      }
    }
    subtitles.sort((left, right) => String(left.lang).localeCompare(String(right.lang)));

    res.json({
      subtitles: subtitles.slice(0, 80),
      providers: results.map(({ addonId, name, subtitles: ignored, error }) => ({ addonId, name, error }))
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!['movie', 'series', 'tv'].includes(type)) {
      return res.status(400).json({ error: 'Type must be movie or series' });
    }
    if (!id || id.length > 180) {
      return res.status(400).json({ error: 'Invalid media id' });
    }

    const addonIds = req.query.addonIds
      ? String(req.query.addonIds).split(',').map((value) => value.trim()).filter(Boolean)
      : null;

    const { streams, sources } = await collectStreams(type, id, addonIds, clientId(req));
    res.json({ streams, sources, count: streams.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.classifyStream = normalizeStream;
router.compareStreams = compareStreams;

module.exports = router;
