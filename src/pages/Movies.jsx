import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchMovies, discoverMovies, getGenreList, posterUrl } from '../lib/tmdb';
import { getAllWatchedTmdbIds } from '../lib/firestore';

const TABS = [
  { key: 'popular', label: 'Popular' },
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'now_playing', label: 'Now Playing' },
];

export default function Movies() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialGenre = searchParams.get('genre') || '';
  const [tab, setTab] = useState('popular');
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState(initialGenre);
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState({});
  const [watched, setWatched] = useState(new Set());
  const debounceRef = useRef(null);

  // Load genres + watched set once
  useEffect(() => {
    getGenreList().then(setGenres);
    if (user) getAllWatchedTmdbIds(user.uid).then(setWatched);
  }, [user]);

  // Reload on tab/filter change
  useEffect(() => {
    if (search.trim()) return; // search handles its own loading
    setPage(1);
    loadDiscover(1, false);
  }, [tab, genre, year]);

  // Search with debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!search.trim()) {
      loadDiscover(1, false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      loadSearch();
    }, 300);
  }, [search]);

  async function loadDiscover(pg, append) {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const result = await discoverMovies({ tab, genre, year, page: pg });
      setMovies(append ? (prev) => [...prev, ...result.movies] : result.movies);
      setTotalPages(result.totalPages);
      setPage(pg);
    } catch (err) {
      console.error('Failed to load movies:', err);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  async function loadSearch() {
    setLoading(true);
    try {
      const results = await searchMovies(search, { year: year || undefined });
      setMovies(results);
      setTotalPages(1);
      setPage(1);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setLoading(false);
  }

  function handleLoadMore() {
    if (search.trim()) return; // no pagination for search
    loadDiscover(page + 1, true);
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = currentYear; y >= 1920; y--) yearOptions.push(y);

  const genreEntries = Object.entries(genres).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-white">Discover</h1>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search movies..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />

      {/* Tabs (hidden when searching) */}
      {!search.trim() && (
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={genre}
          onChange={(e) => { setGenre(e.target.value); setSearch(''); }}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
        >
          <option value="">All genres</option>
          {genreEntries.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

      </div>

      {/* Results */}
      {loading ? (
        <div className="text-gray-400 text-center py-12">Loading...</div>
      ) : movies.length === 0 ? (
        <div className="text-gray-500 text-center py-12">No movies found.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {movies.map((m) => {
              const isSeen = watched.has(m.tmdbId);
              return (
                <Link
                  key={m.tmdbId}
                  to={`/movie/${m.tmdbId}`}
                  className="group relative"
                >
                  {m.posterPath ? (
                    <img
                      src={posterUrl(m.posterPath, 'w185')}
                      alt=""
                      className={`w-full aspect-[2/3] rounded-lg object-cover transition-all group-hover:ring-2 ring-purple-500 ${
                        isSeen ? 'ring-1 ring-green-500/40' : ''
                      }`}
                    />
                  ) : (
                    <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-xs text-gray-600">
                      No img
                    </div>
                  )}
                  {isSeen && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5 truncate group-hover:text-white transition-colors">
                    {m.title}
                  </p>
                  {m.year && (
                    <p className="text-xs text-gray-600">{m.year}</p>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Load more */}
          {!search.trim() && page < totalPages && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500 px-6 py-2 rounded-lg transition-colors disabled:text-gray-600"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
