import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { posterUrl } from '../lib/tmdb';
import {
  getUserAllProgress, getListMovies, getList,
  getUserLists, addMovieToList, removeMovieFromList, createList, startList,
  markWatchedStandalone, unmarkWatchedStandalone, getWatchedInfo,
  getAllWatchedTmdbIds, notifyFriends, getFriendReviewsForMovie,
  getMoviePlot, saveMoviePlot,
} from '../lib/firestore';
import { fetchWikipediaPlot } from '../lib/wikipedia';
import BackButton from '../components/BackButton';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { MOVIE_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyReaddTransmission from '../assets/images/arcy-poses/arcy-read-transmission.png';
import RatingModal from '../components/modal/RatingModal';
import FriendReviewsCarousel from '../components/FriendReviewsCarousel';

export default function MovieDetail() {
  const { tmdbId } = useParams();

  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [fullDetails, setFullDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myLists, setMyLists] = useState([]); // lists I'm on that contain this movie
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [ownedLists, setOwnedLists] = useState([]); // lists I created
  const [movieOnLists, setMovieOnLists] = useState(new Set()); // listIds that have this movie
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [standaloneWatched, setStandaloneWatched] = useState(null); // from userWatched doc
  const [ratingModal, setRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [friendReviews, setFriendReviews] = useState([]);
  const [plotOpen, setPlotOpen] = useState(false);
  const [plotData, setPlotData] = useState(null);
  const [plotLoading, setPlotLoading] = useState(false);
  const addMenuRef = useRef(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadMovie();
    setPlotOpen(false);
    setPlotData(null);
  }, [tmdbId]);

  useEffect(() => {
    if (user && tmdbId) loadUserData();
  }, [user, tmdbId]);

  useEffect(() => {
    if (!user || !tmdbId) return;
    getFriendReviewsForMovie(user.uid, tmdbId).then(setFriendReviews).catch(() => {});
  }, [user, tmdbId]);

  async function loadMovie() {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${import.meta.env.VITE_TMDB_API_KEY}&append_to_response=credits,recommendations`
      );
      const data = await res.json();
      setFullDetails(data);
      setMovie({
        tmdbId: String(data.id),
        title: data.title,
        year: data.release_date ? data.release_date.slice(0, 4) : '',
        releaseDate: data.release_date || '',
        posterPath: data.poster_path,
        overview: data.overview,
      });
    } catch (err) {
      console.error('Failed to load movie:', err);
    }
    setLoading(false);
  }

  // Close popover on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    function handleClickOutside(e) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setAddMenuOpen(false);
        setNewListName('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [addMenuOpen]);

  async function loadOwnedLists() {
    const lists = await getUserLists(user.uid);
    setOwnedLists(lists);
    // Check which of my lists already have this movie
    const onLists = new Set();
    await Promise.all(
      lists.map(async (l) => {
        const movies = await getListMovies(l.id);
        if (movies.some((m) => m.tmdbId === tmdbId)) {
          onLists.add(l.id);
        }
      })
    );
    setMovieOnLists(onLists);
  }

  async function handleToggleList(listId) {
    if (movieOnLists.has(listId)) {
      await removeMovieFromList(listId, tmdbId);
      setMovieOnLists((prev) => { const s = new Set(prev); s.delete(listId); return s; });
      setMyLists((prev) => prev.filter((l) => l.list.id !== listId));
    } else {
      const movieData = {
        tmdbId,
        title: movie.title,
        posterPath: movie.posterPath,
        year: movie.year,
        releaseDate: movie.releaseDate || '',
        overview: movie.overview || '',
        genreIds: fullDetails?.genres?.map((g) => g.id) || [],
      };
      await addMovieToList(listId, movieData);
      setMovieOnLists((prev) => new Set(prev).add(listId));
      // Refresh user data to update "On your lists"
      loadUserData();
    }
  }

  async function handleCreateNewList() {
    const name = newListName.trim();
    if (!name || creatingList) return;
    setCreatingList(true);
    try {
      const listId = await createList({ title: name, description: '', createdBy: user.uid });
      // Auto-start + add movie
      const movieData = {
        tmdbId,
        title: movie.title,
        posterPath: movie.posterPath,
        year: movie.year,
        releaseDate: movie.releaseDate || '',
        overview: movie.overview || '',
        genreIds: fullDetails?.genres?.map((g) => g.id) || [],
      };
      await addMovieToList(listId, movieData);
      await startList(user.uid, listId);
      notifyFriends(user.uid, 'created_list', { listId, listTitle: name });
      setNewListName('');
      setAddMenuOpen(false);
      // Refresh
      loadOwnedLists();
      loadUserData();
    } finally {
      setCreatingList(false);
    }
  }

  async function loadUserData() {
    try {
      const [allProgress, standalone] = await Promise.all([
        getUserAllProgress(user.uid),
        getWatchedInfo(user.uid, tmdbId),
      ]);
      setStandaloneWatched(standalone);

      const listsWithMovie = [];
      await Promise.all(
        allProgress.map(async (p) => {
          const [movies, listDoc] = await Promise.all([
            getListMovies(p.listId),
            getList(p.listId),
          ]);
          if (movies.some((m) => m.tmdbId === tmdbId) && listDoc) {
            listsWithMovie.push({ list: listDoc, progress: p });
          }
        })
      );
      setMyLists(listsWithMovie);
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

  const isWatched = !!standaloneWatched;
  const displayRating = standaloneWatched?.rating;
  const displayNote = standaloneWatched?.note;

  function getMovieData() {
    return {
      tmdbId,
      title: movie?.title,
      posterPath: movie?.posterPath,
      year: movie?.year,
      overview: movie?.overview || '',
      genreIds: fullDetails?.genres?.map((g) => g.id) || [],
    };
  }

  async function showWatchedToast(hasRating) {
    const ids = await getAllWatchedTmdbIds(user.uid);
    const milestone = getMilestone(ids.size);
    if (milestone) {
      showToast({ message: `${milestone.title} ${milestone.subtitle}`, image: ArcyReaddTransmission });
    } else if (hasRating) {
      showToast({ message: randomFrom(REVIEW_REACTIONS), image: ArcyReaddTransmission });
    } else {
      showToast(randomFrom(RATING_ONLY_REACTIONS));
    }
  }

  function isPlotFresh(data, year) {
    if (!data?.fetchedAt) return false;
    const fetchedMs = data.fetchedAt.toMillis?.() ?? new Date(data.fetchedAt).getTime();
    if (!fetchedMs) return false;
    const ageDays = (Date.now() - fetchedMs) / (1000 * 60 * 60 * 24);
    const currentYear = new Date().getFullYear();
    const isRecent = !year || Number(year) >= currentYear - 1;
    return ageDays < (isRecent ? 7 : 90);
  }

  async function handleTogglePlot() {
    if (plotOpen) {
      setPlotOpen(false);
      return;
    }
    setPlotOpen(true);
    if (plotData) return;

    setPlotLoading(true);
    try {
      let data = await getMoviePlot(tmdbId);
      if (!data || !isPlotFresh(data, movie.year)) {
        data = await fetchWikipediaPlot(movie.title, movie.year);
        await saveMoviePlot(tmdbId, data).catch(() => {});
      }
      setPlotData(data);
    } catch (err) {
      console.error('Failed to load plot:', err);
      setPlotData({ error: true });
    } finally {
      setPlotLoading(false);
    }
  }

  async function handleMarkWatched() {
    await markWatchedStandalone(user.uid, tmdbId, {
      rating: rating,
      note: note.trim() || null,
      movieData: getMovieData(),
    });
    setRatingModal(false);
    loadUserData();
    showWatchedToast(!!rating);
    notifyFriends(user.uid, 'watched_movie', {
      movieTitle: movie?.title || null,
      tmdbId: Number(tmdbId) || null,
      posterPath: movie?.poster_path || movie?.posterPath || null,
      rating: rating || null,
      note: note.trim() || null,
    });
  }


  if (loading) {
    return <LoadingScreen />;
  }

  if (!movie || !fullDetails) {
    return <NotFound title={MOVIE_NOT_FOUND.title} subtitle={MOVIE_NOT_FOUND.subtitle} scene={MOVIE_NOT_FOUND.scene} />;
  }

  const directors = fullDetails.credits?.crew?.filter((c) => c.job === 'Director') || [];
  const cast = fullDetails.credits?.cast?.slice(0, 10) || [];
  const genres = fullDetails.genres || [];
  const runtime = fullDetails.runtime;
  const recommendations = fullDetails.recommendations?.results?.slice(0, 6) || [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackButton />
      <div className="flex gap-6">
        {movie.posterPath ? (
          <img
            src={posterUrl(movie.posterPath, 'w342')}
            alt=""
            className={`w-40 h-60 rounded-lg object-cover shrink-0 ${isWatched ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : ''}`}
          />
        ) : (
          <div className={`w-40 h-60 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center text-gray-600 ${isWatched ? 'shadow-[0_0_8px_var(--color-watched-glow)]' : ''}`}>
            No poster
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white">
            {movie.title} {movie.year && <span className="text-gray-400 font-normal">({movie.year})</span>}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {genres.map((g) => (
              <Link key={g.id} to={`/movies?genre=${g.id}`} className="text-xs bg-gray-800 text-gray-300 hover:text-purple-400 hover:bg-gray-700 px-2 py-1 rounded transition-colors">
                {g.name}
              </Link>
            ))}
          </div>
          {runtime > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              {Math.floor(runtime / 60)}h {runtime % 60}m
            </p>
          )}
          {fullDetails.vote_average > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              <span className="text-yellow-400">★</span> {fullDetails.vote_average.toFixed(1)}/10
              <span className="text-gray-500 ml-1">({fullDetails.vote_count?.toLocaleString()} votes)</span>
            </p>
          )}
          {directors.length > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              Directed by <span className="text-white">{directors.map((d) => d.name).join(', ')}</span>
            </p>
          )}
          <p className="text-gray-300 text-sm leading-relaxed hidden sm:block">{movie.overview}</p>
        </div>
      </div>
      {movie.overview && (
        <p className="text-gray-300 text-sm leading-relaxed sm:hidden">{movie.overview}</p>
      )}

      <div>
        <button
          onClick={handleTogglePlot}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          <span>View Plot (spoilers)</span>
          <svg
            className={`w-4 h-4 transition-transform ${plotOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {plotOpen && (
          <div className="mt-3 bg-gray-900/60 border border-gray-800 rounded-lg p-4">
            {plotLoading && (
              <p className="text-sm text-gray-500">Loading plot…</p>
            )}
            {!plotLoading && plotData?.error && (
              <p className="text-sm text-gray-500">Couldn't load the plot right now. Try again in a bit.</p>
            )}
            {!plotLoading && plotData && !plotData.error && plotData.plot && (
              <>
                <div className="space-y-3 text-gray-300 text-sm leading-relaxed">
                  {plotData.plot.split(/\n\n+/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
                {plotData.wikipediaUrl && (
                  <p className="mt-3 text-xs text-gray-500">
                    Source:{' '}
                    <a
                      href={plotData.wikipediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-purple-400 underline"
                    >
                      Wikipedia
                    </a>
                  </p>
                )}
              </>
            )}
            {!plotLoading && plotData && !plotData.error && !plotData.plot && (
              <p className="text-sm text-gray-500">
                No detailed plot found on Wikipedia for this movie.
              </p>
            )}
          </div>
        )}
      </div>

      {(() => {
        const myReview = standaloneWatched;
        const allReviews = [
          ...(myReview && user ? [{
            review: { ...myReview, tmdbId: String(tmdbId) },
            profile: { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL },
          }] : []),
          ...friendReviews.filter((r) => r.profile.uid !== user?.uid),
        ];
        if (allReviews.length === 0) return null;
        return (
          <FriendReviewsCarousel
            reviews={allReviews}
            movieTitle={movie.title}
            posterPath={movie.posterPath}
            onOwnReviewClick={() => {
              setRating(displayRating || 0);
              setNote(displayNote || '');
              setRatingModal(true);
            }}
          />
        );
      })()}


      {/* Lists I'm on that have this movie */}
      {myLists.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">On your lists</h2>
          <p className="text-sm text-gray-400">
            {myLists.map(({ list, progress }, i) => (
              <span key={list.id}>
                {i > 0 && ', '}
                <Link to={`/lists/${list.id}`} className="text-gray-300 hover:text-purple-400 transition-colors">
                  {list.title}
                </Link>
              </span>
            ))}
          </p>
        </div>
      )}


      {/* Add to list + Mark watched */}
      <div className="relative flex items-center gap-2" ref={addMenuRef}>
        {!isWatched && (
          <button
            onClick={() => { setRating(0); setNote(''); setRatingModal(true); }}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-green-400 border border-gray-700 hover:border-green-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            Mark as watched
          </button>
        )}
        
        <button
          onClick={() => {
            if (!addMenuOpen) loadOwnedLists();
            setAddMenuOpen(!addMenuOpen);
            setNewListName('');
          }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-500 px-3 py-1.5 rounded-lg transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add to new list
        </button>               
        
        {addMenuOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {ownedLists.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {ownedLists.map((l) => {
                  const isOn = movieOnLists.has(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => handleToggleList(l.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800 transition-colors text-left"
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isOn ? 'bg-purple-600 border-purple-600' : 'border-gray-600'}`}>
                        {isOn && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-white truncate">{l.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="border-t border-gray-700 p-2">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateNewList(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="New list name..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newListName.trim() || creatingList}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  Create
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {cast.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Cast</h2>
          <div className="flex flex-wrap gap-2">
            {cast.map((c) => (
              <div key={c.id} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
                {c.profile_path ? (
                  <img src={posterUrl(c.profile_path, 'w92')} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-700" />
                )}
                <div>
                  <span className="text-white text-xs">{c.name}</span>
                  {c.character && <span className="text-gray-500 text-xs ml-1">as {c.character}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Similar Movies</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {recommendations.map((r) => (
              <Link
                key={r.id}
                to={`/movie/${r.id}`}
                className="group"
              >
                {r.poster_path ? (
                  <img
                    src={posterUrl(r.poster_path, 'w185')}
                    alt=""
                    className="w-full rounded-lg object-cover group-hover:ring-2 ring-purple-500 transition-all"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-xs text-gray-600">
                    No img
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1 truncate group-hover:text-white transition-colors">{r.title}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <RatingModal
        isOpen={ratingModal}
        rating={rating}
        note={note}
        setRating={setRating}
        setNote={setNote}
        onCancel={() => setRatingModal(false)}
        onSave={handleMarkWatched}
        isExisting={isWatched}
        onDelete={async () => {
          await unmarkWatchedStandalone(user.uid, tmdbId);
          setStandaloneWatched(null);
          setRatingModal(false);
          loadUserData();
        }}
      />
    </div>
  );
}
