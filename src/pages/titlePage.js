'use strict';

const tmdb = require('../core/tmdb');
const sampleData = require('../core/sampleData');

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

function renderProviders(groups, link, country) {
  if (!groups.length) return `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Where to watch · ${country}</p><h2>No provider listing found</h2></div><p class="title-muted">Availability changes frequently. Try another country or check again later.</p><p class="provider-credit-line">Availability data powered by JustWatch via TMDB.</p></section>`;
  const destination = /^https:\/\//.test(link || '') ? link : 'https://www.justwatch.com/';
  return `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Where to watch · ${country}</p><h2>Available services</h2><p>Only services currently returned for this title and country are shown.</p></div>${groups.map((group) => `<div class="title-provider-group"><h3>${group.label}</h3><div class="title-provider-list">${group.items.map((provider) => `<a class="title-provider" href="${escapeHTML(destination)}" target="_blank" rel="noopener noreferrer"><img src="${imageURL(provider.logo_path, 'w92')}" alt=""><span><strong>${escapeHTML(provider.provider_name)}</strong><small>${group.priceLabel}</small></span></a>`).join('')}</div></div>`).join('')}<p class="provider-credit-line">Availability data powered by <a href="${escapeHTML(destination)}" target="_blank" rel="noopener noreferrer">JustWatch</a> via TMDB. Exact prices are shown by the provider because public availability data does not include them.</p></section>`;
}

function renderTitlePage(details, providers, type, country) {
  const title = details.title || details.name || 'Untitled';
  const id = Number(details.id);
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
  const poster = imageURL(details.poster_path, 'w500');
  const backdrop = imageURL(details.backdrop_path || details.poster_path, 'original');
  const structuredData = {
    '@context': 'https://schema.org', '@type': type === 'tv' ? 'TVSeries' : 'Movie',
    name: title, description: overview, image: poster, url: canonical,
    dateCreated: year || undefined,
    aggregateRating: Number.isFinite(rating) && details.vote_count ? { '@type': 'AggregateRating', ratingValue: rating.toFixed(1), bestRating: '10', ratingCount: details.vote_count } : undefined,
    actor: cast.map((person) => ({ '@type': 'Person', name: person.name }))
  };

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090a0d"><meta name="description" content="${escapeHTML(overview.slice(0, 155))}"><meta name="robots" content="index, follow, max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:type" content="video.${type === 'tv' ? 'tv_show' : 'movie'}"><meta property="og:site_name" content="TShow"><meta property="og:title" content="${escapeHTML(title)} · TShow"><meta property="og:description" content="${escapeHTML(overview.slice(0, 200))}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${poster}"><title>${escapeHTML(title)} · TShow</title><link rel="icon" href="/assets/tshow-icon-192.png" type="image/png"><link rel="stylesheet" href="/css/main.css?v=20260906-2"><script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script></head><body class="title-page"><header class="editorial-header"><a class="editorial-brand" href="/"><img src="/assets/tshow-logo.png" alt=""><span>TShow</span></a><nav aria-label="TShow"><a href="/">Home</a><a href="/?view=explore">Explore</a><a href="/news/">News</a></nav><a class="button button-primary" href="/?title=${type}:${id}">Open in TShow</a></header><main><section class="title-hero" style="--title-backdrop:url('${backdrop}')"><div class="title-hero-shade"></div><div class="title-hero-content"><img class="title-poster" src="${poster}" alt="${escapeHTML(title)} poster"><div><p class="eyebrow">${type === 'tv' ? 'Series' : 'Movie'}${year ? ` · ${year}` : ''}</p><h1>${escapeHTML(title)}</h1>${details.tagline ? `<p class="title-tagline">${escapeHTML(details.tagline)}</p>` : ''}<div class="title-facts">${Number.isFinite(rating) && rating > 0 ? `<span class="title-rating">★ ${rating.toFixed(1)} <small>TMDB</small></span>` : ''}${runtime ? `<span>${runtime} min</span>` : ''}${genres.slice(0, 3).map((genre) => `<span>${escapeHTML(genre)}</span>`).join('')}</div><p class="title-overview">${escapeHTML(overview)}</p><div class="title-actions">${trailer ? `<a class="button button-secondary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noopener noreferrer">Watch official trailer</a>` : ''}${imdbId ? `<a class="button button-quiet" href="https://www.imdb.com/title/${encodeURIComponent(imdbId)}/" target="_blank" rel="noopener noreferrer">View on IMDb</a>` : ''}</div></div></div></section><div class="title-content">${renderProviders(groups, region.link, COUNTRIES[country])}<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Availability region</p><h2>Choose your country</h2></div><form class="title-country-form" method="get"><select name="country" aria-label="Viewing country">${Object.entries(COUNTRIES).map(([code, name]) => `<option value="${code}"${code === country ? ' selected' : ''}>${name}</option>`).join('')}</select><button class="button button-quiet" type="submit">Update</button></form></section>${cast.length ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">People</p><h2>Cast</h2></div><div class="title-cast">${cast.map((person) => `<article><span>${person.profile_path ? `<img src="${imageURL(person.profile_path, 'w185')}" alt="">` : escapeHTML(person.name[0])}</span><strong>${escapeHTML(person.name)}</strong><small>${escapeHTML(person.character || 'Cast')}</small></article>`).join('')}</div></section>` : ''}${type === 'tv' && details.number_of_seasons ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Episodes</p><h2>${details.number_of_seasons} seasons · ${details.number_of_episodes || '—'} episodes</h2></div></section>` : ''}${recommendations.length ? `<section class="title-section"><div class="title-section-heading"><p class="section-kicker">Keep exploring</p><h2>More like this</h2></div><div class="title-recommendations">${recommendations.map((item) => { const itemTitle = item.title || item.name || 'Title'; return `<a href="/${kind}/${Number(item.id)}/${slugify(itemTitle)}"><img src="${imageURL(item.poster_path, 'w342')}" alt=""><strong>${escapeHTML(itemTitle)}</strong></a>`; }).join('')}</div></section>` : ''}<p class="title-data-note">Metadata and community rating from TMDB. TShow is not endorsed or certified by TMDB. IMDb is linked for reference; an IMDb score is shown only when licensed rating data is available.</p></div></main></body></html>`;
}

async function titlePage(req, res) {
  const type = req.params.type === 'series' ? 'tv' : 'movie';
  const id = String(req.params.id || '');
  const country = Object.hasOwn(COUNTRIES, String(req.query.country || '').toUpperCase()) ? String(req.query.country).toUpperCase() : 'IN';
  if (!/^\d{1,12}$/.test(id)) return res.status(404).send('Title not found');
  try {
    const append = 'credits,videos,recommendations,similar,external_ids';
    const details = type === 'tv'
      ? await tmdb.getTVDetails(id, append).catch(() => sampleData.getTVDetail(id))
      : await tmdb.getMovieDetails(id, append).catch(() => sampleData.getMovieDetail(id));
    if (!details?.id) return res.status(404).send('Title not found');
    const providers = await tmdb.getWatchProviders(id, type).catch(() => ({ results: {} }));
    res.set('Cache-Control', 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400');
    return res.type('html').send(renderTitlePage(details, providers, type, country));
  } catch {
    return res.status(503).type('html').send('<h1>Title temporarily unavailable</h1>');
  }
}

module.exports = { titlePage, renderTitlePage, slugify, providerGroups };
