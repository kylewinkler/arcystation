import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile, getUserAllProgress, getFriendship,
  sendFriendRequest, acceptFriendRequest,
  getList, getAllWatchedMovies,
  getPinnedLists, pinList, unpinList, sortLists,
  getListMovies, getWatchedMovies, getPrebuiltLists,
  getWatchlistId, getAllWatchedTmdbIds, getWatchedInfo,
} from '../lib/firestore';
import { posterUrl } from '../lib/tmdb';
import ListCard from '../components/lists/ListCard';
import SuggestionCard from '../components/movies/SuggestionCard';
import StarRating from '../components/StarRating';
import ProfileReviews from '../components/profile/ProfileReviews';
import ReviewModal from '../components/modal/ReviewModal';
import QuickActionModal from '../components/modal/QuickActionModal';
import LoadingScreen from '../components/loading/Loading';
import NotFound from '../components/not-found/NotFound';
import ProfileHeader from '../components/profile/ProfileHeader';
import { ADMIN_UIDS } from '../lib/admin';
import { PROFILE_NO_LISTS, USER_NOT_FOUND } from '../lib/copy/empty';
import { useToast } from '../context/ToastContext';
import { randomFrom, PIN_REACTIONS, FIRST_PIN } from '../lib/copy/lore';
import ArcyStar from '../assets/images/arcy-poses/arcy-star.png';
import EmptyArchives from '../assets/images/arcy-scenes/empty-archives.png';

const PAGE_SIZE = 10;

function pickRandom(arr) {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
}

const currentYear = new Date().getFullYear();
function isReleased(m) {
  if (m.releaseDate) return new Date(m.releaseDate) <= new Date();
  if (m.release_date) return new Date(m.release_date) <= new Date();
  return !m.year || Number(m.year) < currentYear;
}

