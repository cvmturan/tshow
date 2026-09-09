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
            const saved = JSON.parse(localStorage.getItem(ADDON_URLS_KEY) || '[]');
            return Array.isArray(saved)
                ? saved.filter((value) => typeof value === 'string' && value.length <= 8192).slice(0, 20)
                : [];
        } catch {
            return [];
        }
    }

    function storedManifests() {
        try {
            const saved = JSON.parse(localStorage.getItem(MANIFEST_CACHE_KEY) || '[]');
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
            localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(cached.slice(-20)));
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

    window.fetch = async (input, init = {}) => {
        let url;
        try {
            url = new URL(input instanceof Request ? input.url : input, window.location.href);
        } catch {
            // Let the browser handle malformed input exactly as it normally would.
            return nativeFetch(input, init);
        }
        if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
            const headers = new Headers(input instanceof Request ? input.headers : undefined);
            new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
            const encoded = encodedAddonURLs();
            if (encoded) headers.set('X-TShow-Addon-Urls', encoded);
            const response = await nativeFetch(input, { ...init, headers });
            await rememberResponseManifests(url, response);
            return response;
        }
        return nativeFetch(input, init);
    };
})();
