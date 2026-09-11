'use strict';

// Cloudflare has no server-side visitor session. Attach this browser's saved
// add-on manifest URLs to same-origin API requests so they remain private to
// this browser while still surviving refreshes and deployments.
(() => {
    const nativeFetch = window.fetch.bind(window);
    const ADDON_URLS_KEY = 'streamflix:addons:v1';
    const MANIFEST_CACHE_KEY = 'tshow:addon-manifests:v1';

    function storedAddonURLs() {
        try {
            const saved = JSON.parse(localStorage.getItem(window.TShowAccount?.storageKey('addonURLs') || ADDON_URLS_KEY) || '[]');
            return Array.isArray(saved)
                ? saved.filter((value) => typeof value === 'string' && value.length <= 8192).slice(0, 20)
                : [];
        } catch {
            return [];
        }
    }

    function storedManifests() {
        try {
            const saved = JSON.parse(localStorage.getItem(window.TShowAccount?.user ? window.TShowAccount.storageKey('manifest-cache') : MANIFEST_CACHE_KEY) || '[]');
            return Array.isArray(saved) ? saved.filter((item) => item?.manifestURL).slice(-20) : [];
        } catch {
            return [];
        }
    }

    function compactManifest(manifest) {
        if (!manifest || typeof manifest !== 'object' || !manifest.manifestURL) return null;
        return {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            resources: manifest.resources,
            types: manifest.types,
            idPrefixes: manifest.idPrefixes,
            catalogs: manifest.catalogs,
            logo: manifest.logo,
            behaviorHints: manifest.behaviorHints,
            manifestURL: manifest.manifestURL
        };
    }

    function rememberManifest(manifest) {
        const compact = compactManifest(manifest);
        if (!compact) return;
        const cached = storedManifests().filter((item) => item.manifestURL !== compact.manifestURL);
        cached.push(compact);
        try {
            localStorage.setItem(window.TShowAccount?.user ? window.TShowAccount.storageKey('manifest-cache') : MANIFEST_CACHE_KEY, JSON.stringify(cached.slice(-20)));
        } catch {
            // URL-only persistence remains available if browser storage is full.
        }
    }

    async function rememberResponseManifests(url, response) {
        if (!response.ok || !url.pathname.startsWith('/api/addons')) return;
        try {
            const data = await response.clone().json();
            const manifests = [
                data?.manifest,
                ...(Array.isArray(data?.addons) ? data.addons : []),
                ...(Array.isArray(data?.manifests) ? data.manifests : [])
            ];
            manifests.filter((manifest) => manifest?.isCustom).forEach(rememberManifest);
        } catch {
            // A malformed response is handled by the main application.
        }
    }

    function encodedAddonURLs() {
        try {
            const urls = storedAddonURLs();
            const cached = new Map(storedManifests().map((manifest) => [manifest.manifestURL, manifest]));
            const entries = urls.map((manifestURL) => cached.has(manifestURL)
                ? { manifestURL, manifest: cached.get(manifestURL) }
                : manifestURL);
            let payload = JSON.stringify(entries);
            let bytes = new TextEncoder().encode(payload);
            let binary = '';
            bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
            let encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
            if (encoded.length <= 16000) return encoded;

            payload = JSON.stringify(urls);
            bytes = new TextEncoder().encode(payload);
            binary = '';
            bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
            encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
            return encoded.length <= 16000 ? encoded : '';
        } catch {
            return '';
        }
    }

    function publicAddonURL(value) {
        const url = new URL(String(value).replace(/^stremio:\/\//i, 'https://'));
        const host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || /^[\d.:[\]]+$/.test(host) || /(^|\.)(localhost|local|internal|localdomain)$/.test(host)) throw new Error('A public HTTPS add-on URL is required.');
        return url;
    }

    async function browserJSON(value, signal) {
        const url = publicAddonURL(value);
        const response = await nativeFetch(url.href, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal || AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Provider declined browser access.');
        publicAddonURL(response.url);
        const reader = response.body.getReader();
        let size = 0; const chunks = [];
        try {
            while (true) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                size += chunk.length;
                if (size > 900000) { await reader.cancel(); throw new Error('Add-on response too large.'); }
                chunks.push(chunk);
            }
        } finally { reader.releaseLock(); }
        return JSON.parse(await new Blob(chunks).text());
    }

    async function normalizeBrowserResult(manifest, resource, data, signal) {
        const response = await nativeFetch('/api/addons/browser-result', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TShow-Request': '1' },
            body: JSON.stringify({ manifestURL: manifest.manifestURL, manifest, resource, data }), signal
        });
        if (!response.ok) throw new Error('Invalid add-on response.');
        return response.json();
    }

    async function recoverBrowserSources(url, response, init) {
        if (!response.ok || !/^\/api\/streams\/(movie|series|tv)\/[^/]+$/.test(url.pathname)) return response;
        const body = await response.clone().json();
        const failed = (body.sources || []).filter(source => source.error);
        if (!failed.length) return response;
        const manifests = storedManifests().filter(m => storedAddonURLs().includes(m.manifestURL));
        const [, , , type, encodedId] = url.pathname.split('/');
        const results = await Promise.all(failed.map(async source => {
            const manifest = manifests.find(m => m.id === source.addonId);
            if (!manifest) return null;
            try {
                const endpoint = publicAddonURL(manifest.manifestURL);
                endpoint.search = ''; endpoint.hash = '';
                endpoint.pathname = endpoint.pathname.replace(/\/manifest\.json\/?$/i, '') + '/stream/' + (type === 'tv' ? 'series' : type) + '/' + encodeURIComponent(decodeURIComponent(encodedId)) + '.json';
                const data = await browserJSON(endpoint.href, init.signal);
                return await normalizeBrowserResult(manifest, 'stream', data, init.signal);
            } catch { return null; }
        }));
        for (const result of results.filter(Boolean)) {
            body.streams = body.streams.filter(s => s.sourceAddon !== result.source.addonId).concat(result.streams);
            body.sources = body.sources.map(s => s.addonId === result.source.addonId ? result.source : s);
        }
        body.count = body.streams.length;
        return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }

    async function recoverBrowserManifests(url, response, init) {
        if (!response.ok || url.pathname !== '/api/addons/sync') return response;
        const body = await response.clone().json();
        const known = new Set((body.addons || []).map(a => a.manifestURL));
        const missing = storedAddonURLs().filter(u => !known.has(u));
        const cached = new Map(storedManifests().map(m => [m.manifestURL, m]));
        const recovered = await Promise.all(missing.map(async manifestURL => {
            try {
                const manifest = cached.get(manifestURL) || { ...await browserJSON(manifestURL, init.signal), manifestURL };
                return (await normalizeBrowserResult(manifest, 'manifest', null, init.signal)).manifest;
            } catch { return null; }
        }));
        body.addons = [...(body.addons || []), ...recovered.filter(Boolean)];
        body.errors = missing.filter((_, i) => !recovered[i]).map(() => 'A saved add-on is temporarily unavailable. Its address is still saved; try Reload later.');
        return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
    }

    window.fetch = async (input, init = {}) => {
        let url;
        try {
            url = new URL(input instanceof Request ? input.url : input, window.location.href);
        } catch {
            // Let the browser handle malformed input exactly as it normally would.
            return nativeFetch(input, init);
        }
        if (url.origin === window.location.origin && (url.pathname.startsWith('/api/addons') || url.pathname.startsWith('/api/streams'))) {
            const headers = new Headers(input instanceof Request ? input.headers : undefined);
            new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
            const encoded = encodedAddonURLs();
            if (encoded) headers.set('X-TShow-Addon-Urls', encoded);
            let response = await nativeFetch(input, { ...init, headers });
            if (!response.ok && url.pathname === '/api/addons/install' && typeof init.body === 'string') {
                try {
                    const { manifestURL } = JSON.parse(init.body);
                    const manifest = { ...await browserJSON(manifestURL, init.signal), manifestURL: publicAddonURL(manifestURL).href };
                    const data = await normalizeBrowserResult(manifest, 'manifest', null, init.signal);
                    response = Response.json(data);
                } catch { /* Preserve the original provider error when browser access also fails. */ }
            }
            response = await recoverBrowserSources(url, response, init);
            response = await recoverBrowserManifests(url, response, init);
            await rememberResponseManifests(url, response);
            return response;
        }
        return nativeFetch(input, init);
    };
})();

// Keep visual and interaction polish isolated from the core catalog/add-on runtime.
(() => {
    if (document.querySelector('script[data-tshow-premium-ui]')) return;
    const script = document.createElement('script');
    script.src = '/js/premium-ui.js?v=20260911-2';
    script.dataset.tshowPremiumUi = 'true';
    document.head.append(script);
})();
