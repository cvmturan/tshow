(() => {
    'use strict';
    const names = { watchlist: 'streamflix:watchlist:v1', continueWatching: 'streamflix:continue:v1', recentlyViewed: 'tshow:recent:v1', addonURLs: 'streamflix:addons:v1', region: 'tshow:region:v1', playerPreferences: 'tshow:player:v1' };
    let user = null, config = {}, versions = {}, pending = new Map(), saving = false, timer, blocked = false;
    const status = text => { const el = document.getElementById('account-sync-status'); if (el) el.textContent = text; };
    const keyFor = key => user
        ? `tshow:user:${user.id}:${Object.hasOwn(names, key) ? key : `local:${key}`}`
        : (names[key] || key);
    const parse = (key, text) => key === 'region' ? text : JSON.parse(text || 'null');
    async function request(path, options = {}) {
        const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', 'X-TShow-Request': '1', ...options.headers }, signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
        return data;
    }
    function save(storageKey, value) {
        try { value === null ? localStorage.removeItem(storageKey) : localStorage.setItem(storageKey, value); }
        catch { status('Browser storage is full or unavailable.'); }
        const key = Object.keys(names).find(k => keyFor(k) === storageKey);
        if (!user || !key) return;
        try { pending.set(key, value === null ? (['watchlist', 'recentlyViewed', 'addonURLs'].includes(key) ? [] : null) : parse(key, value)); }
        catch { return; }
        persistPending();
        status('Changes waiting to sync…');
        clearTimeout(timer); timer = setTimeout(flush, 800);
    }
    function persistPending() {
        if (!user) return;
        try { localStorage.setItem(`tshow:pending:${user.id}`, JSON.stringify({ versions, entries: [...pending] })); } catch { /* Save status still reports pending changes. */ }
    }
    async function flush() {
        if (saving || blocked || !user || !pending.size) return;
        saving = true;
        try {
            while (pending.size) {
                const [key, value] = pending.entries().next().value;
                const result = await request(`/api/account/data/${key}`, { method: 'PUT', body: JSON.stringify({ value, version: versions[key] || 0 }) });
                versions[key] = result.version;
                if (pending.get(key) === value) pending.delete(key);
                persistPending();
            }
            status('All changes saved to your account');
        } catch (e) {
            if (e.status === 409 || e.status === 401) blocked = true;
            status(e.status === 409 ? 'Sync conflict — open Account to save a backup and resolve.' : e.status === 401 ? 'Session expired — export unsaved changes in Account before signing in.' : 'Offline or sync unavailable — changes are saved on this device.');
        } finally { saving = false; }
    }
    function exportData(local = false) {
        const download = data => {
            const link = document.createElement('a');
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            link.href = url; link.download = `tshow-account-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        if (local) {
            download({ app: 'TShow', user, data: Object.fromEntries(Object.keys(names).map(k => { try { return [k, parse(k, localStorage.getItem(keyFor(k)))]; } catch { return [k, null]; } })) });
            return Promise.resolve();
        }
        return request('/api/account/data').then(download);
    }
    function clearAccountCache() {
        if (!user) return;
        for (const key of Object.keys(names)) localStorage.removeItem(keyFor(key));
        localStorage.removeItem(`tshow:pending:${user.id}`);
        localStorage.removeItem(`tshow:user:${user.id}:addon-client`);
        localStorage.removeItem(`tshow:user:${user.id}:manifest-cache`);
    }
    function setupUI() {
        const dialog = document.getElementById('account-dialog');
        if (!dialog) return;
        const form = document.getElementById('account-form'), message = document.getElementById('account-message');
        const mode = document.getElementById('account-mode');
        const updateMode = () => {
            document.getElementById('account-name-field').hidden = mode.value !== 'register';
            form.elements.name.required = mode.value === 'register';
            document.getElementById('account-recovery-field').hidden = mode.value !== 'recover';
            form.elements.recoveryCode.required = mode.value === 'recover';
            form.elements.password.autocomplete = mode.value === 'login' ? 'current-password' : 'new-password';
            document.getElementById('account-submit').textContent = ({ login: 'Sign in', register: 'Create account', recover: 'Reset password' })[mode.value];
        };
        mode.addEventListener('change', updateMode); updateMode();
        document.querySelectorAll('[data-open-account]').forEach(button => button.addEventListener('click', () => { dialog.showModal(); }));
        document.getElementById('account-close').addEventListener('click', () => dialog.close());
        document.getElementById('account-guest').hidden = Boolean(user);
        document.getElementById('account-member').hidden = !user;
        document.getElementById('account-button').textContent = user ? user.name.split(' ')[0] : 'Sign in';
        document.getElementById('account-identity').textContent = user ? `${user.name} · ${user.email}` : '';
        for (const provider of ['google', 'apple']) {
            const button = document.getElementById(`account-${provider}`);
            button.disabled = !config[provider];
            button.title = config[provider] ? '' : 'Provider setup is not complete yet';
            button.addEventListener('click', () => { location.href = `/api/auth/${provider}/start`; });
        }
        document.getElementById('account-provider-note').hidden = Boolean(config.google && config.apple);
        if (!config.available) message.textContent = 'Accounts are unavailable on this host. You can keep browsing as a guest.';
        form.addEventListener('submit', async event => {
            event.preventDefault(); const button = document.getElementById('account-submit'); button.disabled = true; message.textContent = 'Please wait…';
            try {
                const result = await request(`/api/auth/${mode.value}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
                form.reset();
                if (result.recoveryCode) {
                    document.getElementById('account-guest').hidden = true;
                    const panel = document.getElementById('account-recovery-created'); panel.hidden = false;
                    document.getElementById('account-new-code').textContent = result.recoveryCode;
                    message.textContent = 'Save this recovery code somewhere safe. It is shown only once and replaces email password recovery.';
                    document.getElementById('account-recovery-done').onclick = () => location.reload();
                } else location.reload();
            } catch (e) { message.textContent = e.message; }
            finally { button.disabled = false; }
        });
        const act = (id, fn) => document.getElementById(id).addEventListener('click', async event => {
            event.currentTarget.disabled = true;
            try { await fn(); } catch (e) { message.textContent = e.message; }
            finally { event.target.disabled = false; }
        });
        act('account-export', () => exportData(true));
        act('account-retry', async () => { if (blocked) throw new Error('Export unsaved changes first. Then choose “Use cloud copy”.'); await flush(); });
        act('account-use-cloud', async () => {
            await exportData(true);
            if (!window.confirm('Your device backup has been downloaded. Replace this device’s unsaved changes with the cloud copy?')) return;
            localStorage.removeItem(`tshow:pending:${user.id}`); location.reload();
        });
        act('account-import-guest', async () => {
            if (!window.confirm('Copy this browser’s guest library into your account? This replaces the account’s saved lists and add-ons.')) return;
            for (const key of Object.keys(names)) {
                const value = localStorage.getItem(names[key]); if (value !== null) save(keyFor(key), value);
            }
            await flush(); if (!pending.size) location.reload();
        });
        const logout = async all => {
            await flush();
            if (pending.size) throw new Error('Some changes are not synced. Export a backup and resolve them before signing out.');
            await request(all ? '/api/account/sessions' : '/api/auth/logout', { method: all ? 'DELETE' : 'POST', body: '{}' });
            clearAccountCache(); location.reload();
        };
        act('account-logout', () => logout(false)); act('account-logout-all', () => logout(true));
        document.getElementById('account-delete-form').addEventListener('submit', async event => {
            event.preventDefault();
            if (!window.confirm('Permanently delete your account and all cloud data? This cannot be undone.')) return;
            try { await request('/api/account', { method: 'DELETE', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); clearAccountCache(); location.reload(); }
            catch (e) { message.textContent = e.message; }
        });
        document.getElementById('account-delete-password').hidden = !user?.hasPassword;
        status(user ? (pending.size ? 'Restoring pending changes…' : 'All changes saved to your account') : 'Guest mode · saved in this browser');
        if (new URLSearchParams(location.search).has('account')) dialog.showModal();
    }
    const ready = (async () => {
        try {
            config = await request('/api/auth/config');
            if (config.available) {
                user = (await request('/api/auth/me')).user;
                if (user) {
                    const cloud = await request('/api/account/data');
                    const unsaved = JSON.parse(localStorage.getItem(`tshow:pending:${user.id}`) || 'null');
                    for (const key of Object.keys(names)) {
                        const entry = cloud.data[key]; versions[key] = entry?.version || 0;
                        if (entry) localStorage.setItem(keyFor(key), key === 'region' ? entry.value : JSON.stringify(entry.value));
                        else localStorage.removeItem(keyFor(key));
                    }
                    if (unsaved?.entries?.length) {
                        pending = new Map(unsaved.entries.filter(([k]) => Object.hasOwn(names, k)));
                        for (const [key, value] of pending) {
                            versions[key] = unsaved.versions[key] || 0;
                            localStorage.setItem(keyFor(key), key === 'region' ? value : JSON.stringify(value));
                        }
                    }
                }
            }
        } catch { user = null; config.available = false; }
        setupUI();
        if (pending.size) void flush();
    })();
    window.TShowAccount = { ready, storageKey: keyFor, save, flush, get user() { return user; } };
    window.addEventListener('online', () => { void flush(); });
    window.addEventListener('beforeunload', event => { if (pending.size) { event.preventDefault(); event.returnValue = ''; } });
    setInterval(() => { if (pending.size) void flush(); }, 30000);
})();
