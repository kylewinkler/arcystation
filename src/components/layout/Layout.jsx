import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { searchMulti, posterUrl } from '../../lib/tmdb';
import { getAllWatchedTmdbIds, searchUsersByName } from '../../lib/firestore';
import NotificationBadge from '../notifications/NotificationBadge';
import QuickActionModal from '../modal/QuickActionModal';
import ArcyPop from '../../assets/images/arcy-poses/arcy-popcorn.png';

const ROLE_LABELS = {
  Acting: 'Actor',
  Directing: 'Director',
  Editing: 'Editor',
  Writing: 'Writer',
  Production: 'Producer',
  Camera: 'Cinematographer',
  Sound: 'Sound',
  'Visual Effects': 'VFX',
  Art: 'Art',
  'Costume & Make-Up': 'Costume',
  Lighting: 'Lighting',
  Crew: 'Crew',
};

export default function Layout({ children }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [quickActionMovie, setQuickActionMovie] = useState(null);
  const [watched, setWatched] = useState(new Set());
  const inputRef = useRef(null);
  const navRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (user) getAllWatchedTmdbIds(user.uid).then(setWatched);
  }, [user]);

  function openSearch() {
    flushSync(() => setSearchOpen(true));
    inputRef.current?.focus();
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [tmdbRes, userRes] = await Promise.all([
          searchMulti(query),
          user ? searchUsersByName(query) : Promise.resolve([]),
        ]);
        const users = userRes
          .filter((u) => u.uid !== user?.uid)
          .slice(0, 3)
          .map((u) => ({
            kind: 'user',
            uid: u.uid,
            displayName: u.displayName,
            photoURL: u.photoURL,
          }));
        const remaining = Math.max(8 - users.length, 1);
        setResults([...users, ...tmdbRes.slice(0, remaining)]);
      } catch (err) {
        console.error('Search failed:', err);
      }
      setSearching(false);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, user]);

  useEffect(() => {
    if (!searchOpen) return;
    function onClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        closeSearch();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    setResults([]);
  }

  function handleResultClick(item) {
    if (item.kind === 'user') {
      navigate(`/user/${item.uid}`);
    } else if (item.kind === 'person') {
      navigate(`/actor/${item.personId}`);
    } else if (user) {
      setQuickActionMovie(item);
    } else {
      navigate(`/movie/${item.tmdbId}`);
    }
    closeSearch();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') closeSearch();
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav ref={navRef} className="border-b border-gray-800 bg-gray-900 relative">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
        <Link
          to="/"
          className="flex items-center gap-2 text-xl font-bold text-white hover:text-purple-400 transition-colors shrink-0"
        >
          <img
          src={ArcyPop}
          alt="arcy logo popcorn"
          className="h-9 w-auto -translate-y-[1px]"
        />
          <span className={searchOpen ? 'hidden sm:inline' : ''}>Arcy Station</span>
        </Link>
          {!searchOpen && (
            <div className="flex items-center gap-4">
              <button
                onClick={openSearch}
                className="text-gray-300 hover:text-white transition-colors"
                aria-label="Search movies"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                </svg>
              </button>
              <NavLink to="/movies" className={({ isActive }) => `transition-colors ${isActive ? 'text-purple-400' : 'text-gray-300 hover:text-white'}`} aria-label="Movies">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
              </NavLink>
              {user ? (
                <>
                  <NavLink to="/friends" className={({ isActive }) => `relative transition-colors ${isActive ? 'text-purple-400' : 'text-gray-300 hover:text-white'}`} aria-label="Friends">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <NotificationBadge />
                  </NavLink>
                  <NavLink to={`/user/${user.uid}`} className={({ isActive }) => `flex items-center gap-2 text-sm transition-colors ${isActive ? 'text-purple-400' : 'text-gray-300 hover:text-white'}`}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                        {user.displayName?.[0] || '?'}
                      </div>
                    )}
                  </NavLink>
                </>
              ) : (
                <button
                  onClick={() => login().catch((err) => console.error('Sign-in failed:', err))}
                  className="text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 transition-colors rounded-lg px-3 py-1.5"
                >
                  Sign In
                </button>
              )}
            </div>
          )}
          {searchOpen && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search movies..."
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={closeSearch}
                className="text-gray-400 hover:text-white p-1 shrink-0"
                aria-label="Close search"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {searchOpen && query.trim() && (
          <div className="absolute left-0 right-0 top-full bg-gray-900 border-b border-gray-800 shadow-lg z-40">
            <div className="mx-auto max-w-5xl px-4 py-2">
              {searching && results.length === 0 ? (
                <p className="text-sm text-gray-500 px-2 py-3">Searching...</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-gray-500 px-2 py-3">No results</p>
              ) : (
                <ul className="max-h-[60vh] overflow-y-auto">
                  {results.map((item) => {
                    if (item.kind === 'user') {
                      return (
                        <li key={`user-${item.uid}`}>
                          <button
                            onClick={() => handleResultClick(item)}
                            className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                          >
                            {item.photoURL ? (
                              <img
                                src={item.photoURL}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                                {item.displayName?.[0] || '?'}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white truncate">{item.displayName}</p>
                              <p className="text-xs text-gray-500">User</p>
                            </div>
                          </button>
                        </li>
                      );
                    }
                    if (item.kind === 'person') {
                      return (
                        <li key={`person-${item.personId}`}>
                          <button
                            onClick={() => handleResultClick(item)}
                            className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                          >
                            {item.profilePath ? (
                              <img
                                src={posterUrl(item.profilePath, 'w92')}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gray-800 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-white truncate">{item.name}</p>
                              <p className="text-xs text-gray-500">{ROLE_LABELS[item.knownForDepartment] || item.knownForDepartment || 'Person'}</p>
                            </div>
                          </button>
                        </li>
                      );
                    }
                    const isSeen = watched.has(item.tmdbId);
                    return (
                      <li key={`movie-${item.tmdbId}`}>
                        <button
                          onClick={() => handleResultClick(item)}
                          className="w-full flex items-center gap-3 px-2 py-2 hover:bg-gray-800 rounded-lg transition-colors text-left"
                        >
                          {item.posterPath ? (
                            <img
                              src={posterUrl(item.posterPath, 'w92')}
                              alt=""
                              className={`w-9 h-14 rounded object-cover shrink-0 ${isSeen ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : ''}`}
                            />
                          ) : (
                            <div className={`w-9 h-14 rounded bg-gray-800 shrink-0 ${isSeen ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : ''}`} />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-white truncate">{item.title}</p>
                            {item.year && <p className="text-xs text-gray-500">{item.year}</p>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>

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
