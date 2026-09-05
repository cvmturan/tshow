'use strict';

const tmdb = require('../core/tmdb');
const sampleData = require('../core/sampleData');
const addonManager = require('../core/addonManager');

const SITE_URL = 'https://showt.fun';
const COUNTRIES = {
  IN: 'India', CA: 'Canada', US: 'United States', GB: 'United Kingdom',
  AU: 'Australia', AE: 'United Arab Emirates', DE: 'Germany', FR: 'France'
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function slugify(value = '') {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'title';
}

function imageURL(path, size) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : `${SITE_URL}/assets/tshow-icon-512.png`;
}

function providerGroups(region = {}) {
  const definitions = [
    ['flatrate', 'Subscription', 'Included with subscription'],
    ['free', 'Free', 'Free'],
    ['ads', 'Free with ads', 'Free with ads'],
    ['rent', 'Rent', 'Check current price'],
    ['buy', 'Buy', 'Check current price']
  ];
  return definitions.map(([key, label, priceLabel]) => ({
    label,
    priceLabel,
    items: Array.isArray(region[key]) ? region[key].slice(0, 24) : []
  })).filter((group) => group.items.length);
}

function safeExternalURL(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function runtimeMinutes(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) return Math.round(Number(value));
  const text = String(value || '').toLowerCase();
  const hours = Number.parseInt(text.match(/(\d+)\s*h/)?.[1], 10) || 0;
  const minutes = Number.parseInt(text.match(/(\d+)\s*m/)?.[1], 10) || 0;
  return hours || minutes ? (hours * 60) + minutes : 0;
}

function normalizeCinemeta(meta, identifier, type) {
  const title = meta?.name || meta?.title;
  if (!title) return null;
  const genres = Array.isArray(meta.genres) ? meta.genres : [];
  const cast = Array.isArray(meta.cast) ? meta.cast : [];
  return {
    id: identifier,
    title: type === 'movie' ? title : undefined,
    name: type === 'tv' ? title : undefined,
    overview: meta.description || '',
    poster_path: meta.poster || null,
    backdrop_path: meta.background || meta.poster || null,
    release_date: type === 'movie' ? String(meta.releaseInfo || '') : '',
    first_air_date: type === 'tv' ? String(meta.releaseInfo || '') : '',
    runtime: runtimeMinutes(meta.runtime),
    episode_run_time: [runtimeMinutes(meta.runtime)].filter(Boolean),
    vote_average: Number.parseFloat(meta.imdbRating) || 0,
    vote_count: 0,
    imdb_id: identifier,
    external_ids: { imdb_id: identifier },
    genres: genres.map((name) => ({ name: String(name) })),
    credits: { cast: cast.slice(0, 10).map((name) => ({ name: String(name), character: '' })) },
    videos: { results: [] },
    recommendations: { results: [] },
    similar: { results: [] },
    number_of_seasons: 0,
    number_of_episodes: Array.isArray(meta.videos) ? meta.videos.length : 0
  };
}

function normalizeWatchHub(streams = []) {
  const seen = new Set();
  return streams.map((stream) => {
    const url = safeExternalURL(stream?.externalUrl || stream?.url);
    const name = String(stream?.name || stream?.title || 'View offer').trim().slice(0, 100);
    if (!url || seen.has(url)) return null;
    seen.add(url);
    return { name, url, description: String(stream?.title || '').trim().slice(0, 160) };
  }).filter(Boolean).slice(0, 24);
}

function justWatchSearch(title, countryCode) {
  const locales = { IN: 'in', CA: 'ca', US: 'us', GB: 'uk', AU: 'au', AE: 'ae', DE: 'de', FR: 'fr' };
  return `https://www.justwatch.com/${locales[countryCode] || 'in'}/search?q=${encodeURIComponent(title)}`;
}

async function resolveCatalogTitleBySlug(slug, type) {
  const normalizedSlug = slugify(slug);
  if (!slug || normalizedSlug === 'title') return null;
  const query = String(slug).replace(/-/g, ' ').trim();
  if (query.length < 2) return null;

  const addonType = type === 'tv' ? 'series' : 'movie';
  const result = await addonManager.searchCatalogs(query);
  const candidates = (result?.groups || [])
    .filter((group) => group?.type === addonType)
    .flatMap((group) => Array.isArray(group?.data?.metas) ? group.data.metas : []);
  const match = candidates.find((meta) =>
    /^tt\d{5,12}$/i.test(String(meta?.id || '')) &&
    slugify(meta?.name || meta?.title || '') === normalizedSlug
  );
  if (!match) return null;
  return { id: String(match.id), title: String(match.name || match.title) };
}

