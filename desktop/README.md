# TShow Desktop

TShow Desktop keeps add-ons and playback on the viewer's computer. It loads the public TShow interface and plays selected direct HTTPS media inside the app using the bundled mpv engine. The Windows installer includes its playback engine, so users do not need to install VLC separately. Render never receives, proxies, caches, or transcodes the video.

Press Esc or choose **Back to sources** to return from playback. The Playback menu contains pause, subtitle, audio, seek and speed controls. Playback position is saved through the same account storage as browser playback. Unavailable or blocked provider links can still fail; a failed source returns to the source picker.

## Requirements

- Windows 10 or Windows 11
- Node.js 22 or newer for development

TShow Player supports the limited `Referer`, `Origin`, and `User-Agent` headers accepted by the desktop bridge. TShow does not forward cookies, authorization tokens, arbitrary headers, local-network URLs, or insecure HTTP sources. VLC is available as an optional external player. For integrated playback during development, put the pinned mpv distribution in `vendor/mpv/` and copy `embedded-input.conf` into `vendor/`.

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
