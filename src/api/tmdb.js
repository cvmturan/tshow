const express = require('express');
const router = express.Router();
const tmdb = require('../core/tmdb');
const sampleData = require('../core/sampleData');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', tmdbKey: !!process.env.TMDB_API_KEY });
});

router.get('/trending/:mediaType?/:timeWindow?', async (req, res) => {
  const { mediaType = 'all', timeWindow = 'week' } = req.params;
  try {
    const fallback = mediaType === 'movie'
      ? sampleData.sampleMovies.map((item) => ({ ...item, media_type: 'movie' }))
      : mediaType === 'tv'
        ? sampleData.sampleTV.map((item) => ({ ...item, media_type: 'tv' }))
        : [
            ...sampleData.sampleMovies.map((item) => ({ ...item, media_type: 'movie' })),
            ...sampleData.sampleTV.map((item) => ({ ...item, media_type: 'tv' }))
          ];
    const data = await tmdb.getTrending(mediaType, timeWindow).catch(() => ({ results: fallback }));
    res.json(data);
  } catch (error) {
    res.json({ results: [], page: 1, total_results: 0, total_pages: 1 });
  }
});

router.get('/popular/movies', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getPopularMovies(page).catch(() => sampleData.getSample('movies'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/popular/tv', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getPopularTV(page).catch(() => sampleData.getSample('tv'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/top-rated/movies', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getTopRatedMovies(page).catch(() => sampleData.getSample('movies'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/top-rated/tv', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getTopRatedTV(page).catch(() => sampleData.getSample('tv'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/now-playing/movies', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getNowPlayingMovies(page).catch(() => sampleData.getSample('movies'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/airing-today/tv', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const data = await tmdb.getAiringTodayTV(page).catch(() => sampleData.getSample('tv'));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/genres/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const data = await tmdb.getGenres(type).catch(() => ({ genres: sampleData.getGenres() }));
    res.json(data);
  } catch (error) { res.json({ genres: sampleData.getGenres() }); }
});

router.get('/movie/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appendToResponse = req.query.append_to_response || 'credits,videos,images,recommendations,similar,keywords';
    const data = await tmdb.getMovieDetails(id, appendToResponse).catch(() => sampleData.getMovieDetail(id));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tv/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appendToResponse = req.query.append_to_response || 'credits,videos,images,recommendations,similar,keywords';
    const data = await tmdb.getTVDetails(id, appendToResponse).catch(() => sampleData.getTVDetail(id));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tv/:id/season/:seasonNumber', async (req, res) => {
  try {
    const { id, seasonNumber } = req.params;
    const data = await tmdb.getSeasonDetails(id, seasonNumber).catch(() => sampleData.getSeasonDetail(id, seasonNumber));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/tv/:id/season/:seasonNumber/episode/:episodeNumber', async (req, res) => {
  try {
    const { id, seasonNumber, episodeNumber } = req.params;
    const data = await tmdb.getEpisodeDetails(id, seasonNumber, episodeNumber).catch(() => ({ id: 0, name: 'Episode ' + episodeNumber }));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/search', async (req, res) => {
  try {
    const { query, page = 1, type = 'multi' } = req.query;
    if (!query) return res.status(400).json({ error: 'Query parameter required' });
    if (String(query).length > 120) return res.status(400).json({ error: 'Search query is too long' });
    let data;
    if (type === 'movie') {
      data = await tmdb.searchMovies(query, page).catch(() => ({ results: sampleData.sampleMovies.filter(m => m.title.toLowerCase().includes(query.toLowerCase())) }));
    } else if (type === 'tv') {
      data = await tmdb.searchTV(query, page).catch(() => ({ results: sampleData.sampleTV.filter(t => t.name.toLowerCase().includes(query.toLowerCase())) }));
    } else {
      data = await tmdb.searchMulti(query, page).catch(() => ({ results: [...sampleData.sampleMovies, ...sampleData.sampleTV].filter(m => (m.title || m.name || '').toLowerCase().includes(query.toLowerCase())) }));
    }
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/discover/movies', async (req, res) => {
  try {
    const options = { ...req.query };
    if (options.page) options.page = parseInt(options.page);
    const data = await tmdb.discoverMovies(options).catch(() => sampleData.getSample('movies'));
    res.json(data);
  } catch (error) { res.json(sampleData.getSample('movies')); }
});

router.get('/discover/tv', async (req, res) => {
  try {
    const options = { ...req.query };
    if (options.page) options.page = parseInt(options.page);
    const data = await tmdb.discoverTV(options).catch(() => sampleData.getSample('tv'));
    res.json(data);
  } catch (error) { res.json(sampleData.getSample('tv')); }
});

router.get('/person/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await tmdb.getPersonDetails(id).catch(() => ({ id: parseInt(id), name: 'Unknown Cast', profile_path: null }));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/person/:id/credits', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await tmdb.getPersonCredits(id).catch(() => ({ id: parseInt(id), name: 'Unknown Cast', cast: [], crew: [] }));
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/image/:size/:path(*)', async (req, res) => {
  try {
    const { size, path } = req.params;
    const url = tmdb.getImageURL(path, size);
    if (!url) return res.status(404).json({ error: 'Image not found' });
    res.redirect(url);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