async function resolveDiscoveryTitle(id, type) {
  const addonType = type === 'tv' ? 'series' : 'movie';
  const result = await addonManager.getCatalog('org.cvmturan.discovery', addonType, 'top');
  const meta = (result?.metas || []).find((candidate) => String(candidate?.id || '') === String(id));
  return normalizeCinemeta(meta, id, type);
}

function renderProviders(groups, link, country, fallbackOffers = [], fallbackURL = 'https://www.justwatch.com/') {
  if (!groups.length && fallbackOffers.length) return `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Where to watch · ${country}</p><h2>Available viewing links</h2><p>Current legal availability links returned by the built-in WatchHub catalog.</p></div><div class="title-provider-list">${fallbackOffers.map((offer) => `<a class="title-provider" href="${escapeHTML(offer.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${escapeHTML(offer.name)}</strong><small>${escapeHTML(offer.description || 'Open provider')}</small></span></a>`).join('')}</div><p class="provider-credit-line">Availability can change. Confirm the final price and region on the provider page.</p></section>`;
  if (!groups.length) return `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Where to watch · ${country}</p><h2>No provider listing found</h2></div><p class="title-muted">No service was returned for this title and country. Availability changes frequently.</p><a class="button button-secondary" href="${escapeHTML(safeExternalURL(link) || fallbackURL)}" target="_blank" rel="noopener noreferrer">Search current availability ↗</a><p class="provider-credit-line">Availability search powered by JustWatch.</p></section>`;
  const destination = /^https:\/\//.test(link || '') ? link : 'https://www.justwatch.com/';
  const usesWatchHub = groups.some((group) => group.items.some((provider) => provider.provider_url));
  const attributionNote = usesWatchHub
    ? 'Legal viewing links returned by WatchHub. Confirm current price and availability on the provider page.'
    : `Availability data powered by <a href="${escapeHTML(destination)}" target="_blank" rel="noopener noreferrer">JustWatch</a> via TMDB. Exact prices are shown by the provider because public availability data does not include them.`;
  return `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Where to watch · ${country}</p><h2>Available services</h2><p>Only services currently returned for this title and country are shown.</p></div>${groups.map((group) => `<div class="title-provider-group"><h3>${group.label}</h3><div class="title-provider-list">${group.items.map((provider) => { const providerDestination = safeExternalURL(provider.provider_url) || destination; return `<a class="title-provider" href="${escapeHTML(providerDestination)}" target="_blank" rel="noopener noreferrer">${provider.logo_path ? `<img src="${imageURL(provider.logo_path, 'w92')}" alt="">` : ''}<span><strong>${escapeHTML(provider.provider_name)}</strong><small>${escapeHTML(provider.provider_description || group.priceLabel)}</small></span></a>`; }).join('')}</div></div>`).join('')}<p class="provider-credit-line">${attributionNote}</p></section>`;
}

