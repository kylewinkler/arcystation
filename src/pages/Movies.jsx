import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchMovies, getRecommendations } from '../lib/tmdb';
import {
  getAllWatchedTmdbIds,
  getAllWatchedMovies,
  getLatestReviewedMovies,
  getMostReviewedMovies,
  getHighestRatedMovies,
  getLowestRatedMovies,
} from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { DISCOVER_NO_RESULTS } from '../lib/copy/empty';
import SuggestionCard from '../components/movies/SuggestionCard';
import MoviePosterTile from '../components/movies/MoviePosterTile';
import QuickActionModal from '../components/modal/QuickActionModal';

const DISCOVER_TABS = [
  { key: 'latest_reviewed', label: 'Latest' },
  { key: 'most_reviewed', label: 'Popular' },
  { key: 'highest_rated', label: 'Highest' },
  { key: 'lowest_rated', label: 'Lowest' },
];

const TAB_FETCHERS = {
  latest_reviewed: getLatestReviewedMovies,
  most_reviewed: getMostReviewedMovies,
  highest_rated: getHighestRatedMovies,
  lowest_rated: getLowestRatedMovies,
};

const STORAGE_KEY = 'movies_discover_state_v3';
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

  const [restored] = useState(() => getSavedState());
  const didRestore = !!restored?.movies?.length;
  const hasRestoredScroll = useRef(false);

  const [tab, setTab] = useState(restored?.tab || 'latest_reviewed');
  const [movies, setMovies] = useState(restored?.movies || []);
  const [loading, setLoading] = useState(!didRestore);
  const [search, setSearch] = useState(restored?.search || '');
  const [watched, setWatched] = useState(new Set());
  const [recs, setRecs] = useState([]);
  const [recsLoaded, setRecsLoaded] = useState(false);
  const [recSeedTitle, setRecSeedTitle] = useState('');
  const searchDebounce = useRef(null);
  const mountedRef = useRef(false);

  const [quickActionMovie, setQuickActionMovie] = useState(null);

  function handleMovieClick(movie) {
    if (user) {
      setQuickActionMovie(movie);
    } else {
      navigate(`/movie/${movie.tmdbId}`);
    }
  }

  useEffect(() => {
    if (user) getAllWatchedTmdbIds(user.uid).then(setWatched);
  }, [user]);

  useEffect(() => {
    if (!user || recsLoaded) return;
    getAllWatchedMovies(user.uid).then(async (all) => {
      if (all.length === 0) { setRecsLoaded(true); return; }
      const rated = all.filter((m) => m.rating > 0).sort((a, b) => b.rating - a.rating);
      const seed = rated[0] || all[Math.floor(Math.random() * all.length)];
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

  useEffect(() => {
    if (!mountedRef.current) return;
    if (search.trim()) return;
    loadTab();
  }, [tab]);

  useEffect(() => {
    if (!mountedRef.current) return;
    clearTimeout(searchDebounce.current);
    if (!search.trim()) {
      loadTab();
      return;
    }
    searchDebounce.current = setTimeout(() => loadSearch(), 300);
  }, [search]);

  useEffect(() => {
    mountedRef.current = true;
    if (!didRestore) loadTab();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!mountedRef.current || loading) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, movies, search }));
  }, [movies, tab, search, loading]);

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

  useEffect(() => {
    if (didRestore && movies.length > 0 && !hasRestoredScroll.current) {
      hasRestoredScroll.current = true;
      const y = parseInt(sessionStorage.getItem(SCROLL_KEY) || '0', 10);
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    }
  }, [movies]);

  async function loadTab() {
    setLoading(true);
    try {
      const fetcher = TAB_FETCHERS[tab];
      const results = await fetcher(40);
      setMovies(results);
    } catch (err) {
      console.error('Failed to load movies:', err);
    }
    setLoading(false);
  }

  async function loadSearch() {
    setLoading(true);
    try {
      const results = await searchMovies(search);
      setMovies(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Movies</h1>
        {user && (
          <Link
            to={`/watched/${user.uid}`}
            state={{ backTo: '/movies', backLabel: 'Back to movies' }}
            className="text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500 px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            My Watched
            {watched.size > 0 && (
              <span className="ml-1.5 text-xs text-purple-200/60">{watched.size}</span>
            )}
            <span className="ml-1">→</span>
          </Link>
        )}
      </div>

      {recs.length > 0 && !search.trim() && (
        <SuggestionCard
          movie={recs[0]}
          label="You might like"
          labelColor="text-purple-400/80"
          sublabel={recSeedTitle ? `because you liked ${recSeedTitle}` : undefined}
        />
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search movies..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />

      {!search.trim() && (
        <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
          {DISCOVER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <LoadingScreen />
      ) : movies.length === 0 ? (
        <NotFound title={DISCOVER_NO_RESULTS.title} subtitle={DISCOVER_NO_RESULTS.subtitle} scene={DISCOVER_NO_RESULTS.scene} />
      ) : (
        <MovieGrid movies={movies} watched={watched} onQuickAction={handleMovieClick} />
      )}

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
