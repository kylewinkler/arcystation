import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getUserProfile, getAllWatchedMovies } from '../lib/firestore';
import { getGenreList, posterUrl } from '../lib/tmdb';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { WATCHED_NO_MATCHES, WATCHED_NONE } from '../lib/copy/empty';

export default function WatchedByYear() {
  const { uid, year: urlYear } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [genreMap, setGenreMap] = useState({});
  const [selectedYear, setSelectedYear] = useState(urlYear || 'all');
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [loading, setLoading] = useState(true);

  const isOwner = user?.uid === uid;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [prof, watched, genres] = await Promise.all([
        getUserProfile(uid),
        getAllWatchedMovies(uid),
        getGenreList(),
      ]);
      setProfile(prof);
      setAllMovies(watched);
      setGenreMap(genres);
      setLoading(false);
    }
    load();
  }, [uid]);

  // Collect all years present in the data
  const yearSet = new Set();
  allMovies.forEach((m) => { if (m.year) yearSet.add(String(m.year)); });
  const years = [...yearSet].sort((a, b) => b - a);

  // Filter by year
  const yearFiltered = selectedYear === 'all'
    ? allMovies
    : allMovies.filter((m) => String(m.year) === String(selectedYear));

  // Collect genres from year-filtered set
  const availableGenres = {};
  yearFiltered.forEach((m) => {
    (m.genreIds || []).forEach((gid) => {
      if (genreMap[gid]) availableGenres[gid] = genreMap[gid];
    });
  });
  const sortedGenres = Object.entries(availableGenres).sort((a, b) => a[1].localeCompare(b[1]));

  // Apply search + genre filters
  const filtered = yearFiltered.filter((m) => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedGenre && !(m.genreIds || []).includes(Number(selectedGenre))) return false;
    return true;
  });

  const handleYearChange = (val) => {
    setSelectedYear(val);
    setSelectedGenre('');
    navigate(`/watched/${uid}/${val}`, { replace: true });
  };

  if (loading) {
    return <LoadingScreen/>;
  }

  const yearLabel = selectedYear === 'all' ? '' : ` ${selectedYear}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link to={`/user/${uid}`} className="text-sm text-purple-400 hover:text-purple-300">
          ← {isOwner ? 'Back to profile' : `Back to ${profile?.displayName}`}
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1">
          {`${profile?.displayName}'s`} Movies
        </h1>
        <p className="text-sm text-gray-500 mt-1">{yearFiltered.length} movies watched</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
        />
        <select
          value={selectedYear}
          onChange={(e) => handleYearChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        {sortedGenres.length > 0 && (
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="">All genres</option>
            {sortedGenres.map(([gid, name]) => (
              <option key={gid} value={gid}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Results count */}
      {(search || selectedGenre) && (
        <p className="text-sm text-gray-500">
          Showing {filtered.length} of {yearFiltered.length}
        </p>
      )}

      {/* Movie grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
          {filtered.map((m) => (
            <Link
              key={m.tmdbId}
              to={`/movie/${m.tmdbId}`}
              className="group"
              title={m.title}
            >
              {m.posterPath ? (
                <img
                  src={posterUrl(m.posterPath, 'w185')}
                  alt={m.title}
                  className="w-full aspect-[2/3] rounded-lg object-cover ring-1 ring-purple-500/30 group-hover:ring-purple-500 transition-all"
                />
              ) : (
                <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 ring-1 ring-purple-500/30 flex items-center justify-center">
                  <span className="text-xs text-gray-500 text-center leading-tight px-2">{m.title}</span>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1 truncate">{m.title}</p>
            </Link>
          ))}
        </div>
      ) : (
        <NotFound
          title={search || selectedGenre ? WATCHED_NO_MATCHES.title : WATCHED_NONE.title}
          subtitle={search || selectedGenre ? WATCHED_NO_MATCHES.subtitle : WATCHED_NONE.subtitle}
          scene={search || selectedGenre ? WATCHED_NO_MATCHES.scene : WATCHED_NONE.scene}
        />
      )}
    </div>
  );
}
