const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

export const posterUrl = (path, size = 'w342') =>
  path ? `${IMG_BASE}/${size}${path}` : null;

export async function searchMovies(query, { year } = {}) {
  if (!query.trim()) return [];
  let url = `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  if (year) url += `&year=${year}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).map((m) => ({
    tmdbId: String(m.id),
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : '',
    releaseDate: m.release_date || '',
    posterPath: m.poster_path,
    overview: m.overview,
    genreIds: m.genre_ids || [],
  }));
}

let genreCache = null;
export async function getGenreList() {
  if (genreCache) return genreCache;
  const res = await fetch(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}`);
  const data = await res.json();
  genreCache = {};
  (data.genres || []).forEach((g) => { genreCache[g.id] = g.name; });
  return genreCache;
}

function mapMovieResults(results) {
  return (results || []).map((m) => ({
    tmdbId: String(m.id),
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : '',
    releaseDate: m.release_date || '',
    posterPath: m.poster_path,
    overview: m.overview,
    genreIds: m.genre_ids || [],
  }));
}

const POPULAR_CACHE_KEY = 'tmdb_popular_page1';
const POPULAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function discoverMovies({ tab = 'popular', genre, year, page = 1 } = {}) {
  const canCache = tab === 'popular' && page === 1 && !genre && !year;
  if (canCache) {
    try {
      const raw = localStorage.getItem(POPULAR_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.fetchedAt && Date.now() - cached.fetchedAt < POPULAR_CACHE_TTL_MS) {
          return { movies: cached.movies, totalPages: cached.totalPages };
        }
      }
    } catch { /* fall through to fetch */ }
  }

  let url;
  if (tab === 'now_playing') {
    url = `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&page=${page}`;
  } else if (tab === 'top_rated') {
    url = `${BASE_URL}/movie/top_rated?api_key=${API_KEY}&page=${page}`;
  } else {
    url = `${BASE_URL}/movie/popular?api_key=${API_KEY}&page=${page}`;
  }
  // For popular/top_rated we can use discover endpoint to support filters
  if ((genre || year) && tab !== 'now_playing') {
    url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&page=${page}&sort_by=${tab === 'top_rated' ? 'vote_average.desc&vote_count.gte=300' : 'popularity.desc'}&include_adult=false`;
    if (genre) url += `&with_genres=${genre}`;
    if (year) url += `&primary_release_year=${year}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  const result = {
    movies: mapMovieResults(data.results),
    totalPages: Math.min(data.total_pages || 1, 500),
  };

  if (canCache) {
    try {
      localStorage.setItem(POPULAR_CACHE_KEY, JSON.stringify({ ...result, fetchedAt: Date.now() }));
    } catch { /* quota or disabled — ignore */ }
  }

  return result;
}

export async function getRecommendations(tmdbId) {
  const res = await fetch(`${BASE_URL}/movie/${tmdbId}/recommendations?api_key=${API_KEY}`);
  const data = await res.json();
  return mapMovieResults(data.results);
}

export async function getMovieDetails(tmdbId) {
  const res = await fetch(`${BASE_URL}/movie/${tmdbId}?api_key=${API_KEY}`);
  const m = await res.json();
  return {
    tmdbId: String(m.id),
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : '',
    releaseDate: m.release_date || '',
    posterPath: m.poster_path,
    overview: m.overview,
  };
}

export async function getPersonDetails(personId) {
  const res = await fetch(
    `${BASE_URL}/person/${personId}?api_key=${API_KEY}&append_to_response=movie_credits`
  );
  if (!res.ok) return null;
  const p = await res.json();
  if (p.success === false) return null;
  const seen = new Set();
  const filmography = (p.movie_credits?.cast || [])
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .map((m) => ({
      tmdbId: String(m.id),
      title: m.title,
      year: m.release_date ? m.release_date.slice(0, 4) : '',
      releaseDate: m.release_date || '',
      posterPath: m.poster_path,
      overview: m.overview,
      genreIds: m.genre_ids || [],
      character: m.character || '',
      popularity: m.popularity || 0,
    }))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
  return {
    personId: String(p.id),
    name: p.name,
    profilePath: p.profile_path,
    biography: p.biography || '',
    filmography,
  };
}

export async function getFullMovieDetails(tmdbId) {
  const res = await fetch(
    `${BASE_URL}/movie/${tmdbId}?api_key=${API_KEY}&append_to_response=credits`
  );
  const m = await res.json();
  const director = m.credits?.crew?.find((c) => c.job === 'Director');
  const cast = (m.credits?.cast || []).slice(0, 10).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character,
    profilePath: c.profile_path,
  }));
  return {
    tmdbId: String(m.id),
    title: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : '',
    releaseDate: m.release_date || '',
    posterPath: m.poster_path,
    backdropPath: m.backdrop_path,
    overview: m.overview,
    tagline: m.tagline || '',
    genres: (m.genres || []).map((g) => g.name),
    runtime: m.runtime || null,
    director: director ? director.name : null,
    cast,
  };
}
