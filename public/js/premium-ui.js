(() => {
    'use strict';

    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
    const RECENT_SEARCHES_KEY = 'tshow:recent-searches:v1';

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init, { once: true });

    function init() {
        enhanceSmartSearch();
        enhanceMobileDock();
        enhancePlayerGestures();
        enhanceCardAccessibility();
        enhanceConnectionFeedback();
    }

    function withViewTransition(callback) {
        if (!REDUCED_MOTION.matches && typeof document.startViewTransition === 'function') {
            document.startViewTransition(callback);
        } else callback();
    }

    function enhanceSmartSearch() {
        const form = document.getElementById('search-form');
        const input = document.getElementById('search-input');
        if (!form || !input || document.getElementById('smart-search-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'smart-search-panel';
        panel.className = 'smart-search-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'listbox');
        panel.setAttribute('aria-label', 'Search suggestions');
        document.body.append(panel);

        let activeIndex = -1;
        let suggestionButtons = [];

        const recentSearches = () => {
            try {
                const saved = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
                return Array.isArray(saved) ? saved.filter((value) => typeof value === 'string').slice(0, 5) : [];
            } catch { return []; }
        };

        const rememberSearch = (query) => {
            query = String(query || '').trim();
            if (query.length < 2) return;
            const next = [query, ...recentSearches().filter((item) => item.toLocaleLowerCase() !== query.toLocaleLowerCase())].slice(0, 5);
            try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* Search remains usable without storage. */ }
        };

        const availableCards = () => {
            const seen = new Set();
            return [...document.querySelectorAll('.media-card')].map((card) => {
                const title = card.querySelector('.card-title')?.textContent?.trim();
                const meta = [...card.querySelectorAll('.card-meta > span')].map((node) => node.textContent.trim());
                if (!title) return null;
                const key = `${title.toLocaleLowerCase()}|${meta[0] || ''}|${meta[1] || ''}`;
                if (seen.has(key)) return null;
                seen.add(key);
                return { card, title, year: meta[0] || '', type: meta[1] || '' };
            }).filter(Boolean);
        };

        const placePanel = () => {
            if (panel.hidden) return;
            const rect = form.getBoundingClientRect();
            const gutter = window.innerWidth <= 640 ? 10 : 0;
            panel.style.left = `${Math.max(gutter, rect.left)}px`;
            panel.style.top = `${Math.min(window.innerHeight - 12, rect.bottom + 8)}px`;
            panel.style.width = `${Math.min(window.innerWidth - gutter * 2, Math.max(rect.width, window.innerWidth <= 640 ? window.innerWidth - 20 : 430))}px`;
        };

        const selectSuggestion = (index) => {
            if (!suggestionButtons.length) return;
            activeIndex = Math.max(0, Math.min(suggestionButtons.length - 1, index));
            suggestionButtons.forEach((button, buttonIndex) => {
                const active = buttonIndex === activeIndex;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            suggestionButtons[activeIndex]?.scrollIntoView({ block: 'nearest' });
        };

        const runRecent = (query) => {
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            rememberSearch(query);
            panel.hidden = true;
            form.requestSubmit();
        };

        const render = () => {
            const query = input.value.trim().toLocaleLowerCase();
            const cards = availableCards();
            const matches = (query
                ? cards.filter((item) => item.title.toLocaleLowerCase().includes(query))
                : cards
            ).slice(0, 6);
            const recents = query ? [] : recentSearches();

            panel.replaceChildren();
            activeIndex = -1;

            const header = document.createElement('div');
            header.className = 'smart-search-heading';
            header.innerHTML = `<strong>${query ? 'Quick matches' : 'Popular on TShow'}</strong><span>${query ? 'Press Enter to search all' : 'Start typing to search'}</span>`;
            panel.append(header);

            if (recents.length) {
                const recentRow = document.createElement('div');
                recentRow.className = 'smart-search-recents';
                const label = document.createElement('span');
                label.textContent = 'Recent';
                recentRow.append(label);
                recents.forEach((recent) => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.textContent = recent;
                    chip.addEventListener('click', () => runRecent(recent));
                    recentRow.append(chip);
                });
                panel.append(recentRow);
            }

            const list = document.createElement('div');
            list.className = 'smart-search-list';
            matches.forEach((item) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'smart-search-result';
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', 'false');

                const sourceImage = item.card.querySelector('.poster-image');
                if (sourceImage?.currentSrc || sourceImage?.src) {
                    const image = document.createElement('img');
                    image.src = sourceImage.currentSrc || sourceImage.src;
                    image.alt = '';
                    image.loading = 'lazy';
                    button.append(image);
                } else {
                    const fallback = document.createElement('span');
                    fallback.className = 'smart-search-fallback';
                    fallback.textContent = item.title.slice(0, 1).toUpperCase();
                    button.append(fallback);
                }

                const copy = document.createElement('span');
                copy.className = 'smart-search-copy';
                const title = document.createElement('strong');
                title.textContent = item.title;
                const meta = document.createElement('span');
                meta.textContent = [item.year, item.type].filter(Boolean).join(' · ');
                copy.append(title, meta);
                button.append(copy);

                button.addEventListener('click', () => {
                    rememberSearch(item.title);
                    input.value = item.title;
                    panel.hidden = true;
                    withViewTransition(() => item.card.click());
                });
                list.append(button);
            });
            panel.append(list);

            if (!matches.length) {
                const empty = document.createElement('p');
                empty.className = 'smart-search-empty';
                empty.textContent = 'No quick match in the loaded rows. Press Enter to search the full catalog.';
                panel.append(empty);
            }

            suggestionButtons = [...list.querySelectorAll('.smart-search-result')];
            panel.hidden = false;
            placePanel();
        };

        input.addEventListener('focus', render);
        input.addEventListener('input', render);
        form.addEventListener('submit', () => {
            rememberSearch(input.value);
            panel.hidden = true;
        });
        input.addEventListener('keydown', (event) => {
            if (panel.hidden) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                selectSuggestion(activeIndex + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                selectSuggestion(activeIndex <= 0 ? suggestionButtons.length - 1 : activeIndex - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                suggestionButtons[activeIndex]?.click();
            } else if (event.key === 'Escape') {
                panel.hidden = true;
            }
        });

        document.addEventListener('pointerdown', (event) => {
            if (!panel.hidden && !panel.contains(event.target) && !form.contains(event.target)) panel.hidden = true;
        });
        window.addEventListener('resize', placePanel, { passive: true });
        window.addEventListener('scroll', placePanel, { passive: true });
    }

    function enhanceMobileDock() {
        if (document.getElementById('mobile-dock')) return;
        const dock = document.createElement('nav');
        dock.id = 'mobile-dock';
        dock.className = 'mobile-dock';
        dock.setAttribute('aria-label', 'Quick navigation');

        const items = [
            ['⌂', 'Home', () => document.querySelector('.nav-link[data-view="home"]')?.click()],
            ['✦', 'Explore', () => document.querySelector('.nav-link[data-view="explore"]')?.click()],
            ['⌕', 'Search', () => document.getElementById('search-input')?.focus()],
            ['＋', 'My List', () => document.querySelector('.nav-link[data-view="list"]')?.click()],
            ['☰', 'More', () => document.getElementById('menu-button')?.click()]
        ];

        items.forEach(([icon, label, action]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.dock = label.toLocaleLowerCase().replace(/\s+/g, '-');
            button.innerHTML = `<span aria-hidden="true">${icon}</span><small>${label}</small>`;
            button.addEventListener('click', () => withViewTransition(action));
            dock.append(button);
        });
        document.body.append(dock);

        const sync = () => {
            const active = document.querySelector('.sidebar-nav .nav-link.is-active')?.dataset.view || '';
            dock.querySelectorAll('button').forEach((button) => {
                const key = button.dataset.dock;
                const matches = (key === 'home' && active === 'home') ||
                    (key === 'explore' && active === 'explore') ||
                    (key === 'my-list' && active === 'list');
                button.classList.toggle('is-active', matches);
                if (matches) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            });
        };
        sync();
        const sidebar = document.querySelector('.sidebar-nav');
        if (sidebar) new MutationObserver(sync).observe(sidebar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function enhancePlayerGestures() {
        const stage = document.getElementById('video-stage');
        const video = document.getElementById('video-player');
        if (!stage || !video || stage.dataset.gesturesReady) return;
        stage.dataset.gesturesReady = 'true';

        let lastTapAt = 0;
        let lastTapX = 0;
        const feedback = document.createElement('div');
        feedback.className = 'seek-feedback';
        feedback.hidden = true;
        stage.append(feedback);
        let feedbackTimer;

        const showFeedback = (text, side = 'center') => {
            feedback.textContent = text;
            feedback.dataset.side = side;
            feedback.hidden = false;
            feedback.classList.remove('is-visible');
            requestAnimationFrame(() => feedback.classList.add('is-visible'));
            clearTimeout(feedbackTimer);
            feedbackTimer = setTimeout(() => {
                feedback.classList.remove('is-visible');
                setTimeout(() => { feedback.hidden = true; }, 170);
            }, 620);
        };

        const actAt = (clientX) => {
            if (video.hidden || !Number.isFinite(video.duration) || !video.duration) return;
            const rect = stage.getBoundingClientRect();
            const ratio = (clientX - rect.left) / Math.max(1, rect.width);
            if (ratio < .35) {
                video.currentTime = Math.max(0, video.currentTime - 10);
                showFeedback('−10 sec', 'left');
            } else if (ratio > .65) {
                video.currentTime = Math.min(video.duration, video.currentTime + 10);
                showFeedback('+10 sec', 'right');
            } else if (document.fullscreenEnabled) {
                (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen?.()).catch?.(() => {});
                showFeedback('Fullscreen', 'center');
            } else if (typeof video.webkitEnterFullscreen === 'function') {
                try { video.webkitEnterFullscreen(); } catch { /* Native playback remains available. */ }
            }
        };

        stage.addEventListener('dblclick', (event) => {
            if (event.target.closest('button, select, a')) return;
            event.preventDefault();
            actAt(event.clientX);
        });

        stage.addEventListener('pointerup', (event) => {
            if (event.pointerType !== 'touch' || event.target.closest('button, select, a')) return;
            const now = performance.now();
            if (now - lastTapAt < 330 && Math.abs(event.clientX - lastTapX) < 90) {
                event.preventDefault();
                actAt(event.clientX);
                lastTapAt = 0;
                return;
            }
            lastTapAt = now;
            lastTapX = event.clientX;
        });
    }

    function enhanceCardAccessibility() {
        const apply = (root = document) => {
            root.querySelectorAll?.('.media-card:not([data-premium-ready])').forEach((card) => {
                card.dataset.premiumReady = 'true';
                card.title = card.querySelector('.card-title')?.textContent?.trim() || card.title;
            });
        };
        apply();
        const main = document.getElementById('main-content');
        if (main) new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
            if (node.nodeType === 1) apply(node);
        }))).observe(main, { childList: true, subtree: true });
    }

    function enhanceConnectionFeedback() {
        const pill = document.createElement('div');
        pill.className = 'connection-pill';
        pill.hidden = true;
        pill.setAttribute('role', 'status');
        pill.setAttribute('aria-live', 'polite');
        document.body.append(pill);
        let timer;
        const show = (text, online) => {
            pill.textContent = text;
            pill.classList.toggle('is-online', online);
            pill.hidden = false;
            clearTimeout(timer);
            timer = setTimeout(() => { pill.hidden = true; }, online ? 2200 : 5000);
        };
        window.addEventListener('offline', () => show('Offline · saved items still work', false));
        window.addEventListener('online', () => show('Back online', true));
    }
})();
