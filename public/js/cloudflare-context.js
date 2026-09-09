'use strict';

// Cloudflare has no server-side visitor session. Attach this browser's saved
// add-on manifest URLs to same-origin API requests so they remain private to
// this browser while still surviving refreshes and deployments.
(() => {
    const nativeFetch = window.fetch.bind(window);

    function encodedAddonURLs() {
        try {
            const saved = JSON.parse(localStorage.getItem('streamflix:addons:v1') || '[]');
            const urls = Array.isArray(saved)
                ? saved.map((item) => typeof item === 'string' ? item : item?.manifestURL)
                    .filter((value) => typeof value === 'string')
                    .slice(0, 20)
                : [];
            const bytes = new TextEncoder().encode(JSON.stringify(urls));
            let binary = '';
            bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
            const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
            return encoded.length <= 16000 ? encoded : '';
        } catch {
            return '';
        }
    }

    window.fetch = (input, init = {}) => {
        try {
            const url = new URL(input instanceof Request ? input.url : input, window.location.href);
            if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
                const headers = new Headers(input instanceof Request ? input.headers : undefined);
                new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
                const encoded = encodedAddonURLs();
                if (encoded) headers.set('X-TShow-Addon-Urls', encoded);
                return nativeFetch(input, { ...init, headers });
            }
        } catch {
            // Let the browser handle malformed input exactly as it normally would.
        }
        return nativeFetch(input, init);
    };
})();
