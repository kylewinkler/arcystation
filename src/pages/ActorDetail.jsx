import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPersonDetails, posterUrl } from '../lib/tmdb';
import { getAllWatchedTmdbIds } from '../lib/firestore';
import BackButton from '../components/BackButton';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import MoviePosterTile from '../components/movies/MoviePosterTile';
import QuickActionModal from '../components/modal/QuickActionModal';

const ACTOR_NOT_FOUND = {
  title: 'Arcy can\'t find this performer.',
  subtitle: 'Their record may have drifted from the archive.',
  scene: 'window',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function groupByYear(films) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map();
  for (const f of films) {
    const isUpcoming = !f.releaseDate || f.releaseDate > today;
    const key = isUpcoming ? 'Upcoming' : f.year;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  if (groups.has('Upcoming')) {
    groups.get('Upcoming').sort((a, b) => {
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return a.releaseDate.localeCompare(b.releaseDate);
    });
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === 'Upcoming') return -1;
    if (b === 'Upcoming') return 1;
    return b.localeCompare(a);
  });
}

export default function ActorDetail() {
  const { personId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [watched, setWatched] = useState(new Set());
  const [quickActionMovie, setQuickActionMovie] = useState(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    getPersonDetails(personId)
      .then(setPerson)
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [personId]);

  useEffect(() => {
    if (!user) return;
    getAllWatchedTmdbIds(user.uid).then(setWatched).catch(() => {});
  }, [user]);

  function handleMovieClick(movie) {
    if (user) setQuickActionMovie(movie);
    else navigate(`/movie/${movie.tmdbId}`);
  }

  if (loading) return <LoadingScreen />;
  if (!person) return <NotFound title={ACTOR_NOT_FOUND.title} subtitle={ACTOR_NOT_FOUND.subtitle} scene={ACTOR_NOT_FOUND.scene} />;

  const grouped = groupByYear(person.filmography);
  const popular = [...person.filmography]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackButton />

      <div className="flex gap-6">
        {person.profilePath ? (
          <img
            src={posterUrl(person.profilePath, 'w342')}
            alt=""
            className="w-40 h-60 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="w-40 h-60 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600">
            No photo
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">{person.name}</h1>
          {person.biography && (
            <div className="mt-3 hidden sm:block">
              <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-line ${bioExpanded ? '' : 'line-clamp-[9]'}`}>
                {person.biography}
              </p>
              {(person.biography.length > 400) && (
                <button
                  onClick={() => setBioExpanded((v) => !v)}
                  className="text-xs text-purple-400 hover:text-purple-300 mt-1"
                >
                  {bioExpanded ? 'See less' : 'See more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {person.biography && (
        <div className="sm:hidden">
          <p className={`text-gray-300 text-sm leading-relaxed whitespace-pre-line ${bioExpanded ? '' : 'line-clamp-[9]'}`}>
            {person.biography}
          </p>
          {(person.biography.length > 400) && (
            <button
              onClick={() => setBioExpanded((v) => !v)}
              className="text-xs text-purple-400 hover:text-purple-300 mt-1"
            >
              {bioExpanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      )}

      {popular.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {popular.map((m) => (
            <MoviePosterTile
              key={m.tmdbId}
              movie={m}
              isSeen={watched.has(m.tmdbId)}
              onClick={() => handleMovieClick(m)}
            />
          ))}
        </div>
      )}

      {grouped.length > 0 ? (
        <div className="space-y-6">
          {grouped.map(([year, films]) => (
            <section key={year}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {year}
              </h2>
              <ul className="divide-y divide-gray-800">
                {films.map((m) => (
                  <li key={m.tmdbId}>
                    <button
                      onClick={() => handleMovieClick(m)}
                      className="w-full flex items-center gap-3 py-2 text-left hover:bg-gray-800/40 rounded-md px-2 -mx-2 transition-colors"
                    >
                      {m.posterPath ? (
                        <img
                          src={posterUrl(m.posterPath, 'w92')}
                          alt=""
                          className={`w-10 h-14 rounded object-cover shrink-0 ${watched.has(m.tmdbId) ? 'shadow-[0_0_6px_var(--color-watched-glow)]' : ''}`}
                        />
                      ) : (
                        <div className="w-10 h-14 rounded bg-gray-800 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white truncate">{m.title}</p>
                        {(m.character || m.releaseDate) && (
                          <p className="text-gray-500 text-xs truncate">
                            {[m.character && `as ${m.character}`, formatDate(m.releaseDate)].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No films on record.</p>
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