function renderTitlePage(details, providers, type, country, fallbackOffers = []) {
  const title = details.title || details.name || 'Untitled';
  const id = String(details.id);
  const slug = slugify(title);
  const kind = type === 'tv' ? 'series' : 'movie';
  const canonical = `${SITE_URL}/${kind}/${id}/${slug}`;
  const overview = details.overview || `Discover ${title}, its cast, rating, trailer and legal viewing availability on TShow.`;
  const year = String(details.release_date || details.first_air_date || '').slice(0, 4);
  const runtime = type === 'tv' ? details.episode_run_time?.[0] : details.runtime;
  const rating = Number(details.vote_average);
  const imdbId = details.external_ids?.imdb_id || details.imdb_id || '';
  const cast = Array.isArray(details.credits?.cast) ? details.credits.cast.filter((person) => person?.name).slice(0, 10) : [];
  const trailers = Array.isArray(details.videos?.results) ? details.videos.results : [];
  const trailer = trailers.find((video) => video.site === 'YouTube' && video.type === 'Trailer' && video.official) || trailers.find((video) => video.site === 'YouTube' && video.type === 'Trailer');
  const recommendations = [...(details.recommendations?.results || []), ...(details.similar?.results || [])]
    .filter((item, index, values) => item?.id && values.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 10);
  const genres = Array.isArray(details.genres) ? details.genres.map((genre) => genre.name).filter(Boolean) : [];
  const region = providers?.results?.[country] || {};
  const groups = providerGroups(region);
  if (!groups.length && fallbackOffers.length) {
    groups.push({
      label: 'Viewing links',
      priceLabel: 'Open provider',
      items: fallbackOffers.map((offer) => ({
        provider_name: offer.name,
        provider_url: offer.url,
        provider_description: offer.description,
        logo_path: null
      }))
    });
  }
  const poster = safeExternalURL(details.poster_path) || imageURL(details.poster_path, 'w500');
  const backdrop = safeExternalURL(details.backdrop_path) || imageURL(details.backdrop_path || details.poster_path, 'original');
  const availabilitySearch = justWatchSearch(title, country);
  if (!region.link) region.link = availabilitySearch;
  const metadataNote = details.vote_count
    ? 'Metadata and community rating from TMDB. TShow is not endorsed or certified by TMDB. IMDb is linked for reference.'
    : 'Metadata from Cinemeta. The displayed IMDb score is supplied by that catalog; IMDb is linked for reference.';
  const structuredData = {
    '@context': 'https://schema.org', '@type': type === 'tv' ? 'TVSeries' : 'Movie',
    name: title, description: overview, image: poster, url: canonical,
    dateCreated: year || undefined,
    aggregateRating: Number.isFinite(rating) && details.vote_count ? { '@type': 'AggregateRating', ratingValue: rating.toFixed(1), bestRating: '10', ratingCount: details.vote_count } : undefined,
    actor: cast.map((person) => ({ '@type': 'Person', name: person.name }))
  };

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090a0d"><meta name="description" content="${escapeHTML(overview.slice(0, 155))}"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:type" content="video.${type === 'tv' ? 'tv_show' : 'movie'}"><meta property="og:site_name" content="TShow"><meta property="og:title" content="${escapeHTML(title)} · TShow"><meta property="og:description" content="${escapeHTML(overview.slice(0, 200))}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${poster}"><title>${escapeHTML(title)} · TShow</title><link rel="icon" href="/assets/tshow-icon-192.png" type="image/png"><link rel="stylesheet" href="/css/main.css?v=20260906-3"><script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script></head><body class="title-page"><header class="editorial-header"><a class="editorial-brand" href="/"><img src="/assets/tshow-logo.png" alt=""><span>TShow</span></a><nav aria-label="TShow"><a href="/">Home</a><a href="/?view=explore">Explore</a><a href="/news/">News</a></nav><a class="button button-primary" href="/?title=${type}:${id}">Open in TShow</a></header><main><section class="title-hero" style="--title-backdrop:url('${backdrop}')"><div class="title-hero-shade"></div><div class="title-hero-content"><img class="title-poster" src="${poster}" alt="${escapeHTML(title)} poster"><div><p class="eyebrow">${type === 'tv' ? 'Series' : 'Movie'}${year ? ` · ${year}` : ''}</p><h1>${escapeHTML(title)}</h1>${details.tagline ? `<p class="title-tagline">${escapeHTML(details.tagline)}</p>` : ''}<div class="title-facts">${Number.isFinite(rating) && rating > 0 ? `<span class="title-rating">★ ${rating.toFixed(1)} <small>${details.vote_count ? "TMDB" : "IMDb"}</small></span>` : ''}${runtime ? `<span>${runtime} min</span>` : ''}${genres.slice(0, 3).map((genre) => `<span>${escapeHTML(genre)}</span>`).join('')}</div><p class="title-overview">${escapeHTML(overview)}</p><div class="title-actions">${trailer ? `<a class="button button-secondary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noopener noreferrer">Watch official trailer</a>` : ''}${imdbId ? `<a class="button button-quiet" href="https://www.imdb.com/title/${encodeURIComponent(imdbId)}/" target="_blank" rel="noopener noreferrer">View on IMDb</a>` : ''}</div></div></div></section><div class="title-content">${renderProviders(groups, region.link, COUNTRIES[country])}<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Availability region</p><h2>Choose your country</h2></div><form class="title-country-form" method="get"><select name="country" aria-label="Viewing country">${Object.entries(COUNTRIES).map(([code, name]) => `<option value="${code}"${code === country ? ' selected' : ''}>${name}</option>`).join('')}</select><button class="button button-quiet" type="submit">Update</button></form></section>${cast.length ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">People</p><h2>Cast</h2></div><div class="title-cast">${cast.map((person) => `<article><span>${person.profile_path ? `<img src="${imageURL(person.profile_path, 'w185')}" alt="">` : escapeHTML(person.name[0])}</span><strong>${escapeHTML(person.name)}</strong><small>${escapeHTML(person.character || 'Cast')}</small></article>`).join('')}</div></section>` : ''}${type === 'tv' && details.number_of_seasons ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Episodes</p><h2>${details.number_of_seasons} seasons · ${details.number_of_episodes || '—'} episodes</h2></div></section>` : ''}${recommendations.length ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Keep exploring</p><h2>More like this</h2></div><div class="title-recommendations">${recommendations.map((item) => { const itemTitle = item.title || item.name || 'Title'; return `<a href="/${kind}/${Number(item.id)}/${slugify(itemTitle)}"><img src="${imageURL(item.poster_path, 'w342')}" alt=""><strong>${escapeHTML(itemTitle)}</strong></a>`; }).join('')}</div></section>` : ''}<p class="title-data-note">${metadataNote}</p></div></main></body></html>`;
}

async function titlePage(req, res) {
  const type = req.params.type === 'series' ? 'tv' : 'movie';
  const id = String(req.params.id || '');
  const country = Object.hasOwn(COUNTRIES, String(req.query.country || '').toUpperCase()) ? String(req.query.country).toUpperCase() : 'IN';
  if (!/^(?:\d{1,12}|tt\d{5,12})$/i.test(id)) return res.status(404).send('Title not found');
  try {
    let details;
    let providers = { results: {} };
    let fallbackOffers = [];
    let recoveredTitle;
    if (/^tt\d{5,12}$/i.test(id)) {
      const addonType = type === 'tv' ? 'series' : 'movie';
      const metaResult = await addonManager.getMeta('org.streamflix.cinemeta', addonType, id);
      details = normalizeCinemeta(metaResult?.meta, id, type);
      const streamResult = await addonManager.getStreams('org.stremio.watchhub', addonType, id)
        .catch(() => ({ streams: [] }));
      fallbackOffers = normalizeWatchHub(streamResult?.streams);
    } else {
      const append = 'credits,videos,recommendations,similar,external_ids';
      try {
        details = type === 'tv'
          ? await tmdb.getTVDetails(id, append)
          : await tmdb.getMovieDetails(id, append);
        providers = await tmdb.getWatchProviders(id, type).catch(() => ({ results: {} }));
      } catch {
        const fallback = type === 'tv' ? sampleData.getTVDetail(id) : sampleData.getMovieDetail(id);
        const fallbackTitle = fallback?.title || fallback?.name || '';
        details = /^Unknown (?:Movie|Series)$/.test(fallbackTitle) ? null : fallback;
        if (!details) {
          details = await resolveDiscoveryTitle(id, type).catch(() => null);
        }
        if (!details) {
          recoveredTitle = await resolveCatalogTitleBySlug(req.params.slug, type).catch(() => null);
        }
      }
    }
    if (recoveredTitle) {
      const kind = type === 'tv' ? 'series' : 'movie';
      const query = new URLSearchParams({ country }).toString();
      return res.redirect(302, `/${kind}/${recoveredTitle.id}/${slugify(recoveredTitle.title)}?${query}`);
    }
    if (!details?.id) return res.status(404).send('Title not found');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
    return res.type('html').send(renderTitlePage(details, providers, type, country, fallbackOffers));
  } catch {
    return res.status(503).type('html').send('<h1>Title temporarily unavailable</h1>');
  }
}

module.exports = {
  titlePage, renderTitlePage, slugify, providerGroups,
  resolveCatalogTitleBySlug, resolveDiscoveryTitle
};
