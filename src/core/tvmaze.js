const axios = require('axios');

const BASE_URL = 'https://api.tvmaze.com';
const CACHE_TTL_MS = 60 * 60 * 1000;

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3_000);
}

class TVmazeClient {
  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 7_000,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
      maxRedirects: 0,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Cvm-Turan/1.2 (legal metadata search)'
      }
    });
    this.cache = new Map();
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.savedAt < CACHE_TTL_MS) return entry.data;
    this.cache.delete(key);
    return null;
  }

  setCached(key, data) {
    this.cache.set(key, { data, savedAt: Date.now() });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
    return data;
  }

  normalizeShow(show, requestedId = null) {
    if (!show || typeof show !== 'object' || !show.id || !show.name) return null;
    const imdbId = /^tt\d+$/i.test(String(show.externals?.imdb || ''))
      ? String(show.externals.imdb)
      : null;
    const id = imdbId || requestedId || `tvmaze:${show.id}`;
    const premiered = String(show.premiered || '');
    const videos = Array.isArray(show._embedded?.episodes)
      ? show._embedded.episodes
          .filter((episode) => Number.isInteger(episode?.season) && Number.isInteger(episode?.number))
          .slice(0, 500)
          .map((episode) => ({
            id: `${id}:${episode.season}:${episode.number}`,
            title: String(episode.name || `Episode ${episode.number}`).slice(0, 240),
            season: episode.season,
            episode: episode.number,
            released: episode.airdate || null
          }))
      : [];

    return {
      id,
      imdb_id: imdbId,
      type: 'series',
      name: String(show.name).slice(0, 240),
      description: cleanText(show.summary),
      releaseInfo: premiered.match(/\b\d{4}\b/)?.[0] || '',
      poster: show.image?.original || show.image?.medium || null,
      background: show.image?.original || null,
      imdbRating: Number(show.rating?.average) || 0,
      genres: Array.isArray(show.genres) ? show.genres.map(String).slice(0, 20) : [],
      runtime: Number(show.averageRuntime || show.runtime) || null,
      videos,
      behaviorHints: videos[0] ? { defaultVideoId: videos[0].id } : {},
      links: show.url ? [{ name: 'TVmaze', category: 'source', url: show.url }] : []
    };
  }

  async search(query) {
    const normalized = String(query || '').trim().slice(0, 120);
    const key = `search:${normalized.toLocaleLowerCase()}`;
    const cached = this.getCached(key);
    if (cached) return cached;

    const response = await this.client.get('/search/shows', { params: { q: normalized } });
    const metas = (Array.isArray(response.data) ? response.data : [])
      .map((entry) => this.normalizeShow(entry?.show))
      .filter(Boolean)
      .slice(0, 20);
    return this.setCached(key, { metas });
  }

  async getMeta(id) {
    const requestedId = String(id || '').trim();
    const key = `meta:${requestedId}`;
    const cached = this.getCached(key);
    if (cached) return cached;

    let showId = requestedId.match(/^tvmaze:(\d+)$/i)?.[1] || null;
    if (!showId && /^tt\d+$/i.test(requestedId)) {
      const lookup = await this.client.get('/lookup/shows', {
        params: { imdb: requestedId },
        validateStatus: (status) => status === 200 || status === 301 || status === 302
      });
      showId = lookup.data?.id;
      if (!showId && lookup.headers?.location) {
        const destination = new URL(lookup.headers.location, BASE_URL);
        const match = destination.pathname.match(/^\/shows\/(\d+)$/);
        if (destination.origin !== BASE_URL || !match) {
          throw new Error('TVmaze returned an unsafe lookup redirect');
        }
        showId = match[1];
      }
    }
    if (!showId) throw new Error('TVmaze title not found');

    const response = await this.client.get(`/shows/${encodeURIComponent(showId)}`, {
      params: { embed: 'episodes' }
    });
    const meta = this.normalizeShow(response.data, requestedId);
    if (!meta) throw new Error('TVmaze returned invalid title metadata');
    return this.setCached(key, { meta });
  }
}

module.exports = new TVmazeClient();
module.exports.cleanText = cleanText;
