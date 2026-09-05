'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const data = JSON.parse(fs.readFileSync(path.join(publicDir, 'data', 'editorial.json'), 'utf8'));
const validTypes = new Set(['news', 'release', 'collection', 'guide']);

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function pageShell({ title, description, canonical, body, structuredData, robots = 'index, follow, max-image-preview:large' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#090a0d">
  <meta name="description" content="${escapeHTML(description)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${escapeHTML(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="TShow">
  <meta property="og:title" content="${escapeHTML(title)}">
  <meta property="og:description" content="${escapeHTML(description)}">
  <meta property="og:url" content="${escapeHTML(canonical)}">
  <meta property="og:image" content="${data.site.url}/assets/tshow-icon-512.png">
  <title>${escapeHTML(title)} · TShow</title>
  <link rel="icon" href="/assets/tshow-icon-192.png" type="image/png">
  <link rel="stylesheet" href="/css/main.css?v=20260906-1">
  <script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
</head>
<body class="editorial-page">
${body}
</body>
</html>\n`;
}

function header() {
  return `<header class="editorial-header"><a class="editorial-brand" href="/"><img src="/assets/tshow-logo.png" alt=""><span>TShow</span></a><nav aria-label="Editorial"><a href="/?view=explore">Explore</a><a href="/news/">News</a><a href="/collections/">Collections</a><a href="/releases/">Releases</a><a href="/guides/">Guides</a></nav><a class="button button-primary" href="/">Open TShow</a></header>`;
}

function footer() {
  return `<footer class="editorial-footer"><div><strong>TShow</strong><p>Original, privacy-first movie and series discovery.</p></div><nav><a href="/legal.html#terms">Terms</a><a href="/legal.html#privacy">Privacy</a><a href="/legal.html#copyright">Copyright</a><a href="/partners/">Partners</a></nav><p>© 2026 TShow.</p></footer>`;
}

function write(relativePath, value) {
  const output = path.join(publicDir, relativePath);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, value);
}

for (const item of data.items) {
  if (!validTypes.has(item.type) || !/^[a-z0-9-]+$/.test(item.slug)) throw new Error(`Invalid editorial item: ${item.slug}`);
  const canonical = `${data.site.url}/news/${item.slug}/`;
  const article = `<main class="editorial-main"><article class="editorial-article"><a class="editorial-back" href="/?view=explore">← Explore TShow</a><p class="eyebrow">${escapeHTML(item.label)}</p><h1>${escapeHTML(item.title)}</h1><div class="editorial-meta"><time datetime="${item.published}">${new Date(`${item.published}T00:00:00Z`).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' })}</time><span>${escapeHTML(item.readTime)}</span><span>By TShow Editorial</span></div><p class="editorial-dek">${escapeHTML(item.summary)}</p>${item.body.map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`).join('')}<aside class="editorial-disclosure"><strong>About this guide</strong><p>${escapeHTML(data.site.editorialPolicy)}</p></aside></article></main>`;
  const jsonLD = {
    '@context': 'https://schema.org',
    '@type': item.type === 'news' ? 'NewsArticle' : 'Article',
    headline: item.title,
    description: item.summary,
    datePublished: item.published,
    dateModified: item.published,
    mainEntityOfPage: canonical,
    author: { '@type': 'Organization', name: 'TShow Editorial', url: data.site.url },
    publisher: { '@type': 'Organization', name: 'TShow', url: data.site.url, logo: { '@type': 'ImageObject', url: `${data.site.url}/assets/tshow-icon-512.png` } }
  };
  write(path.join('news', item.slug, 'index.html'), pageShell({ title: item.title, description: item.summary, canonical, body: `${header()}${article}${footer()}`, structuredData: jsonLD }));
}

const groups = { news: 'News', release: 'Releases', collection: 'Collections', guide: 'Guides' };
for (const [type, label] of Object.entries(groups)) {
  const folder = type === 'release' ? 'releases' : type === 'collection' ? 'collections' : type === 'news' ? 'news' : `${type}s`;
  const items = data.items.filter((item) => item.type === type);
  const cards = items.map((item) => `<article class="editorial-list-card"><p>${escapeHTML(item.label)}</p><h2><a href="/news/${item.slug}/">${escapeHTML(item.title)}</a></h2><span>${escapeHTML(item.summary)}</span><div><time datetime="${item.published}">${item.published}</time><a href="/news/${item.slug}/">Read guide →</a></div></article>`).join('');
  const body = `${header()}<main class="editorial-main editorial-index"><p class="eyebrow">TShow editorial</p><h1>${label}</h1><p class="editorial-dek">Original ideas and practical viewing guides. Every public page is reviewed before publication.</p><div class="editorial-list">${cards || '<p>New stories are being prepared.</p>'}</div></main>${footer()}`;
  const canonical = `${data.site.url}/${folder}/`;
  write(path.join(folder, 'index.html'), pageShell({ title: label, description: `Original ${label.toLowerCase()} from TShow.`, canonical, body, structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} · TShow`, url: canonical } }));
}

const sitemapURLs = ['/', '/news/', '/collections/', '/releases/', '/guides/', '/partners/', '/legal.html', ...data.items.map((item) => `/news/${item.slug}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapURLs.map((url) => `<url><loc>${data.site.url}${url}</loc><lastmod>${data.site.updated}</lastmod></url>`).join('')}</urlset>\n`);

const newsItems = data.items.filter((item) => item.type === 'news' && Date.now() - Date.parse(`${item.published}T00:00:00Z`) <= 3 * 24 * 60 * 60 * 1000);
write('news-sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${newsItems.map((item) => `<url><loc>${data.site.url}/news/${item.slug}/</loc><news:news><news:publication><news:name>TShow</news:name><news:language>en</news:language></news:publication><news:publication_date>${item.published}</news:publication_date><news:title>${escapeHTML(item.title)}</news:title></news:news></url>`).join('')}</urlset>\n`);

console.log(`Built ${data.items.length} editorial pages and ${Object.keys(groups).length} indexes.`);
