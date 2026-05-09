import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { posterUrl } from '../lib/tmdb';
import {
  getUserAllProgress, getListMovies, getList,
  markWatchedStandalone, unmarkWatchedStandalone, getWatchedInfo,
  getAllWatchedTmdbIds, notifyFriends, getFriendReviewsForMovie,
  getMovieReviewStats, getHype, setHype, deleteHype,
} from '../lib/firestore';
import StarRating from '../components/StarRating';
import BackButton from '../components/BackButton';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { MOVIE_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyReaddTransmission from '../assets/images/arcy-poses/arcy-read-transmission.png';
import RatingModal from '../components/modal/RatingModal';
import AddToListModal from '../components/modal/AddToListModal';
import QuickActionModal from '../components/modal/QuickActionModal';
import FriendReviewsCarousel from '../components/FriendReviewsCarousel';
import MovieActionsMenu from '../components/movie/MovieActionsMenu';
import SiteReviews from '../components/movie/SiteReviews';
import MoviePlot from '../components/movie/MoviePlot';
import LoginPrompt from '../components/auth/LoginPrompt';

export default function MovieDetail() {
  const { tmdbId } = useParams();

  const { user } = useAuth();
  const [movie, setMovie] = useState(null);
  const [fullDetails, setFullDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [myLists, setMyLists] = useState([]); // lists I'm on that contain this movie
  const [standaloneWatched, setStandaloneWatched] = useState(null);
  const [ratingModal, setRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [friendReviews, setFriendReviews] = useState([]);
  const [addListModal, setAddListModal] = useState(false);
  const [reviewStats, setReviewStats] = useState(null);
  const [reviewsKey, setReviewsKey] = useState(0); // bump to force SiteReviews refetch
  const [loginPromptMessage, setLoginPromptMessage] = useState(null);
  const [recommendQuickAction, setRecommendQuickAction] = useState(null);
  const [recommendWatched, setRecommendWatched] = useState(new Set());
  const [hypeData, setHypeData] = useState(null);
  const [hypeBusy, setHypeBusy] = useState(false);
  const reviewsRef = useRef(null);
  const { showToast } = useToast();

  function requireAuth(handler, message) {
    return () => {
      if (user) handler();
      else setLoginPromptMessage(message || 'Sign in to continue.');
    };
  }

  useEffect(() => {
    loadMovie();
  }, [tmdbId]);

  useEffect(() => {
    if (user && tmdbId) loadUserData();
  }, [user, tmdbId]);

  useEffect(() => {
    if (!user || !tmdbId) return;
    getFriendReviewsForMovie(user.uid, tmdbId).then(setFriendReviews).catch(() => {});
  }, [user, tmdbId]);

  useEffect(() => {
    if (!tmdbId) return;
    getMovieReviewStats(tmdbId).then(setReviewStats).catch(() => {});
  }, [tmdbId, reviewsKey]);

  useEffect(() => {
    if (!user) return;
    getAllWatchedTmdbIds(user.uid).then(setRecommendWatched).catch(() => {});
  }, [user, reviewsKey]);

  useEffect(() => {
    if (!user || !tmdbId) { setHypeData(null); return; }
    getHype(user.uid, tmdbId).then(setHypeData).catch(() => {});
  }, [user, tmdbId]);

  async function handleHypeChange(newHype) {
    if (hypeBusy || isWatched) return;
    setHypeBusy(true);
    try {
      if (newHype > 0) {
        await setHype(user.uid, tmdbId, newHype, getMovieData());
        setHypeData({ hype: newHype });
      } else {
        await deleteHype(user.uid, tmdbId);
        setHypeData(null);
      }
    } finally {
      setHypeBusy(false);
    }
  }

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

  async function handleMarkWatched() {
    await markWatchedStandalone(user.uid, tmdbId, {
      rating: rating,
      note: note.trim() || null,
      movieData: getMovieData(),
    });
    setRatingModal(false);
    loadUserData();
    setReviewsKey((k) => k + 1);
    showWatchedToast(!!rating);
    notifyFriends(user.uid, 'watched_movie', {
      movieTitle: movie?.title || null,
      tmdbId: Number(tmdbId) || null,
      posterPath: movie?.poster_path || movie?.posterPath || null,
      rating: rating || null,
      note: note.trim() || null,
    });
  }

  function openMarkWatchedModal() {
    setRating(displayRating || 0);
    setNote(displayNote || '');
    setRatingModal(true);
  }

  function scrollToReviews() {
    reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!movie || !fullDetails) {
    return <NotFound title={MOVIE_NOT_FOUND.title} subtitle={MOVIE_NOT_FOUND.subtitle} scene={MOVIE_NOT_FOUND.scene} />;
  }

  const directors = fullDetails.credits?.crew?.filter((c) => c.job === 'Director') || [];
  const cast = (fullDetails.credits?.cast || []).slice(0, 10);
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
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold text-white">
              {movie.title} {movie.year && <span className="text-gray-400 font-normal">({movie.year})</span>}
            </h1>
            <MovieActionsMenu
              isWatched={isWatched}
              onAddToList={requireAuth(() => setAddListModal(true), 'Sign in to add movies to your lists.')}
              onMarkWatched={requireAuth(openMarkWatchedModal, 'Sign in to rate movies.')}
            />
          </div>
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
          {reviewStats?.count > 0 ? (
            <button
              onClick={scrollToReviews}
              className="text-sm text-gray-400 mt-1 hover:text-white transition-colors"
            >
              <span className="text-green-400 font-medium">{reviewStats.scorePct}%</span>{' '}
              <span className="text-gray-500">
                ({reviewStats.count} {reviewStats.count === 1 ? 'review' : 'reviews'})
              </span>
            </button>
          ) : (
            !isWatched && (
              <button
                onClick={requireAuth(openMarkWatchedModal, 'Sign in to be the first to rate.')}
                className="text-sm text-gray-500 mt-1 hover:text-purple-400 transition-colors italic"
              >
                Be the first to rate
              </button>
            )
          )}
          {user && !isWatched && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Your hype</span>
              <StarRating
                value={hypeData?.hype || 0}
                onChange={handleHypeChange}
                size="md"
              />
            </div>
          )}
          {user && isWatched && hypeData?.hype > 0 && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Hyped</span>
              <StarRating value={hypeData.hype} size="sm" />
              <span className="text-[10px] uppercase tracking-wide text-gray-600">frozen</span>
            </div>
          )}
          {directors.length > 0 && (
            <p className="text-sm text-gray-400 mt-2">
              Directed by{' '}
              {directors.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <Link to={`/actor/${d.id}`} className="text-white hover:text-purple-400 transition-colors">
                    {d.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <p className="text-gray-300 text-sm leading-relaxed hidden sm:block">{movie.overview}</p>
        </div>
      </div>
      {movie.overview && (
        <p className="text-gray-300 text-sm leading-relaxed sm:hidden">{movie.overview}</p>
      )}

      <MoviePlot tmdbId={tmdbId} title={movie.title} year={movie.year} />

      {(() => {
        const onlyFriends = friendReviews.filter((r) => r.profile.uid !== user?.uid);
        if (onlyFriends.length === 0) return null;
        return (
          <FriendReviewsCarousel
            reviews={onlyFriends}
            movieTitle={movie.title}
            posterPath={movie.posterPath}
          />
        );
      })()}

      {/* Site reviews (replaces Cast) */}
      <SiteReviews
        ref={reviewsRef}
        tmdbId={tmdbId}
        stats={reviewStats}
        refreshKey={reviewsKey}
      />

      {cast.length > 0 && (
        <div>
          <h2 className="text-md font-medium text-gray-400 mb-2">Cast</h2>
          <div className="space-y-2">
            {cast.map((c) => (
              <Link
                key={c.id}
                to={`/actor/${c.id}`}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-purple-500 rounded-lg px-3 py-2 transition-colors"
              >
                {c.profile_path ? (
                  <img src={posterUrl(c.profile_path, 'w92')} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{c.name}</p>
                  {c.character && <p className="text-gray-500 text-xs truncate">as {c.character}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <h2 className="text-md font-medium text-gray-400 mb-2">Similar Movies</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {recommendations.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => {
                  if (!user) return setLoginPromptMessage('Sign in to rate this movie.');
                  setRecommendQuickAction({
                    tmdbId: String(r.id),
                    title: r.title,
                    posterPath: r.poster_path,
                    year: r.release_date ? r.release_date.slice(0, 4) : '',
                    overview: r.overview || '',
                    genreIds: r.genre_ids || [],
                  });
                }}
                className="group text-left"
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
              </button>
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
          setReviewsKey((k) => k + 1);
        }}
      />

      <AddToListModal
        isOpen={addListModal}
        onClose={() => setAddListModal(false)}
        movie={movie}
        user={user}
        onChanged={loadUserData}
      />

      <LoginPrompt
        isOpen={!!loginPromptMessage}
        onClose={() => setLoginPromptMessage(null)}
        message={loginPromptMessage || undefined}
      />

      {user && (
        <QuickActionModal
          isOpen={!!recommendQuickAction}
          onClose={() => setRecommendQuickAction(null)}
          movie={recommendQuickAction}
          user={user}
          watched={recommendWatched}
          setWatched={setRecommendWatched}
        />
      )}
    </div>
  );
}
