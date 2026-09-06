# TShow Desktop

TShow Desktop keeps add-ons and playback on the viewer's computer. It loads the public TShow interface and opens selected direct HTTPS media in a dedicated **TShow Player** window. The Windows installer includes its playback engine, so users do not need to install VLC separately. Render never receives, proxies, caches, or transcodes the video.

## Requirements

- Windows 10 or Windows 11
- Node.js 22 or newer for development

TShow Player supports the limited `Referer`, `Origin`, and `User-Agent` headers accepted by the desktop bridge. TShow does not forward cookies, authorization tokens, arbitrary headers, local-network URLs, or insecure HTTP sources. During local development, an installed mpv or VLC remains available as a fallback.

## Development

```bash
cd desktop
npm install
npm test
npm start
```

## Windows installer

```bash
cd desktop
npm install
npm run dist:win
```

The installer is written to `desktop/dist/`. Do not distribute an unsigned build as if it were store-verified software; Windows may show a reputation warning until the application is code-signed.
