import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { posterUrl } from '../lib/tmdb';
import {
  getUserAllProgress, getListMovies, getList,
  markWatchedStandalone, unmarkWatchedStandalone, getWatchedInfo,
  getAllWatchedTmdbIds, notifyFriends, getFriendReviewsForMovie,
  getMovieReviewStats,
} from '../lib/firestore';
import BackButton from '../components/BackButton';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { MOVIE_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyReaddTransmission from '../assets/images/arcy-poses/arcy-read-transmission.png';
import RatingModal from '../components/modal/RatingModal';
import AddToListModal from '../components/modal/AddToListModal';
import PlotModal from '../components/modal/PlotModal';
import FriendReviewsCarousel from '../components/FriendReviewsCarousel';
import MovieActionsMenu from '../components/movie/MovieActionsMenu';
import SiteReviews from '../components/movie/SiteReviews';
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
  const [plotModal, setPlotModal] = useState(false);
  const [reviewStats, setReviewStats] = useState(null);
  const [reviewsKey, setReviewsKey] = useState(0); // bump to force SiteReviews refetch
  const [loginPromptMessage, setLoginPromptMessage] = useState(null);
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
              onViewPlot={() => setPlotModal(true)}
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
      {cast.length > 0 && (
        <p className="text-sm text-gray-400">
          Starring <span className="text-white">{cast.map((c) => c.name).join(', ')}</span>
        </p>
      )}

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
            {myLists.map(({ list }, i) => (
              <span key={list.id}>
                {i > 0 && ', '}
                <Link to={`/lists/${list.id}`} className="text-gray-300 hover:text-purple-400 transition-colors">
                  {list.title}
                </Link>
              </span>
            ))}
            {user && (
              <button
                onClick={() => setAddListModal(true)}
                className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-700 text-gray-400 hover:text-purple-400 hover:border-purple-500 transition-colors align-middle"
                aria-label="Add to another list"
                title="Add to another list"
              >
                <span className="text-sm leading-none">+</span>
              </button>
            )}
          </p>
        </div>
      )}

      {/* Site reviews (replaces Cast) */}
      <SiteReviews
        ref={reviewsRef}
        tmdbId={tmdbId}
        stats={reviewStats}
        refreshKey={reviewsKey}
      />

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

      <PlotModal
        isOpen={plotModal}
        onClose={() => setPlotModal(false)}
        tmdbId={tmdbId}
        title={movie.title}
        year={movie.year}
      />

      <LoginPrompt
        isOpen={!!loginPromptMessage}
        onClose={() => setLoginPromptMessage(null)}
        message={loginPromptMessage || undefined}
      />
    </div>
  );
}
