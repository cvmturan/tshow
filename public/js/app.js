(() => {
    'use strict';

    const STORAGE_KEYS = {
        watchlist: 'streamflix:watchlist:v1',
        continueWatching: 'streamflix:continue:v1',
        recentlyViewed: 'tshow:recent:v1',
        dataSaver: 'streamflix:data-saver:v1',
        addonURLs: 'streamflix:addons:v1',
        addonClientId: 'streamflix:addon-client:v1'
    };

    const addonClientId = loadOrCreateAddonClientId();

    const state = {
        trending: [],
        movies: [],
        series: [],
        latestMovies: [],
        topMovies: [],
        topSeries: [],
        airingToday: [],
        featured: null,
        watchlist: loadStoredArray(STORAGE_KEYS.watchlist),
        recentlyViewed: loadStoredArray(STORAGE_KEYS.recentlyViewed),
        continueEntry: loadStoredValue(STORAGE_KEYS.continueWatching),
        addons: [],
        addonCatalogs: [],
        addonCatalogSignature: '',
        addonCatalogGeneration: 0,
        addonCatalogLoadPromise: null,
        activeView: 'home',
        activeMedia: null,
        activeDetails: null,
        activeVideoId: null,
        playerMedia: null,
        streams: [],
        sourceFilter: 'all',
        visibleStreamIndexes: [],
        activeStreamIndex: null,
        hlsPlayer: null,
        activeExternalURL: null,
        activeExternalAppURL: null,
        activeAttemptIndex: null,
        activeHlsURL: null,
        transcodeTried: false,
        trailerMode: false,
        localObjectURL: null,
        lastProgressSave: 0,
        subtitleLibrary: [],
        subtitleObjectURL: null,
        editingAddonId: null,
        addonURLs: loadStoredArray(STORAGE_KEYS.addonURLs)
            .filter((value) => typeof value === 'string' && value.length <= 8192)
            .slice(0, 20),
        lastAddonSync: 0,
        dataSaver: false,
        installPrompt: null
    };

    const elements = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheElements();
        bindEvents();
        updateListCount();
        renderContinueWatching();
        renderRecentlyViewed();
        renderLoadingCards(elements.trendingRail, 8);
        renderLoadingCards(elements.moviesRail, 8);
        renderLoadingCards(elements.seriesRail, 8);
        renderLoadingCards(elements.latestMoviesRail, 8);
        renderLoadingCards(elements.topMoviesRail, 8);
        renderLoadingCards(elements.topSeriesRail, 8);
        renderLoadingCards(elements.airingTodayRail, 8);
        updateClock();
        window.setInterval(updateClock, 30_000);
        registerPWA();

        await Promise.all([
            loadHome(),
            initializeAddons()
        ]);

        const requestedView = new URLSearchParams(window.location.search).get('view');
        if (['home', 'list', 'addons', 'help'].includes(requestedView)) setView(requestedView);
    }

    function cacheElements() {
        const ids = [
            'site-header',
            'site-sidebar',
            'sidebar-scrim',
            'menu-button',
            'install-app-button',
            'header-clock',
            'search-form',
            'search-input',
            'search-clear',
            'open-local-button',
            'local-video-input',
            'list-count',
            'hero',
            'hero-art',
            'hero-title',
            'hero-meta',
            'hero-overview',
            'hero-play',
            'hero-info',
            'catalog-mode',
            'continue-section',
            'continue-rail',
            'trending-rail',
            'movies-rail',
            'series-rail',
            'latest-movies-rail',
            'top-movies-rail',
            'top-series-rail',
            'airing-today-rail',
            'recent-section',
            'recent-rail',
            'addon-catalogs-section',
            'addon-catalogs-container',
            'refresh-addon-catalogs',
            'list-grid',
            'list-empty',
            'search-title',
            'search-summary',
            'search-grid',
            'search-empty',
            'addon-count',
            'addon-form',
            'manifest-url',
            'install-addon-button',
            'refresh-addons',
            'addon-grid',
            'export-data-button',
            'import-data-button',
            'import-data-input',
            'contact-form',
            'contact-submit',
            'contact-status',
            'details-dialog',
            'details-close',
            'details-content',
            'player-dialog',
            'player-close',
            'player-title',
            'video-player',
            'trailer-frame',
            'video-loading',
            'external-source',
            'external-source-title',
            'external-source-note',
            'open-external-source',
            'try-direct-source',
            'source-summary',
            'source-filter-group',
            'source-compatibility-help',
            'stream-select',
            'speed-select',
            'data-saver-button',
            'external-player-actions',
            'open-in-vlc',
            'open-in-outplayer',
            'open-in-source-app',
            'copy-source-link',
            'subtitle-select',
            'open-local-subtitle',
            'subtitle-file-input',
            'player-source-title',
            'player-source-note',
            'toast-region'
        ];

        for (const id of ids) {
            elements[toCamelCase(id)] = document.getElementById(id);
        }
    }

    function bindEvents() {
        document.querySelectorAll('.nav-trigger, .nav-link').forEach((button) => {
            if (!button.dataset.view) return;
            button.addEventListener('click', () => {
                setView(button.dataset.view);
                closeSidebar();
            });
        });

        document.querySelectorAll('[data-browse-collection]').forEach((button) => {
            button.addEventListener('click', () => {
                showBrowseView(button.dataset.browseCollection === 'movies' ? 'movie' : 'tv');
                closeSidebar();
            });
        });

        document.querySelectorAll('[data-browse-rail]').forEach((button) => {
            button.addEventListener('click', () => showCollectionView(button.dataset.browseRail));
        });

        elements.menuButton.addEventListener('click', toggleSidebar);
        elements.sidebarScrim.addEventListener('click', closeSidebar);
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeSidebar();
        });

        elements.searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            runSearch(elements.searchInput.value);
        });

        elements.searchInput.addEventListener('input', () => {
            elements.searchClear.hidden = !elements.searchInput.value;
        });

        elements.searchClear.addEventListener('click', () => {
            elements.searchInput.value = '';
            elements.searchClear.hidden = true;
            elements.searchInput.focus();
            if (state.activeView === 'search') setView('home');
        });

        elements.openLocalButton.addEventListener('click', () => {
            elements.localVideoInput.click();
            closeSidebar();
        });
        elements.localVideoInput.addEventListener('change', openLocalVideo);

        elements.heroPlay.addEventListener('click', () => {
            if (!state.featured) return;
            if (mediaType(state.featured) === 'tv' && state.featured._addonCatalog) {
                openDetails(state.featured);
            } else {
                playMedia(state.featured);
            }
        });
        elements.heroInfo.addEventListener('click', () => {
            if (state.featured) openDetails(state.featured);
        });

        elements.addonForm.addEventListener('submit', installAddon);
        elements.refreshAddons.addEventListener('click', refreshAddons);
        elements.exportDataButton.addEventListener('click', exportBrowserData);
        elements.importDataButton.addEventListener('click', () => elements.importDataInput.click());
        elements.importDataInput.addEventListener('change', importBrowserData);
        elements.contactForm.addEventListener('submit', submitContactForm);

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            state.installPrompt = event;
            elements.installAppButton.hidden = false;
        });
        elements.installAppButton.addEventListener('click', installPWA);
        window.addEventListener('appinstalled', () => {
            state.installPrompt = null;
            elements.installAppButton.hidden = true;
            showToast('TShow was installed successfully.');
        });
        elements.refreshAddonCatalogs.addEventListener('click', () => {
            state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
        });

        elements.detailsClose.addEventListener('click', () => elements.detailsDialog.close());
        elements.playerClose.addEventListener('click', () => elements.playerDialog.close());

        [elements.detailsDialog, elements.playerDialog].forEach((dialog) => {
            dialog.addEventListener('click', (event) => {
                if (event.target === dialog) dialog.close();
            });
            dialog.addEventListener('close', updateDialogState);
        });

        elements.playerDialog.addEventListener('close', closePlayer);
        elements.streamSelect.addEventListener('change', () => {
            const index = Number.parseInt(elements.streamSelect.value, 10);
            if (Number.isInteger(index)) applyStream(index);
        });
        elements.sourceFilterGroup.querySelectorAll('[data-source-filter]').forEach((button) => {
            button.addEventListener('click', () => {
                state.sourceFilter = button.dataset.sourceFilter || 'all';
                renderSourcePicker();
            });
        });
        elements.speedSelect.addEventListener('change', () => {
            elements.videoPlayer.playbackRate = Number(elements.speedSelect.value) || 1;
        });
        elements.dataSaverButton.addEventListener('click', toggleDataSaver);
        elements.openInVlc.addEventListener('click', openActiveStreamInVlc);
        elements.openInOutplayer.addEventListener('click', openActiveStreamInOutplayer);
        elements.openInSourceApp.addEventListener('click', openActiveStreamInSourceApp);
        elements.copySourceLink.addEventListener('click', copyActiveSourceLink);
        updateDataSaverButton();
        elements.subtitleSelect.addEventListener('change', () => {
            applySubtitleChoice(elements.subtitleSelect.value);
        });
        elements.openLocalSubtitle.addEventListener('click', () => {
            elements.subtitleFileInput.click();
        });
        elements.subtitleFileInput.addEventListener('change', openLocalSubtitle);
        elements.openExternalSource.addEventListener('click', () => {
            if (state.activeExternalURL) {
                window.open(state.activeExternalURL, '_blank', 'noopener,noreferrer');
            }
        });
        elements.tryDirectSource.addEventListener('click', () => {
            if (Number.isInteger(state.activeAttemptIndex)) {
                applyStream(state.activeAttemptIndex, { forceAttempt: true });
            }
        });

        elements.videoPlayer.addEventListener('timeupdate', savePlaybackProgress);
        elements.videoPlayer.addEventListener('ended', () => {
            if (state.playerMedia) {
                localStorage.removeItem(STORAGE_KEYS.continueWatching);
                state.continueEntry = null;
                renderContinueWatching();
            }
        });
        elements.videoPlayer.addEventListener('error', () => {
            if (!elements.videoPlayer.currentSrc || state.hlsPlayer) return;
            showToast('This source could not be played by the browser. Try another source or video format.', 'error');
        });

        window.addEventListener('scroll', () => {
            elements.siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);
        }, { passive: true });
    }

    async function loadHome() {
        try {
            const tmdbHealth = await api('/api/tmdb/health').catch(() => ({ tmdbKey: false }));
            let catalogLabel = 'Live public metadata';

            if (tmdbHealth.tmdbKey) {
                const [trendingData, moviesData, seriesData, latestMoviesData, topMoviesData, topSeriesData, airingData] = await Promise.all([
                    api('/api/tmdb/trending/all/week'),
                    loadPagedCatalog('/api/tmdb/popular/movies'),
                    loadPagedCatalog('/api/tmdb/popular/tv'),
                    loadPagedCatalog('/api/tmdb/now-playing/movies'),
                    loadPagedCatalog('/api/tmdb/top-rated/movies'),
                    loadPagedCatalog('/api/tmdb/top-rated/tv'),
                    loadPagedCatalog('/api/tmdb/airing-today/tv')
                ]);
                state.movies = normalizeCollection(moviesData.results, 'movie');
                state.series = normalizeCollection(seriesData.results, 'tv');
                state.trending = normalizeCollection(trendingData.results);
                state.latestMovies = normalizeCollection(latestMoviesData.results, 'movie');
                state.topMovies = normalizeCollection(topMoviesData.results, 'movie');
                state.topSeries = normalizeCollection(topSeriesData.results, 'tv');
                state.airingToday = normalizeCollection(airingData.results, 'tv');
                catalogLabel = 'Live movie & TV catalog';
            } else {
                try {
                    const [moviePages, seriesPages] = await Promise.all([
                        Promise.all([0, 100, 200].map((skip) => api(`/api/addons/catalog/org.cvmturan.discovery/movie/top?skip=${skip}`))),
                        Promise.all([0, 100, 200].map((skip) => api(`/api/addons/catalog/org.cvmturan.discovery/series/top?skip=${skip}`)))
                    ]);
                    const discoveryAddon = {
                        id: 'org.cvmturan.discovery',
                        name: 'TShow Discovery'
                    };
                    state.movies = normalizeLiveCatalog(
                        mergeAddonCatalogPages(moviePages),
                        { addon: discoveryAddon, catalog: { id: 'top', name: 'Popular movies' }, type: 'movie' }
                    );
                    state.series = normalizeLiveCatalog(
                        mergeAddonCatalogPages(seriesPages),
                        { addon: discoveryAddon, catalog: { id: 'top', name: 'Popular series' }, type: 'series' }
                    );
                    state.trending = weaveCollections(state.movies, state.series);
                    if (!state.movies.length || !state.series.length) {
                        throw new Error('The live catalog returned no titles.');
                    }
                } catch {
                    const [trendingData, moviesData, seriesData] = await Promise.all([
                        api('/api/tmdb/trending/all/week'),
                        api('/api/tmdb/discover/movies'),
                        api('/api/tmdb/discover/tv')
                    ]);
                    state.movies = normalizeCollection(moviesData.results, 'movie');
                    state.series = normalizeCollection(seriesData.results, 'tv');
                    state.trending = normalizeCollection(trendingData.results);
                    catalogLabel = 'Offline fallback catalog';
                }
                state.latestMovies = sortByLatest(state.movies);
                state.topMovies = sortByRating(state.movies);
                state.topSeries = sortByRating(state.series);
                state.airingToday = sortByLatest(state.series);
            }

            if (!state.trending.length) {
                state.trending = weaveCollections(state.movies, state.series);
            }

            state.featured = state.movies.find((media) => media.backdrop_path && media.overview) ||
                state.trending.find((media) => media.backdrop_path && media.overview) ||
                state.movies[0] ||
                state.series[0] ||
                null;
            renderHero(state.featured);
            renderRail(elements.trendingRail, state.trending);
            renderRail(elements.moviesRail, state.movies);
            renderRail(elements.seriesRail, state.series);
            renderRail(elements.latestMoviesRail, state.latestMovies);
            renderRail(elements.topMoviesRail, state.topMovies);
            renderRail(elements.topSeriesRail, state.topSeries);
            renderRail(elements.airingTodayRail, state.airingToday);
            elements.catalogMode.textContent = catalogLabel;
        } catch (error) {
            [elements.trendingRail, elements.moviesRail, elements.seriesRail, elements.latestMoviesRail,
                elements.topMoviesRail, elements.topSeriesRail, elements.airingTodayRail]
                .forEach((rail) => renderRail(rail, []));
            elements.catalogMode.textContent = 'Catalog unavailable';
            showToast(error.message || 'Could not load the catalog.', 'error');
        }
    }

    async function loadPagedCatalog(path, pageCount = 2) {
        const pages = await Promise.all(
            Array.from({ length: pageCount }, (_, index) => api(`${path}?page=${index + 1}`))
        );
        return {
            results: pages.flatMap((page) => Array.isArray(page?.results) ? page.results : [])
        };
    }

    function mergeAddonCatalogPages(pages) {
        return {
            metas: pages.flatMap((page) => Array.isArray(page?.metas)
                ? page.metas
                : Array.isArray(page?.results) ? page.results : [])
        };
    }

    function sortByLatest(items) {
        return [...items].sort((left, right) => {
            const leftDate = Date.parse(left.release_date || left.first_air_date || left.releaseInfo || '') || 0;
            const rightDate = Date.parse(right.release_date || right.first_air_date || right.releaseInfo || '') || 0;
            return rightDate - leftDate || Number(right.popularity || 0) - Number(left.popularity || 0);
        });
    }

    function sortByRating(items) {
        return [...items].sort((left, right) =>
            Number(right.vote_average || 0) - Number(left.vote_average || 0) ||
            Number(right.popularity || 0) - Number(left.popularity || 0)
        );
    }

    function normalizeLiveCatalog(data, descriptor) {
        const metas = Array.isArray(data?.metas)
            ? data.metas
            : Array.isArray(data?.results)
                ? data.results
                : [];
        return uniqueMedia(
            metas
                .map((meta) => normalizeAddonMeta(meta, descriptor))
                .filter(Boolean)
        );
    }

    function weaveCollections(left, right) {
        const items = [];
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            if (left[index]) items.push(left[index]);
            if (right[index]) items.push(right[index]);
        }
        return uniqueMedia(items);
    }

    function renderHero(media) {
        if (!media) return;

        const title = mediaTitle(media);
        const year = mediaYear(media);
        const score = formatRating(media.vote_average);
        const backdrop = imageURL(media.backdrop_path, 'original');

        elements.heroTitle.textContent = title;
        elements.heroOverview.textContent = media.overview || 'Open the title to see more information.';
        const provider = (media._sourceAddonId === 'org.cvmturan.discovery' ? 'TShow' : null) ||
            media._catalogName ||
            media._sourceAddonName ||
            'Catalog title';
        elements.heroMeta.replaceChildren(
            makeElement('span', 'match', score ? `${score} viewer score` : 'Featured'),
            makeElement('span', '', year || 'Catalog pick'),
            makeElement('span', '', mediaType(media) === 'movie' ? 'Movie' : 'Series'),
            makeElement('span', 'rating-pill', provider)
        );

        if (backdrop) {
            elements.heroArt.style.backgroundImage = `url("${backdrop}")`;
            elements.heroArt.classList.add('has-image');
        } else {
            elements.heroArt.style.backgroundImage = '';
            elements.heroArt.classList.remove('has-image');
        }
    }

    function renderLoadingCards(container, count) {
        const cards = Array.from({ length: count }, () => {
            const card = makeElement('div', 'skeleton-card');
            const poster = makeElement('div', 'poster-frame');
            const line = makeElement('div', 'skeleton-line');
            card.append(poster, line);
            return card;
        });
        container.replaceChildren(...cards);
    }

    function renderRail(container, mediaItems) {
        if (!mediaItems.length) {
            const message = makeElement('p', 'section-note', 'Nothing is available in this row yet.');
            container.replaceChildren(message);
            return;
        }

        container.replaceChildren(...mediaItems.slice(0, 20).map((media) => createMediaCard(media)));
    }

    function createMediaCard(media, progress = null) {
        const title = mediaTitle(media);
        const type = mediaType(media);
        const card = makeElement('button', 'media-card');
        card.type = 'button';
        card.setAttribute('aria-label', `Open details for ${title}`);

        const frame = makeElement('span', 'poster-frame');
        const fallback = makeElement('span', 'poster-fallback', title.slice(0, 1).toUpperCase() || 'S');
        frame.append(fallback);

        const sourceLabel = (media._sourceAddonId === 'org.cvmturan.discovery' ? 'TShow' : null) ||
            media._catalogName ||
            media._sourceAddonName;
        if (sourceLabel) {
            frame.append(makeElement('span', 'media-source-badge', sourceLabel));
        }

        const poster = imageURL(media.poster_path, 'w500');
        if (poster) {
            const image = document.createElement('img');
            image.className = 'poster-image';
            image.alt = `${title} poster`;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('load', () => image.classList.add('is-loaded'));
            image.addEventListener('error', () => image.remove());
            if (/^\/[a-zA-Z0-9_./-]+$/.test(String(media.poster_path || ''))) {
                image.srcset = [
                    `${imageURL(media.poster_path, 'w342')} 342w`,
                    `${poster} 500w`,
                    `${imageURL(media.poster_path, 'w780')} 780w`
                ].join(', ');
                image.sizes = '(max-width: 640px) 145px, 208px';
            }
            image.src = poster;
            frame.append(image);
        }

        const overlay = makeElement('span', 'card-overlay');
        const play = makeElement('span', 'card-play');
        play.append(makeElement('span', 'play-icon'));
        overlay.append(play);
        frame.append(overlay);

        if (progress !== null && Number.isFinite(progress)) {
            const track = makeElement('span', 'progress-track');
            const fill = makeElement('span');
            fill.style.width = `${Math.min(100, Math.max(2, progress))}%`;
            track.append(fill);
            frame.append(track);
        }

        const copy = makeElement('span', 'card-copy');
        const cardTitle = makeElement('span', 'card-title', title);
        const meta = makeElement('span', 'card-meta');
        const rating = makeElement('span', 'card-rating', formatRating(media.vote_average) || 'New');
        meta.append(
            makeElement('span', '', mediaYear(media) || '—'),
            makeElement('span', '', type === 'movie' ? 'Movie' : 'Series'),
            rating
        );
        copy.append(cardTitle, meta);
        card.append(frame, copy);
        card.addEventListener('click', () => openDetails(media));
        return card;
    }

    async function openDetails(media) {
        const type = mediaType(media);

        try {
            if (media._addonCatalog) {
                const resolved = await resolveAddonDetails(media);
                state.activeMedia = resolved.media;
                state.activeDetails = resolved.details;
            } else {
                const endpoint = type === 'movie' ? 'movie' : 'tv';
                const details = await api(`/api/tmdb/${endpoint}/${encodeURIComponent(media.id)}`);
                state.activeMedia = normalizeMedia({ ...media, ...details }, type);
                state.activeDetails = details;
            }

            renderDetails(state.activeMedia, state.activeDetails);
            rememberRecentlyViewed(state.activeMedia);
            openDialog(elements.detailsDialog);
        } catch (error) {
            showToast(error.message || 'Could not load title details.', 'error');
        }
    }

    async function resolveAddonDetails(media) {
        const stremioType = media._stremioType || (mediaType(media) === 'movie' ? 'movie' : 'series');
        const stremioId = String(media._stremioId || media.imdb_id || media.id);
        const sourceAddon = state.addons.find((addon) => addon.id === media._sourceAddonId);
        const descriptor = {
            addon: sourceAddon || {
                id: media._sourceAddonId,
                name: media._sourceAddonName || 'Installed add-on'
            },
            catalog: {
                id: media._catalogId || '',
                name: media._catalogName || ''
            },
            type: stremioType
        };
        const inlineMeta = {
            id: stremioId,
            type: stremioType,
            name: mediaTitle(media),
            poster: media.poster_path,
            background: media.backdrop_path,
            description: media.overview,
            releaseInfo: mediaYear(media),
            imdbRating: media.vote_average,
            genres: media._genres || [],
            runtime: media._runtime || null,
            trailerStreams: media._trailers || [],
            videos: media._stremioVideos || [],
            behaviorHints: media._behaviorHints || {},
            moviedb_id: media._tmdbId || null
        };

        const candidates = [];
        if (
            Array.isArray(sourceAddon?.resources) &&
            sourceAddon.resources.includes('meta') &&
            (sourceAddon.manifestURL || sourceAddon.id === 'org.cvmturan.tvmaze')
        ) {
            candidates.push(sourceAddon.id);
        }
        if (/^tt\d+$/i.test(stremioId)) {
            candidates.push('org.streamflix.cinemeta');
        }

        let remoteMeta = null;
        for (const addonId of [...new Set(candidates)]) {
            try {
                const data = await api(
                    `/api/addons/meta/${encodeURIComponent(addonId)}/${encodeURIComponent(stremioType)}/${encodeURIComponent(stremioId)}`
                );
                if (data?.meta && typeof data.meta === 'object') {
                    remoteMeta = data.meta;
                    break;
                }
            } catch {
                // Rich inline catalog data remains usable when a metadata service is unavailable.
            }
        }

        const combined = { ...inlineMeta, ...(remoteMeta || {}), id: stremioId, type: stremioType };
        const normalized = normalizeAddonMeta(combined, descriptor);
        const videos = Array.isArray(combined.videos) ? combined.videos : [];
        const seasons = summarizeAddonSeasons(videos);
        const details = {
            ...combined,
            imdb_id: combined.imdb_id || (/^tt\d+$/i.test(stremioId) ? stremioId : null),
            runtime: parseRuntimeMinutes(combined.runtime),
            genres: normalizeGenres(combined.genres || combined.genre),
            videos,
            trailerStreams: Array.isArray(combined.trailerStreams)
                ? combined.trailerStreams
                : Array.isArray(combined.trailers)
                    ? combined.trailers
                    : [],
            behaviorHints: combined.behaviorHints || {},
            seasons,
            number_of_seasons: seasons.length
        };

        return {
            media: normalizeMedia({ ...media, ...normalized, id: stremioId }, mediaType(media)),
            details
        };
    }

    function summarizeAddonSeasons(videos) {
        const counts = new Map();
        for (const video of videos) {
            const season = Number(video?.season);
            if (!Number.isInteger(season) || season < 0) continue;
            counts.set(season, (counts.get(season) || 0) + 1);
        }
        return [...counts.entries()]
            .sort(([left], [right]) => left - right)
            .map(([season, count]) => ({
                season_number: season,
                name: season === 0 ? 'Specials' : `Season ${season}`,
                episode_count: count
            }));
    }

    function renderDetails(media, details) {
        const title = mediaTitle(media);
        const type = mediaType(media);
        const year = mediaYear(media);
        const score = formatRating(media.vote_average);
        const backdropURL = imageURL(media.backdrop_path, 'original');
        const posterURL = imageURL(media.poster_path, 'w500');

        const backdrop = makeElement('div', 'details-backdrop');
        if (backdropURL) backdrop.style.backgroundImage = `url("${backdropURL}")`;

        const layout = makeElement('div', 'details-layout');
        const poster = makeElement('div', 'details-poster');
        if (posterURL) {
            const image = document.createElement('img');
            image.alt = `${title} poster`;
            image.addEventListener('error', () => image.remove());
            image.src = posterURL;
            poster.append(image);
        } else {
            poster.append(makeElement('span', 'poster-fallback', title.slice(0, 1).toUpperCase()));
        }

        const main = makeElement('div', 'details-main');
        const eyebrow = media._sourceAddonName
            ? `${type === 'movie' ? 'Feature film' : 'Series'} · ${media._sourceAddonName}`
            : type === 'movie' ? 'Feature film' : 'Series';
        main.append(makeElement('p', 'modal-eyebrow', eyebrow));

        const heading = makeElement('h2', '', title);
        heading.id = 'details-title';
        main.append(heading);

        const meta = makeElement('div', 'details-meta');
        if (score) meta.append(makeElement('span', 'score', `★ ${score}`));
        if (year) meta.append(makeElement('span', '', year));
        if (type === 'movie' && details.runtime) {
            meta.append(makeElement('span', '', `${details.runtime} min`));
        }
        if (type === 'tv' && details.number_of_seasons) {
            meta.append(makeElement('span', '', pluralize(details.number_of_seasons, 'season')));
        }
        if (media.original_language) {
            meta.append(makeElement('span', '', String(media.original_language).toUpperCase()));
        }
        main.append(meta);

        const genres = normalizeGenres(details.genres).slice(0, 5);
        if (genres.length) {
            const genreList = makeElement('div', 'genre-list');
            genres.forEach((genre) => genreList.append(makeElement('span', '', genre.name)));
            main.append(genreList);
        }

        main.append(makeElement(
            'p',
            'details-overview',
            media.overview || 'No overview is available for this title.'
        ));

        const defaultVideoId = String(
            details.behaviorHints?.defaultVideoId ||
            details.imdb_id ||
            media._stremioId ||
            media.id ||
            ''
        );
        state.activeVideoId = defaultVideoId || null;

        if (type === 'tv' && media._addonCatalog) {
            const episodePicker = createEpisodePicker(details);
            if (episodePicker) {
                main.append(episodePicker);
            } else {
                state.activeVideoId = null;
                main.append(makeElement(
                    'p',
                    'season-summary',
                    'Episode metadata is not available from this catalog, so the player cannot choose a series episode yet.'
                ));
            }
        }

        const actions = makeElement('div', 'details-actions');
        const playButton = makeElement('button', 'button button-primary');
        playButton.type = 'button';
        playButton.append(makeElement('span', 'play-icon'), document.createTextNode('Play'));
        playButton.disabled = type === 'tv' && media._addonCatalog && !state.activeVideoId;
        playButton.addEventListener('click', () => playMedia(media, details, state.activeVideoId));

        const trailerButton = makeElement('button', 'button button-secondary', 'Watch trailer');
        trailerButton.type = 'button';
        trailerButton.addEventListener('click', () => openTrailer(media, details));

        const listButton = makeElement(
            'button',
            'button button-quiet',
            isInWatchlist(media) ? '✓ In my list' : '＋ My list'
        );
        listButton.type = 'button';
        listButton.addEventListener('click', () => {
            const added = toggleWatchlist(media);
            listButton.textContent = added ? '✓ In my list' : '＋ My list';
        });

        const shareButton = makeElement('button', 'button button-quiet', 'Share');
        shareButton.type = 'button';
        shareButton.addEventListener('click', () => shareMedia(media));

        actions.append(playButton, trailerButton, listButton, shareButton);
        main.append(actions);
        main.append(makeElement(
            'p',
            'details-footnote',
            'The built-in Play source is a clearly labeled public demo. Installed legal add-ons may offer other direct web streams.'
        ));

        if (type === 'tv' && Array.isArray(details.seasons) && details.seasons.length) {
            const seasonText = details.seasons
                .filter((season) => Number(season.season_number) > 0)
                .slice(0, 6)
                .map((season) => `${season.name || `Season ${season.season_number}`} · ${pluralize(season.episode_count || 0, 'episode')}`)
                .join('  ·  ');
            if (seasonText) {
                main.append(makeElement('p', 'season-summary', seasonText));
            }
        }

        layout.append(poster, main);
        elements.detailsContent.replaceChildren(backdrop, layout);
    }

    function createEpisodePicker(details) {
        const videos = Array.isArray(details?.videos)
            ? details.videos
                .filter((video) =>
                    video &&
                    typeof video.id === 'string' &&
                    Number.isInteger(Number(video.season)) &&
                    Number.isInteger(Number(video.episode))
                )
                .map((video) => ({
                    ...video,
                    season: Number(video.season),
                    episode: Number(video.episode)
                }))
                .sort((left, right) =>
                    left.season - right.season ||
                    left.episode - right.episode
                )
            : [];
        if (!videos.length) return null;

        const picker = makeElement('div', 'episode-picker');
        picker.append(makeElement('p', 'episode-picker-title', 'Choose an episode'));
        const grid = makeElement('div', 'episode-picker-grid');
        const seasonLabel = makeElement('label', '', 'Season');
        const episodeLabel = makeElement('label', '', 'Episode');
        const seasonSelect = document.createElement('select');
        const episodeSelect = document.createElement('select');
        const seasons = [...new Set(videos.map((video) => video.season))];

        seasons.forEach((season) => {
            const option = document.createElement('option');
            option.value = String(season);
            option.textContent = season === 0 ? 'Specials' : `Season ${season}`;
            seasonSelect.append(option);
        });

        const defaultId = String(details.behaviorHints?.defaultVideoId || '');
        const defaultVideo = videos.find((video) => video.id === defaultId) ||
            videos.find((video) => video.season > 0) ||
            videos[0];
        seasonSelect.value = String(defaultVideo.season);

        function renderEpisodes(preferredId = '') {
            const season = Number(seasonSelect.value);
            const episodes = videos.filter((video) => video.season === season);
            episodeSelect.replaceChildren(...episodes.map((video) => {
                const option = document.createElement('option');
                option.value = video.id;
                const label = video.title || video.name || `Episode ${video.episode}`;
                option.textContent = `E${String(video.episode).padStart(2, '0')} · ${label}`;
                return option;
            }));
            if (preferredId && episodes.some((video) => video.id === preferredId)) {
                episodeSelect.value = preferredId;
            }
            state.activeVideoId = episodeSelect.value || null;
        }

        renderEpisodes(defaultVideo.id);
        seasonSelect.addEventListener('change', () => renderEpisodes());
        episodeSelect.addEventListener('change', () => {
            state.activeVideoId = episodeSelect.value || null;
        });

        seasonLabel.append(seasonSelect);
        episodeLabel.append(episodeSelect);
        grid.append(seasonLabel, episodeLabel);
        picker.append(
            grid,
            makeElement('p', 'episode-picker-note', 'The selected episode ID is sent to compatible installed add-ons.')
        );
        return picker;
    }

    function openTrailer(media, details) {
        const videos = details?.videos?.results;
        const tmdbTrailer = Array.isArray(videos)
            ? videos.find((video) =>
                String(video.site).toLowerCase() === 'youtube' &&
                String(video.type).toLowerCase() === 'trailer' &&
                /^[a-zA-Z0-9_-]{6,20}$/.test(video.key)
            )
            : null;
        const addonTrailers = [
            ...(Array.isArray(details?.trailerStreams) ? details.trailerStreams : []),
            ...(Array.isArray(details?.trailers) ? details.trailers : []),
            ...(Array.isArray(media?._trailers) ? media._trailers : [])
        ];
        const addonTrailer = addonTrailers
            .map((trailer) => trailer?.ytId || trailer?.source || trailer?.key)
            .find((value) => /^[a-zA-Z0-9_-]{6,20}$/.test(String(value || '')));
        const trailerId = tmdbTrailer?.key || addonTrailer;

        if (!trailerId) {
            showToast('No official trailer was returned by this title’s metadata provider.', 'warning');
            return;
        }

        clearVideoElement();
        state.trailerMode = true;
        state.playerMedia = null;
        state.streams = [];
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        elements.playerDialog.classList.add('is-trailer');
        elements.playerTitle.textContent = `${mediaTitle(media)} · Official trailer`;
        elements.videoPlayer.hidden = true;
        elements.videoLoading.hidden = true;
        elements.externalSource.hidden = true;
        elements.trailerFrame.hidden = false;
        elements.trailerFrame.src =
            `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&playsinline=1&rel=0`;
        elements.streamSelect.replaceChildren();
        elements.playerSourceTitle.textContent = 'Official trailer';
        elements.playerSourceNote.textContent =
            'Trailer metadata came from the title API and is playing inside TShow.';
        openDialog(elements.playerDialog);
    }

    async function playMedia(media, details = null, requestedVideoId = null) {
        resetTrailerFrame();
        state.playerMedia = serializeMedia(media);
        elements.playerTitle.textContent = mediaTitle(media);
        elements.videoPlayer.poster = imageURL(media.backdrop_path, 'w1280') || '';
        elements.videoLoading.hidden = false;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        state.activeStreamIndex = null;
        state.visibleStreamIndexes = [];
        state.sourceFilter = 'all';
        state.streams = [];
        state.subtitleLibrary = [];
        renderSourcePicker();
        renderSubtitlePicker();
        elements.sourceSummary.textContent = 'Checking compatibility…';
        elements.sourceCompatibilityHelp.textContent = 'Choose a source to see what the browser can do with it.';
        elements.speedSelect.disabled = true;
        elements.playerSourceTitle.textContent = 'Looking for sources';
        elements.playerSourceNote.textContent = 'Checking installed browser-safe add-ons…';
        openDialog(elements.playerDialog);

        try {
            let resolvedDetails = details;
            if (!resolvedDetails) {
                if (media._addonCatalog) {
                    const resolved = await resolveAddonDetails(media);
                    resolvedDetails = resolved.details;
                } else {
                    const endpoint = mediaType(media) === 'movie' ? 'movie' : 'tv';
                    resolvedDetails = await api(`/api/tmdb/${endpoint}/${encodeURIComponent(media.id)}`);
                }
            }

            const streamType = mediaType(media) === 'movie' ? 'movie' : 'series';
            const streamId = requestedVideoId ||
                state.activeVideoId ||
                resolvedDetails.behaviorHints?.defaultVideoId ||
                resolvedDetails.imdb_id ||
                media._stremioId ||
                media.id;
            if (streamType === 'series' && media._addonCatalog && !requestedVideoId && !state.activeVideoId) {
                throw new Error('Choose a series episode before opening the player.');
            }
            const result = await api(`/api/streams/${streamType}/${encodeURIComponent(streamId)}`);
            state.streams = Array.isArray(result.streams)
                ? result.streams.filter((stream) =>
                    stream &&
                    (stream.url || stream.externalUrl || stream.attemptUrl || stream.unsupportedReason)
                )
                : [];

            if (!state.streams.length) {
                const sourceErrors = Array.isArray(result.sources)
                    ? result.sources.filter((source) => source.error).map((source) => source.addonName).join(', ')
                    : '';
                throw new Error(sourceErrors
                    ? `No source was returned. These providers could not be reached: ${sourceErrors}.`
                    : 'No source was returned by the compatible installed add-ons.');
            }

            renderSourcePicker();

            loadSubtitleLibrary(streamType, streamId);

            const recommendedIndex = recommendedStreamIndex();
            if (recommendedIndex >= 0) {
                applyStream(recommendedIndex);
            } else {
                showSourceOverview(media);
            }
        } catch (error) {
            elements.videoLoading.hidden = true;
            elements.playerSourceTitle.textContent = 'No playable source';
            elements.playerSourceNote.textContent = error.message;
            showToast(error.message, 'error');
        }
    }

    function streamCompatibilityGroup(stream) {
        if (stream.isDemo) return 'demo';
        if (stream.playbackMode === 'proxy' && stream.transcodeLowUrl) return 'try';
        if (stream.browserReady) return 'playable';
        if (stream.attemptUrl) return 'try';
        if (stream.externalUrl || stream.externalPlayerUrl || stream.externalAppUrl) return 'external';
        return 'app-only';
    }

    function isLikelyMobileDevice() {
        return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
            (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    }

    function recommendedStreamIndex() {
        const smallest = (items) => items.sort((left, right) => {
            const leftSize = Number(left.stream.sizeBytes) || Number.MAX_SAFE_INTEGER;
            const rightSize = Number(right.stream.sizeBytes) || Number.MAX_SAFE_INTEGER;
            return leftSize - rightSize;
        })[0]?.index ?? -1;
        const browserNative = state.streams
            .map((stream, index) => ({ stream, index }))
            .filter(({ stream }) =>
                !stream.isDemo && stream.browserReady &&
                (stream.playbackMode === 'direct' || stream.playbackMode === 'hls')
            );
        const nativeIndex = smallest(browserNative);
        if (nativeIndex >= 0) return nativeIndex;

        return smallest(state.streams
            .map((stream, index) => ({ stream, index }))
            .filter(({ stream }) => !stream.isDemo && stream.browserReady));
    }

    function sourceCounts() {
        const counts = {
            all: state.streams.length,
            playable: 0,
            try: 0,
            external: 0,
            'app-only': 0,
            demo: 0
        };
        for (const stream of state.streams) {
            counts[streamCompatibilityGroup(stream)] += 1;
        }
        return counts;
    }

    function renderSourcePicker() {
        const counts = sourceCounts();
        const buttons = elements.sourceFilterGroup.querySelectorAll('[data-source-filter]');
        buttons.forEach((button) => {
            const filter = button.dataset.sourceFilter || 'all';
            const count = counts[filter] || 0;
            button.setAttribute('aria-pressed', String(state.sourceFilter === filter));
            button.querySelector('span').textContent = String(count);
            button.disabled = filter !== 'all' && count === 0;
        });

        state.visibleStreamIndexes = state.streams
            .map((_stream, index) => index)
            .filter((index) => state.sourceFilter === 'all' ||
                streamCompatibilityGroup(state.streams[index]) === state.sourceFilter
            );

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.disabled = true;
        placeholder.textContent = state.visibleStreamIndexes.length
            ? `Choose a source (${state.visibleStreamIndexes.length} shown)`
            : 'No sources in this filter';

        const groups = [
            ['playable', 'Plays in this browser'],
            ['try', 'Proxied browser try'],
            ['external', 'External apps and provider links'],
            ['app-only', 'App-only or download sources'],
            ['demo', 'Player test — not the selected title']
        ];
        const options = [placeholder];
        const mirrorTotals = new Map();
        const mirrorSeen = new Map();

        for (const index of state.visibleStreamIndexes) {
            const stream = state.streams[index];
            const key = `${streamCompatibilityGroup(stream)}|${stream.sourceAddonName || ''}|${stream.name || ''}`;
            mirrorTotals.set(key, (mirrorTotals.get(key) || 0) + 1);
        }

        for (const [groupName, groupLabel] of groups) {
            const indexes = state.visibleStreamIndexes.filter((index) =>
                streamCompatibilityGroup(state.streams[index]) === groupName
            );
            if (!indexes.length) continue;
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${groupLabel} (${indexes.length})`;
            for (const index of indexes) {
                const stream = state.streams[index];
                const key = `${groupName}|${stream.sourceAddonName || ''}|${stream.name || ''}`;
                const mirrorNumber = (mirrorSeen.get(key) || 0) + 1;
                mirrorSeen.set(key, mirrorNumber);
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = streamOptionLabel(
                    stream,
                    index,
                    mirrorNumber,
                    mirrorTotals.get(key) || 1
                );
                option.selected = state.activeStreamIndex === index;
                optgroup.append(option);
            }
            options.push(optgroup);
        }

        if (!state.visibleStreamIndexes.includes(state.activeStreamIndex)) {
            placeholder.selected = true;
        }
        elements.streamSelect.replaceChildren(...options);
        elements.streamSelect.disabled = state.visibleStreamIndexes.length === 0;

        elements.sourceSummary.textContent =
            `${counts.all} entries: ${counts.playable} play here, ${counts.try} proxied browser tries, ` +
            `${counts.external} external sources, ${counts['app-only']} app-only, ${counts.demo} player test.`;
        elements.sourceCompatibilityHelp.textContent = sourceFilterHelp(state.sourceFilter);
    }

    function sourceFilterHelp(filter) {
        if (filter === 'playable') return 'Direct MP4, WebM, or HLS sources confirmed for browser playback.';
        if (filter === 'try') return 'These smaller sources are forwarded unchanged. They play only when their original format and codec are supported by the device.';
        if (filter === 'external') return 'User-added sources open directly in external players, source apps, or provider pages. Their video never passes through TShow.';
        if (filter === 'app-only') return 'These are downloads, redirects, torrents, or unknown formats intended for another app.';
        if (filter === 'demo') return 'The short CC0 flower video only tests the player. It is not the movie or episode you selected.';
        return 'Use the filters to separate playable, external, app-only, and player-test entries.';
    }

    function streamOptionLabel(stream, index, mirrorNumber = 1, mirrorTotal = 1) {
        if (stream.isDemo) {
            return `${stream.title || stream.name || 'Public sample'} · player test, not this title`;
        }

        const name = stream.name || stream.title || `Source ${index + 1}`;
        const badges = [];
        if (stream.sizeLabel) badges.push(stream.sizeLabel);
        if (stream.playbackMode === 'proxy' && stream.transcodeLowUrl) {
            badges.push('proxied link');
        } else if (stream.browserReady) {
            badges.push(stream.format ? stream.format.toUpperCase() : 'plays here');
        }
        if (stream.attemptUrl) badges.push(`${stream.format ? stream.format.toUpperCase() : 'stream'} · manual try`);
        if (stream.externalPlayerUrl && !stream.browserReady) badges.push('external player');
        if (stream.externalAppUrl && !stream.browserReady) badges.push('source app');
        if (stream.externalUrl && !stream.browserReady) badges.push('provider link');
        if (!stream.browserReady && !stream.externalUrl && !stream.externalPlayerUrl && !stream.externalAppUrl && !stream.attemptUrl) {
            badges.push(stream.format ? `${stream.format.toUpperCase()} · app-only` : 'app-only · format unknown');
        }
        if (mirrorTotal > 1) badges.push(`mirror ${mirrorNumber}`);
        return badges.length ? `${name} · ${badges.join(' · ')}` : name;
    }

    function showSourceOverview(media) {
        const counts = sourceCounts();
        clearVideoElement();
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = false;
        elements.openExternalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        elements.speedSelect.disabled = true;
        elements.externalSourceTitle.textContent = `Choose an external source for ${mediaTitle(media)}`;
        elements.externalSourceNote.textContent = counts['app-only']
            ? `The add-on returned ${counts['app-only']} unavailable entries. Select another entry to open it in an external player, source app, or provider page.`
            : 'Select a source below to open it directly on this device. User-added video is not relayed through TShow.';
        elements.playerSourceTitle.textContent = 'Compatibility check complete';
        elements.playerSourceNote.textContent =
            'TShow will not send unknown downloads or webpage redirects blindly into the video player.';
    }

    function applyStream(index, { forceAttempt = false } = {}) {
        let stream = state.streams[index];
        if (!stream) return;
        state.activeStreamIndex = index;
        if (forceAttempt && isSafeWebURL(stream.attemptUrl)) {
            stream = {
                ...stream,
                url: stream.attemptUrl,
                browserReady: true,
                playbackMode: 'hls',
                unsupportedReason: null
            };
        }

        elements.streamSelect.value = String(index);
        clearVideoElement();
        state.transcodeTried = false;
        state.activeHlsURL = null;
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSource.hidden = true;
        elements.openExternalSource.hidden = false;
        elements.tryDirectSource.hidden = true;
        elements.speedSelect.disabled = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        updateExternalPlayerActions(stream);
        elements.playerSourceTitle.textContent = stream.title || stream.name || 'Web stream';
        elements.playerSourceNote.textContent = stream.description ||
            `Provided by ${stream.sourceAddonName || 'an installed add-on'}`;

        if (!stream.browserReady) {
            const canOpenExternally = isSafeWebURL(stream.externalUrl);
            const canOpenPlayer = isSafeWebURL(stream.externalPlayerUrl);
            const canOpenApp = isSafeExternalAppURL(stream.externalAppUrl);
            const canTryHls = isSafeWebURL(stream.attemptUrl);
            state.activeExternalURL = canOpenExternally ? stream.externalUrl : null;
            state.activeExternalAppURL = canOpenApp ? stream.externalAppUrl : null;
            state.activeAttemptIndex = canTryHls ? index : null;
            elements.externalSourceTitle.textContent = canOpenExternally
                ? 'Open this source with its provider'
                : canOpenPlayer
                    ? 'Open this source in an external player'
                    : canOpenApp
                        ? 'Open this source in a compatible app'
                        : canTryHls
                            ? 'This provider marked the HLS source as app-only'
                            : stream.notWebReady
                                ? 'App-only download or redirect'
                                : 'This source cannot play in a browser';
            elements.externalSourceNote.textContent = canOpenExternally
                ? 'The add-on supplied a provider page instead of a direct browser video.'
                : canOpenPlayer
                    ? 'This user-added source goes directly from its provider to your device. TShow does not proxy or transcode the video.'
                    : canOpenApp
                        ? 'Your device will hand this source to a compatible app. TShow does not download or operate the source.'
                        : canTryHls
                            ? 'You can try the direct HLS link once. It may still fail if the provider blocks browsers or requires an app.'
                            : stream.unsupportedReason ||
                                'The add-on must provide a direct MP4, WebM, HLS, or an external provider page.';
            elements.openExternalSource.hidden = !canOpenExternally;
            elements.tryDirectSource.hidden = !canTryHls;
            elements.externalSource.hidden = false;
            return;
        }

        if (!stream.url) {
            showUnsupportedSource('This source did not include a direct video URL.');
            return;
        }

        removeExternalSubtitleTracks();
        elements.subtitleSelect.value = '';
        renderSubtitlePicker();
        if (state.subtitleObjectURL) {
            const select = elements.subtitleSelect;
            if (![...select.options].some((option) => option.value === 'local:file')) {
                select.append(makeOption('local:file', 'Local subtitles'));
            }
        }
        elements.speedSelect.disabled = false;
        elements.videoPlayer.playbackRate = Number(elements.speedSelect.value) || 1;

        elements.videoPlayer.hidden = false;

        const isHls = stream.playbackMode === 'hls' ||
            stream.format === 'hls' ||
            String(stream.type || '').toLowerCase().includes('mpegurl') ||
            /\.m3u8(?:$|[?#])/i.test(stream.url);

        if (isHls) {
            playHlsStream(stream.url);
        } else {
            elements.videoPlayer.src = stream.url;
            elements.videoPlayer.load();
            attemptVideoPlay();
        }
    }

    function activeExternalPlayerURL() {
        const stream = state.streams[state.activeStreamIndex];
        return isSafeWebURL(stream?.externalPlayerUrl) ? stream.externalPlayerUrl : null;
    }

    function activeSourceLink() {
        const stream = state.streams[state.activeStreamIndex];
        if (isSafeWebURL(stream?.externalPlayerUrl)) return stream.externalPlayerUrl;
        if (isSafeExternalAppURL(stream?.externalAppUrl)) return stream.externalAppUrl;
        if (isSafeWebURL(stream?.externalUrl)) return stream.externalUrl;
        return null;
    }

    function updateExternalPlayerActions(stream) {
        const playerAvailable = isSafeWebURL(stream?.externalPlayerUrl);
        const appAvailable = isSafeExternalAppURL(stream?.externalAppUrl);
        const copyAvailable = Boolean(playerAvailable || appAvailable || isSafeWebURL(stream?.externalUrl));
        elements.externalPlayerActions.hidden = !copyAvailable;
        elements.openInVlc.hidden = !playerAvailable;
        elements.openInOutplayer.hidden = !playerAvailable;
        elements.openInVlc.disabled = !playerAvailable;
        elements.openInOutplayer.disabled = !playerAvailable;
        elements.openInSourceApp.hidden = !appAvailable;
        elements.openInSourceApp.disabled = !appAvailable;
        elements.copySourceLink.disabled = !copyAvailable;
    }

    function openActiveStreamInVlc() {
        const url = activeExternalPlayerURL();
        if (!url) return showToast('This source has no direct external-player link.', 'warning');
        window.location.href = `vlc://${url}`;
        setTimeout(() => {
            showToast('If VLC did not open, install VLC or try Outplayer.', 'info');
        }, 800);
    }

    function openActiveStreamInOutplayer() {
        const url = activeExternalPlayerURL();
        if (!url) return showToast('This source has no direct external-player link.', 'warning');
        window.location.href = `outplayer://x-callback-url/play?url=${encodeURIComponent(url)}`;
        setTimeout(() => {
            showToast('If Outplayer did not open, install Outplayer from the App Store.', 'info');
        }, 800);
    }

    function openActiveStreamInSourceApp() {
        if (!isSafeExternalAppURL(state.activeExternalAppURL)) {
            return showToast('This entry has no safe external-app link.', 'warning');
        }
        window.location.href = state.activeExternalAppURL;
        setTimeout(() => {
            showToast('If no app opened, copy the source link and use an app you trust.', 'info');
        }, 800);
    }

    async function copyActiveSourceLink() {
        const link = activeSourceLink();
        if (!link) return showToast('This entry has no safe source link.', 'warning');
        try {
            await navigator.clipboard.writeText(link);
            showToast('Source link copied.', 'info');
        } catch {
            showToast('The browser could not copy this link.', 'warning');
        }
    }

    function subtitleTrackSrc(subtitle) {
        const proxyURL = String(subtitle?.proxyUrl || '');
        return proxyURL.startsWith('/api/proxy/subtitle?') ? proxyURL : '';
    }

    function subtitleOptions(activeStream) {
        const merged = [
            ...(Array.isArray(activeStream?.subtitles) ? activeStream.subtitles : []),
            ...state.subtitleLibrary
        ].filter((subtitle) => subtitle && isSafeWebURL(subtitle.url));

        const seen = new Set();
        return merged.filter((subtitle) => {
            const key = `${String(subtitle.lang || '').toLowerCase()}|${subtitle.url}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 60);
    }

    function renderSubtitlePicker() {
        const stream = state.streams[state.activeStreamIndex];
        const options = subtitleOptions(stream);
        const select = elements.subtitleSelect;
        const current = select.value;

        select.replaceChildren(
            makeOption('', options.length ? 'Off' : 'Off (none found)')
        );
        options.forEach((subtitle, index) => {
            const language = String(subtitle.lang || '').toUpperCase() || '—';
            const provider = subtitle.provider ? ` · ${subtitle.provider}` : '';
            select.append(makeOption(String(index), `${language}${provider}`));
        });
        if ([...select.options].some((option) => option.value === current)) {
            select.value = current;
        }
    }

    function makeOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function removeExternalSubtitleTracks() {
        elements.videoPlayer.querySelectorAll('track[data-external]').forEach((track) => {
            track.remove();
        });
    }

    function attachSubtitleTrack(src, label, language, marker) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.src = src;
        track.label = String(label || 'Subtitles').slice(0, 60);
        track.srclang = String(language || '').slice(0, 12);
        track.dataset.external = marker;
        track.addEventListener('load', () => {
            track.track.mode = 'showing';
        }, { once: true });
        elements.videoPlayer.append(track);
        return track;
    }

    function applySubtitleChoice(value) {
        removeExternalSubtitleTracks();
        if (!value) return;

        if (value.startsWith('local:')) {
            if (state.subtitleObjectURL) {
                attachSubtitleTrack(state.subtitleObjectURL, 'Local subtitles', '', 'local');
            }
            return;
        }

        const index = Number.parseInt(value, 10);
        const stream = state.streams[state.activeStreamIndex];
        const subtitle = subtitleOptions(stream)[index];
        if (!subtitle) return;
        const source = subtitleTrackSrc(subtitle);
        if (!source) {
            showToast('This subtitle source could not be verified.', 'error');
            return;
        }
        attachSubtitleTrack(source, subtitle.label, subtitle.lang, 'remote');
    }

    function srtToVtt(text) {
        const body = String(text)
            .replace(/\r+\n/g, '\n')
            .replace(/^\uFEFF/, '')
            .replace(/^\d+\s*$/gm, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
            .trim();
        return `WEBVTT\n\n${body}\n`;
    }

    async function openLocalSubtitle(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            let content = await file.text();
            if (!/^WEBVTT/.test(content.trim())) content = srtToVtt(content);
            else if (/(\d{2}:\d{2}:\d{2}),\d{3}/.test(content)) content = srtToVtt(content);

            if (state.subtitleObjectURL) URL.revokeObjectURL(state.subtitleObjectURL);
            state.subtitleObjectURL = URL.createObjectURL(
                new Blob([content], { type: 'text/vtt' })
            );
            const select = elements.subtitleSelect;
            if (![...select.options].some((option) => option.value === 'local:file')) {
                select.append(makeOption('local:file', `Local · ${file.name.slice(0, 30)}`));
            }
            select.value = 'local:file';
            applySubtitleChoice('local:file');
            showToast('Subtitles loaded from your file.');
        } catch {
            showToast('That subtitle file could not be read.', 'error');
        }
    }

    async function loadSubtitleLibrary(type, id) {
        try {
            const data = await api(`/api/streams/subtitles/${type}/${encodeURIComponent(id)}`);
            state.subtitleLibrary = Array.isArray(data.subtitles) ? data.subtitles : [];
            const missing = data.providers
                ?.filter((provider) => provider.error)
                .map((provider) => provider.name);
            if (missing?.length) {
                showToast(`Subtitle provider(s) unavailable: ${missing.join(', ')}.`, 'warning');
            }
        } catch {
            state.subtitleLibrary = [];
        }
        renderSubtitlePicker();
    }

    function toggleDataSaver() {
        state.dataSaver = false;
        try {
            localStorage.removeItem(STORAGE_KEYS.dataSaver);
        } catch {
            // The selection still applies for this session when storage is blocked.
        }
        updateDataSaverButton();
        if (!elements.playerDialog.open) return;
        const smallestIndex = recommendedStreamIndex();
        if (smallestIndex < 0) return showToast('No direct source is available.', 'warning');
        applyStream(smallestIndex);
        showToast('Selected the smallest available source without conversion.');
    }

    function updateDataSaverButton() {
        if (!elements.dataSaverButton) return;
        elements.dataSaverButton.setAttribute('aria-pressed', String(state.dataSaver));
        elements.dataSaverButton.classList.toggle('active', state.dataSaver);
    }

    function playHlsStream(url) {
        state.activeHlsURL = url;
        elements.videoLoading.hidden = false;
        const loadingText = elements.videoLoading.querySelector('p');
        if (loadingText) loadingText.textContent = 'Preparing the video stream…';
        const nativeHls = elements.videoPlayer.canPlayType('application/vnd.apple.mpegurl');
        if (nativeHls) {
            const finishLoading = () => {
                elements.videoLoading.hidden = true;
            };
            elements.videoPlayer.addEventListener('loadedmetadata', finishLoading, { once: true });
            elements.videoPlayer.addEventListener('canplay', finishLoading, { once: true });
            elements.videoPlayer.addEventListener('playing', finishLoading, { once: true });
            elements.videoPlayer.src = url;
            elements.videoPlayer.load();
            attemptVideoPlay();
            return;
        }

        if (!window.Hls?.isSupported()) {
            showUnsupportedSource(
                'This device does not provide the MediaSource support required for HLS. Choose another source or the public demo.'
            );
            return;
        }

        state.hlsPlayer = new window.Hls({
            enableWorker: true,
            backBufferLength: 60,
            maxBufferLength: 45,
            maxMaxBufferLength: 300,
            maxBufferSize: 120_000_000,
            fragLoadingMaxRetry: 8,
            manifestLoadingMaxRetry: 4,
            levelLoadingMaxRetry: 6,
            startLevel: 0
        });
        state.hlsPlayer.on(window.Hls.Events.MEDIA_ATTACHED, () => {
            state.hlsPlayer?.loadSource(url);
        });
        state.hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, () => {
            elements.videoLoading.hidden = true;
            attemptVideoPlay();
        });
        state.hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
            if (!data?.fatal) return;
            destroyHls();
            showUnsupportedSource(
                'This source could not be reached or its original format is not supported. Try another smaller MP4 or HLS source.'
            );
        });
        state.hlsPlayer.attachMedia(elements.videoPlayer);
    }

    function attemptVideoPlay() {
        const playPromise = elements.videoPlayer.play();
        if (playPromise?.catch) {
            playPromise.catch(() => {
                showToast('Press play when you are ready.', 'warning');
            });
        }
    }

    async function tryTranscodeFallback(stream) {
        const isMobile = isLikelyMobileDevice();
        const useLow = isMobile || state.dataSaver;
        const transcodeTarget = useLow && stream.transcodeLowUrl ? stream.transcodeLowUrl : stream.transcodeUrl;
        if (!transcodeTarget || state.transcodeTried) return;
        state.transcodeTried = true;
        const attemptedIndex = state.activeStreamIndex;
        showToast(useLow
            ? 'Direct playback failed — switching to mobile-friendly H.264 stream…'
            : 'Direct playback failed — converting this source on the server…', 'warning');
        clearVideoElement();
        elements.videoLoading.hidden = false;
        elements.videoPlayer.hidden = true;
        try {
            await fetch(transcodeTarget, { credentials: 'same-origin', cache: 'no-store' });
        } catch {
            // hls.js reports the real failure when it attaches.
        }
        if (!elements.playerDialog.open || state.activeStreamIndex !== attemptedIndex) return;
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = false;
        playHlsStream(transcodeTarget);
    }

    function showUnsupportedSource(message) {
        elements.videoLoading.hidden = true;
        elements.videoPlayer.hidden = true;
        elements.externalSourceTitle.textContent = 'This source cannot play here';
        elements.externalSourceNote.textContent = message;
        elements.openExternalSource.hidden = true;
        elements.tryDirectSource.hidden = true;
        state.activeAttemptIndex = null;
        elements.externalSource.hidden = false;
    }

    function openLocalVideo(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        resetTrailerFrame();
        if (state.localObjectURL) URL.revokeObjectURL(state.localObjectURL);
        state.localObjectURL = URL.createObjectURL(file);
        elements.videoPlayer.removeAttribute('poster');
        state.playerMedia = null;
        state.streams = [{
            url: state.localObjectURL,
            name: file.name,
            title: file.name,
            description: 'Opened directly from this computer. The file was not uploaded.',
            type: file.type || '',
            format: file.type.includes('webm') ? 'webm' : 'mp4',
            playbackMode: 'direct',
            browserReady: true,
            sourceAddonName: 'This computer'
        }];

        elements.playerTitle.textContent = file.name;
        state.sourceFilter = 'playable';
        state.activeStreamIndex = null;
        renderSourcePicker();
        openDialog(elements.playerDialog);
        applyStream(0);
        showToast('Opened locally. Nothing was uploaded.');
        event.target.value = '';
    }

    function closePlayer() {
        savePlaybackProgress(true);
        clearVideoElement();
        resetTrailerFrame();
        elements.videoPlayer.removeAttribute('poster');
        elements.externalSource.hidden = true;
        elements.externalPlayerActions.hidden = true;
        state.activeExternalURL = null;
        state.activeExternalAppURL = null;
        state.activeAttemptIndex = null;
        state.transcodeTried = false;
        state.activeHlsURL = null;
        state.activeStreamIndex = null;
        state.visibleStreamIndexes = [];
        state.streams = [];
        state.playerMedia = null;
        elements.speedSelect.disabled = false;

        if (state.localObjectURL) {
            URL.revokeObjectURL(state.localObjectURL);
            state.localObjectURL = null;
        }
        if (state.subtitleObjectURL) {
            URL.revokeObjectURL(state.subtitleObjectURL);
            state.subtitleObjectURL = null;
        }
        state.subtitleLibrary = [];
    }

    function resetTrailerFrame() {
        state.trailerMode = false;
        elements.playerDialog.classList.remove('is-trailer');
        elements.trailerFrame.hidden = true;
        elements.trailerFrame.removeAttribute('src');
    }

    function destroyHls() {
        if (!state.hlsPlayer) return;
        state.hlsPlayer.destroy();
        state.hlsPlayer = null;
    }

    function clearVideoElement() {
        destroyHls();
        elements.videoPlayer.pause();
        elements.videoPlayer.removeAttribute('src');
        elements.videoPlayer.querySelectorAll('track').forEach((track) => track.remove());
        elements.videoPlayer.load();
    }

    function savePlaybackProgress(force = false) {
        if (!state.playerMedia || !Number.isFinite(elements.videoPlayer.duration)) return;

        const now = Date.now();
        if (!force && now - state.lastProgressSave < 5_000) return;
        if (elements.videoPlayer.currentTime < 2) return;

        const entry = {
            media: state.playerMedia,
            currentTime: Math.round(elements.videoPlayer.currentTime),
            duration: Math.round(elements.videoPlayer.duration),
            updatedAt: now
        };

        state.lastProgressSave = now;
        state.continueEntry = entry;
        localStorage.setItem(STORAGE_KEYS.continueWatching, JSON.stringify(entry));
        renderContinueWatching();
    }

    function renderContinueWatching() {
        const entry = state.continueEntry;
        const valid = entry?.media && entry.duration > 0 && entry.currentTime < entry.duration * 0.98;

        if (!valid) {
            elements.continueSection.hidden = true;
            elements.continueRail.replaceChildren();
            return;
        }

        const progress = (entry.currentTime / entry.duration) * 100;
        elements.continueSection.hidden = false;
        elements.continueRail.replaceChildren(createMediaCard(normalizeMedia(entry.media), progress));
    }

    function toggleWatchlist(media) {
        const key = mediaKey(media);
        const index = state.watchlist.findIndex((item) => mediaKey(item) === key);
        let added;

        if (index >= 0) {
            state.watchlist.splice(index, 1);
            added = false;
            showToast('Removed from My list.');
        } else {
            state.watchlist.unshift(serializeMedia(media));
            state.watchlist = state.watchlist.slice(0, 100);
            added = true;
            showToast('Added to My list.');
        }

        localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
        updateListCount();
        renderWatchlist();
        return added;
    }

    function isInWatchlist(media) {
        const key = mediaKey(media);
        return state.watchlist.some((item) => mediaKey(item) === key);
    }

    function updateListCount() {
        const count = state.watchlist.length;
        elements.listCount.textContent = String(count);
        elements.listCount.hidden = count === 0;
    }

    function renderWatchlist() {
        const items = state.watchlist.map((item) => normalizeMedia(item));
        elements.listGrid.replaceChildren(...items.map((item) => createMediaCard(item)));
        elements.listEmpty.hidden = items.length > 0;
    }

    function rememberRecentlyViewed(media) {
        const serialized = serializeMedia(media);
        state.recentlyViewed = [
            serialized,
            ...state.recentlyViewed.filter((item) => mediaKey(item) !== mediaKey(serialized))
        ].slice(0, 20);
        localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(state.recentlyViewed));
        renderRecentlyViewed();
    }

    function renderRecentlyViewed() {
        const items = state.recentlyViewed.map((item) => normalizeMedia(item)).filter(Boolean);
        elements.recentSection.hidden = items.length === 0;
        if (items.length) renderRail(elements.recentRail, items);
    }

    async function shareMedia(media) {
        const shareData = {
            title: `${mediaTitle(media)} · TShow`,
            text: `Discover ${mediaTitle(media)} on TShow`,
            url: window.location.href.split('#')[0]
        };
        try {
            if (navigator.share) await navigator.share(shareData);
            else {
                await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
                showToast('Share link copied.');
            }
        } catch (error) {
            if (error?.name !== 'AbortError') showToast('Could not share this title.', 'error');
        }
    }

    async function runSearch(rawQuery) {
        const query = String(rawQuery || '').trim();
        if (query.length < 2) {
            showToast('Enter at least two characters to search.', 'warning');
            elements.searchInput.focus();
            return;
        }

        setView('search');
        elements.searchTitle.textContent = `Results for “${query}”`;
        elements.searchSummary.textContent = 'Searching movies and series…';
        elements.searchEmpty.hidden = true;
        renderGridLoading(elements.searchGrid, 10);

        if (state.addonCatalogLoadPromise) {
            await Promise.race([
                state.addonCatalogLoadPromise.catch(() => null),
                new Promise((resolve) => window.setTimeout(resolve, 4_000))
            ]);
        }

        const localResults = searchLoadedCatalogs(query);
        let apiResults = [];
        try {
            const data = await api(`/api/tmdb/search?query=${encodeURIComponent(query)}&type=multi`);
            apiResults = normalizeCollection(data.results)
                .filter((item) => item.id && ['movie', 'tv'].includes(mediaType(item)));
        } catch {
            // Connected catalogs remain searchable even when TMDB is not configured.
        }

        let globalResults = [];
        let searchProviders = [];
        try {
            const searchData = await api(`/api/addons/search?query=${encodeURIComponent(query)}`);
            searchProviders = Array.isArray(searchData.providers) ? searchData.providers : [];
            globalResults = (Array.isArray(searchData.groups) ? searchData.groups : [])
                .flatMap((group) => normalizeLiveCatalog(group.data, {
                    addon: group.addon,
                    catalog: group.catalog,
                    type: group.type
                }));
        } catch {
            // Permanent and user-installed search providers are best-effort.
        }

        const results = dedupeSearchResults([...localResults, ...globalResults, ...apiResults]).slice(0, 100);
        elements.searchGrid.replaceChildren(...results.map((item) => createMediaCard(item)));
        const providerSummary = searchProviders.length
            ? ` from ${searchProviders.join(', ')}`
            : '';
        elements.searchSummary.textContent = results.length
            ? `${pluralize(results.length, 'matching title')}${providerSummary}`
            : 'No matching title was found in the loaded catalogs.';
        elements.searchEmpty.hidden = results.length > 0;
    }

    function showBrowseView(type) {
        const isMovie = type === 'movie';
        const items = dedupeSearchResults(
            allLoadedCatalogItems().filter((item) => mediaType(item) === (isMovie ? 'movie' : 'tv'))
        );
        setView('search');
        elements.searchTitle.textContent = isMovie ? 'Browse movies' : 'Browse series';
        elements.searchSummary.textContent = pluralize(items.length, isMovie ? 'movie' : 'series');
        elements.searchGrid.replaceChildren(...items.map((item) => createMediaCard(item)));
        elements.searchEmpty.hidden = items.length > 0;
    }

    function showCollectionView(collectionName) {
        const collections = {
            trending: ['Trending now', state.trending],
            movies: ['Popular movies', state.movies],
            latestMovies: ['Latest movies', state.latestMovies],
            topMovies: ['Top-rated movies', state.topMovies],
            series: ['Popular series', state.series],
            topSeries: ['Top-rated series', state.topSeries],
            airingToday: ['Airing today', state.airingToday]
        };
        const [title, items] = collections[collectionName] || ['Browse', []];
        const results = dedupeSearchResults(items);
        setView('search');
        elements.searchTitle.textContent = title;
        elements.searchSummary.textContent = pluralize(results.length, 'title');
        elements.searchGrid.replaceChildren(...results.map((item) => createMediaCard(item)));
        elements.searchEmpty.hidden = results.length > 0;
    }

    function allLoadedCatalogItems() {
        return [
            ...state.movies,
            ...state.series,
            ...state.trending,
            ...state.latestMovies,
            ...state.topMovies,
            ...state.topSeries,
            ...state.airingToday,
            ...state.addonCatalogs.flatMap((catalog) => catalog.items || []),
            ...state.watchlist.map((item) => normalizeMedia(item))
        ].filter(Boolean);
    }

    function searchLoadedCatalogs(query) {
        const needle = query.toLocaleLowerCase();
        return allLoadedCatalogItems()
            .map((item) => {
                const title = mediaTitle(item).toLocaleLowerCase();
                const metadata = [
                    item.overview,
                    item._sourceAddonName,
                    item._catalogName,
                    ...(Array.isArray(item._genres) ? item._genres : [])
                ].join(' ').toLocaleLowerCase();
                let score = Number.POSITIVE_INFINITY;
                if (title === needle) score = 0;
                else if (title.startsWith(needle)) score = 1;
                else if (title.includes(needle)) score = 2;
                else if (metadata.includes(needle)) score = 3;
                return { item, score };
            })
            .filter((entry) => Number.isFinite(entry.score))
            .sort((left, right) =>
                left.score - right.score ||
                mediaTitle(left.item).localeCompare(mediaTitle(right.item))
            )
            .map((entry) => entry.item);
    }

    function dedupeSearchResults(items) {
        const seen = new Set();
        return items.filter((item) => {
            const identity = item._stremioId || item.imdb_id || item.id;
            const key = `${mediaType(item)}:${identity}`;
            if (!identity || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function renderGridLoading(container, count) {
        const items = Array.from({ length: count }, () => {
            const skeleton = makeElement('div', 'skeleton-card');
            skeleton.append(makeElement('div', 'poster-frame'), makeElement('div', 'skeleton-line'));
            return skeleton;
        });
        container.replaceChildren(...items);
    }

    function setView(view) {
        if (!view) return;
        const panel = document.querySelector(`[data-view-panel="${view}"]`);
        if (!panel) return;

        document.querySelectorAll('[data-view-panel]').forEach((candidate) => {
            candidate.hidden = candidate !== panel;
        });
        document.querySelectorAll('.nav-link').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.view === view);
        });

        state.activeView = view;
        if (view === 'list') renderWatchlist();
        if (view === 'addons') loadAddons({ quiet: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function getAddonCatalogDescriptors() {
        const descriptors = [];
        for (const addon of state.addons) {
            if (!addon?.isCustom) continue;
            if (!addon?.manifestURL || !Array.isArray(addon.catalogs)) continue;
            if (!Array.isArray(addon.resources) || !addon.resources.includes('catalog')) continue;
            for (const catalog of addon.catalogs) {
                const type = catalog?.type === 'series' ? 'series' : catalog?.type;
                if (!catalog?.id || !['movie', 'series'].includes(type)) continue;
                descriptors.push({
                    key: `${addon.id}:${type}:${catalog.id}`,
                    addon,
                    catalog,
                    type
                });
            }
        }
        return descriptors.slice(0, 16);
    }

    function addonCatalogSignature() {
        return getAddonCatalogDescriptors()
            .map((descriptor) => descriptor.key)
            .sort()
            .join('|');
    }

    async function loadAddonCatalogs({ force = false } = {}) {
        const descriptors = getAddonCatalogDescriptors();
        const generation = ++state.addonCatalogGeneration;
        state.addonCatalogs = [];

        if (!descriptors.length) {
            elements.addonCatalogsSection.hidden = true;
            elements.addonCatalogsContainer.replaceChildren();
            return;
        }

        elements.addonCatalogsSection.hidden = false;
        if (force) setButtonBusy(elements.refreshAddonCatalogs, true, 'Reloading…');

        const rows = new Map();
        const rowElements = descriptors.map((descriptor) => {
            const row = makeElement('article', 'addon-catalog-row');
            const heading = makeElement('div', 'addon-catalog-heading');
            const copy = makeElement('div');
            const typeLabel = descriptor.type === 'movie' ? 'Movies' : 'Series';
            copy.append(
                makeElement('h3', '', descriptor.catalog.name || typeLabel),
                makeElement('p', '', `${descriptor.addon.name} · ${typeLabel}`)
            );
            heading.append(copy);
            const rail = makeElement('div', 'media-rail');
            rail.setAttribute('aria-label', `${descriptor.catalog.name || typeLabel} from ${descriptor.addon.name}`);
            renderLoadingCards(rail, 6);
            row.append(heading, rail);
            rows.set(descriptor.key, rail);
            return row;
        });
        elements.addonCatalogsContainer.replaceChildren(...rowElements);

        try {
            await runWithConcurrency(descriptors, 3, async (descriptor) => {
                const rail = rows.get(descriptor.key);
                try {
                    const data = await api(
                        `/api/addons/catalog/${encodeURIComponent(descriptor.addon.id)}/${encodeURIComponent(descriptor.type)}/${encodeURIComponent(descriptor.catalog.id)}`
                    );
                    if (generation !== state.addonCatalogGeneration) return;
                    const metas = Array.isArray(data?.metas)
                        ? data.metas
                        : Array.isArray(data?.results)
                            ? data.results
                            : [];
                    const items = uniqueMedia(
                        metas
                            .map((meta) => normalizeAddonMeta(meta, descriptor))
                            .filter(Boolean)
                    );
                    state.addonCatalogs.push({ ...descriptor, items });
                    if (items.length) {
                        renderRail(rail, items);
                    } else {
                        rail.replaceChildren(makeElement(
                            'p',
                            'catalog-row-error',
                            'This add-on returned no titles for this row.'
                        ));
                    }
                } catch (error) {
                    if (generation !== state.addonCatalogGeneration) return;
                    rail.replaceChildren(makeElement(
                        'p',
                        'catalog-row-error',
                        error.message || 'This catalog could not be loaded.'
                    ));
                }
            });
        } finally {
            const catalogOrder = new Map(
                descriptors.map((descriptor, index) => [descriptor.key, index])
            );
            state.addonCatalogs.sort((left, right) =>
                (catalogOrder.get(left.key) ?? 999) - (catalogOrder.get(right.key) ?? 999)
            );
            if (force && generation === state.addonCatalogGeneration) {
                setButtonBusy(elements.refreshAddonCatalogs, false, 'Reload catalogs');
            }
        }
    }

    async function runWithConcurrency(items, limit, worker) {
        let nextIndex = 0;
        const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (nextIndex < items.length) {
                const index = nextIndex;
                nextIndex += 1;
                await worker(items[index], index);
            }
        });
        await Promise.all(runners);
    }

    async function loadAddons({ quiet = false } = {}) {
        try {
            const data = await api('/api/addons');
            state.addons = Array.isArray(data.addons) ? data.addons : [];
            renderAddons();
            const signature = addonCatalogSignature();
            if (signature !== state.addonCatalogSignature) {
                state.addonCatalogSignature = signature;
                state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
            }
        } catch (error) {
            if (!quiet) showToast(error.message || 'Could not load add-ons.', 'error');
        }
    }

    async function initializeAddons() {
        try {
            const result = await syncStoredAddons();
            if (result.errors?.length) {
                showToast(
                    `${result.errors.length} saved add-on${result.errors.length === 1 ? '' : 's'} could not be restored yet.`,
                    'warning'
                );
            }
        } catch (error) {
            showToast(error.message || 'Saved add-ons could not be restored.', 'warning');
        }
        await loadAddons({ quiet: true });
    }

    async function syncStoredAddons() {
        const result = await api('/api/addons/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ manifestURLs: state.addonURLs })
        }, { skipAddonSync: true });
        state.lastAddonSync = Date.now();
        return result;
    }

    function saveAddonURLs() {
        localStorage.setItem(STORAGE_KEYS.addonURLs, JSON.stringify(state.addonURLs));
    }

    function rememberAddon(manifest, previousAddon) {
        const previousURL = previousAddon?.isCustom ? previousAddon.manifestURL : null;
        const nextURL = manifest?.manifestURL;
        if (!nextURL) return;
        state.addonURLs = state.addonURLs
            .filter((url) => url !== previousURL && url !== nextURL);
        state.addonURLs.push(nextURL);
        state.addonURLs = state.addonURLs.slice(-20);
        saveAddonURLs();
    }

    function forgetAddon(addon) {
        state.addonURLs = state.addonURLs.filter((url) => url !== addon.manifestURL);
        saveAddonURLs();
    }

    function renderAddons() {
        const count = state.addons.filter((addon) => addon.isCustom).length;
        elements.addonCount.textContent = pluralize(count, 'private add-on');

        const cards = state.addons.map((addon) => {
            const card = makeElement('article', 'addon-card');
            const capability = addonCapability(addon);
            const configurationRequired = addon.behaviorHints?.configurationRequired === true;
            if (configurationRequired) card.classList.add('requires-configuration');
            const initials = String(addon.name || 'A')
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join('')
                .toUpperCase();
            const icon = makeElement('div', 'addon-icon', initials);

            const copy = makeElement('div', 'addon-copy');
            const topLine = makeElement('div', 'addon-topline');
            topLine.append(
                makeElement('h3', '', addon.name || addon.id),
                makeElement(
                    'span',
                    `source-chip capability-chip ${capability.className}`,
                    capability.label
                )
            );
            copy.append(
                topLine,
                makeElement('p', 'addon-description', addon.description || 'No description provided.')
            );

            const resources = makeElement('div', 'resource-list');
            (addon.resources || []).slice(0, 8).forEach((resource) => {
                resources.append(makeElement('span', 'resource-chip', resource));
            });
            copy.append(resources);

            if (configurationRequired) {
                const warning = makeElement('div', 'addon-configuration-warning');
                warning.setAttribute('role', 'note');
                warning.append(
                    makeElement('span', 'addon-warning-icon', '!'),
                    makeElement(
                        'span',
                        '',
                        'Configuration required. Finish this add-on\'s setup before its catalog or playback can work.'
                    )
                );
                copy.append(warning);
            }

            const footer = makeElement('div', 'addon-card-footer');
            footer.append(makeElement(
                'span',
                '',
                `${addon.isCustom ? 'Manual' : 'Built-in'} · ${addon.id} · v${addon.version || '1.0.0'}`
            ));

            if (addon.isRemovable) {
                if (isConfigurableAddon(addon)) {
                    const configure = makeElement('button', 'remove-addon', 'Configure');
                    configure.type = 'button';
                    configure.title = "Open this add-on's configuration page";
                    configure.addEventListener('click', () => openAddonConfiguration(addon));
                    footer.append(configure);
                }
                const edit = makeElement('button', 'remove-addon', 'Edit');
                edit.type = 'button';
                edit.title = 'Replace this add-on with a different manifest URL';
                edit.addEventListener('click', () => beginAddonEdit(addon));
                const remove = makeElement('button', 'remove-addon', 'Remove');
                remove.type = 'button';
                remove.addEventListener('click', () => removeAddon(addon));
                footer.append(edit, remove);
            } else if (isConfigurableAddon(addon)) {
                const configure = makeElement('button', 'remove-addon', 'Configure');
                configure.type = 'button';
                configure.title = "Open this add-on's configuration page";
                configure.addEventListener('click', () => openAddonConfiguration(addon));
                footer.append(configure);
                footer.append(makeElement('span', '', 'Protected'));
            } else {
                footer.append(makeElement('span', '', 'Protected'));
            }

            card.append(icon, copy, footer);
            return card;
        });

        elements.addonGrid.replaceChildren(...cards);
    }

    function addonCapability(addon) {
        const resources = new Set(
            (Array.isArray(addon?.resources) ? addon.resources : [])
                .map((resource) => String(resource || '').toLowerCase())
        );
        const hasCatalog = resources.has('catalog') || Boolean(addon?.catalogs?.length);
        const hasPlayback = resources.has('stream');

        if (hasCatalog && hasPlayback) {
            return { label: 'Catalog + playback', className: 'catalog-playback' };
        }
        if (hasCatalog) {
            return { label: 'Catalog only', className: 'catalog-only' };
        }
        if (hasPlayback) {
            return { label: 'Stream provider only', className: 'stream-only' };
        }
        return { label: 'Metadata/support', className: 'metadata-only' };
    }

    function isConfigurableAddon(addon) {
        const hints = addon?.behaviorHints || {};
        return hints.configurationRequired === true ||
            hints.configurable === true ||
            (Array.isArray(hints.configurable) && hints.configurable.length > 0);
    }

    function addonConfigureURL(manifestURL) {
        try {
            const url = new URL(manifestURL);
            if (!/\/manifest\.json$/i.test(url.pathname)) return null;
            url.pathname = url.pathname.replace(/\/manifest\.json$/i, '/configure');
            return url.toString();
        } catch {
            return null;
        }
    }

    function openAddonConfiguration(addon) {
        const target = addon.manifestURL ? addonConfigureURL(addon.manifestURL) : null;
        if (!target) {
            showToast('This add-on does not expose a configuration page.', 'warning');
            return;
        }
        window.open(target, '_blank', 'noopener');
    }

    function beginAddonEdit(addon) {
        state.editingAddonId = addon.id;
        elements.manifestUrl.value = addon.manifestURL || '';
        elements.installAddonButton.textContent = 'Update';
        elements.addonForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elements.manifestUrl.focus();
        showToast(`Editing “${addon.name}”. Paste a new manifest URL and press Update, or clear the field to cancel.`);
    }

    function cancelAddonEdit() {
        state.editingAddonId = null;
        elements.installAddonButton.textContent = 'Install';
    }

    async function installAddon(event) {
        event.preventDefault();
        const manifestURL = elements.manifestUrl.value.trim();
        if (!manifestURL) {
            if (state.editingAddonId) cancelAddonEdit();
            return;
        }
        const isUpdate = Boolean(state.editingAddonId);
        const previousAddon = state.addons.find((addon) =>
            addon.id === state.editingAddonId || addon.manifestURL === manifestURL
        );

        setButtonBusy(elements.installAddonButton, true, isUpdate ? 'Updating…' : 'Installing…');
        try {
            const result = await api('/api/addons/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manifestURL })
            });
            rememberAddon(result.manifest, previousAddon || state.addons.find((addon) =>
                addon.id === result.manifest.id
            ));
            cancelAddonEdit();
            elements.addonForm.reset();
            await loadAddons({ quiet: true });
            const installedAddon = state.addons.find((addon) => addon.id === result.manifest.id) || result.manifest;
            const capability = addonCapability(installedAddon).label;
            const configurationRequired = installedAddon.behaviorHints?.configurationRequired === true;
            showToast(
                configurationRequired
                    ? `${result.manifest.name} was ${isUpdate ? 'updated' : 'installed'} as ${capability}, but configuration is still required.`
                    : `${result.manifest.name} was ${isUpdate ? 'updated' : 'installed'} as ${capability}.`,
                configurationRequired ? 'warning' : 'success'
            );
        } catch (error) {
            showToast(error.message || 'The add-on could not be installed.', 'error');
        } finally {
            setButtonBusy(elements.installAddonButton, false, state.editingAddonId ? 'Update' : 'Install');
        }
    }

    async function removeAddon(addon) {
        const confirmed = window.confirm(`Remove “${addon.name}” from TShow?`);
        if (!confirmed) return;

        try {
            await api(`/api/addons/${encodeURIComponent(addon.id)}`, { method: 'DELETE' });
            forgetAddon(addon);
            if (state.editingAddonId === addon.id) cancelAddonEdit();
            await loadAddons({ quiet: true });
            showToast(`${addon.name} was removed.`);
        } catch (error) {
            showToast(error.message || 'The add-on could not be removed.', 'error');
        }
    }

    async function refreshAddons() {
        setButtonBusy(elements.refreshAddons, true, 'Refreshing…');
        try {
            const result = await syncStoredAddons();
            state.addons = Array.isArray(result.addons) ? result.addons : [];
            renderAddons();
            state.addonCatalogSignature = addonCatalogSignature();
            state.addonCatalogLoadPromise = loadAddonCatalogs({ force: true });
            showToast('Add-on list refreshed.');
        } catch (error) {
            showToast(error.message || 'Could not refresh add-ons.', 'error');
        } finally {
            setButtonBusy(elements.refreshAddons, false, 'Refresh');
        }
    }

    async function api(path, options = {}, controls = {}) {
        const usesCustomAddons = /^\/api\/(?:streams\/|addons\/(?:search(?:\?|$)|(?:catalog|meta|streams)\/))/.test(path);
        if (
            !controls.skipAddonSync &&
            usesCustomAddons &&
            state.addonURLs.length &&
            Date.now() - state.lastAddonSync > 10 * 60 * 1000
        ) {
            await syncStoredAddons();
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 25_000);

        try {
            const response = await fetch(path, {
                ...options,
                signal: controller.signal,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Cvm-Client-Id': addonClientId,
                    ...(options.headers || {})
                }
            });

            let data = {};
            const type = response.headers.get('content-type') || '';
            if (type.includes('application/json')) {
                data = await response.json();
            }

            if (!response.ok) {
                throw new Error(data.error || `Request failed with status ${response.status}`);
            }
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('The request took too long. Please try again.');
            }
            throw error;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function openDialog(dialog) {
        if (!dialog.open) dialog.showModal();
        updateDialogState();
    }

    function updateDialogState() {
        const anyOpen = elements.detailsDialog.open || elements.playerDialog.open;
        document.body.classList.toggle('is-dialog-open', anyOpen);
    }

    function showToast(message, type = 'success') {
        const toast = makeElement('div', `toast ${type}`);
        toast.append(
            makeElement('span', 'toast-dot'),
            makeElement('p', '', String(message || 'Done'))
        );
        elements.toastRegion.append(toast);
        requestAnimationFrame(() => toast.classList.add('is-visible'));

        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => toast.remove(), 220);
        }, 4_200);
    }

    function setButtonBusy(button, busy, label) {
        button.disabled = busy;
        button.textContent = label;
    }

    function normalizeCollection(items, hint) {
        if (!Array.isArray(items)) return [];
        return uniqueMedia(
            items
                .filter((item) =>
                    item &&
                    typeof item === 'object' &&
                    item.id &&
                    item.media_type !== 'person'
                )
                .map((item) => normalizeMedia(item, hint))
                .filter((item) => ['movie', 'tv'].includes(mediaType(item)))
        );
    }

    function uniqueMedia(items) {
        const seen = new Set();
        return items.filter((item) => {
            const key = mediaKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function normalizeMedia(item, hint) {
        const inferred = hint || item.media_type || (item.title ? 'movie' : 'tv');
        return {
            ...item,
            media_type: inferred === 'series' ? 'tv' : inferred
        };
    }

    function normalizeAddonMeta(meta, descriptor = {}) {
        if (!meta || typeof meta !== 'object') return null;
        const id = String(meta.id || meta.imdb_id || '').trim();
        if (!id || id.length > 180) return null;

        const stremioType = meta.type || descriptor.type || 'movie';
        if (!['movie', 'series', 'tv'].includes(stremioType)) return null;
        const type = stremioType === 'series' ? 'tv' : stremioType;
        const title = String(meta.name || meta.title || 'Untitled').slice(0, 240);
        const dateText = String(
            meta.releaseInfo ||
            meta.year ||
            meta.released ||
            meta.release_date ||
            meta.first_air_date ||
            ''
        );
        const year = dateText.match(/\b(18|19|20|21)\d{2}\b/)?.[0] || '';
        const rating = Number.parseFloat(meta.imdbRating ?? meta.vote_average ?? 0);
        const genres = normalizeGenres(meta.genres || meta.genre);
        const addon = descriptor.addon || {};

        return normalizeMedia({
            id,
            imdb_id: meta.imdb_id || (/^tt\d+$/i.test(id) ? id : null),
            title: type === 'movie' ? title : null,
            name: type === 'tv' ? title : null,
            media_type: type,
            poster_path: meta.poster || meta.poster_path || null,
            backdrop_path: meta.background || meta.backdrop_path || null,
            overview: String(meta.description || meta.overview || '').slice(0, 3_000),
            release_date: type === 'movie' && year ? `${year}-01-01` : null,
            first_air_date: type === 'tv' && year ? `${year}-01-01` : null,
            vote_average: Number.isFinite(rating) ? rating : 0,
            original_language: meta.language || meta.original_language || null,
            _addonCatalog: true,
            _sourceAddonId: addon.id || meta._sourceAddonId || null,
            _sourceAddonName: addon.name || meta._sourceAddonName || 'Installed add-on',
            _catalogId: descriptor.catalog?.id || meta._catalogId || null,
            _catalogName: descriptor.catalog?.name || meta._catalogName || null,
            _stremioId: id,
            _stremioType: stremioType === 'tv' ? 'series' : stremioType,
            _tmdbId: meta.moviedb_id || meta.tmdb_id || meta._tmdbId || null,
            _genres: genres.map((genre) => genre.name),
            _trailers: Array.isArray(meta.trailerStreams)
                ? meta.trailerStreams
                : Array.isArray(meta.trailers)
                    ? meta.trailers
                    : [],
            _stremioVideos: Array.isArray(meta.videos) ? meta.videos : [],
            _runtime: meta.runtime || null,
            _behaviorHints: meta.behaviorHints || {}
        }, type);
    }

    function normalizeGenres(value) {
        const values = Array.isArray(value)
            ? value
            : typeof value === 'string'
                ? value.split(',')
                : [];
        return values
            .map((genre) => typeof genre === 'string' ? genre : genre?.name)
            .map((name) => String(name || '').trim())
            .filter(Boolean)
            .slice(0, 20)
            .map((name) => ({ name }));
    }

    function parseRuntimeMinutes(value) {
        if (Number.isFinite(Number(value)) && Number(value) > 0) {
            return Math.round(Number(value));
        }
        const text = String(value || '').toLowerCase();
        const hours = Number.parseInt(text.match(/(\d+)\s*h/)?.[1], 10) || 0;
        const minutes = Number.parseInt(text.match(/(\d+)\s*m/)?.[1], 10) || 0;
        if (hours || minutes) return hours * 60 + minutes;
        const firstNumber = Number.parseInt(text.match(/\d+/)?.[0], 10);
        return Number.isFinite(firstNumber) ? firstNumber : 0;
    }

    function serializeMedia(media) {
        return {
            id: media.id,
            imdb_id: media.imdb_id || null,
            title: media.title || null,
            name: media.name || null,
            media_type: mediaType(media),
            release_date: media.release_date || null,
            first_air_date: media.first_air_date || null,
            poster_path: media.poster_path || null,
            backdrop_path: media.backdrop_path || null,
            vote_average: Number(media.vote_average) || 0,
            overview: String(media.overview || '').slice(0, 1_500),
            original_language: media.original_language || null,
            _addonCatalog: Boolean(media._addonCatalog),
            _sourceAddonId: media._sourceAddonId || null,
            _sourceAddonName: media._sourceAddonName || null,
            _catalogId: media._catalogId || null,
            _catalogName: media._catalogName || null,
            _stremioId: media._stremioId || null,
            _stremioType: media._stremioType || null,
            _tmdbId: media._tmdbId || null,
            _genres: Array.isArray(media._genres) ? media._genres.slice(0, 20) : [],
            _trailers: Array.isArray(media._trailers) ? media._trailers.slice(0, 20) : [],
            _stremioVideos: Array.isArray(media._stremioVideos)
                ? media._stremioVideos.slice(0, 250).map((video) => ({
                    id: video.id,
                    title: video.title || video.name || null,
                    season: video.season,
                    episode: video.episode,
                    released: video.released || null
                }))
                : [],
            _runtime: media._runtime || null,
            _behaviorHints: media._behaviorHints || {}
        };
    }

    function mediaType(media) {
        if (media.media_type === 'movie') return 'movie';
        if (media.media_type === 'tv' || media.media_type === 'series') return 'tv';
        return media.title ? 'movie' : 'tv';
    }

    function mediaTitle(media) {
        return String(media.title || media.name || 'Untitled');
    }

    function mediaYear(media) {
        const date = media.release_date || media.first_air_date;
        return /^\d{4}/.test(String(date || '')) ? String(date).slice(0, 4) : '';
    }

    function mediaKey(media) {
        const provider = media._sourceAddonId ? `:${media._sourceAddonId}` : '';
        return `${mediaType(media)}:${media.id}${provider}`;
    }

    function formatRating(value) {
        const rating = Number(value);
        return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : '';
    }

    function imageURL(path, size) {
        if (typeof path !== 'string') return null;
        if (/^\/[a-zA-Z0-9_./-]+$/.test(path)) {
            return `https://image.tmdb.org/t/p/${size}${path}`;
        }
        try {
            const url = new URL(path);
            return url.protocol === 'https:' ? url.href : null;
        } catch {
            return null;
        }
    }

    function isSafeWebURL(value) {
        try {
            const url = new URL(String(value || ''));
            return ['https:', 'http:'].includes(url.protocol);
        } catch {
            return false;
        }
    }

    function isSafeExternalAppURL(value) {
        try {
            const url = new URL(String(value || ''));
            if (url.protocol !== 'magnet:') return false;
            return /^urn:btih:(?:[a-f0-9]{40}|[a-z2-7]{32})$/i.test(
                String(url.searchParams.get('xt') || '')
            );
        } catch {
            return false;
        }
    }

    function toggleSidebar() {
        const open = !document.body.classList.contains('sidebar-open');
        document.body.classList.toggle('sidebar-open', open);
        elements.menuButton.setAttribute('aria-expanded', String(open));
        elements.sidebarScrim.hidden = !open;
    }

    function closeSidebar() {
        document.body.classList.remove('sidebar-open');
        elements.menuButton.setAttribute('aria-expanded', 'false');
        elements.sidebarScrim.hidden = true;
    }

    function updateClock() {
        const now = new Date();
        elements.headerClock.dateTime = now.toISOString();
        elements.headerClock.textContent = new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        }).format(now);
        elements.headerClock.title = new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }).format(now);
    }

    function registerPWA() {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        elements.installAppButton.hidden = standalone;
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // The website remains fully usable if offline installation is unavailable.
            });
        }
    }

    async function installPWA() {
        closeSidebar();
        if (state.installPrompt) {
            state.installPrompt.prompt();
            await state.installPrompt.userChoice;
            state.installPrompt = null;
            return;
        }
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        showToast(
            isIOS
                ? 'In Safari, tap Share and then “Add to Home Screen”.'
                : 'Open your browser menu and choose “Install app” or “Add to Home screen”.',
            'warning'
        );
    }

    function exportBrowserData() {
        const payload = {
            version: 1,
            app: 'TShow',
            exportedAt: new Date().toISOString(),
            watchlist: state.watchlist.slice(0, 250),
            recentlyViewed: state.recentlyViewed.slice(0, 20),
            addonURLs: state.addonURLs.slice(0, 20)
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tshow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        showToast('Browser backup exported.');
    }

    async function importBrowserData(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 1_000_000) {
            showToast('That backup is too large.', 'error');
            return;
        }
        try {
            const payload = JSON.parse(await file.text());
            if (payload?.app !== 'TShow' || payload?.version !== 1) {
                throw new Error('This is not a supported TShow backup.');
            }
            state.watchlist = Array.isArray(payload.watchlist) ? payload.watchlist.slice(0, 250) : [];
            state.recentlyViewed = Array.isArray(payload.recentlyViewed) ? payload.recentlyViewed.slice(0, 20) : [];
            state.addonURLs = Array.isArray(payload.addonURLs)
                ? payload.addonURLs.filter((value) => typeof value === 'string' && value.length <= 8192).slice(0, 20)
                : [];
            localStorage.setItem(STORAGE_KEYS.watchlist, JSON.stringify(state.watchlist));
            localStorage.setItem(STORAGE_KEYS.recentlyViewed, JSON.stringify(state.recentlyViewed));
            saveAddonURLs();
            updateListCount();
            renderRecentlyViewed();
            await syncStoredAddons();
            await loadAddons({ quiet: true });
            showToast('Backup restored in this browser.');
        } catch (error) {
            showToast(error.message || 'The backup could not be imported.', 'error');
        }
    }

    async function submitContactForm(event) {
        event.preventDefault();
        const formData = new FormData(elements.contactForm);
        const payload = {
            type: String(formData.get('type') || ''),
            name: String(formData.get('name') || ''),
            email: String(formData.get('email') || ''),
            message: String(formData.get('message') || ''),
            website: String(formData.get('website') || ''),
            consent: formData.get('consent') === 'on'
        };
        setButtonBusy(elements.contactSubmit, true, 'Sending…');
        elements.contactStatus.textContent = '';
        try {
            const result = await api('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            elements.contactForm.reset();
            elements.contactStatus.textContent = result.message || 'Your message was sent.';
            showToast('Message sent to TShow support.');
        } catch (error) {
            elements.contactStatus.textContent = error.message || 'The message could not be sent.';
            showToast(elements.contactStatus.textContent, 'error');
        } finally {
            setButtonBusy(elements.contactSubmit, false, 'Send message');
        }
    }

    function pluralize(count, singular) {
        const numeric = Number(count) || 0;
        if (singular === 'series') return `${numeric} series`;
        return `${numeric} ${singular}${numeric === 1 ? '' : 's'}`;
    }

    function makeElement(tag, className = '', text = null) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== null && text !== undefined) element.textContent = String(text);
        return element;
    }

    function toCamelCase(value) {
        return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    function loadStoredArray(key) {
        const value = loadStoredValue(key);
        return Array.isArray(value) ? value : [];
    }

    function loadStoredValue(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch {
            return null;
        }
    }

    function loadOrCreateAddonClientId() {
        const saved = String(localStorage.getItem(STORAGE_KEYS.addonClientId) || '').toLowerCase();
        if (/^[a-f0-9]{32}$/.test(saved)) return saved;

        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const clientId = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(STORAGE_KEYS.addonClientId, clientId);
        return clientId;
    }
})();
