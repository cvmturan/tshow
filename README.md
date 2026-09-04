# TShow

TShow is a local-first movie and series discovery PWA. It combines a polished streaming-style interface, expanded discovery rails, a private watchlist, browser backups, and a manual Stremio-compatible add-on system while keeping playback limited to public-domain, licensed, or user-owned sources.

It works immediately with a fresh public metadata catalog, an offline fallback, and a short public CC0 player-test video. A TMDB key is optional.

## What is included

- Responsive hero, movie/series rails, search, details, ratings, and trailers
- Working HTML5 player with source selection, subtitles, speed, fullscreen, and progress
- Continue Watching and My List stored only in the browser
- “Open video” for files already on your computer; the file is never uploaded
- Per-browser manual add-on install, list, refresh, and remove controls
- Permanent Cinemeta movie/series search plus legal TVmaze series search, with an offline fallback
- Localhost-only server, strict browser security headers, and private-network add-on URL blocking
- No bundled torrent or piracy provider

## Start on this computer

The dependencies have already been installed for this project.

1. Double-click **Start TShow.cmd** (the launcher keeps its legacy filename).
2. Your browser opens [http://127.0.0.1:3000](http://127.0.0.1:3000).
3. Keep the small server window open while using TShow.
4. Close that window, or press **Ctrl+C**, to stop the app.

If dependencies are ever removed, double-click **Setup TShow.cmd** once, then start again.

### Standard Node.js commands

With Node.js 18 or newer installed:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Validation commands:

```powershell
npm run check
npm test
```

## Cloudflare Pages + Workers

The repository is ready for a hybrid Cloudflare deployment:

- Cloudflare Pages serves the static PWA from `dist/`.
- A Pages Function (running on Cloudflare Workers) handles `/api/*`.
- Safe public catalogue responses are cached at the edge.
- Private add-on, contact, media proxy, and transcoding requests are never cached.
- The existing Node server remains the API origin, because Workers cannot run the FFmpeg process used by TShow transcoding.

### Cloudflare dashboard settings

Create a Pages project connected to this GitHub repository and use:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | `pnpm run build:pages` |
| Build output directory | `dist` |
| Root directory | leave empty |

Add a production and preview environment variable named `TSHOW_ORIGIN`. Set it to the HTTPS URL of the existing TShow Node server, with no trailing slash, for example `https://your-tshow-service.onrender.com`.

After deployment, open `/api/cloudflare/health` on the Pages URL. A successful setup reports `edge: cloudflare-pages-functions` and `originConfigured: true`.

Local Cloudflare preview commands:

```powershell
npm run build:pages
pnpm dlx wrangler@4.128.0 pages dev --binding TSHOW_ORIGIN=https://your-tshow-service.onrender.com
```

## Optional TMDB catalog

1. Copy `.env.example` to `.env`.
2. Put your TMDB API key after `TMDB_API_KEY=`.
3. Restart TShow.

Without a key, the app uses its live public catalog first and falls back to built-in metadata rather than failing.

## Manual add-on guide

Open **Add-ons** in the header and paste a trusted manifest URL, for example:

```text
https://your-provider.example/manifest.json
```

Standard `stremio://host/path/manifest.json` install links are also accepted and are safely normalized to HTTPS. TShow validates every redirect destination and blocks private-network targets by default.

Installed manifest URLs are saved in that browser's local storage and restored automatically after a refresh, redeploy, or Render cold start. They are isolated by a random browser identifier, so a different browser or device cannot list, use, or remove them. This is anonymous browser-level storage, not account synchronization; clearing site data removes the saved list.

Search providers are separate from playback providers. Official Cinemeta movie/series search and TVmaze series search are permanent protected providers. Search also queries any browser-installed add-on that explicitly declares a search catalog. A slow or unavailable provider is skipped without hiding results returned by the others.

Catalog add-ons create home-screen rows. Stream-only add-ons appear when **Play** checks a title, but do not add movie rows by themselves. Sources from a user-installed add-on are external-only: safe HTTP/HTTPS links can be opened in VLC or Outplayer or copied, valid BitTorrent info hashes can be handed to a compatible app, and provider pages open separately. TShow does not proxy, download, cache, transcode, or subtitle-relay content from a user-installed add-on. It still fetches that add-on's manifest and catalog, metadata, and stream-description JSON so the interface can list its results.

Built-in lawful player sources, local files, and official trailers can still play in the browser. Unsafe protocols, local-network destinations, and malformed source-app links remain blocked. The Terms, Privacy Policy, Copyright Policy, legal notice, and provider credits are published at `/legal.html`.

A minimal compatible stream manifest looks like this:

```json
{
  "id": "com.example.legal-videos",
  "version": "1.0.0",
  "name": "My Legal Videos",
  "description": "Direct streams I am allowed to use",
  "resources": ["stream"],
  "types": ["movie", "series"]
}
```

For a movie request such as:

```text
GET /stream/movie/tt0111161.json
```

the add-on can return an authorized HTTP or HTTPS video URL for the visitor to open directly on their device:

```json
{
  "streams": [
    {
      "name": "Licensed 1080p",
      "title": "My authorized source",
      "url": "https://media.example/video.mp4"
    }
  ]
}
```

Magnet links, torrent files, and non-web protocols are intentionally ignored by the browser player. Local/LAN manifest hosts are blocked by default to prevent server-side request forgery. For add-on development on your own machine, set `ALLOW_PRIVATE_ADDONS=true` in `.env`, understand the risk, and keep `HOST=127.0.0.1`.

## Private service tokens

Optional Real-Debrid, AllDebrid, Premiumize, and TorBox tokens can be placed in the local `.env` file for user-owned, licensed sources. Runtime token entry is disabled by default so secrets are not accepted from the browser. Never share or commit `.env`.

## Project layout

- `public/` — the interface and player
- `src/api/` — local API routes
- `src/core/` — metadata, add-on, sample, and optional service logic
- Browser local storage — each browser's private list of installed manifest URLs
- `tests/` — local API and security smoke tests

TShow uses original branding and does not copy Netflix artwork or trademarks. TMDB metadata and images are used only when configured; the app is not endorsed or certified by TMDB.
