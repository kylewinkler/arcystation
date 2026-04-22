import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile, getListMovies, getWatchedMovies,
  getPinnedLists,
  getPendingListInvites, acceptListInvite, declineListInvite,
  getAllWatchedTmdbIds, reconcileUserWatchedCounts,
  getWatchedInfo,
} from '../lib/firestore';
import { discoverMovies, posterUrl } from '../lib/tmdb';
import QuickActionModal from '../components/modal/QuickActionModal';
import SuggestionCard from '../components/movies/SuggestionCard';
import StarRating from '../components/StarRating';
import LoadingScreen from '../components/loading/Loading';
import NoComms from '../assets/images/arcy-scenes/no-comms.png';

function pickRandom(arr) {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : null;
}

// ISO week key like "2026-W17" — stable Monday-to-Sunday bucket for the weekly pick.
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

const currentYear = new Date().getFullYear();
function isReleased(m) {
  if (m.releaseDate) return new Date(m.releaseDate) <= new Date();
  if (m.release_date) return new Date(m.release_date) <= new Date();
  return !m.year || Number(m.year) < currentYear;
}

export default function Home() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [continueItem, setContinueItem] = useState(null);
  const [weekPick, setWeekPick] = useState(null);
  const [weekPickReview, setWeekPickReview] = useState(null);
  const [almostDone, setAlmostDone] = useState(null);
  const [hasLists, setHasLists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [popularMovies, setPopularMovies] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [quickActionMovie, setQuickActionMovie] = useState(null);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user]);

  async function handleAcceptInvite(invite) {
    await acceptListInvite(invite.id, user.uid, invite.listId);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    load();
  }

  async function handleDeclineInvite(invite) {
    await declineListInvite(invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  async function load() {
    setLoading(true);

    // One-time per session: heal any watchedCount corruption from the earlier
    // increment-on-missing-field bug. Runs before getUserAllProgress so the
    // rest of the load sees corrected data.
    if (!sessionStorage.getItem('watchedCountReconciledV1')) {
      try {
        await reconcileUserWatchedCounts(user.uid);
        sessionStorage.setItem('watchedCountReconciledV1', '1');
      } catch { /* non-fatal — let the rest of load proceed */ }
    }

    const [allProgress, pinned, pendingInvites, popResult, ids] = await Promise.all([
      getUserAllProgress(user.uid),
      getPinnedLists(user.uid),
      getPendingListInvites(user.uid),
      discoverMovies({ tab: 'popular' }),
      getAllWatchedTmdbIds(user.uid),
    ]);
    setPopularMovies(popResult.movies.slice(0, 10));
    setWatchedIds(ids);

    const enrichedInvites = await Promise.all(
      pendingInvites.map(async (inv) => {
        const [fromProfile, listDoc] = await Promise.all([
          getUserProfile(inv.fromUid),
          getList(inv.listId),
        ]);
        return { ...inv, fromProfile, list: listDoc };
      })
    );
    setInvites(enrichedInvites.filter((inv) => inv.list));
    const pinnedSet = new Set(pinned);

    const enriched = await Promise.all(
      allProgress.map(async (p) => {
        try {
          const listDoc = await getList(p.listId);
          if (!listDoc) return null;
          return { ...p, list: listDoc };
        } catch { return null; }
      })
    );
    const valid = enriched.filter(Boolean);
    setHasLists(valid.length > 0);

    if (valid.length === 0) {
      setLoading(false);
      return;
    }

    const allIncomplete = valid.filter(
      (item) => item.watchedCount > 0 && item.watchedCount < (item.list.movieCount || 0)
    );

    if (allIncomplete.length === 0) {
      setLoading(false);
      return;
    }

    const movieData = {};
    const watchedData = {};
    await Promise.all(
      allIncomplete.map(async (item) => {
        const [movies, watched] = await Promise.all([
          getListMovies(item.listId),
          getWatchedMovies(user.uid, item.listId),
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
      .filter(({ item }) => item.listId !== continueList.listId)
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

    // This week's pick: stable per ISO week, persisted to localStorage so the
    // user sees the same movie all week even after watching it.
    const weekKey = getWeekKey();
    const storageKey = weekPickStorageKey(user.uid);
    let pick = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.weekKey === weekKey && parsed.movie?.tmdbId) pick = parsed;
      }
    } catch { /* corrupt entry — regenerate */ }

    if (!pick) {
      const shuffledLists = [...allIncomplete].sort(() => Math.random() - 0.5);
      for (const item of shuffledLists) {
        const candidates = (movieData[item.listId] || [])
          .filter((m) => !watchedData[item.listId]?.[m.tmdbId])
          .filter((m) => m.tmdbId !== continueMovie?.tmdbId)
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
      if (ids.has(pick.movie.tmdbId)) {
        try {
          const info = await getWatchedInfo(user.uid, pick.movie.tmdbId);
          if (info) setWeekPickReview(info);
        } catch { /* non-fatal */ }
      }
    }

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  const pickWatched = !!weekPick && watchedIds.has(weekPick.movie.tmdbId);
  const hasAnyAction = invites.length > 0 || weekPick || continueItem || almostDone;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Popular movies — always at top */}
      {popularMovies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Popular Right Now</h2>
            <Link to="/movies" className="text-xs text-purple-400 hover:text-purple-300">View more →</Link>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {popularMovies.slice(0, 5).map((m) => (
              <button
                key={m.tmdbId}
                onClick={() => setQuickActionMovie(m)}
                className="group text-left"
              >
                {m.posterPath ? (
                  <img
                    src={posterUrl(m.posterPath, 'w185')}
                    alt=""
                    className="w-full aspect-[2/3] rounded-lg object-cover group-hover:ring-2 ring-purple-500 transition-all"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] rounded-lg bg-gray-800" />
                )}
                <p className="text-xs text-gray-400 mt-1 truncate group-hover:text-white transition-colors">{m.title}</p>
              </button>
            ))}
          </div>
        </div>
      )}

    {/* Pending invites — top, urgent */}
      {invites.length > 0 && (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div key={invite.id} className="bg-gray-900 border border-purple-500/30 rounded-xl p-4 flex items-center gap-3">
              {invite.fromProfile?.photoURL ? (
                <img src={invite.fromProfile.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-sm font-bold shrink-0">
                  {invite.fromProfile?.displayName?.[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">
                  {invite.fromProfile?.displayName} {invite.list.isPrebuilt ? 'wants you to join the collection' : 'invited you to their list'}
                </p>
                <p className="text-purple-400 text-sm font-medium truncate">{invite.list.title}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleAcceptInvite(invite)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  Join
                </button>
                <button
                  onClick={() => handleDeclineInvite(invite)}
                  className="text-gray-400 hover:text-red-400 border border-gray-700 px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hero: This week's pick */}
      {weekPick && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            {pickWatched ? "You watched this week's pick" : 'Not sure what to watch?'}
          </p>
          <Link
            to={`/movie/${weekPick.movie.tmdbId}`}
            className="block group"
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
              <div className="relative flex gap-4 p-4">
                {weekPick.movie.posterPath ? (
                  <img
                    src={posterUrl(weekPick.movie.posterPath, 'w342')}
                    alt={weekPick.movie.title}
                    className="w-28 sm:w-32 aspect-[2/3] rounded-lg object-cover shrink-0 shadow-lg"
                  />
                ) : (
                  <div className="w-28 sm:w-32 aspect-[2/3] rounded-lg bg-gray-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className={`text-xs font-medium mb-1 ${pickWatched ? 'text-orange-400' : 'text-yellow-400/90'}`}>
                    {pickWatched ? '🍿 Your pick this week' : "🎬 This week's pick"}
                  </p>
                  <h2 className="text-white text-xl sm:text-2xl font-bold leading-tight">
                    {weekPick.movie.title}
                  </h2>
                  {weekPick.movie.year && (
                    <p className="text-gray-400 text-sm mt-0.5">{weekPick.movie.year}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-2">from {weekPick.listTitle}</p>
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
          </Link>
        </div>
      )}

      {/* Secondary actionable cards */}
      {(continueItem || almostDone) && (
        <div className="space-y-3">
          {continueItem && (
            <SuggestionCard
              movie={continueItem.movie}
              label={<><span className="text-white">Continue</span> {continueItem.listTitle}</>}
              labelColor="text-purple-400"
              to={`/lists/${continueItem.listId}`}
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

      {/* Empty state — no lists at all */}
      {!hasLists && (
        <div className="space-y-8">
          <div className="text-center">
            <img
              src={NoComms}
              alt=""
              className="mx-auto mb-4 w-full max-w-md select-none"
              draggable="false"
            />
            <p className="text-white font-medium mb-1">Your station is quiet.</p>
            <p className="text-gray-400 text-sm mb-4">
              Start a list of movies to track, or join a friend's.
            </p>
            <div className="flex gap-2 justify-center">
              <Link
                to="/lists/new"
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + New List
              </Link>
              <Link
                to="/lists"
                className="border border-gray-700 hover:border-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Browse Collections
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Nothing actionable but user has lists (e.g. all complete or all untouched) */}
      {hasLists && !hasAnyAction && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
          <p className="text-white font-medium mb-1">All caught up.</p>
          <p className="text-gray-400 text-sm mb-4">
            Start watching something from a list to see picks here.
          </p>
          <Link
            to="/lists"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Go to Lists
          </Link>
        </div>
      )}

      <QuickActionModal
        isOpen={!!quickActionMovie}
        onClose={() => setQuickActionMovie(null)}
        movie={quickActionMovie}
        user={user}
        watched={watchedIds}
        setWatched={setWatchedIds}
      />
    </div>
  );
}
