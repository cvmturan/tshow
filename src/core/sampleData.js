class SampleData {
  constructor() {
    this.tmdbImageBase = 'https://image.tmdb.org/t/p';
    this.sampleStream = {
      url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      type: 'mp4',
      quality: '540p',
      codec: 'h264'
    };

    this.genreMap = {
      12: 'Adventure',
      14: 'Fantasy',
      16: 'Animation',
      18: 'Drama',
      27: 'Horror',
      28: 'Action',
      35: 'Comedy',
      36: 'History',
      53: 'Thriller',
      80: 'Crime',
      99: 'Documentary',
      10751: 'Family',
      10759: 'Action & Adventure',
      10765: 'Sci-Fi & Fantasy',
      9648: 'Mystery',
      878: 'Science Fiction'
    };

    this.sampleMovies = [
      {
        id: 278,
        title: 'The Shawshank Redemption',
        release_date: '1994-09-23',
        poster_path: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
        backdrop_path: '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg',
        vote_average: 8.7,
        vote_count: 24522,
        overview: 'Two imprisoned men bond over years, finding solace and eventual redemption through acts of common decency.',
        genre_ids: [18, 80],
        original_language: 'en',
        popularity: 92
      },
      {
        id: 238,
        title: 'The Godfather',
        release_date: '1972-03-24',
        poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
        backdrop_path: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg',
        vote_average: 8.7,
        vote_count: 18668,
        overview: 'The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.',
        genre_ids: [18, 80],
        original_language: 'en',
        popularity: 89
      },
      {
        id: 155,
        title: 'The Dark Knight',
        release_date: '2008-07-16',
        poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        backdrop_path: '/nMKdUUepR0i5zn0y1T4CsSB5chy.jpg',
        vote_average: 8.5,
        vote_count: 30511,
        overview: 'Batman faces a criminal mastermind whose reign of chaos pushes Gotham and its heroes to their limits.',
        genre_ids: [18, 28, 80, 53],
        original_language: 'en',
        popularity: 96
      },
      {
        id: 680,
        title: 'Pulp Fiction',
        release_date: '1994-09-10',
        poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg',
        backdrop_path: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg',
        vote_average: 8.5,
        vote_count: 25714,
        overview: 'The lives of two mob hitmen, a boxer, and a pair of diner bandits intertwine in four tales of violence and redemption.',
        genre_ids: [18, 80],
        original_language: 'en',
        popularity: 84
      },
      {
        id: 13,
        title: 'Forrest Gump',
        release_date: '1994-06-23',
        poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg',
        backdrop_path: '/3h1JZGDhZ8nzxdgvkxha0qBqi05.jpg',
        vote_average: 8.5,
        vote_count: 25324,
        overview: 'A kind-hearted man from Alabama witnesses and influences several defining events in twentieth-century America.',
        genre_ids: [18, 35],
        original_language: 'en',
        popularity: 82
      },
      {
        id: 2493,
        title: 'The Princess Bride',
        release_date: '1987-09-25',
        poster_path: '/kTXxdNv44najTayFcrT487xWuDv.jpg',
        backdrop_path: null,
        vote_average: 7.7,
        vote_count: 4500,
        overview: 'A fairy tale adventure about a beautiful young woman and the swashbuckling hero who must rescue her.',
        genre_ids: [12, 14, 35, 10751],
        original_language: 'en',
        popularity: 73
      }
    ];

    this.sampleTV = [
      {
        id: 71912,
        name: 'The Witcher',
        first_air_date: '2019-12-20',
        poster_path: '/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg',
        backdrop_path: '/foGkPxpw9h8zln81j63mix5B7m8.jpg',
        vote_average: 8.0,
        vote_count: 14684,
        overview: 'A solitary monster hunter struggles to find his place in a world where people often prove more wicked than beasts.',
        genre_ids: [18, 10759, 10765],
        original_language: 'en',
        popularity: 91
      },
      {
        id: 82856,
        name: 'The Mandalorian',
        first_air_date: '2019-11-12',
        poster_path: '/eU1i6eHXlzMOlEq0ku1Rzq7Y4wA.jpg',
        backdrop_path: '/9ijMGlJKqcslswWUzTEwScm82Gs.jpg',
        vote_average: 8.4,
        vote_count: 13625,
        overview: 'A lone bounty hunter makes his way through the outer reaches of the galaxy, far from the authority of the New Republic.',
        genre_ids: [10759, 18, 10765],
        original_language: 'en',
        popularity: 93
      },
      {
        id: 100088,
        name: 'The Last of Us',
        first_air_date: '2023-01-15',
        poster_path: '/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg',
        backdrop_path: '/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg',
        vote_average: 8.6,
        vote_count: 8200,
        overview: 'Twenty years after civilization has been destroyed, a hardened survivor is hired to smuggle a teenager across a fractured country.',
        genre_ids: [18],
        original_language: 'en',
        popularity: 98
      },
      {
        id: 95396,
        name: 'Severance',
        first_air_date: '2022-02-17',
        poster_path: '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg',
        backdrop_path: '/b1Y8SUb12gPHCSSSNlbX4nB3IKy.jpg',
        vote_average: 8.4,
        vote_count: 2600,
        overview: 'Office workers whose memories are surgically divided between work and personal lives uncover the truth about their jobs.',
        genre_ids: [18, 9648],
        original_language: 'en',
        popularity: 88
      }
    ];

    this.imdbIds = {
      movie: {
        278: 'tt0111161',
        238: 'tt0068646',
        155: 'tt0468569',
        680: 'tt0110912',
        13: 'tt0109830',
        2493: 'tt0093779'
      },
      tv: {
        71912: 'tt5180504',
        82856: 'tt8111088',
        100088: 'tt3581920',
        95396: 'tt11280740'
      }
    };
  }

  getSample(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'movie' || normalized === 'movies') {
      return this.asPage(this.sampleMovies);
    }
    if (normalized === 'series' || normalized === 'tv') {
      return this.asPage(this.sampleTV);
    }
    if (normalized === 'trending' || normalized === 'all') {
      return this.asPage([
        ...this.sampleMovies.map((item) => ({ ...item, media_type: 'movie' })),
        ...this.sampleTV.map((item) => ({ ...item, media_type: 'tv' }))
      ]);
    }
    if (normalized === 'stream') {
      return this.getStream();
    }
    return this.asPage([]);
  }

  asPage(results) {
    return {
      page: 1,
      results,
      total_results: results.length,
      total_pages: 1
    };
  }

  getGenres() {
    return Object.entries(this.genreMap).map(([id, name]) => ({
      id: Number.parseInt(id, 10),
      name
    }));
  }

  getMovieDetail(id) {
    const numericId = Number.parseInt(id, 10);
    const movie = this.sampleMovies.find((item) => item.id === numericId);
    if (!movie) return this.unknownDetail(numericId, 'movie');

    return {
      ...movie,
      genres: this.expandGenres(movie.genre_ids),
      runtime: numericId === 278 ? 142 : 120,
      imdb_id: this.imdbIds.movie[numericId] || null,
      tagline: '',
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      recommendations: {
        results: this.sampleMovies.filter((item) => item.id !== numericId)
      },
      similar: {
        results: this.sampleMovies.filter((item) => item.id !== numericId)
      }
    };
  }

  getTVDetail(id) {
    const numericId = Number.parseInt(id, 10);
    const show = this.sampleTV.find((item) => item.id === numericId);
    if (!show) return this.unknownDetail(numericId, 'tv');

    const seasons = [
      {
        id: numericId * 10 + 1,
        season_number: 1,
        name: 'Season 1',
        poster_path: show.poster_path,
        episode_count: 8,
        air_date: show.first_air_date
      },
      {
        id: numericId * 10 + 2,
        season_number: 2,
        name: 'Season 2',
        poster_path: show.poster_path,
        episode_count: 8,
        air_date: ''
      }
    ];

    return {
      ...show,
      genres: this.expandGenres(show.genre_ids),
      number_of_seasons: seasons.length,
      number_of_episodes: 16,
      seasons,
      imdb_id: this.imdbIds.tv[numericId] || null,
      tagline: '',
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      recommendations: {
        results: this.sampleTV.filter((item) => item.id !== numericId)
      },
      similar: {
        results: this.sampleTV.filter((item) => item.id !== numericId)
      }
    };
  }

  unknownDetail(id, type) {
    const isMovie = type === 'movie';
    return {
      id,
      title: isMovie ? 'Unknown Movie' : undefined,
      name: isMovie ? undefined : 'Unknown Series',
      poster_path: null,
      backdrop_path: null,
      overview: 'Details are not available in the offline demo catalog.',
      genres: [],
      release_date: '',
      first_air_date: '',
      runtime: 0,
      vote_average: 0,
      credits: { cast: [], crew: [] },
      videos: { results: [] },
      recommendations: { results: [] },
      similar: { results: [] }
    };
  }

  getSeasonDetail(tvId, seasonNumber) {
    const show = this.getTVDetail(tvId);
    const season = show.seasons?.find(
      (candidate) => candidate.season_number === Number.parseInt(seasonNumber, 10)
    );
    if (!season) return { id: 0, episodes: [] };

    const episodes = Array.from({ length: season.episode_count || 8 }, (_, index) => ({
      id: season.id * 100 + index + 1,
      name: `Episode ${index + 1}`,
      overview: 'Episode information is available when a TMDB API key is configured.',
      still_path: null,
      episode_number: index + 1,
      season_number: season.season_number,
      air_date: '',
      vote_average: 0
    }));

    return { ...season, episodes };
  }

  expandGenres(ids = []) {
    return ids
      .filter((id) => this.genreMap[id])
      .map((id) => ({ id, name: this.genreMap[id] }));
  }

  getStream() {
    return { ...this.sampleStream };
  }

  getImageURL(imagePath, size = 'w500') {
    if (!imagePath) return null;
    return `${this.tmdbImageBase}/${size}${imagePath}`;
  }
}

module.exports = new SampleData();
