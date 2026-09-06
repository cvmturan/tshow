# TShow Desktop

TShow Desktop keeps add-ons and playback on the viewer's computer. It loads the public TShow interface and hands a selected direct HTTPS media URL to a locally installed **mpv** or **VLC** player. Render never receives, proxies, caches, or transcodes the video.

## Requirements

- Windows 10 or Windows 11
- mpv (recommended) or VLC installed on the PC
- Node.js 22 or newer for development

mpv is preferred because it supports the limited `Referer`, `Origin`, and `User-Agent` headers accepted by the desktop bridge. TShow does not forward cookies, authorization tokens, arbitrary headers, local-network URLs, or insecure HTTP sources.

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

The installer and portable build are written to `desktop/dist/`. Do not distribute an unsigned build as if it were store-verified software; Windows may show a reputation warning until the application is code-signed.
