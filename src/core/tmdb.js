const axios = require('axios');

class TMDBClient {
  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
    this.baseURL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
    this.imageBaseURL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      params: { api_key: this.apiKey }
    });
    this.cache = new Map();
    this.cacheTTL = Number.parseInt(process.env.CACHE_TTL_MS, 10) || 3_600_000;
  }

  getCacheKey(endpoint, params) {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async request(endpoint, params = {}) {
    if (!this.apiKey || this.apiKey.startsWith('your_')) {
      throw new Error('TMDB API key is not configured');
    }

    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get(endpoint, { params });
      this.setCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid TMDB API key');
      }
      if (error.response?.status === 404) {
        throw new Error('Resource not found');
      }
      throw new Error(`TMDB API error: ${error.message}`);
    }
  }

  getImageURL(path, size = 'w500') {
    if (!path) return null;
    return `${this.imageBaseURL}/${size}${path}`;
  }

  getBackdropURL(path, size = 'w1280') {
    return this.getImageURL(path, size);
  }

  getPosterURL(path, size = 'w500') {
    return this.getImageURL(path, size);
  }

  getProfileURL(path, size = 'w185') {
    return this.getImageURL(path, size);
  }

  async getTrending(mediaType = 'all', timeWindow = 'week') {
    return this.request(`/trending/${mediaType}/${timeWindow}`);
  }

  async getPopularMovies(page = 1) {
    return this.request('/movie/popular', { page });
  }

  async getPopularTV(page = 1) {
    return this.request('/tv/popular', { page });
  }

  async getTopRatedMovies(page = 1) {
    return this.request('/movie/top_rated', { page });
  }

  async getTopRatedTV(page = 1) {
    return this.request('/tv/top_rated', { page });
  }

  async getNowPlayingMovies(page = 1) {
    return this.request('/movie/now_playing', { page });
  }

  async getAiringTodayTV(page = 1) {
    return this.request('/tv/airing_today', { page });
  }

  async getMovieDetails(movieId, appendToResponse = 'credits,videos,images,recommendations,similar,keywords') {
    return this.request(`/movie/${movieId}`, { append_to_response: appendToResponse });
  }

  async getTVDetails(tvId, appendToResponse = 'credits,videos,images,recommendations,similar,keywords') {
    return this.request(`/tv/${tvId}`, { append_to_response: appendToResponse });
  }

  async getSeasonDetails(tvId, seasonNumber) {
    return this.request(`/tv/${tvId}/season/${seasonNumber}`);
  }

  async getEpisodeDetails(tvId, seasonNumber, episodeNumber) {
    return this.request(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`);
  }

  async searchMulti(query, page = 1, includeAdult = false) {
    return this.request('/search/multi', { query, page, include_adult: includeAdult });
  }

  async searchMovies(query, page = 1, includeAdult = false) {
    return this.request('/search/movie', { query, page, include_adult: includeAdult });
  }

  async searchTV(query, page = 1, includeAdult = false) {
    return this.request('/search/tv', { query, page, include_adult: includeAdult });
  }

  async discoverMovies(options = {}) {
    return this.request('/discover/movie', options);
  }

  async discoverTV(options = {}) {
    return this.request('/discover/tv', options);
  }

  async getGenres(type = 'movie') {
    return this.request(`/genre/${type}/list`);
  }

  async getMovieCredits(movieId) {
    return this.request(`/movie/${movieId}/credits`);
  }

  async getTVCredits(tvId) {
    return this.request(`/tv/${tvId}/credits`);
  }

  async getMovieVideos(movieId) {
    return this.request(`/movie/${movieId}/videos`);
  }

  async getTVVideos(tvId) {
    return this.request(`/tv/${tvId}/videos`);
  }

  async getMovieImages(movieId) {
    return this.request(`/movie/${movieId}/images`);
  }

  async getTVImages(tvId) {
    return this.request(`/tv/${tvId}/images`);
  }

  async getMovieRecommendations(movieId, page = 1) {
    return this.request(`/movie/${movieId}/recommendations`, { page });
  }

  async getTVRecommendations(tvId, page = 1) {
    return this.request(`/tv/${tvId}/recommendations`, { page });
  }

  async getMovieSimilar(movieId, page = 1) {
    return this.request(`/movie/${movieId}/similar`, { page });
  }

  async getTVSimilar(tvId, page = 1) {
    return this.request(`/tv/${tvId}/similar`, { page });
  }

  async getPersonDetails(personId) {
    return this.request(`/person/${personId}`);
  }

  async getPersonCredits(personId) {
    return this.request(`/person/${personId}/combined_credits`);
  }

  async getWatchProviders(movieId, type = 'movie') {
    return this.request(`/${type}/${movieId}/watch/providers`);
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new TMDBClient();
