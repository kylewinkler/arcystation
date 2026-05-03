import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserAllProgress, getList, getUserProfile, getListMovies, getWatchedMovies,
  getPendingListInvites, acceptListInvite, declineListInvite,
  getAllWatchedTmdbIds, reconcileUserWatchedCounts,
  getWatchedInfo, getThrowbackReview, getRecentSiteReviews,
} from '../lib/firestore';
import { discoverMovies, posterUrl } from '../lib/tmdb';
import QuickActionModal from '../components/modal/QuickActionModal';
import SuggestionCard from '../components/movies/SuggestionCard';
import StarRating from '../components/StarRating';
import MoviePosterTile from '../components/movies/MoviePosterTile';
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
  const navigate = useNavigate();
  const [invites, setInvites] = useState([]);
  const [weekPick, setWeekPick] = useState(null);
  const [weekPickReview, setWeekPickReview] = useState(null);
  const [throwback, setThrowback] = useState(null);
  const [recentReviews, setRecentReviews] = useState([]);
  const [hasLists, setHasLists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [popularMovies, setPopularMovies] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [quickActionMovie, setQuickActionMovie] = useState(null);

  useEffect(() => {
    load();
  }, [user]);

  function handlePosterClick(movie) {
    if (user) {
      setQuickActionMovie(movie);
    } else {
      navigate(`/movie/${movie.tmdbId}`);
    }
  }

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

    // Public sections — load for everyone (anonymous + logged-in).
    const [popResult, recents] = await Promise.all([
      discoverMovies({ tab: 'popular' }),
      getRecentSiteReviews(12).catch((err) => {
        console.error('Failed to load recent reviews:', err);
        return [];
      }),
    ]);
    setPopularMovies(popResult.movies.slice(0, 10));
    setRecentReviews(recents);

    if (!user) {
      setLoading(false);
      return;
    }

    // Logged-in-only — week pick, invites, throwback, watched glow, hasLists.

    // One-time per session: heal any watchedCount corruption from the earlier
    // increment-on-missing-field bug. Runs before getUserAllProgress so the
    // rest of the load sees corrected data.
    if (!sessionStorage.getItem('watchedCountReconciledV1')) {
      try {
        await reconcileUserWatchedCounts(user.uid);
        sessionStorage.setItem('watchedCountReconciledV1', '1');
      } catch { /* non-fatal — let the rest of load proceed */ }
    }

    const [allProgress, pendingInvites, ids] = await Promise.all([
      getUserAllProgress(user.uid),
      getPendingListInvites(user.uid),
      getAllWatchedTmdbIds(user.uid),
    ]);
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

    // Lists that still have unwatched movies — power the week-pick
    // (any list with something unwatched is fair game).
    const withUnwatched = valid.filter(
      (item) => item.watchedCount < (item.list.movieCount || 0)
    );

    const movieData = {};
    const watchedData = {};
    await Promise.all(
      withUnwatched.map(async (item) => {
        const [movies, watched] = await Promise.all([
          getListMovies(item.listId),
          getWatchedMovies(user.uid, item.listId),
        ]);
        movieData[item.listId] = movies;
        watchedData[item.listId] = watched;
      })
    );

    // This week's pick: stable per ISO week, persisted to localStorage so the
    // user sees the same movie all week even after watching it.
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
          parsed?.listId && valid.some((v) => v.listId === parsed.listId);
        if (fresh && listStillValid) pick = parsed;
      }
    } catch { /* corrupt entry — regenerate */ }

    if (!pick) {
      const shuffledLists = [...withUnwatched].sort(() => Math.random() - 0.5);
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
      if (ids.has(pick.movie.tmdbId)) {
        try {
          const info = await getWatchedInfo(user.uid, pick.movie.tmdbId);
          if (info) setWeekPickReview(info);
        } catch { /* non-fatal */ }
      }
    }

    const throwbackReview = await getThrowbackReview(user.uid).catch(() => null);
    if (throwbackReview) setThrowback(throwbackReview);

    setLoading(false);
  }

  if (loading) return <LoadingScreen />;

  const pickWatched = !!weekPick && watchedIds.has(weekPick.movie.tmdbId);
  const hasAnyAction =
    invites.length > 0 ||
    weekPick ||
    throwback;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Pending invites — top, urgent (logged-in only) */}
      {user && invites.length > 0 && (
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

      {/* Hero: This week's pick — logged-in only, top of page */}
      {user && weekPick && (
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
          </Link>
        </div>
      )}

      {/* Popular movies — everyone */}
      {popularMovies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Popular Right Now</h2>
            <Link to="/movies" className="text-xs text-purple-400 hover:text-purple-300">View more →</Link>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {popularMovies.slice(0, 5).map((m) => (
              <MoviePosterTile
                key={m.tmdbId}
                movie={m}
                isSeen={watchedIds.has(m.tmdbId)}
                onClick={() => handlePosterClick(m)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent reviews — everyone */}
      {recentReviews.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white">Recent Reviews</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {recentReviews.map(({ review, profile, stats }) => (
              <RecentReviewCard
                key={`${profile.uid}__${review.tmdbId}`}
                review={review}
                profile={profile}
                stats={stats}
              />
            ))}
          </div>
        </div>
      )}

      {/* Throwback — logged-in only */}
      {user && throwback && (
        <SuggestionCard
          movie={throwback}
          label={<><span className="text-white">A year ago you watched</span></>}
          sublabel={throwback.note ? `"${throwback.note}"` : undefined}
          labelColor="text-amber-400"
          to={`/movie/${throwback.tmdbId}`}
        />
      )}

      {/* Empty state — no lists at all (logged-in only) */}
      {user && !hasLists && (
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
      {user && hasLists && !hasAnyAction && (
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

      {user && (
        <QuickActionModal
          isOpen={!!quickActionMovie}
          onClose={() => setQuickActionMovie(null)}
          movie={quickActionMovie}
          user={user}
          watched={watchedIds}
          setWatched={setWatchedIds}
        />
      )}
    </div>
  );
}

function RecentReviewCard({ review, profile, stats }) {
  const hasRating = review.rating > 0;
  const hasNote = !!review.note;
  return (
    <Link
      to={`/movie/${review.tmdbId}`}
      className="bg-gray-900/60 border border-gray-800 rounded-lg p-2.5 flex flex-col hover:border-purple-500 transition-colors"
    >
      <div className="flex gap-2.5">
        {review.posterPath ? (
          <img
            src={posterUrl(review.posterPath, 'w92')}
            alt=""
            className="w-12 h-[72px] rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-[72px] rounded bg-gray-800 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          {review.title && (
            <p className="text-white text-xs font-medium truncate">{review.title}</p>
          )}
          {review.year && <p className="text-[10px] text-gray-500">{review.year}</p>}
          {stats?.scorePct != null && (
            <p className="text-[10px] text-green-400 font-medium mt-0.5">
              {stats.scorePct}%
              {stats.count > 0 && (
                <span className="text-gray-500 font-normal"> ({stats.count})</span>
              )}
            </p>
          )}
          {hasRating && <div className="mt-1"><StarRating value={review.rating} size="sm" /></div>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-2 min-w-0">
        {profile.photoURL ? (
          <img
            src={profile.photoURL}
            alt=""
            className="w-4 h-4 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-[8px] font-bold text-white shrink-0">
            {profile.displayName?.[0]?.toUpperCase()}
          </div>
        )}
        <span className="text-gray-400 text-[10px] truncate">{profile.displayName}</span>
      </div>
      {hasNote ? (
        <p className="text-gray-300 text-xs mt-1.5 italic line-clamp-3">"{review.note}"</p>
      ) : (
        !hasRating && <p className="text-gray-500 text-xs mt-1.5">Watched it</p>
      )}
    </Link>
  );
}
