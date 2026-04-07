import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToList, subscribeToListMovies, getListStarters,
  startList, deleteList, enablePublicShare, disablePublicShare, setFeaturedMovie,
  getUserProfile, getAllWatchedTmdbIds, getWatchedInfo,
  subscribeToProgress, subscribeToWatched, markWatched, unmarkWatched,
  copyList,
} from '../lib/firestore';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';
import ArcyCopyReel from '../assets/images/arcy-poses/arcy-copy-reel.png';
import { doc, deleteDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MovieCard from '../components/movies/MovieCard';
import ProgressBar from '../components/lists/ProgressBar';
import StarRating from '../components/StarRating';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import { LIST_NOT_FOUND } from '../lib/copy/empty';

export default function ListDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const viewerUid = searchParams.get('viewer');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [list, setList] = useState(null);
  const [movies, setMovies] = useState([]);
  const [starters, setStarters] = useState([]);
  const [starterProfiles, setStarterProfiles] = useState([]);
  const [myProfile, setMyProfile] = useState(null);
  const [myProgress, setMyProgress] = useState(null);
  const [myWatched, setMyWatched] = useState({});
  const [allMyWatched, setAllMyWatched] = useState(new Set());
  const [viewerProfile, setViewerProfile] = useState(null);
  const [viewerProgress, setViewerProgress] = useState(null);
  const [viewerWatched, setViewerWatched] = useState({});
  const [ratingModal, setRatingModal] = useState(null);
  const [unmarkModal, setUnmarkModal] = useState(null);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState('');
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [copyingList, setCopyingList] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);

  const { showToast } = useToast();
  const isOwner = list?.createdBy === user?.uid;
  const isViewingSelf = !viewerUid || viewerUid === user?.uid;
  const targetUid = viewerUid || user?.uid;

  // Subscribe to list + movies
  useEffect(() => {
    const unsub1 = subscribeToList(id, setList);
    const unsub2 = subscribeToListMovies(id, setMovies);
    return () => { unsub1(); unsub2(); };
  }, [id]);

  // Load starters, global watched, my profile, owner profile
  useEffect(() => {
    if (!user || !list) return;
    loadStarters();
    loadMyGlobalWatched();
    getUserProfile(user.uid).then(setMyProfile);
    if (list.createdBy && list.createdBy !== user.uid) {
      getUserProfile(list.createdBy).then(setOwnerProfile);
    }
  }, [user, list]);

  // Subscribe to progress + watched for the target user (self or viewer)
  useEffect(() => {
    if (!user || !targetUid) return;

    const unsub1 = subscribeToProgress(targetUid, id, (p) => {
      if (isViewingSelf) {
        setMyProgress(p);
      } else {
        setViewerProgress(p);
      }
      setLoading(false);
    });

    const unsub2 = subscribeToWatched(targetUid, id, (w) => {
      if (isViewingSelf) {
        setMyWatched(w);
      } else {
        setViewerWatched(w);
      }
    });

    let unsub3, unsub4;
    if (!isViewingSelf) {
      unsub3 = subscribeToProgress(user.uid, id, setMyProgress);
      unsub4 = subscribeToWatched(user.uid, id, setMyWatched);
      getUserProfile(targetUid).then(setViewerProfile);
    }

    return () => {
      unsub1();
      unsub2();
      unsub3?.();
      unsub4?.();
    };
  }, [user, targetUid, id]);

  async function loadStarters() {
    const allStarters = await getListStarters(id);
    setStarters(allStarters);
    const otherStarters = allStarters.filter((s) => s.uid !== user.uid);
    const profiles = await Promise.all(
      otherStarters.map((s) => getUserProfile(s.uid))
    );
    setStarterProfiles(profiles.filter(Boolean));
  }

  async function loadMyGlobalWatched() {
    const ids = await getAllWatchedTmdbIds(user.uid);
    setAllMyWatched(ids);
  }

  const handleDelete = async () => {
    if (!confirm('Delete this list? This cannot be undone.')) return;
    await deleteList(id);
    navigate('/');
  };

  const handleStopTracking = async () => {
    if (!confirm('Stop tracking this list? Your watched progress will be removed.')) return;
    const progressId = `${user.uid}__${id}`;
    const watchedSnap = await getDocs(collection(db, 'userProgress', progressId, 'watched'));
    if (!watchedSnap.empty) {
      const batch = writeBatch(db);
      watchedSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await deleteDoc(doc(db, 'userProgress', progressId));
    if (!isOwner) navigate('/');
  };

  const handleToggleShare = async () => {
    if (list.isPublic) {
      await disablePublicShare(id);
    } else {
      await enablePublicShare(id);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/s/${list.shareSlug}`;
    await navigator.clipboard.writeText(url);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleCopyList = async () => {
    if (copyingList) return;
    setCopyingList(true);
    try {
      const newId = await copyList(id, user.uid);
      navigate(`/lists/${newId}`);
    } catch (err) {
      console.error('Failed to copy list:', err);
    }
    setCopyingList(false);
  };

  const handleStartList = async () => {
    await startList(user.uid, id, list.title, movies.length);
    loadStarters();
  };

  const handleToggleWatched = async (tmdbId, shouldWatch) => {
    if (shouldWatch) {
      // Pre-fill with existing review if they've watched this before
      const existing = await getWatchedInfo(user.uid, tmdbId);
      setRating(existing?.rating || 0);
      setNote(existing?.note || '');
      setRatingModal(tmdbId);
    } else {
      setUnmarkModal(tmdbId);
    }
  };

  const showWatchedToast = async (hasRating) => {
    const ids = await getAllWatchedTmdbIds(user.uid);
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
    const movie = movies.find((m) => m.tmdbId === ratingModal);
    await markWatched(user.uid, id, ratingModal, {
      rating: rating || null,
      note: note.trim() || null,
      movieData: movie || undefined,
    });
    setRatingModal(null);
    showWatchedToast(!!rating);
  };

  const handleSkipRating = async () => {
    const movie = movies.find((m) => m.tmdbId === ratingModal);
    await markWatched(user.uid, id, ratingModal, {
      movieData: movie || undefined,
    });
    setRatingModal(null);
    showWatchedToast(false);
  };

  const handleCancelRating = () => {
    setRatingModal(null);
  };

  const handleConfirmUnmark = async () => {
    await unmarkWatched(user.uid, id, unmarkModal);
    setUnmarkModal(null);
  };

  if (copyingList || (loading && !list)) {
    return <LoadingScreen />;
  }

  if (!list) {
    return <NotFound title={LIST_NOT_FOUND.title} subtitle={LIST_NOT_FOUND.subtitle} scene={LIST_NOT_FOUND.scene} />;
  }

  const displayWatched = isViewingSelf ? myWatched : viewerWatched;
  const displayProgress = isViewingSelf ? myProgress : viewerProgress;
  const canCheckMovies = isViewingSelf && !!myProgress;

  // Build watchers list: active viewer first, then self (if not active), then others
  const myStarter = starters.find((s) => s.uid === user.uid);
  const allWatcherTiles = [];

  // Self tile
  if (myStarter && myProfile) {
    allWatcherTiles.push({
      uid: user.uid,
      profile: myProfile,
      progress: myStarter,
      isSelf: true,
      isActive: isViewingSelf,
      link: `/lists/${id}`,
      label: 'You',
    });
  }

  // Other starter tiles
  starterProfiles.forEach((p) => {
    const sp = starters.find((s) => s.uid === p.uid);
    allWatcherTiles.push({
      uid: p.uid,
      profile: p,
      progress: sp,
      isSelf: false,
      isActive: !isViewingSelf && targetUid === p.uid,
      link: `/lists/${id}?viewer=${p.uid}`,
      label: p.displayName,
    });
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{list.title}</h1>
            {list.description && <p className="text-gray-400 mt-1 text-sm">{list.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              {isOwner ? (
                <span className="text-xs text-purple-400">Your list</span>
              ) : ownerProfile ? (
                <Link to={`/user/${ownerProfile.uid}`} className="flex items-center gap-1.5 group">
                  {ownerProfile.photoURL ? (
                    <img src={ownerProfile.photoURL} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold">
                      {ownerProfile.displayName?.[0]}
                    </div>
                  )}
                  <span className="text-xs text-gray-400 group-hover:text-purple-400 transition-colors">
                    {ownerProfile.displayName}
                  </span>
                </Link>
              ) : null}
              <span className="text-xs text-gray-600">{movies.length} {movies.length === 1 ? 'film' : 'films'}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-3">
          {isOwner && (
            <>
              <Link
                to={`/lists/${id}/edit`}
                className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 px-3 py-1.5 rounded-lg"
              >
                Edit
              </Link>
              <button
                onClick={handleDelete}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors border border-gray-700 px-3 py-1.5 rounded-lg"
              >
                Delete
              </button>
            </>
          )}
          {!isOwner && !myProgress && (
            <button
              onClick={handleStartList}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Start List
            </button>
          )}
          {!isOwner && (
            <button
              onClick={() => setShowCopyModal(true)}
              className="text-xs text-gray-400 hover:text-white transition-colors border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              Copy List
            </button>
          )}
          {!isOwner && myProgress && (
            <button
              onClick={handleStopTracking}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors border border-gray-700 px-3 py-1.5 rounded-lg"
            >
              Leave List
            </button>
          )}
        </div>
      </div>

            {/* People watching this list — active viewer shown first */}
      {allWatcherTiles.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2">
            {allWatcherTiles.map((w) => (
              <Link
                key={w.uid}
                to={w.link}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                  w.isActive
                    ? 'bg-purple-600/20 border border-purple-500/50'
                    : 'bg-gray-900 border border-gray-800 hover:border-purple-500'
                }`}
              >
                {w.profile.photoURL ? (
                  <img src={w.profile.photoURL} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                    {w.profile.displayName?.[0]}
                  </div>
                )}
                <span className={`text-sm ${w.isActive ? 'text-purple-300' : 'text-white'}`}>
                  {w.label}
                </span>
                <span className="text-xs text-gray-500">
                  {w.progress?.watchedCount || 0}/{movies.length}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Viewer's progress (when viewing a friend) */}
      {!isViewingSelf && displayProgress && (
        <>
          <p className="text-md text-gray-400 mb-2"><Link to={`/user/${viewerProfile?.uid || targetUid}`} className="text-white hover:text-purple-400 transition-colors">{viewerProfile?.displayName}</Link>'s progress</p>
          <ProgressBar watched={displayProgress.watchedCount} total={movies.length} />
        </>
      )}

      {/* Your progress (when viewing self) */}
      {isViewingSelf && myProgress && (
        <>
          <p className="text-md text-gray-400 mb-2">Your progress</p>
          <ProgressBar watched={myProgress.watchedCount} total={movies.length} />
        </>
      )}

      {/* Already seen count (when not tracking this list) */}
      {isViewingSelf && !myProgress && movies.length > 0 && allMyWatched.size > 0 && (() => {
        const seenCount = movies.filter((m) => allMyWatched.has(m.tmdbId)).length;
        if (seenCount === 0) return null;
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
            <span className="text-2xl">👁</span>
            <p className="text-sm text-gray-300">
              You've seen <span className="text-white font-medium">{seenCount}</span> of{' '}
              <span className="text-white font-medium">{movies.length}</span> movies on this list
              (across other lists)
            </p>
          </div>
        );
      })()}

      {/* Movie list */}
      <div className="space-y-2">
        {[...movies].sort((a, b) => {
          const aFeat = list.featuredMovie?.tmdbId === a.tmdbId ? -1 : 0;
          const bFeat = list.featuredMovie?.tmdbId === b.tmdbId ? -1 : 0;
          return aFeat - bFeat;
        }).map((movie) => (
          <MovieCard
            key={movie.tmdbId}
            movie={movie}
            watchedData={displayWatched[movie.tmdbId]}
            onToggleWatched={canCheckMovies ? handleToggleWatched : undefined}
            readonly={!canCheckMovies}
            seenElsewhere={allMyWatched.has(movie.tmdbId)}
            isFeatured={list.featuredMovie?.tmdbId === movie.tmdbId}
            onToggleFeatured={isOwner ? async (m) => {
              await setFeaturedMovie(id, list.featuredMovie?.tmdbId === m.tmdbId ? null : m);
            } : undefined}
          />
        ))}
      </div>

      {/* Rating modal (mark as watched) */}
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
                onClick={handleCancelRating}
                className="flex-1 text-sm text-gray-500 hover:text-gray-300 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSkipRating}
                className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg transition-colors"
              >
                Mark Watched
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

      {/* Copy list confirmation modal */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex justify-center">
              <img
                src={ArcyCopyReel}
                alt=""
                className="h-24 w-24 object-contain drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]"
              />
            </div>
            <h3 className="text-white font-medium text-center">Copy this list?</h3>
            <p className="text-sm text-gray-400 text-center">
              Arcy will duplicate this archive to your collection. You'll own the copy and can edit it freely.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCopyModal(false)}
                className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowCopyModal(false); handleCopyList(); }}
                disabled={copyingList}
                className="flex-1 text-sm bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors font-medium disabled:bg-gray-700 disabled:text-gray-500"
              >
                {copyingList ? 'Copying...' : 'Copy List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unmark confirmation modal */}
      {unmarkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-medium">Unmark as watched?</h3>
            <p className="text-sm text-gray-400">This will remove your rating and notes for this movie on this list.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setUnmarkModal(null)}
                className="flex-1 text-sm text-gray-400 hover:text-white border border-gray-700 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUnmark}
                className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition-colors font-medium"
              >
                Unmark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
