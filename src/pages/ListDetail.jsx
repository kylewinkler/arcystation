import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  subscribeToList, subscribeToListMovies, getListStarters,
  startList, deleteList, enablePublicShare, disablePublicShare, setFeaturedMovie,
  getUserProfile, getAllWatchedTmdbIds, getAllWatchedMovies, getWatchedInfo,
  subscribeToProgress, subscribeToWatched, markWatched, unmarkWatched,
  copyList, getFriends, sendListInvite, getPendingInvitesForList,
  notifyFriends, createNotification, bulkMarkWatchedFromReviews,
} from '../lib/firestore';
import { useToast } from '../context/ToastContext';
import { randomFrom, REVIEW_REACTIONS, RATING_ONLY_REACTIONS, getMilestone } from '../lib/copy/lore';
import ArcyReaddTransmission from '../assets/images/arcy-poses/arcy-read-transmission.png';
import ArcyCopyReel from '../assets/images/arcy-poses/arcy-copy-reel.png';
import { doc, deleteDoc, getDocs, query, where, collection, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getGenreList } from '../lib/tmdb';
import MovieCard from '../components/movies/MovieCard';
import ProgressBar from '../components/lists/ProgressBar';
import StarRating from '../components/StarRating';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import ConfirmModal from '../components/modal/ConfirmModal';
import { LIST_NOT_FOUND } from '../lib/copy/empty';
import { ADMIN_UIDS } from '../lib/admin';
import RatingModal from '../components/modal/RatingModal';
import QuickActionModal from '../components/modal/QuickActionModal';

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
  const [globalRatings, setGlobalRatings] = useState({});
  const [viewerGlobalRatings, setViewerGlobalRatings] = useState({});
  const [ownerProfile, setOwnerProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [copyingList, setCopyingList] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showBulkWatchModal, setShowBulkWatchModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [pendingInviteUids, setPendingInviteUids] = useState(new Set());
  const [invitingUid, setInvitingUid] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchFilter, setWatchFilter] = useState('all');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [genres, setGenres] = useState({});
  const [quickActionMovie, setQuickActionMovie] = useState(null);
  const menuRef = useRef(null);

  function handlePosterClick(movie) {
    if (user) setQuickActionMovie(movie);
    else navigate(`/movie/${movie.tmdbId}`);
  }

  const { showToast } = useToast();
  const isOwner = list?.createdBy === user?.uid;
  const isPrebuilt = list?.isPrebuilt === true;
  const isWatchlist = list?.kind === 'watchlist';
  const isViewingSelf = !viewerUid || viewerUid === user?.uid;
  const targetUid = viewerUid || user?.uid;

  // Load genre map
  useEffect(() => { getGenreList().then(setGenres); }, []);

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

  // Load global ratings (source of truth for reviews)
  useEffect(() => {
    if (!user) return;
    loadGlobalRatings(user.uid, setGlobalRatings);
  }, [user, myWatched]);

  useEffect(() => {
    if (!targetUid || isViewingSelf) return;
    loadGlobalRatings(targetUid, setViewerGlobalRatings);
  }, [targetUid, viewerWatched]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  async function loadGlobalRatings(uid, setter) {
    const movies = await getAllWatchedMovies(uid);
    const map = {};
    movies.forEach((m) => { map[m.tmdbId] = m; });
    setter(map);
  }

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
    await deleteList(id);
    navigate('/');
  };

  const handleStopTracking = async () => {
    // Delete listWatched docs for this user + list
    const watchedSnap = await getDocs(query(
      collection(db, 'listWatched'),
      where('uid', '==', user.uid),
      where('listId', '==', id)
    ));
    if (!watchedSnap.empty) {
      const batch = writeBatch(db);
      watchedSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    // Delete membership
    await deleteDoc(doc(db, 'listMembers', `${user.uid}__${id}`));
    setShowLeaveModal(false);
    if (!isOwner) navigate('/');
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
    await startList(user.uid, id);
    loadStarters();
    if (list?.isPrebuilt) {
      notifyFriends(user.uid, 'joined_collection', { listTitle: list.title, listId: id });
    }
  };

  const handleBulkMarkWatched = async () => {
    const previouslyWatched = movies
      .filter((m) => allMyWatched.has(m.tmdbId) && !myWatched[m.tmdbId])
      .map((m) => m.tmdbId);
    if (previouslyWatched.length > 0) {
      await bulkMarkWatchedFromReviews(user.uid, id, previouslyWatched);
    }
    setShowBulkWatchModal(false);
    showToast({ message: `Marked ${previouslyWatched.length} movies as watched` });
  };

  const handleOpenInviteModal = async () => {
    setShowMenu(false);
    setShowInviteModal(true);
    const [friendUids, pendingInvites] = await Promise.all([
      getFriends(user.uid),
      getPendingInvitesForList(id),
    ]);
    const starterUids = new Set(starters.map((s) => s.uid));
    const pendingUids = new Set(pendingInvites.map((i) => i.toUid));
    setPendingInviteUids(pendingUids);
    const eligibleUids = friendUids.filter((uid) => !starterUids.has(uid) && !pendingUids.has(uid));
    const profiles = await Promise.all(eligibleUids.map((uid) => getUserProfile(uid)));
    setInviteFriends(profiles.filter(Boolean));
  };

  const handleSendInvite = async (friendUid) => {
    setInvitingUid(friendUid);
    await sendListInvite(user.uid, friendUid, id, list.title);
    const notifType = isPrebuilt ? 'collection_invite' : 'list_invite';
    await createNotification(notifType, user.uid, friendUid, { listTitle: list.title, listId: id });
    setPendingInviteUids((prev) => new Set([...prev, friendUid]));
    setInviteFriends((prev) => prev.filter((f) => f.uid !== friendUid));
    setInvitingUid(null);
    showToast({ message: 'Invite sent!' });
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
      showToast({ message: `${milestone.title} ${milestone.subtitle}`, image: ArcyReaddTransmission });
    } else if (hasRating) {
      showToast({ message: randomFrom(REVIEW_REACTIONS), image: ArcyReaddTransmission });
    } else {
      showToast(randomFrom(RATING_ONLY_REACTIONS));
    }
  };

  const handleSubmitRating = async () => {
    const movie = movies.find((m) => m.tmdbId === ratingModal);
    await markWatched(user.uid, id, ratingModal, {
      rating: rating,
      note: note.trim() || null,
      movieData: movie || undefined,
    });
    setGlobalRatings((prev) => ({
      ...prev,
      [ratingModal]: { ...(prev[ratingModal] || {}), rating: rating || null, note: note.trim() || null },
    }));
    setRatingModal(null);
    showWatchedToast(!!rating);

    // Notify friends about watched movie (fire-and-forget)
    notifyFriends(user.uid, 'watched_movie', {
      movieTitle: movie?.title || null,
      tmdbId: movie?.tmdbId || null,
      posterPath: movie?.posterPath || null,
      listTitle: list?.title || null,
      listId: id,
      rating: rating || null,
      note: note.trim() || null,
    });

    // Check if user just finished the list
    const watchedAfter = Object.keys(myWatched).length + 1;
    if (watchedAfter >= movies.length && movies.length > 0) {
      notifyFriends(user.uid, 'finished_list', {
        listTitle: list?.title || null,
        listId: id,
      });
    }
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
  const displayRatings = isViewingSelf ? globalRatings : viewerGlobalRatings;
  const canCheckMovies = isViewingSelf && !!myProgress;

  // Build watchers list: active viewer first, then self (if not active), then others
  const myStarter = starters.find((s) => s.uid === user.uid);
  const allWatcherTiles = [];

  // Self tile — use live myWatched count so it updates optimistically on mark/unmark
  if (myStarter && myProfile) {
    allWatcherTiles.push({
      uid: user.uid,
      profile: myProfile,
      progress: { ...myStarter, watchedCount: Object.keys(myWatched).length },
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

  // Sort: featured first, then by order
  const sortedMovies = [...movies].sort((a, b) => {
    const aFeat = list?.featuredMovie?.tmdbId === a.tmdbId ? -1 : 0;
    const bFeat = list?.featuredMovie?.tmdbId === b.tmdbId ? -1 : 0;
    return aFeat - bFeat;
  });

  // Filter
  const filteredMovies = sortedMovies.filter((movie) => {
    if (searchQuery && !movie.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (watchFilter === 'unwatched' && displayWatched[movie.tmdbId]) return false;
    if (watchFilter === 'watched' && !displayWatched[movie.tmdbId]) return false;
    if (selectedGenre && !(movie.genreIds || []).includes(Number(selectedGenre))) return false;
    return true;
  });

  // Available genres from all movies in this list
  const availableGenres = {};
  movies.forEach((m) => {
    (m.genreIds || []).forEach((gid) => {
      if (genres[gid]) availableGenres[gid] = genres[gid];
    });
  });
  const sortedGenreEntries = Object.entries(availableGenres).sort((a, b) => a[1].localeCompare(b[1]));

  // Paginate
  const visibleMovies = filteredMovies.slice(0, visibleCount);
  const hasMore = visibleCount < filteredMovies.length;
  const isFiltered = searchQuery || watchFilter !== 'all' || selectedGenre;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white">{list.title}</h1>
            {list.description && <p className="text-gray-400 mt-1 text-sm">{list.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              {isPrebuilt ? (
                <span className="text-xs text-teal-400">Collection</span>
              ) : isOwner ? (
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

          {/* 3-dot menu */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
            >
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px] z-40">
                {isOwner && !isPrebuilt && !isWatchlist && (
                  <>
                    <Link
                      to={`/lists/${id}/edit`}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                      onClick={() => setShowMenu(false)}
                    >
                      Edit List
                    </Link>
                    <button
                      onClick={handleOpenInviteModal}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                    >
                      Invite Friend
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowDeleteModal(true); }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors"
                    >
                      Delete List
                    </button>
                  </>
                )}
                {isPrebuilt && myProgress && (
                  <button
                    onClick={handleOpenInviteModal}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    Invite Friend
                  </button>
                )}
                {myProgress && movies.some((m) => allMyWatched.has(m.tmdbId) && !myWatched[m.tmdbId]) && (
                  <button
                    onClick={() => { setShowMenu(false); setShowBulkWatchModal(true); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    Sync watched movies
                  </button>
                )}
                {!isOwner && !myProgress && (
                  <button
                    onClick={() => { setShowMenu(false); handleStartList(); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    {isPrebuilt ? 'Start Collection' : `Join ${ownerProfile?.displayName ? `${ownerProfile.displayName}'s` : 'this'} list`}
                  </button>
                )}
                {!isOwner && (
                  <button
                    onClick={() => { setShowMenu(false); setShowCopyModal(true); }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                  >
                    Copy List
                  </button>
                )}
                {!isOwner && myProgress && (
                  <button
                    onClick={() => { setShowMenu(false); setShowLeaveModal(true); }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors"
                  >
                    {isPrebuilt ? 'Leave Collection' : 'Leave List'}
                  </button>
                )}
              </div>
            )}
          </div>
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
          <ProgressBar watched={Object.keys(displayWatched).length} total={movies.length} />
        </>
      )}

      {/* Your progress (when viewing self) */}
      {isViewingSelf && myProgress && (
        <>
          <p className="text-md text-gray-400 mb-2">Your progress</p>
          <ProgressBar watched={Object.keys(myWatched).length} total={movies.length} />
        </>
      )}

      {/* Already seen count (when not tracking this list) */}
      {isViewingSelf && !myProgress && movies.length > 0 && allMyWatched.size > 0 && (() => {
        const seenCount = movies.filter((m) => allMyWatched.has(m.tmdbId)).length;
        if (seenCount === 0) return null;
        return (
            <p className="text-sm text-watched">
              You've seen <span className="text-white font-medium">{seenCount}</span> of{' '}
              <span className="text-white font-medium">{movies.length}</span> movies on this list
              (across other lists)
            </p>

        );
      })()}

      {/* Filters */}
      {movies.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(20); }}
              placeholder="Search movies..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            {sortedGenreEntries.length > 0 && (
              <select
                value={selectedGenre}
                onChange={(e) => { setSelectedGenre(e.target.value); setVisibleCount(20); }}
                className="shrink-0 max-w-[8rem] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">All genres</option>
                {sortedGenreEntries.map(([gid, name]) => (
                  <option key={gid} value={gid}>{name}</option>
                ))}
              </select>
            )}
          </div>
          {myProgress && (
            <div className="flex rounded-lg border border-gray-700 overflow-hidden">
              {['all', 'unwatched', 'watched'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setWatchFilter(tab); setVisibleCount(20); }}
                  className={`flex-1 text-sm py-1.5 transition-colors ${
                    watchFilter === tab
                      ? 'bg-purple-600/20 text-purple-300'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          )}
          {isFiltered && (
            <p className="text-sm text-gray-500">
              {filteredMovies.length} of {movies.length} movies
            </p>
          )}
        </div>
      )}

      {/* Movie list */}
      {filteredMovies.length === 0 && movies.length > 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">No movies match your filters.</p>
      ) : (
        <div className="space-y-2">
          {visibleMovies.map((movie) => (
            <MovieCard
              key={movie.tmdbId}
              movie={movie}
              watchedData={displayWatched[movie.tmdbId] ? { ...displayWatched[movie.tmdbId], ...(displayRatings[movie.tmdbId] || {}) } : undefined}
              onToggleWatched={canCheckMovies ? handleToggleWatched : undefined}
              readonly={!canCheckMovies}
              seenElsewhere={allMyWatched.has(movie.tmdbId)}
              isFeatured={list.featuredMovie?.tmdbId === movie.tmdbId}
              onPosterClick={handlePosterClick}
              onToggleFeatured={(isOwner || (isPrebuilt && ADMIN_UIDS.includes(user?.uid))) ? async (m) => {
                await setFeaturedMovie(id, list.featuredMovie?.tmdbId === m.tmdbId ? null : m);
              } : undefined}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((v) => v + 20)}
          className="w-full py-3 text-sm font-medium text-purple-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg hover:border-purple-500 transition-colors"
        >
          Load more ({filteredMovies.length - visibleCount} remaining)
        </button>
      )}

      <RatingModal
        isOpen={!!ratingModal}
        rating={rating}
        note={note}
        setRating={setRating}
        setNote={setNote}
        onCancel={handleCancelRating}
        onSave={handleSubmitRating}
      />

      {user && (
        <QuickActionModal
          isOpen={!!quickActionMovie}
          onClose={() => setQuickActionMovie(null)}
          movie={quickActionMovie}
          user={user}
          watched={allMyWatched}
          setWatched={setAllMyWatched}
        />
      )}

      {/* Copy list confirmation modal */}
      {showCopyModal && (
        <ConfirmModal
          title="Copy this list?"
          message="Arcy will duplicate this archive to your collection. You'll own the copy and can edit it freely."
          confirmLabel={copyingList ? 'Copying...' : 'Copy List'}
          onConfirm={() => { setShowCopyModal(false); handleCopyList(); }}
          onCancel={() => setShowCopyModal(false)}
          image={ArcyCopyReel}
          disabled={copyingList}
        />
      )}

      {/* Delete list confirmation modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete this list?"
          message="This cannot be undone. All movies and progress data for this list will be removed."
          confirmLabel="Delete"
          confirmStyle="bg-red-600 hover:bg-red-700"
          onConfirm={() => { setShowDeleteModal(false); handleDelete(); }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Leave list confirmation modal */}
      {showLeaveModal && (
        <ConfirmModal
          title="Leave this list?"
          message="Your watched progress on this list will be removed. Your reviews and ratings are kept."
          confirmLabel="Leave"
          confirmStyle="bg-red-600 hover:bg-red-700"
          onConfirm={handleStopTracking}
          onCancel={() => setShowLeaveModal(false)}
        />
      )}

      {/* Unmark confirmation modal */}
      {unmarkModal && (
        <ConfirmModal
          title="Unmark as watched?"
          message="This will remove your watched status for this movie on this list. Your review is kept."
          confirmLabel="Unmark"
          confirmStyle="bg-red-600 hover:bg-red-700"
          onConfirm={handleConfirmUnmark}
          onCancel={() => setUnmarkModal(null)}
        />
      )}

      {showBulkWatchModal && (
        <ConfirmModal
          title="Sync watched movies?"
          message={`Mark ${movies.filter((m) => allMyWatched.has(m.tmdbId) && !myWatched[m.tmdbId]).length} previously watched movies as watched on this list. Your existing ratings and reviews will be kept.`}
          confirmLabel="Sync"
          onConfirm={handleBulkMarkWatched}
          onCancel={() => setShowBulkWatchModal(false)}
        />
      )}

      {/* Invite friend modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4">Invite a Friend</h2>
            {inviteFriends.length === 0 ? (
              <p className="text-gray-400 text-sm">
                {pendingInviteUids.size > 0
                  ? 'All your friends have been invited or are already on this list.'
                  : 'No friends available to invite.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {inviteFriends.map((friend) => (
                  <div key={friend.uid} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                    {friend.photoURL ? (
                      <img src={friend.photoURL} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                        {friend.displayName?.[0]}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{friend.displayName}</p>
                    </div>
                    <button
                      onClick={() => handleSendInvite(friend.uid)}
                      disabled={invitingUid === friend.uid}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0"
                    >
                      {invitingUid === friend.uid ? 'Sending...' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowInviteModal(false)}
              className="mt-4 w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
