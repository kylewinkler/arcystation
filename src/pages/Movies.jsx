import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { searchMovies, discoverMovies } from '../lib/tmdb';
import {
  getAllWatchedTmdbIds,
  getLatestReviewedMovies,
  getMostReviewedMovies,
  getHighestRatedMovies,
  getLowestRatedMovies,
} from '../lib/firestore';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { DISCOVER_NO_RESULTS } from '../lib/copy/empty';
import MoviePosterTile from '../components/movies/MoviePosterTile';
import QuickActionModal from '../components/modal/QuickActionModal';

const SECTIONS = [
  { key: 'movies', label: 'Movies' },
  { key: 'reviews', label: 'Reviews' },
];

const MOVIE_PILLS = [
  { key: 'popular', label: 'Popular' },
  { key: 'now_playing', label: 'Now Playing' },
  { key: 'top_rated', label: 'Top Rated' },
  { key: 'upcoming', label: 'Upcoming' },
];

const REVIEW_PILLS = [
  { key: 'latest_reviewed', label: 'Latest' },
  { key: 'most_reviewed', label: 'Most Reviewed' },
  { key: 'highest_rated', label: 'Highest' },
  { key: 'lowest_rated', label: 'Lowest' },
];

const REVIEW_FETCHERS = {
  latest_reviewed: getLatestReviewedMovies,
  most_reviewed: getMostReviewedMovies,
  highest_rated: getHighestRatedMovies,
  lowest_rated: getLowestRatedMovies,
};

const STORAGE_KEY = 'movies_discover_state_v4';
const SCROLL_KEY = 'movies_scroll_y';

function getSavedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function Movies() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Inbound navigation can force a specific section/pill via Link state —
  // e.g. "View more" on Home's Popular Right Now sends users to the Movies
  // section + Popular pill no matter what their session-saved preference was.
  const forcedSection = location.state?.section;
  const forcedPill = location.state?.pill;
  const hasForceOverride = !!forcedSection;

  const [restored] = useState(() => getSavedState());
  // When a section is forced, ignore any restored movie list — it belongs to
  // a different section/pill and would flash the wrong content while we wait
  // for the fresh fetch to land.
  const didRestore = !hasForceOverride && !!restored?.movies?.length;
  const hasRestoredScroll = useRef(false);

  const [section, setSection] = useState(forcedSection || restored?.section || null);
  const [moviesPill, setMoviesPill] = useState(
    forcedSection === 'movies' && forcedPill
      ? forcedPill
      : (restored?.moviesPill || 'popular')
  );
  const [reviewsPill, setReviewsPill] = useState(
    forcedSection === 'reviews' && forcedPill
      ? forcedPill
      : (restored?.reviewsPill || 'latest_reviewed')
  );
  const [movies, setMovies] = useState(hasForceOverride ? [] : (restored?.movies || []));
  const [loading, setLoading] = useState(hasForceOverride || !restored?.movies?.length);
  const [search, setSearch] = useState(hasForceOverride ? '' : (restored?.search || ''));
  const [watched, setWatched] = useState(new Set());
  const searchDebounce = useRef(null);
  const mountedRef = useRef(false);

  const [quickActionMovie, setQuickActionMovie] = useState(null);

  const activePill = section === 'reviews' ? reviewsPill : moviesPill;
  const pillsForSection = section === 'reviews' ? REVIEW_PILLS : MOVIE_PILLS;

  function handleMovieClick(movie) {
    if (user) {
      setQuickActionMovie(movie);
    } else {
      navigate(`/movie/${movie.tmdbId}`);
    }
  }

  function setPill(pillKey) {
    if (section === 'reviews') setReviewsPill(pillKey);
    else setMoviesPill(pillKey);
  }

  // Once auth resolves, fix the default section if the user didn't have one
  // restored from session — logged-in users land on Reviews, everyone else
  // on Movies. We never auto-flip after this initial decision, so a
  // mid-session login doesn't yank the user off their chosen section.
  useEffect(() => {
    if (authLoading || section) return;
    setSection(user ? 'reviews' : 'movies');
  }, [authLoading, user, section]);

  useEffect(() => {
    if (user) getAllWatchedTmdbIds(user.uid).then(setWatched);
  }, [user]);

  useEffect(() => {
    if (!mountedRef.current || !section) return;
    if (search.trim()) return;
    loadTab();
  }, [section, moviesPill, reviewsPill]);

  useEffect(() => {
    if (!mountedRef.current || !section) return;
    clearTimeout(searchDebounce.current);
    if (!search.trim()) {
      loadTab();
      return;
    }
    searchDebounce.current = setTimeout(() => loadSearch(), 300);
  }, [search]);

  useEffect(() => {
    mountedRef.current = true;
    if (!didRestore && section) loadTab();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!mountedRef.current || loading || !section) return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      section, moviesPill, reviewsPill, movies, search,
    }));
  }, [movies, section, moviesPill, reviewsPill, search, loading]);

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
      if (section === 'reviews') {
        const fetcher = REVIEW_FETCHERS[reviewsPill];
        setMovies(await fetcher(40));
      } else {
        const { movies: results } = await discoverMovies({ tab: moviesPill, page: 1 });
        setMovies(results);
      }
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

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search movies..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
      />

      {!search.trim() && section && (
        <div className="space-y-3">
          <div className="flex gap-1 bg-gray-800/50 rounded-lg p-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  section === s.key
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {pillsForSection.map((p) => (
              <button
                key={p.key}
                onClick={() => setPill(p.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                  activePill === p.key
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
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
