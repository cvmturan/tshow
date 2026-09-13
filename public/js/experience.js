(() => {
    'use strict';

    const recentSearchKey = 'tshow:recent-searches:v1';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        setupSmartSearch();
        setupMobileDock();
        setupPlayerGestures();
        setupConnectivityNotice();
        setupCardLabels();
    }

    function transition(action) {
        if (!reducedMotion.matches && typeof document.startViewTransition === 'function') {
            document.startViewTransition(action);
        } else {
            action();
        }
    }

    function setupSmartSearch() {
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
        input.setAttribute('aria-controls', panel.id);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        let activeIndex = -1;
        let optionButtons = [];

        const readRecent = () => {
            try {
                const stored = JSON.parse(localStorage.getItem(recentSearchKey) || '[]');
                return Array.isArray(stored)
                    ? stored.filter((item) => typeof item === 'string' && item.trim()).slice(0, 5)
                    : [];
            } catch {
                return [];
            }
        };

        const remember = (value) => {
            const query = String(value || '').trim();
            if (query.length < 2) return;
            const others = readRecent().filter((item) => item.toLocaleLowerCase() !== query.toLocaleLowerCase());
            try {
                localStorage.setItem(recentSearchKey, JSON.stringify([query, ...others].slice(0, 5)));
            } catch {
                // Search remains available when browser storage is unavailable.
            }
        };

        const availableCards = () => {
            const seen = new Set();
            return [...document.querySelectorAll('.media-card')].map((card) => {
                const title = card.querySelector('.card-title')?.textContent?.trim();
                if (!title) return null;
                const metadata = [...card.querySelectorAll('.card-meta span')]
                    .map((node) => node.textContent?.trim()).filter(Boolean);
                const key = `${title.toLocaleLowerCase()}|${metadata.join('|')}`;
                if (seen.has(key)) return null;
                seen.add(key);
                return { card, title, metadata };
            }).filter(Boolean);
        };

        const place = () => {
            if (panel.hidden) return;
            const rect = form.getBoundingClientRect();
            const gutter = window.innerWidth <= 700 ? 10 : 14;
            panel.style.left = `${Math.max(gutter, Math.min(rect.left, window.innerWidth - gutter - 460))}px`;
            panel.style.top = `${Math.min(window.innerHeight - 16, rect.bottom + 9)}px`;
            panel.style.width = `${Math.min(460, window.innerWidth - gutter * 2)}px`;
        };

        const setOpen = (open) => {
            panel.hidden = !open;
            input.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open) place();
        };

        const select = (index) => {
            if (!optionButtons.length) return;
            activeIndex = (index + optionButtons.length) % optionButtons.length;
            optionButtons.forEach((button, buttonIndex) => {
                const active = buttonIndex === activeIndex;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            optionButtons[activeIndex].scrollIntoView({ block: 'nearest' });
        };

        const submitRecent = (query) => {
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            remember(query);
            setOpen(false);
            form.requestSubmit();
        };

        const render = () => {
            const rawQuery = input.value.trim();
            const query = rawQuery.toLocaleLowerCase();
            const cards = availableCards();
            const results = (query
                ? cards.filter((item) => item.title.toLocaleLowerCase().includes(query))
                : cards
            ).slice(0, 6);

            panel.replaceChildren();
            activeIndex = -1;

            const heading = document.createElement('div');
            heading.className = 'smart-search-heading';
            const label = document.createElement('strong');
            label.textContent = query ? 'Quick matches' : 'Popular on TShow';
            const hint = document.createElement('span');
            hint.textContent = query ? 'Enter searches the full catalog' : 'Start typing to search';
            heading.append(label, hint);
            panel.append(heading);

            const recents = query ? [] : readRecent();
            if (recents.length) {
                const recentRow = document.createElement('div');
                recentRow.className = 'smart-search-recents';
                const recentLabel = document.createElement('span');
                recentLabel.textContent = 'Recent';
                recentRow.append(recentLabel);
                recents.forEach((recent) => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.textContent = recent;
                    chip.addEventListener('click', () => submitRecent(recent));
                    recentRow.append(chip);
                });
                panel.append(recentRow);
            }

            const list = document.createElement('div');
            list.className = 'smart-search-list';
            results.forEach((item) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'smart-search-result';
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', 'false');

                const poster = item.card.querySelector('.poster-image');
                if (poster?.currentSrc || poster?.src) {
                    const image = document.createElement('img');
                    image.src = poster.currentSrc || poster.src;
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
                meta.textContent = item.metadata.join(' · ');
                copy.append(title, meta);
                button.append(copy);
                button.addEventListener('click', () => {
                    remember(item.title);
                    input.value = item.title;
                    setOpen(false);
                    transition(() => item.card.click());
                });
                list.append(button);
            });
            panel.append(list);

            if (!results.length) {
                const empty = document.createElement('p');
                empty.className = 'smart-search-empty';
                empty.textContent = 'No quick match in the loaded rows. Press Enter to search every connected catalog.';
                panel.append(empty);
            }

            optionButtons = [...list.querySelectorAll('.smart-search-result')];
            setOpen(true);
        };

        input.addEventListener('focus', render);
        input.addEventListener('input', render);
        form.addEventListener('submit', () => {
            remember(input.value);
            setOpen(false);
        });
        input.addEventListener('keydown', (event) => {
            if (panel.hidden) return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                select(activeIndex + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                select(activeIndex - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                optionButtons[activeIndex]?.click();
            } else if (event.key === 'Escape') {
                setOpen(false);
            }
        });
        document.addEventListener('pointerdown', (event) => {
            if (!panel.hidden && !panel.contains(event.target) && !form.contains(event.target)) setOpen(false);
        });
        window.addEventListener('resize', place, { passive: true });
        window.addEventListener('scroll', place, { passive: true });
    }

    function setupMobileDock() {
        if (document.getElementById('mobile-dock')) return;
        const dock = document.createElement('nav');
        dock.id = 'mobile-dock';
        dock.className = 'mobile-dock';
        dock.setAttribute('aria-label', 'Quick navigation');
        const destinations = [
            ['⌂', 'Home', 'home', () => document.querySelector('.nav-link[data-view="home"]')?.click()],
            ['✦', 'Explore', 'explore', () => document.querySelector('.nav-link[data-view="explore"]')?.click()],
            ['⌕', 'Search', 'search', () => document.getElementById('search-input')?.focus()],
            ['＋', 'My List', 'list', () => document.querySelector('.nav-link[data-view="list"]')?.click()],
            ['☰', 'More', 'more', () => document.getElementById('menu-button')?.click()]
        ];
        destinations.forEach(([icon, label, key, action]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.dock = key;
            const iconNode = document.createElement('span');
            iconNode.setAttribute('aria-hidden', 'true');
            iconNode.textContent = icon;
            const copy = document.createElement('small');
            copy.textContent = label;
            button.append(iconNode, copy);
            button.addEventListener('click', () => transition(action));
            dock.append(button);
        });
        document.body.append(dock);

        const sync = () => {
            const active = document.querySelector('.sidebar-nav .nav-link.is-active')?.dataset.view || '';
            const searchIsVisible = !document.querySelector('[data-view-panel="search"]')?.hidden;
            const sidebarIsOpen = document.body.classList.contains('sidebar-open');
            dock.querySelectorAll('button').forEach((button) => {
                const matches = button.dataset.dock === active ||
                    (button.dataset.dock === 'search' && searchIsVisible) ||
                    (button.dataset.dock === 'more' && sidebarIsOpen);
                button.classList.toggle('is-active', matches);
                if (matches) button.setAttribute('aria-current', 'page');
                else button.removeAttribute('aria-current');
            });
        };
        sync();
        const sidebar = document.querySelector('.sidebar-nav');
        if (sidebar) new MutationObserver(sync).observe(sidebar, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        new MutationObserver(sync).observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function setupPlayerGestures() {
        const stage = document.getElementById('video-stage');
        const video = document.getElementById('video-player');
        if (!stage || !video || stage.dataset.gesturesReady) return;
        stage.dataset.gesturesReady = 'true';

        const feedback = document.createElement('div');
        feedback.className = 'seek-feedback';
        feedback.hidden = true;
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        stage.append(feedback);
        let feedbackTimer;
        let lastTapAt = 0;
        let lastTapX = 0;

        const showFeedback = (message, side) => {
            feedback.textContent = message;
            feedback.dataset.side = side;
            feedback.hidden = false;
            requestAnimationFrame(() => feedback.classList.add('is-visible'));
            clearTimeout(feedbackTimer);
            feedbackTimer = setTimeout(() => {
                feedback.classList.remove('is-visible');
                setTimeout(() => { feedback.hidden = true; }, 180);
            }, 650);
        };

        const act = (clientX) => {
            if (video.hidden || !Number.isFinite(video.duration) || video.duration <= 0) return;
            const bounds = stage.getBoundingClientRect();
            const position = (clientX - bounds.left) / Math.max(1, bounds.width);
            if (position < 0.35) {
                video.currentTime = Math.max(0, video.currentTime - 10);
                showFeedback('−10 seconds', 'left');
            } else if (position > 0.65) {
                video.currentTime = Math.min(video.duration, video.currentTime + 10);
                showFeedback('+10 seconds', 'right');
            } else if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
                showFeedback('Exit fullscreen', 'center');
            } else if (stage.requestFullscreen) {
                stage.requestFullscreen().catch(() => {});
                showFeedback('Fullscreen', 'center');
            } else if (typeof video.webkitEnterFullscreen === 'function') {
                try { video.webkitEnterFullscreen(); } catch { /* Native controls remain available. */ }
            }
        };

        stage.addEventListener('dblclick', (event) => {
            if (event.target !== video) return;
            event.preventDefault();
            act(event.clientX);
        });
        stage.addEventListener('pointerup', (event) => {
            if (event.pointerType !== 'touch' || event.target !== video) return;
            const now = performance.now();
            if (now - lastTapAt < 330 && Math.abs(event.clientX - lastTapX) < 90) {
                event.preventDefault();
                act(event.clientX);
                lastTapAt = 0;
            } else {
                lastTapAt = now;
                lastTapX = event.clientX;
            }
        });
    }

    function setupConnectivityNotice() {
        if (document.getElementById('connection-pill')) return;
        const pill = document.createElement('div');
        pill.id = 'connection-pill';
        pill.className = 'connection-pill';
        pill.hidden = true;
        pill.setAttribute('role', 'status');
        pill.setAttribute('aria-live', 'polite');
        document.body.append(pill);
        let timer;
        const show = (message, online) => {
            pill.textContent = message;
            pill.classList.toggle('is-online', online);
            pill.hidden = false;
            clearTimeout(timer);
            timer = setTimeout(() => { pill.hidden = true; }, online ? 2200 : 5000);
        };
        window.addEventListener('offline', () => show('Offline · saved items remain available', false));
        window.addEventListener('online', () => show('Back online', true));
    }

    function setupCardLabels() {
        const apply = (root = document) => {
            root.querySelectorAll?.('.media-card:not([data-experience-ready])').forEach((card) => {
                card.dataset.experienceReady = 'true';
                const title = card.querySelector('.card-title')?.textContent?.trim();
                if (title && !card.title) card.title = `View ${title}`;
            });
        };
        apply();
        const main = document.getElementById('main-content');
        if (main) new MutationObserver((records) => records.forEach((record) =>
            record.addedNodes.forEach((node) => { if (node.nodeType === 1) apply(node); })
        )).observe(main, { childList: true, subtree: true });
    }
})();
