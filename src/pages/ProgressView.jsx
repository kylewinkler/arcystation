import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToProgress, subscribeToListMovies, subscribeToWatched,
  markWatched, unmarkWatched, getUserProfile, getList, deleteList, getWatchedInfo,
  getAllWatchedTmdbIds,
} from '../lib/firestore';
import { doc, deleteDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MovieCard from '../components/movies/MovieCard';
import ProgressBar from '../components/lists/ProgressBar';
import StarRating from '../components/StarRating';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { PROGRESS_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';

export default function ProgressView() {
  const { uid, listId } = useParams();
  const { user } = useAuth();
  const [progress, setProgress] = useState(null);
  const [movies, setMovies] = useState([]);
  const [watched, setWatched] = useState({});
  const [profile, setProfile] = useState(null);
  const [ratingModal, setRatingModal] = useState(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [listData, setListData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const { showToast } = useToast();
  const isOwner = user?.uid === uid;
  const isListOwner = listData?.createdBy === user?.uid;

  useEffect(() => {
    if (!isOwner) {
      getUserProfile(uid).then(setProfile);
    }
    getList(listId).then(setListData);
    const unsub1 = subscribeToProgress(uid, listId, (p) => {
      setProgress(p);
      setLoading(false);
    });
    const unsub2 = subscribeToListMovies(listId, setMovies);
    const unsub3 = subscribeToWatched(uid, listId, setWatched);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [uid, listId]);

  const handleToggleWatched = async (tmdbId, shouldWatch) => {
    if (shouldWatch) {
      const existing = await getWatchedInfo(uid, tmdbId);
      setRating(existing?.rating || 0);
      setNote(existing?.note || '');
      setRatingModal(tmdbId);
    } else {
      await unmarkWatched(uid, listId, tmdbId);
    }
  };

  const showWatchedToast = async (hasRating) => {
    const ids = await getAllWatchedTmdbIds(uid);
    const milestone = getMilestone(ids.size);
    if (milestone) {
      showToast({ message: `${milestone.title} ${milestone.subtitle}`, image: ArcyStar }, 5000);
    } else if (hasRating) {
      showToast({ message: randomFrom(REVIEW_REACTIONS), image: ArcyStar });
    } else {
      showToast(randomFrom(RATING_ONLY_REACTIONS));
    }
  };

  const handleSubmitRating = async () => {
    await markWatched(uid, listId, ratingModal, {
      rating: rating || null,
      note: note.trim() || null,
    });
    setRatingModal(null);
    showWatchedToast(!!rating);
  };

  const handleSkipRating = async () => {
    await markWatched(uid, listId, ratingModal);
    setRatingModal(null);
    showWatchedToast(false);
  };

  const handleStopTracking = async () => {
    if (!confirm('Stop tracking this list? Your watched progress will be removed.')) return;
    const progressId = `${uid}__${listId}`;
    // Delete watched subcollection
    const watchedSnap = await getDocs(collection(db, 'userProgress', progressId, 'watched'));
    if (!watchedSnap.empty) {
      const batch = writeBatch(db);
      watchedSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    // Delete progress doc
    await deleteDoc(doc(db, 'userProgress', progressId));
    navigate('/');
  };

  const handleDeleteList = async () => {
    if (!confirm('Delete this list entirely? This cannot be undone.')) return;
    await handleStopTracking();
    await deleteList(listId);
    navigate('/');
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!progress) {
    return <NotFound title={PROGRESS_NOT_FOUND.title} subtitle={PROGRESS_NOT_FOUND.subtitle} scene={PROGRESS_NOT_FOUND.scene} />;
  }

  const displayName = isOwner ? 'Your' : `${profile?.displayName || 'User'}'s`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          {!isOwner && profile?.photoURL && (
            <Link to={`/user/${uid}`}>
              <img src={profile.photoURL} alt="" className="w-8 h-8 rounded-full" />
            </Link>
          )}
          <h1 className="text-2xl font-bold text-white">{displayName} Progress</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/lists/${listId}`} className="text-purple-400 hover:text-purple-300 text-sm">
            {progress.listTitle} →
          </Link>
          {isListOwner && (
            <Link to={`/lists/${listId}/edit`} className="text-xs text-gray-500 hover:text-white border border-gray-700 px-2 py-1 rounded transition-colors">
              Edit
            </Link>
          )}
          {isOwner && (
            <button
              onClick={handleStopTracking}
              className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 px-2 py-1 rounded transition-colors"
            >
              Stop tracking
            </button>
          )}
          {isListOwner && (
            <button
              onClick={handleDeleteList}
              className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 px-2 py-1 rounded transition-colors"
            >
              Delete list
            </button>
          )}
        </div>
      </div>

      <ProgressBar watched={progress.watchedCount} total={progress.totalCount} />

      <div className="space-y-2">
        {movies.map((movie) => (
          <MovieCard
            key={movie.tmdbId}
            movie={movie}
            watchedData={watched[movie.tmdbId]}
            onToggleWatched={isOwner ? handleToggleWatched : undefined}
            readonly={!isOwner}
          />
        ))}
      </div>

      {/* Rating modal */}
      {ratingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-medium">Rate this movie</h3>
            <div className="flex justify-center">
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quick thoughts? (optional)"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSkipRating}
                className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmitRating}
                className="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