// ISO week key like "2026-W17" — stable Monday-to-Sunday bucket for the
// weekly pick. The pick stays the same all week even after the user watches
// it (we just swap to the "you watched it" variant).
function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum}`;
}

function weekPickStorageKey(uid) {
  return `weekPick_${uid}`;
}

export default function UserProfile() {
  const { uid } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [allWatchedMovies, setAllWatchedMovies] = useState([]);
  const [lists, setLists] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [collections, setCollections] = useState([]);
  const [continueItem, setContinueItem] = useState(null);
  const [startWatching, setStartWatching] = useState(null);
  const [almostDone, setAlmostDone] = useState(null);
  const [weekPick, setWeekPick] = useState(null);
  const [weekPickReview, setWeekPickReview] = useState(null);
  const [quickActionMovie, setQuickActionMovie] = useState(null);
  const [newInLists, setNewInLists] = useState(null);
  const [page, setPage] = useState(1);
  const [isFriend, setIsFriend] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState(null);
  const [requestedBy, setRequestedBy] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [myWatchedIds, setMyWatchedIds] = useState(new Set());

  const isOwner = user?.uid === uid;
  const tab = searchParams.get('tab') || 'all';
  const isPublic = profile?.isPublic !== false;

  useEffect(() => {
    loadProfile();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getAllWatchedMovies(uid).then(setAllWatchedMovies);
  }, [uid]);

  useEffect(() => {
    if (!user) return;
    getAllWatchedTmdbIds(user.uid).then(setMyWatchedIds).catch(() => {});
  }, [user]);

  // Keep the week-pick's "watched" variant in sync with myWatchedIds — if the
  // user marks the pick watched from the QuickActionModal we need to pull the
  // rating/note in so the hero flips to the orange "you watched it" state
  // without a page reload.
  useEffect(() => {
    if (!user || !weekPick) return;
    const watched = myWatchedIds.has(weekPick.movie.tmdbId);
    if (watched && !weekPickReview) {
      getWatchedInfo(user.uid, weekPick.movie.tmdbId)
        .then((info) => { if (info) setWeekPickReview(info); })
        .catch(() => {});
    } else if (!watched && weekPickReview) {
      setWeekPickReview(null);
    }
  }, [myWatchedIds, weekPick, user]);

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
  }, [tab]);

  async function handleTogglePin(listId) {
    const newPinned = new Set(pinnedIds);
    if (newPinned.has(listId)) {
      newPinned.delete(listId);
      await unpinList(user.uid, listId);
    } else {
      const isFirst = pinnedIds.size === 0;
      newPinned.add(listId);
      await pinList(user.uid, listId);
      showToast({
        message: isFirst ? FIRST_PIN : randomFrom(PIN_REACTIONS),
        image: ArcyStar,
      });
    }
    setPinnedIds(newPinned);
  }

  async function loadProfile() {
    setLoading(true);
    const profileData = await getUserProfile(uid);
    setProfile(profileData);

    const ownerView = user?.uid === uid;

    if (!ownerView && user) {
      const friendship = await getFriendship(user.uid, uid);
      setFriendshipStatus(friendship?.status || null);
      setRequestedBy(friendship?.requestedBy || null);
      setIsFriend(friendship?.status === 'accepted');
    }

    // Anonymous viewers can read this user's reviews (loaded separately) but
    // not their list memberships — skip the lists-grid fetches entirely.
    if (!user) {
      setLoading(false);
      return;
    }

    const [allProgress, pinned, prebuiltLists] = await Promise.all([
      getUserAllProgress(uid),
      ownerView ? getPinnedLists(uid) : Promise.resolve([]),
      ownerView ? getPrebuiltLists() : Promise.resolve([]),
    ]);
    const pinnedSet = new Set(pinned);
    setPinnedIds(pinnedSet);

    const enriched = await Promise.all(
      allProgress.map(async (p) => {
        try {
          const listDoc = await getList(p.listId);
          if (!listDoc) return null;
          let creator = null;
          if (listDoc.createdBy && listDoc.createdBy !== user?.uid) {
            creator = await getUserProfile(listDoc.createdBy);
          }
          return {
            ...p,
            list: listDoc,
            creator,
            isProfileOwnersList: listDoc.createdBy === uid,
            isViewerOwned: listDoc.createdBy === user?.uid,
          };
        } catch { return null; }
      })
    );

    const validLists = enriched.filter(Boolean);
    setLists(sortLists(validLists, pinnedSet));

    if (ownerView) {
      // Pre-built lists the user hasn't started yet
      const startedListIds = new Set(validLists.map((l) => l.listId));
      setCollections(prebuiltLists.filter((l) => !startedListIds.has(l.id)));

      // Suggestion tiles (Continue / Start watching / Almost done / New) — fetch
      // movies + watched maps for any list with something unwatched, then pick
      // representatives. Shows the user something actionable at the top of the
      // page without making them scan list cards.
      const watchlistId = getWatchlistId(uid);
      // allUnwatched includes the Watchlist — the week pick can draw from
      // any list with something unwatched. withUnwatched excludes it for the
      // Continue / Start watching / Almost done tiles, which frame each list
      // as a project to make progress on (the Watchlist is save-for-later,
      // not a project).
      const allUnwatched = validLists.filter(
        (item) => item.watchedCount < (item.list.movieCount || 0)
      );
      const withUnwatched = allUnwatched.filter((item) => item.listId !== watchlistId);
      const allIncomplete = withUnwatched.filter((item) => item.watchedCount > 0);

      const movieData = {};
      const watchedData = {};
      await Promise.all(
        allUnwatched.map(async (item) => {
          const [movies, watched] = await Promise.all([
            getListMovies(item.listId),
            getWatchedMovies(uid, item.listId),
          ]);
          movieData[item.listId] = movies;
          watchedData[item.listId] = watched;
        })
      );

      // Continue watching: most-recent activity on a pinned list, falling back
      // to any other list by recency. Walk candidates in priority order and
      // pick the first one that actually has a released-unwatched movie — a
      // pinned list with no viable pick should yield to the next candidate,
      // not silently hide the tile.
      const byRecent = [...allIncomplete].sort(
        (a, b) => (b.lastActivityAt?.seconds || 0) - (a.lastActivityAt?.seconds || 0)
      );
      const pinnedIncomplete = byRecent.filter((item) => pinnedSet.has(item.listId));
      const unpinnedIncomplete = byRecent.filter((item) => !pinnedSet.has(item.listId));
      const candidates = [...pinnedIncomplete, ...unpinnedIncomplete];

      let continueList = null;
      let continueMovie = null;
      for (const cand of candidates) {
        const unwatched = (movieData[cand.listId] || [])
          .filter((m) => !watchedData[cand.listId]?.[m.tmdbId])
          .filter(isReleased);
        if (unwatched.length > 0) {
          continueList = cand;
          continueMovie = pickRandom(unwatched);
          break;
        }
      }
      if (continueMovie) {
        setContinueItem({
          movie: continueMovie,
          listTitle: continueList.list.title,
          listId: continueList.listId,
        });
      }

      // Almost done: list with highest % watched (excluding the one already used for continue)
      const withRatio = allIncomplete
        .map((item) => ({
          item,
          ratio: item.watchedCount / (item.list.movieCount || 1),
        }))
        .filter(({ item }) => !continueList || item.listId !== continueList.listId)
        .sort((a, b) => b.ratio - a.ratio);

      if (withRatio.length > 0 && withRatio[0].ratio >= 0.5) {
        const almost = withRatio[0].item;
        const remaining = (movieData[almost.listId] || [])
          .filter((m) => !watchedData[almost.listId]?.[m.tmdbId])
          .filter(isReleased);
        const almostMovie = pickRandom(remaining);
        if (almostMovie) {
          const left = (almost.list.movieCount || 0) - almost.watchedCount;
          setAlmostDone({
            movie: almostMovie,
            listTitle: almost.list.title,
            listId: almost.listId,
            remaining: left,
          });
        }
      }

      // Track tmdbIds already shown so the same movie doesn't appear across
      // multiple cards (Continue + Start watching + New).
      const usedTmdbIds = new Set([continueMovie?.tmdbId].filter(Boolean));

      // Start watching: a fresh list (movies present, none watched yet) — picks
      // a released unwatched movie so the user has somewhere obvious to begin.
      const freshLists = withUnwatched.filter((item) => item.watchedCount === 0);
      if (freshLists.length > 0) {
        const shuffled = [...freshLists].sort(() => Math.random() - 0.5);
        for (const item of shuffled) {
          const cands = (movieData[item.listId] || [])
            .filter((m) => !usedTmdbIds.has(m.tmdbId))
            .filter(isReleased);
          if (cands.length > 0) {
            const movie = pickRandom(cands);
            setStartWatching({ movie, listTitle: item.list.title, listId: item.listId });
            usedTmdbIds.add(movie.tmdbId);
            break;
          }
        }
      }

      // New in your lists: a movie tracked in any of the user's lists that
      // released within the last 30 days. Free to compute — we already have
      // movieData fetched. Prefers unwatched.
      const NEW_WINDOW_DAYS = 30;
      const newCutoff = Date.now() - NEW_WINDOW_DAYS * 86400000;
      const newCandidates = [];
      for (const item of withUnwatched) {
        for (const m of (movieData[item.listId] || [])) {
          if (usedTmdbIds.has(m.tmdbId)) continue;
          if (watchedData[item.listId]?.[m.tmdbId]) continue;
          const dateStr = m.releaseDate || m.release_date;
          if (!dateStr) continue;
          const t = new Date(dateStr).getTime();
          if (t >= newCutoff && t <= Date.now()) {
            newCandidates.push({ movie: m, listTitle: item.list.title, listId: item.listId, releasedAt: t });
          }
        }
      }
      if (newCandidates.length > 0) {
        newCandidates.sort((a, b) => b.releasedAt - a.releasedAt);
        const top = newCandidates[0];
        setNewInLists({ movie: top.movie, listTitle: top.listTitle, listId: top.listId });
      }

      // This week's pick: stable per ISO week, persisted to localStorage so
      // the user sees the same movie all week even after watching it. Draws
      // from any list with unwatched movies, including the Watchlist.
      const weekKey = getWeekKey();
      const storageKey = weekPickStorageKey(user.uid);
      let pick = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const fresh = parsed?.weekKey === weekKey && parsed.movie?.tmdbId;
          // Self-heal: if the cached pick references a list the user is no
          // longer in (left/deleted), regenerate instead of showing stale info.
          const listStillValid =
            parsed?.listId && validLists.some((v) => v.listId === parsed.listId);
          if (fresh && listStillValid) pick = parsed;
        }
      } catch { /* corrupt entry — regenerate */ }

      if (!pick) {
        const shuffledLists = [...allUnwatched].sort(() => Math.random() - 0.5);
        for (const item of shuffledLists) {
          const candidates = (movieData[item.listId] || [])
            .filter((m) => !watchedData[item.listId]?.[m.tmdbId])
            .filter(isReleased);
          if (candidates.length > 0) {
            const movie = pickRandom(candidates);
            pick = {
              weekKey,
              movie,
              listTitle: item.list?.title || '',
              listId: item.listId || '',
            };
            try { localStorage.setItem(storageKey, JSON.stringify(pick)); } catch { /* quota — ignore */ }
            break;
          }
        }
      }

      if (pick) {
        setWeekPick(pick);
        const ids = await getAllWatchedTmdbIds(user.uid).catch(() => new Set());
        if (ids.has(pick.movie.tmdbId)) {
          try {
            const info = await getWatchedInfo(user.uid, pick.movie.tmdbId);
            if (info) setWeekPickReview(info);
          } catch { /* non-fatal */ }
        }
      }
    }

    setLoading(false);
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <NotFound title={USER_NOT_FOUND.title} subtitle={USER_NOT_FOUND.subtitle} scene={USER_NOT_FOUND.scene} />;
  }

  const canSeeContent = isOwner || isFriend || isPublic;

  // Filtered list — owner can switch tabs; non-owner sees a single combined
  // grid of all lists the profile owner is on.
  let activeList;
  if (!isOwner) {
    activeList = lists;
  } else if (tab === 'created') {
    activeList = lists.filter((item) => item.isProfileOwnersList);
  } else if (tab === 'joined') {
    activeList = lists.filter((item) => !item.isProfileOwnersList);
  } else if (tab === 'favorites') {
    activeList = lists.filter((item) => pinnedIds.has(item.listId));
  } else if (tab === 'collections') {
    const joinedPrebuilts = lists.filter((item) => item.list.isPrebuilt);
    activeList = [...joinedPrebuilts, ...collections];
  } else {
    activeList = lists;
  }

  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const paginated = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'created', label: 'Created' },
    { key: 'joined', label: 'Joined' },
    { key: 'collections', label: 'Collections' },
  ];

  const ownerEmpty = {
    all: "You aren't on any lists yet.",
    created: "You haven't created any lists yet.",
    joined: "You haven't joined any lists yet.",
    favorites: 'No favorites yet — tap the star on a list to pin it.',
    collections: 'No collections to discover right now.',
  }[tab];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProfileHeader
        profile={profile}
        isOwner={isOwner}
        isAdmin={ADMIN_UIDS.includes(user?.uid)}
        onProfileChange={setProfile}
      />

      {/* Private profile placeholder — shown to non-friends (and to logged-out
          viewers) when the profile owner has flipped privacy off. */}
      {!canSeeContent && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-400">This profile is private.</p>
          {!user && (
            <p className="text-sm text-gray-500 mt-2">Sign in to send a friend request.</p>
          )}
          {user && friendshipStatus === 'pending' && requestedBy === uid ? (
            <button
              onClick={async () => {
                setSending(true);
                await acceptFriendRequest(user.uid, uid);
                setIsFriend(true);
                setFriendshipStatus('accepted');
                setSending(false);
                loadProfile();
              }}
              disabled={sending}
              className="mt-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'Accepting...' : 'Accept Friend Request'}
            </button>
          ) : user && friendshipStatus === 'pending' ? (
            <p className="text-sm text-gray-500 mt-2">Friend request pending</p>
          ) : user ? (
            <button
              onClick={async () => {
                setSending(true);
                await sendFriendRequest(user.uid, uid);
                setFriendshipStatus('pending');
                setSending(false);
              }}
              disabled={sending}
              className="mt-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Add Friend'}
            </button>
          ) : null}
        </div>
      )}

      {/* Logged-in non-friend viewing a public profile — small, non-blocking
          friend-request CTA above the content. */}
      {canSeeContent && !isOwner && !isFriend && user && (
        <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
          <p className="text-sm text-gray-400">You're not friends yet.</p>
          {friendshipStatus === 'pending' && requestedBy === uid ? (
            <button
              onClick={async () => {
                setSending(true);
                await acceptFriendRequest(user.uid, uid);
                setIsFriend(true);
                setFriendshipStatus('accepted');
                setSending(false);
                loadProfile();
              }}
              disabled={sending}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              {sending ? 'Accepting...' : 'Accept Request'}
            </button>
          ) : friendshipStatus === 'pending' ? (
            <span className="text-xs text-gray-500">Request pending</span>
          ) : (
            <button
              onClick={async () => {
                setSending(true);
                await sendFriendRequest(user.uid, uid);
                setFriendshipStatus('pending');
                setSending(false);
              }}
              disabled={sending}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Add Friend'}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {canSeeContent && (
        <div className="space-y-6">
          <ProfileReviews
            watchedMovies={allWatchedMovies}
            onSelect={setSelected}
            viewAllHref={`/watched/${uid}`}
          />

          {/* Lists section — full Lists experience for owner, simple grid for
              friends and logged-in public viewers. Anonymous viewers can't
              read listMembers so the section is hidden entirely for them. */}
          {user && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Lists</h2>
              {isOwner && (
                <Link
                  to="/lists/new"
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                  + New List
                </Link>
              )}
            </div>

            {/* Suggestion tiles — owner only */}
            {isOwner && (continueItem || startWatching || almostDone || weekPick) && (
              <div className="space-y-3">
                {weekPick && (() => {
                  const pickWatched = myWatchedIds.has(weekPick.movie.tmdbId);
                  return (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        {pickWatched ? "You watched this week's pick" : 'Not sure what to watch?'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setQuickActionMovie(weekPick.movie)}
                        className="block w-full text-left group"
                      >
                        <div
                          className={
                            pickWatched
                              ? 'relative rounded-xl overflow-hidden bg-gray-900 border border-orange-500 shadow-[0_0_30px_-5px_rgba(249,115,22,0.6)] transition-colors'
                              : 'relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 group-hover:border-purple-500 transition-colors'
                          }
                        >
                          {weekPick.movie.posterPath ? (
                            <div
                              className="absolute inset-0 bg-cover bg-center opacity-20 blur-xl"
                              style={{ backgroundImage: `url(${posterUrl(weekPick.movie.posterPath, 'w500')})` }}
                            />
                          ) : null}
                          <div className="relative flex items-center gap-4 p-3">
                            {weekPick.movie.posterPath ? (
                              <img
                                src={posterUrl(weekPick.movie.posterPath, 'w185')}
                                alt={weekPick.movie.title}
                                className="w-16 h-24 rounded object-cover shrink-0 shadow-lg"
                              />
                            ) : (
                              <div className="w-16 h-24 rounded bg-gray-800 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium mb-0.5 ${pickWatched ? 'text-orange-400' : 'text-yellow-400/90'}`}>
                                {pickWatched ? '🍿 Your pick this week' : "🎬 This week's pick"}
                              </p>
                              <p className="text-white font-medium truncate">
                                {weekPick.movie.title}
                                {weekPick.movie.year && (
                                  <span className="text-gray-400 font-normal"> ({weekPick.movie.year})</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">from {weekPick.listTitle}</p>
                              {pickWatched && weekPickReview && (weekPickReview.rating || weekPickReview.note) && (
                                <div className="mt-2">
                                  {weekPickReview.rating > 0 && <StarRating value={weekPickReview.rating} size="sm" />}
                                  {weekPickReview.note && (
                                    <p className="text-gray-300 text-xs italic mt-1 line-clamp-2">"{weekPickReview.note}"</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })()}
                {continueItem && (
                  <SuggestionCard
                    movie={continueItem.movie}
                    label={<><span className="text-white">Continue</span> {continueItem.listTitle}</>}
                    labelColor="text-purple-400"
                    to={`/lists/${continueItem.listId}`}
                  />
                )}
                {startWatching && (
                  <SuggestionCard
                    movie={startWatching.movie}
                    label={<><span className="text-white">Start watching</span> {startWatching.listTitle}</>}
                    labelColor="text-blue-400"
                    to={`/lists/${startWatching.listId}`}
                  />
                )}
                {almostDone && (
                  <SuggestionCard
                    movie={almostDone.movie}
                    label={<><span className="text-white">Almost done with</span> {almostDone.listTitle}</>}
                    sublabel={`${almostDone.remaining} ${almostDone.remaining === 1 ? 'movie' : 'movies'} left`}
                    labelColor="text-green-400"
                    to={`/lists/${almostDone.listId}`}
                  />
                )}
              </div>
            )}

            {/* Owner: View more link below suggestion tiles */}
            {isOwner && (
              <div className="flex justify-end">
                <Link to="/lists" className="text-xs text-purple-400 hover:text-purple-300">
                  View more →
                </Link>
              </div>
            )}

            {/* Friend view: full list grid + pagination */}
            {!isOwner && (
              <>
                {paginated.length === 0 ? (
                  <NotFound title={PROFILE_NO_LISTS.title} subtitle={PROFILE_NO_LISTS.subtitle} scene={PROFILE_NO_LISTS.scene} />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {paginated.map((item) => (
                      <ListCard
                        key={item.id}
                        listId={item.listId}
                        title={item.list.title}
                        total={item.list.movieCount || 0}
                        watched={item.watchedCount}
                        isOwner={item.isViewerOwned}
                        isPrebuilt={item.list.isPrebuilt || false}
                        creatorName={item.creator?.displayName}
                        featuredPoster={item.list.featuredMovie?.posterPath || item.list.firstPoster}
                        to={`/lists/${item.listId}?viewer=${uid}`}
                      />
                    ))}
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-500">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="text-sm text-gray-400 hover:text-white disabled:text-gray-700 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          )}
        </div>
      )}

      {isOwner && (
        <button
          onClick={async () => { await logout(); navigate('/'); }}
          className="w-full text-sm text-gray-500 hover:text-red-400 border border-gray-700 px-3 py-2 rounded-lg transition-colors"
        >
          Sign out
        </button>
      )}

      {user && (
        <QuickActionModal
          isOpen={!!quickActionMovie}
          onClose={() => setQuickActionMovie(null)}
          movie={quickActionMovie}
          user={user}
          watched={myWatchedIds}
          setWatched={setMyWatchedIds}
        />
      )}

      {user ? (
        <QuickActionModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          movie={selected ? {
            tmdbId: selected.tmdbId,
            title: selected.title,
            posterPath: selected.posterPath,
            year: selected.year,
            genreIds: selected.genreIds || [],
            overview: selected.overview || '',
          } : null}
          user={user}
          watched={myWatchedIds}
          setWatched={setMyWatchedIds}
          review={selected}
          reviewerProfile={profile}
          onReactionChange={(newReactions) => {
            setSelected((prev) => (prev ? { ...prev, reactions: newReactions } : prev));
            setAllWatchedMovies((prev) => prev.map((mv) =>
              mv.tmdbId === selected?.tmdbId ? { ...mv, reactions: newReactions } : mv
            ));
          }}
          onEdit={({ rating, note, reactions }) => {
            if (!selected || selected.uid !== user.uid) return;
            setAllWatchedMovies((prev) => prev.map((mv) =>
              mv.tmdbId === selected.tmdbId ? { ...mv, rating, note, reactions } : mv
            ));
          }}
          onDelete={() => {
            if (!selected || selected.uid !== user.uid) return;
            setAllWatchedMovies((prev) => prev.filter((mv) => mv.tmdbId !== selected.tmdbId));
          }}
        />
      ) : (
        <ReviewModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          movie={selected}
          reviewerProfile={profile}
          onReactionChange={(newReactions) => {
            setSelected((prev) => (prev ? { ...prev, reactions: newReactions } : prev));
            setAllWatchedMovies((prev) => prev.map((mv) =>
              mv.tmdbId === selected?.tmdbId ? { ...mv, reactions: newReactions } : mv
            ));
          }}
        />
      )}
    </div>
  );
}
