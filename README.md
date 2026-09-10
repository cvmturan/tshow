# TShow

TShow is a local-first movie and series discovery PWA. It combines a polished streaming-style interface, expanded discovery rails, a private watchlist, browser backups, and a manual Stremio-compatible add-on system while keeping playback limited to public-domain, licensed, or user-owned sources.

It works immediately with a fresh public metadata catalog, an offline fallback, and a short public CC0 player-test video. A TMDB key is optional.

## What is included

- Responsive hero, movie/series rails, search, details, ratings, and trailers
- Working HTML5 player with source selection, subtitles, speed, fullscreen, and progress
- Email/password accounts with per-user synchronization for My List, history, progress, region, player settings, and add-ons
- Guest mode with browser-only storage, export, recovery codes, conflict protection, and account deletion
- Country-based legal watch-provider results stored as a browser preference
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

## Cloudflare deployment

The production-ready Cloudflare Worker configuration is included in `wrangler.jsonc`.
Cloudflare serves the PWA, static assets, metadata routes, add-on JSON requests, search,
catalogs, and stream descriptions from its global network. Production has no Render
runtime dependency.

Public movie metadata is cached briefly at the edge. Search queries, browser add-ons,
streams, contact messages, cookies, authorization headers, and every modifying request
are deliberately excluded from shared caching. Guest add-on manifest URLs stay in the
visitor's browser. Signed-in visitors can synchronize them to their private account
record. Every API request carries only that visitor's list; TShow does not expose one
user's add-ons to another.

For a repository connected through Cloudflare Workers Builds:

1. Select the `cvmturan/tshow` repository and the `main` production branch.
2. Use the Worker name `tshow` (it must match `wrangler.jsonc`).
3. Leave the build command empty and use the default `npx wrangler deploy` as the deploy
   command. Wrangler automatically runs the included asset build and bundles the HLS
   player library before every development session or deployment.
4. Set the root directory to `/` and save/deploy.

For a manual authenticated deployment, run:

```powershell
pnpm install
pnpm run cf:check
pnpm run cf:deploy
```

`TMDB_API_KEY` can be added as an optional encrypted Cloudflare Worker secret. Without
it, permanent Cinemeta and TVmaze discovery/search continue working; TMDB-specific
provider and metadata routes report that the optional service is unavailable.

Email registration, login, recovery codes, account deletion, and per-user sync use the
bound `tshow-accounts` D1 database. Apply migrations before the first deployment with
`npx wrangler d1 migrations apply tshow-accounts --remote`.

Google and Apple buttons stay disabled until their provider credentials are configured.
Register `https://showt.fun/api/auth/google/callback` with Google and
`https://showt.fun/api/auth/apple/callback` with Apple, then add the corresponding
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_ID`, and
`APPLE_CLIENT_SECRET` encrypted Worker secrets. For Apple, the client secret is the
signed JWT generated from the Sign in with Apple key.

Legacy `/api/proxy`, `/api/transcode`, and `/api/debrid` routes return HTTP 410. Cloudflare
never downloads, caches, proxies, or converts media. Compatible HTTPS MP4, WebM, and HLS
sources go directly from their provider to the browser. Other lawful sources can be
opened in a locally installed TShow Player, VLC, Outplayer, or another compatible app.

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

Installed manifest URLs are saved in that browser's local storage and restored automatically after a refresh or redeploy. Each request carries only that browser's list; a different browser or device cannot list, use, or remove it. This is anonymous browser-level storage, not account synchronization; clearing site data removes the saved list.

Search providers are separate from playback providers. Official Cinemeta movie/series search and TVmaze series search are permanent protected providers. Search also queries any browser-installed add-on that explicitly declares a search catalog. A slow or unavailable provider is skipped without hiding results returned by the others.

Catalog add-ons create home-screen rows. Stream-only add-ons appear when **Play** checks a title, but do not add movie rows by themselves. Sources from a user-installed add-on are classified by capability: compatible public HTTPS MP4, WebM, and HLS links may play directly in the browser, other safe links can be opened in a local player or copied, valid BitTorrent info hashes can be handed to a compatible app, and provider pages open separately. TShow does not proxy, download, cache, transcode, or subtitle-relay content. It fetches only the add-on manifest and catalog, metadata, subtitle-description, and stream-description JSON needed to display choices.

Built-in lawful player sources and official trailers can still play in the browser. Unsafe protocols, local-network destinations, and malformed source-app links remain blocked. The Terms, Privacy Policy, Copyright Policy, legal notice, and provider credits are published at `/legal.html`.

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
