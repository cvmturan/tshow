# Cvm Turan

Cvm Turan is a local-first cinematic movie and series browser. It combines a polished streaming-style interface with a manual, Stremio-compatible add-on system while keeping playback limited to public-domain, licensed, or user-owned sources.

It works immediately with a fresh public metadata catalog, an offline fallback, and a short public CC0 player-test video. A TMDB key is optional.

## What is included

- Responsive hero, movie/series rails, search, details, ratings, and trailers
- Working HTML5 player with source selection, subtitles, speed, fullscreen, and progress
- Continue Watching and My List stored only in the browser
- “Open video” for files already on your computer; the file is never uploaded
- Manual add-on install, list, refresh, and remove controls
- Fresh public metadata catalog with an offline fallback when TMDB is not configured
- Localhost-only server, strict browser security headers, and private-network add-on URL blocking
- No bundled torrent or piracy provider

## Start on this computer

The dependencies have already been installed for this project.

1. Double-click **Start StreamFlix.cmd** (the launcher keeps its legacy filename).
2. Your browser opens [http://127.0.0.1:3000](http://127.0.0.1:3000).
3. Keep the small server window open while using Cvm Turan.
4. Close that window, or press **Ctrl+C**, to stop the app.

If dependencies are ever removed, double-click **Setup StreamFlix.cmd** once, then start again.

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

## Optional TMDB catalog

1. Copy `.env.example` to `.env`.
2. Put your TMDB API key after `TMDB_API_KEY=`.
3. Restart Cvm Turan.

Without a key, the app uses its live public catalog first and falls back to built-in metadata rather than failing.

## Manual add-on guide

Open **Add-ons** in the header and paste a trusted manifest URL, for example:

```text
https://your-provider.example/manifest.json
```

Standard `stremio://host/path/manifest.json` install links are also accepted and are safely normalized to HTTPS. Cvm Turan validates every redirect destination, blocks private-network targets by default, and saves installed add-ons atomically so a failed write cannot leave a temporary in-memory installation.

Catalog add-ons create home-screen rows. Stream-only add-ons appear when **Play** checks a title, but do not add movie rows by themselves. Installation does not guarantee browser playback: a provider must return a declared direct MP4, WebM, or HLS URL (or an external provider page). App-only downloads, MKV files, and HTML redirects remain visible for diagnosis but are not sent blindly to the browser player.

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

the add-on should return direct browser-playable HTTP or HTTPS video URLs:

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
- `data/custom-addons.json` — manually installed manifests
- `tests/` — local API and security smoke tests

Cvm Turan uses original branding and does not copy Netflix artwork or trademarks. TMDB metadata and images are used only when configured; the app is not endorsed or certified by TMDB.
