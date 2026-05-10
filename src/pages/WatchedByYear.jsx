import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getUserProfile, getAllWatchedMovies, getAllWatchedTmdbIds } from '../lib/firestore';
import { getGenreList } from '../lib/tmdb';
import WatchedPoster from '../components/movies/WatchedPoster';
import ReviewModal from '../components/modal/ReviewModal';
import ProfileHeader from '../components/profile/ProfileHeader';
import BackButton from '../components/BackButton';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { WATCHED_NO_MATCHES, WATCHED_NONE } from '../lib/copy/empty';

const PAGE_SIZE = 60;

export default function WatchedByYear() {
  const { uid, year: urlYear } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [allMovies, setAllMovies] = useState([]);
  const [genreMap, setGenreMap] = useState({});
  const [selectedYear, setSelectedYear] = useState(urlYear || 'all');
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [myWatchedIds, setMyWatchedIds] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isOwner = user?.uid === uid;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [prof, watched, genres, myIds] = await Promise.all([
        getUserProfile(uid),
        getAllWatchedMovies(uid),
        getGenreList(),
        user ? getAllWatchedTmdbIds(user.uid) : Promise.resolve(new Set()),
      ]);
      setProfile(prof);
      setAllMovies(watched);
      setGenreMap(genres);
      setMyWatchedIds(myIds);
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

  // Apply search + genre filters + sort
  const filtered = yearFiltered
    .filter((m) => {
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedGenre && !(m.genreIds || []).includes(Number(selectedGenre))) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'rating_desc') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'rating_asc') return (a.rating || 0) - (b.rating || 0);
      return 0;
    });

  // Reset visible window when filter/sort inputs change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedYear, selectedGenre, sortBy]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleYearChange = (val) => {
    setSelectedYear(val);
    setSelectedGenre('');
    navigate(`/watched/${uid}/${val}`, { replace: true });
  };

  if (loading) {
    return <LoadingScreen/>;
  }

  if (!profile) {
    return <NotFound title="User not found" subtitle="" scene={null} />;
  }

  // Privacy gate — only owners and the profile owner themselves see private
  // archives. Friends would also see, but checking friendship here would mean
  // an extra round-trip; we keep it simple: profiles flipped to private hide
  // their watched archive from non-owners.
  const isProfilePublic = profile.isPublic !== false;
  if (!isProfilePublic && !isOwner) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <BackButton to={`/user/${uid}`} label={`Back to ${profile.displayName}`} />
        <ProfileHeader profile={profile} isOwner={false} />
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">This profile is private.</p>
        </div>
      </div>
    );
  }

  const yearLabel = selectedYear === 'all' ? '' : ` ${selectedYear}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <BackButton
        to={location.state?.backTo || `/user/${uid}`}
        label={location.state?.backLabel || (isOwner ? 'Back to profile' : `Back to ${profile?.displayName}`)}
      />
      <ProfileHeader profile={profile} isOwner={isOwner} />
      <p className="text-sm text-gray-500">{yearFiltered.length} movies watched</p>

      {/* Filters */}
      <div className="space-y-2 sm:space-y-0 sm:flex sm:gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title..."
          className="w-full sm:flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-purple-500"
        />
        <div className={`grid gap-2 sm:flex ${sortedGenres.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
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
              className="min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">All genres</option>
              {sortedGenres.map(([gid, name]) => (
                <option key={gid} value={gid}>{name}</option>
              ))}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
          >
            <option value="recent">Recent</option>
            <option value="rating_desc">Top rated</option>
            <option value="rating_asc">Lowest rated</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      {(search || selectedGenre) && (
        <p className="text-sm text-gray-500">
          Showing {filtered.length} of {yearFiltered.length}
        </p>
      )}

      {/* Movie grid */}
      {filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 items-start">
            {visible.map((m) => (
              <WatchedPoster
                key={m.tmdbId}
                tmdbId={m.tmdbId}
                title={m.title}
                posterPath={m.posterPath}
                rating={m.rating}
                glow={myWatchedIds.has(m.tmdbId)}
                onClick={() => setSelected(m)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="text-center pt-2 pb-4">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="text-sm text-purple-400 hover:text-purple-300 border border-gray-700 hover:border-purple-500 px-6 py-2 rounded-lg transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </>
      ) : (
        <NotFound
          title={search || selectedGenre ? WATCHED_NO_MATCHES.title : WATCHED_NONE.title}
          subtitle={search || selectedGenre ? WATCHED_NO_MATCHES.subtitle : WATCHED_NONE.subtitle}
          scene={search || selectedGenre ? WATCHED_NO_MATCHES.scene : WATCHED_NONE.scene}
        />
      )}

      <ReviewModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        movie={selected}
        reviewerProfile={profile}
        onReactionChange={(newReactions) => {
          setSelected((prev) => (prev ? { ...prev, reactions: newReactions } : prev));
          setAllMovies((prev) => prev.map((mv) =>
            mv.tmdbId === selected?.tmdbId ? { ...mv, reactions: newReactions } : mv
          ));
        }}
        onEdit={({ rating, note, reactions }) => {
          setSelected((prev) => (prev ? { ...prev, rating, note, reactions } : prev));
          setAllMovies((prev) => prev.map((mv) =>
            mv.tmdbId === selected?.tmdbId ? { ...mv, rating, note, reactions } : mv
          ));
        }}
      />
    </div>
  );
}
