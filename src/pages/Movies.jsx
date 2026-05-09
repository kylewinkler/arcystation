import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchMovies, discoverMovies, getGenreList, getRecommendations } from '../lib/tmdb';
import { getAllWatchedTmdbIds, getAllWatchedMovies } from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { DISCOVER_NO_RESULTS, WATCHED_NONE } from '../lib/copy/empty';
import SuggestionCard from '../components/movies/SuggestionCard';
import WatchedPoster from '../components/movies/WatchedPoster';
import MoviePosterTile from '../components/movies/MoviePosterTile';
import QuickActionModal from '../components/modal/QuickActionModal';

const DISCOVER_TABS = [
  { key: 'popular', label: 'Popular' },
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'now_playing', label: 'Now Playing' },
];

const STORAGE_KEY = 'movies_discover_state';
const SCROLL_KEY = 'movies_scroll_y';

function getSavedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function Movies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialGenre = searchParams.get('genre') || '';
  const initialSection = searchParams.get('section') || 'discover';

  // Restore saved discover state if available
  const [restored] = useState(() => getSavedState());
  const didRestore = !!restored?.movies?.length;
  const hasRestoredScroll = useRef(false);

  // Top-level section
  const [section, setSection] = useState(initialSection);

  // ── Discover state ──
  const [discoverTab, setDiscoverTab] = useState(restored?.discoverTab || 'popular');
  const [discoverMovies_, setDiscoverMovies] = useState(restored?.movies || []);
  const [page, setPage] = useState(restored?.page || 1);
  const [totalPages, setTotalPages] = useState(restored?.totalPages || 1);
  const [discoverLoading, setDiscoverLoading] = useState(!didRestore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [discoverSearch, setDiscoverSearch] = useState(restored?.search || '');
  const [discoverGenre, setDiscoverGenre] = useState(initialGenre || restored?.genre || '');
  const [genres, setGenres] = useState({});
  const [watched, setWatched] = useState(new Set());
  const [recs, setRecs] = useState([]);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [recSeedTitle, setRecSeedTitle] = useState('');
  const discoverDebounce = useRef(null);
  const mountedRef = useRef(false);

  // ── Quick action modal ──
  const [quickActionMovie, setQuickActionMovie] = useState(null);

  function handleMovieClick(movie) {
    if (user) {
      setQuickActionMovie(movie);
    } else {
      navigate(`/movie/${movie.tmdbId}`);
    }
  }

  // ── Watched preview state (recent 18) ──
  const [watchedPreview, setWatchedPreview] = useState([]);
  const [watchedLoading, setWatchedLoading] = useState(false);
  const [watchedLoaded, setWatchedLoaded] = useState(false);

  // Load genres + watched set once
  useEffect(() => {
    getGenreList().then(setGenres);
    if (user) getAllWatchedTmdbIds(user.uid).then(setWatched);
  }, [user]);

  // Load recs from highest-rated watched movie
  useEffect(() => {
    if (!user || recsLoaded) return;
    getAllWatchedMovies(user.uid).then(async (movies) => {
      if (movies.length === 0) { setRecsLoaded(true); return; }
      const rated = movies.filter((m) => m.rating > 0).sort((a, b) => b.rating - a.rating);
      const seed = rated[0] || movies[Math.floor(Math.random() * movies.length)];
      if (!seed?.tmdbId) { setRecsLoaded(true); return; }
      try {
        const results = await getRecommendations(seed.tmdbId);
        const unseen = results.filter((m) => !watched.has(m.tmdbId));
        setRecs(unseen.slice(0, 10));
        setRecSeedTitle(seed.title || '');
      } catch (err) {
        console.error('Failed to load recs:', err);
      }
      setRecsLoaded(true);
    });
  }, [user, watched]);

  // ── Discover effects ──
  // Only fetch on tab/genre/section change AFTER initial mount
  useEffect(() => {
    if (!mountedRef.current) return; // skip first render
    if (section !== 'discover') return;
    if (discoverSearch.trim()) return;
    setPage(1);
    loadDiscover(1, false);
  }, [discoverTab, discoverGenre, section]);

  // Search effect — only after mount
  useEffect(() => {
    if (!mountedRef.current) return;
    if (section !== 'discover') return;
    clearTimeout(discoverDebounce.current);
    if (!discoverSearch.trim()) {
      loadDiscover(1, false);
      return;
    }
    discoverDebounce.current = setTimeout(() => loadSearch(), 300);
  }, [discoverSearch]);

  // On mount: fetch only if we did NOT restore
  useEffect(() => {
    mountedRef.current = true;
    if (!didRestore && section === 'discover') {
      loadDiscover(1, false);
    }
    // Reset on cleanup so Strict Mode's simulated unmount/remount doesn't
    // leave the ref "true" and trick the [discoverTab, ...] effect into
    // firing a fresh fetch that clobbers restored state on back-nav.
    return () => { mountedRef.current = false; };
  }, []);

  // ── Save discover state to sessionStorage ──
  useEffect(() => {
    if (!mountedRef.current || section !== 'discover' || discoverLoading) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      discoverTab,
      movies: discoverMovies_,
      page,
      totalPages,
      search: discoverSearch,
      genre: discoverGenre,
    }));
  }, [discoverMovies_, discoverTab, page, totalPages, discoverSearch, discoverGenre, section, discoverLoading]);

  // ── Save scroll position ──
  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
          ticking = false;
        });
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Restore scroll position after restored movies render ──
  useEffect(() => {
    if (didRestore && discoverMovies_.length > 0 && !hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    }
  }, [discoverMovies_]);

  async function loadDiscover(pg, append) {
    if (!append) setDiscoverLoading(true);
    else setLoadingMore(true);
    try {
      const result = await discoverMovies({ tab: discoverTab, genre: discoverGenre, page: pg });
      setDiscoverMovies(append ? (prev) => [...prev, ...result.movies] : result.movies);
      setTotalPages(result.totalPages);
      setPage(pg);
    } catch (err) {
      console.error('Failed to load movies:', err);
    }
    setDiscoverLoading(false);
    setLoadingMore(false);
  }

  async function loadSearch() {
    setDiscoverLoading(true);
    try {
      const results = await searchMovies(discoverSearch);
      setDiscoverMovies(results);
      setTotalPages(1);
      setPage(1);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setDiscoverLoading(false);
  }

  function handleLoadMore() {
    if (discoverSearch.trim()) return;
    loadDiscover(page + 1, true);
  }

  // ── Watched preview effect — fetch 18 most recent on tab open ──
  useEffect(() => {
    if (section !== 'watched' || watchedLoaded || !user) return;
    setWatchedLoading(true);
    getAllWatchedMovies(user.uid, 18).then((movies) => {
      setWatchedPreview(movies);
      setWatchedLoaded(true);
      setWatchedLoading(false);
    });
  }, [section, user]);

  // Section switching
  function switchSection(s) {
    setSection(s);
    const params = new URLSearchParams(searchParams);
    if (s === 'discover') {
      params.delete('section');
    } else {
      params.set('section', s);
    }
    setSearchParams(params, { replace: true });
  }

  const genreEntries = Object.entries(genres).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-white">Movies</h1>

      {/* Top-level tabs — Watched is logged-in-only */}
      {user && (
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          <button
            onClick={() => switchSection('discover')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              section === 'discover' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Discover
          </button>
          <button
            onClick={() => switchSection('watched')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              section === 'watched' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Watched
            {watched.size > 0 && (
              <span className="ml-1.5 text-xs text-purple-200/60">{watched.size}</span>
            )}
          </button>
        </div>
      )}

      {/* ════════ DISCOVER SECTION ════════ */}
      {section === 'discover' && (
        <>
          {/* You might like */}
          {recs.length > 0 && !discoverSearch.trim() && (
            <SuggestionCard
              movie={recs[0]}
              label="You might like"
              labelColor="text-purple-400/80"
              sublabel={recSeedTitle ? `because you liked ${recSeedTitle}` : undefined}
            />
          )}

          {/* Search */}
          <input
            type="text"
            value={discoverSearch}
            onChange={(e) => setDiscoverSearch(e.target.value)}
            placeholder="Search movies..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />

          {/* Sub-tabs */}
          {!discoverSearch.trim() && (
            <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
              {DISCOVER_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setDiscoverTab(t.key)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    discoverTab === t.key
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Genre filter */}
          <div className="flex gap-2">
            <select
              value={discoverGenre}
              onChange={(e) => { setDiscoverGenre(e.target.value); setDiscoverSearch(''); }}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="">All genres</option>
              {genreEntries.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Results */}
          {discoverLoading ? (
            <LoadingScreen />
          ) : discoverMovies_.length === 0 ? (
            <NotFound title={DISCOVER_NO_RESULTS.title} subtitle={DISCOVER_NO_RESULTS.subtitle} scene={DISCOVER_NO_RESULTS.scene} />
          ) : (
            <>
              <MovieGrid movies={discoverMovies_} watched={watched} onQuickAction={handleMovieClick} />
              {!discoverSearch.trim() && page < totalPages && (
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
        </>
      )}

      {/* ════════ WATCHED SECTION ════════ */}
      {section === 'watched' && (
        <>
          {watchedLoading ? (
            <LoadingScreen />
          ) : watchedPreview.length > 0 ? (
            <>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {watchedPreview.map((m) => (
                  <WatchedPoster
                    key={m.tmdbId}
                    tmdbId={m.tmdbId}
                    title={m.title}
                    posterPath={m.posterPath}
                    rating={m.rating}
                    onClick={() => handleMovieClick(m)}
                  />
                ))}
              </div>
              {user && (
                <div className="text-center pt-2 pb-4">
                  <Link
                    to={`/watched/${user.uid}`}
                    state={{ backTo: '/movies?section=watched', backLabel: 'Back to discover' }}
                    className="text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500 px-6 py-2 rounded-lg transition-colors inline-block"
                  >
                    View all →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <NotFound
              title={WATCHED_NONE.title}
              subtitle={WATCHED_NONE.subtitle}
              scene={WATCHED_NONE.scene}
            />
          )}
        </>
      )}

      {/* Quick action modal — only meaningful for logged-in users */}
      {user && (
        <QuickActionModal
          isOpen={!!quickActionMovie}
          onClose={() => setQuickActionMovie(null)}
          movie={quickActionMovie}
          user={user}
          watched={watched}
          setWatched={setWatched}
        />
      )}
    </div>
  );
}

// Shared poster grid for discover results
function MovieGrid({ movies, watched, onQuickAction }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {movies.map((m) => (
        <MoviePosterTile
          key={m.tmdbId}
          movie={m}
          isSeen={watched.has(m.tmdbId)}
          onClick={() => onQuickAction(m)}
        />
      ))}
    </div>
  );
}
